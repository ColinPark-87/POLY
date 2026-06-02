import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

// 빈 정류장 마스터 (campus_registered_stops) — 학생 배정 없이 정류장만 등록.
// 좌표는 기존 campus_stop_coords(stop-coords route)에 저장하고 여기서는 다루지 않음.

const PERM_SELECT = 'campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'

function gateVehicles(profile: { role?: string | null; position?: string | null; perm_class_roster?: boolean | null; perm_vehicles?: boolean | null; perm_vehicles_restricted?: boolean | null } | null) {
  return resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!gateVehicles(profile).vehicles) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { data, error } = await service
    .from('campus_registered_stops')
    .select('stop_name, bus_name, direction, default_time')
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ stops: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  const perms = gateVehicles(profile)
  if (!perms.vehicles || perms.vehiclesRestricted) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json()
  const stop_name = (body.stop_name ?? '').trim()
  const bus_name = (body.bus_name ?? '').trim()
  const direction = body.direction === 'arr' ? 'arr' : 'dep'
  const default_time = body.default_time ? String(body.default_time).trim() : null
  if (!stop_name || !bus_name) return NextResponse.json({ error: '정류장명·호차 필요' }, { status: 400 })

  const { data, error } = await service
    .from('campus_registered_stops')
    .upsert(
      { campus_id: campusId, stop_name, bus_name, direction, default_time },
      { onConflict: 'campus_id,stop_name,bus_name,direction' }
    )
    .select('stop_name, bus_name, direction, default_time')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stop: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  const perms = gateVehicles(profile)
  if (!perms.vehicles || perms.vehiclesRestricted) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json()
  const stop_name = (body.stop_name ?? '').trim()
  const bus_name = (body.bus_name ?? '').trim()
  const direction = body.direction === 'arr' ? 'arr' : 'dep'
  // 단건 삭제만 허용 — 캠퍼스 전체 삭제 금지
  if (!stop_name || !bus_name) return NextResponse.json({ error: '정류장명·호차 필요' }, { status: 400 })

  const { error } = await service
    .from('campus_registered_stops')
    .delete()
    .eq('campus_id', campusId)
    .eq('stop_name', stop_name)
    .eq('bus_name', bus_name)
    .eq('direction', direction)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
