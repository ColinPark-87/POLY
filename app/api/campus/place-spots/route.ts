import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'
import { resolveCampusId } from '@/lib/utils/resolve-campus'

export const dynamic = 'force-dynamic'

// 차량 관리 권한(vehicles) 보유자만 접근 — 일반 직원의 spot 변조 차단.
const PERM_SELECT = 'campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'

// 학교/아파트 spot 오버라이드 레이어 (자동 지오코딩 위에 좌표보정/추가/숨김)
async function getCtx(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증 필요', status: 401 as const }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  const perms = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!perms.vehicles) return { error: '권한 없음', status: 403 as const }
  const campusId = resolveCampusId(profile?.role, profile?.campus_id, new URL(request.url).searchParams.get('campus_id'))
  if (!campusId) return { error: '캠퍼스 없음', status: 400 as const }
  return { service, campusId }
}

export async function GET(request: NextRequest) {
  const ctx = await getCtx(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service, campusId } = ctx
  const { data, error } = await service
    .from('campus_place_spots')
    .select('kind, name, lat, lng, hidden')
    .eq('campus_id', campusId)
  // 테이블 미생성 등은 빈 배열로 (기능 비활성), 자동 지오코딩만 동작
  if (error) return NextResponse.json({ spots: [] })
  return NextResponse.json({ spots: data ?? [] })
}

// 좌표 보정 / 추가 / 숨김 토글 (upsert)
export async function POST(request: NextRequest) {
  const ctx = await getCtx(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service, campusId } = ctx
  const body = await request.json()
  const kind = body.kind === 'apt' ? 'apt' : 'school'
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '이름 필요' }, { status: 400 })
  const row: Record<string, unknown> = { campus_id: campusId, kind, name, updated_at: new Date().toISOString() }
  if (body.lat !== undefined && body.lat !== null && body.lat !== '') row.lat = Number(body.lat)
  if (body.lng !== undefined && body.lng !== null && body.lng !== '') row.lng = Number(body.lng)
  row.hidden = !!body.hidden
  const { error } = await service.from('campus_place_spots').upsert(row, { onConflict: 'campus_id,kind,name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 오버라이드 제거 (자동 지오코딩 값으로 복귀)
export async function DELETE(request: NextRequest) {
  const ctx = await getCtx(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { service, campusId } = ctx
  const body = await request.json()
  const kind = body.kind === 'apt' ? 'apt' : 'school'
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '이름 필요' }, { status: 400 })
  const { error } = await service.from('campus_place_spots')
    .delete().eq('campus_id', campusId).eq('kind', kind).eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
