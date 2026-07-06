import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'
import { resolveCampusId } from '@/lib/utils/resolve-campus'

// 수동 노선그리기 저장/조회. 호차·세션·방향별 좌표점 배열(campus_manual_routes).
// 테이블 미생성(마이그레이션 019 미적용) 시에도 안전하게 빈 결과 반환.

const PERM_SELECT = 'campus_id, name, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'
function canVehicles(p: { role?: string | null; position?: string | null; perm_class_roster?: boolean | null; perm_vehicles?: boolean | null; perm_vehicles_restricted?: boolean | null } | null) {
  return resolvePermissions({
    role: p?.role ?? 'employee', position: p?.position ?? null,
    perm_class_roster: p?.perm_class_roster ?? null, perm_vehicles: p?.perm_vehicles ?? null,
    perm_vehicles_restricted: p?.perm_vehicles_restricted ?? null,
  }).vehicles
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canVehicles(profile)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const campusId = resolveCampusId(profile?.role, profile?.campus_id, new URL(request.url).searchParams.get('campus_id'))
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { data, error } = await service.from('campus_manual_routes')
    .select('bus_name, session_label, direction, points, updated_at')
    .eq('campus_id', campusId)
  // 테이블 미생성 등 → 빈 목록(기능 비활성처럼 동작)
  if (error) return NextResponse.json({ routes: [], tableMissing: true })
  return NextResponse.json({ routes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  const perms = resolvePermissions({
    role: profile?.role ?? 'employee', position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null, perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!perms.vehicles || perms.vehiclesRestricted) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const campusId = resolveCampusId(profile?.role, profile?.campus_id, new URL(request.url).searchParams.get('campus_id'))
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { bus_name, session_label, direction, points } = body as { bus_name?: string; session_label?: string; direction?: string; points?: unknown }
  if (!bus_name || !session_label || (direction !== 'arr' && direction !== 'dep')) {
    return NextResponse.json({ error: 'bus_name·session_label·direction 필요' }, { status: 400 })
  }
  // points 검증: [[number,number], ...]
  const pts = Array.isArray(points)
    ? points.filter(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
    : []

  // 점 0개 = 수동노선 삭제(TMAP로 복귀)
  if (pts.length === 0) {
    const { error } = await service.from('campus_manual_routes').delete()
      .eq('campus_id', campusId).eq('bus_name', bus_name).eq('session_label', session_label).eq('direction', direction)
    if (error) return NextResponse.json({ error: error.message, tableMissing: /relation .* does not exist/i.test(error.message) }, { status: 500 })
    return NextResponse.json({ ok: true, cleared: true })
  }
  const { error } = await service.from('campus_manual_routes').upsert({
    campus_id: campusId, bus_name, session_label, direction, points: pts,
    updated_by: profile?.name ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'campus_id,bus_name,session_label,direction' })
  if (error) return NextResponse.json({ error: error.message, tableMissing: /relation .* does not exist/i.test(error.message) }, { status: 500 })
  return NextResponse.json({ ok: true, count: pts.length })
}
