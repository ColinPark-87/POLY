import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'
import { conflictBody } from '@/lib/vehicles/conflict'

// 차량 관리 권한 보유자(vehicles)만 접근 — 일반 직원의 좌표 열람/변조 차단.
// 제한권한(vehiclesRestricted, 안전선생님)도 현행대로 접근 가능하도록 vehicles 만 요구.
const PERM_SELECT = 'campus_id, name, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'
function canVehicles(profile: { role?: string | null; position?: string | null; perm_class_roster?: boolean | null; perm_vehicles?: boolean | null; perm_vehicles_restricted?: boolean | null } | null) {
  return resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  }).vehicles
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canVehicles(profile)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { data, error } = await service
    .from('campus_stop_coords')
    .select('stop_name, lat, lng')
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const coords: Record<string, { lat: number; lng: number }> = {}
  for (const row of data ?? []) {
    coords[row.stop_name] = { lat: row.lat, lng: row.lng }
  }

  return NextResponse.json({ coords })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canVehicles(profile)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json()
  const coords: Record<string, { lat: number; lng: number }> = body.coords ?? {}

  // 유효한 좌표만 (NaN/null/무한대 제외) — 잘못된 행 하나로 저장 전체가 실패하는 것 방지
  const rows = Object.entries(coords)
    .filter(([stop_name, c]) => stop_name && c && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map(([stop_name, { lat, lng }]) => ({
      campus_id: campusId,
      stop_name,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    }))

  // 빈 저장은 무시 (실수로 전체가 삭제되는 것 방지 — 전체 삭제는 DELETE로만)
  if (rows.length === 0) return NextResponse.json({ ok: true, saved: 0 })

  // 1) 먼저 upsert — 실패해도 기존 데이터 보존 (옛 '삭제 후 삽입 실패 → 전체 유실' 위험 제거)
  const { error: upErr } = await service
    .from('campus_stop_coords')
    .upsert(rows, { onConflict: 'campus_id,stop_name' })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 2) 이번 저장에 없는(=삭제된) 정류장만 정리 (제거 시맨틱 보존)
  const provided = new Set(rows.map(r => r.stop_name))
  const { data: existing } = await service
    .from('campus_stop_coords')
    .select('stop_name')
    .eq('campus_id', campusId)
  const toDelete = (existing ?? []).map(r => r.stop_name).filter(n => !provided.has(n))
  if (toDelete.length) {
    const { error: delErr } = await service
      .from('campus_stop_coords')
      .delete()
      .eq('campus_id', campusId)
      .in('stop_name', toDelete)
    if (delErr) return NextResponse.json({ error: delErr.message, saved: rows.length }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: rows.length, removed: toDelete.length })
}

// PATCH: 정류장명 변경 (campus_stop_coords + class_enrollments location 동시 변경)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canVehicles(profile)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { oldName, newName, lat, lng, baseVersion, force } = await request.json()
  if (!oldName || !newName) return NextResponse.json({ error: '이름 필요' }, { status: 400 })

  // 충돌 검사: 편집 시작 후 다른 사람이 이 정류장을 바꿨으면 409 (force면 생략)
  if (!force) {
    const { data: cur } = await service.from('campus_stop_coords')
      .select('updated_at, updated_by').eq('campus_id', campusId).eq('stop_name', oldName).maybeSingle()
    const cf = conflictBody(cur, baseVersion)
    if (cf) return NextResponse.json(cf, { status: 409 })
  }

  // 1) campus_stop_coords: 기존 행 삭제 후 새 이름으로 삽입
  await service.from('campus_stop_coords').delete().eq('campus_id', campusId).eq('stop_name', oldName)
  if (lat !== undefined && lng !== undefined) {
    await service.from('campus_stop_coords').upsert(
      { campus_id: campusId, stop_name: newName, lat, lng, updated_at: new Date().toISOString(), updated_by: profile?.name ?? null },
      { onConflict: 'campus_id,stop_name' }
    )
  }

  // 2) class_enrollments: {day}_loc 값이 oldName인 것 newName으로 변경
  const { data: sessions } = await service.from('class_sessions').select('id').eq('campus_id', campusId)
  const sessionIds = (sessions ?? []).map(s => s.id)
  if (sessionIds.length) {
    const { data: classes } = await service.from('classes').select('id').in('session_id', sessionIds)
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length) {
      const { data: enrollments } = await service
        .from('class_enrollments')
        .select('id, arr_schedule, dep_schedule')
        .in('class_id', classIds)

      const DAYS = ['월', '화', '수', '목', '금', '토', '일']
      const toUpdate: { id: string; arr_schedule: object; dep_schedule: object }[] = []
      for (const enr of enrollments ?? []) {
        let changed = false
        const arr = { ...(enr.arr_schedule as Record<string, string> ?? {}) }
        const dep = { ...(enr.dep_schedule as Record<string, string> ?? {}) }
        for (const d of DAYS) {
          if (arr[`${d}_loc`] === oldName) { arr[`${d}_loc`] = newName; changed = true }
          if (dep[`${d}_loc`] === oldName) { dep[`${d}_loc`] = newName; changed = true }
        }
        if (changed) toUpdate.push({ id: enr.id, arr_schedule: arr, dep_schedule: dep })
      }
      for (const row of toUpdate) {
        await service.from('class_enrollments')
          .update({ arr_schedule: row.arr_schedule, dep_schedule: row.dep_schedule })
          .eq('id', row.id)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canVehicles(profile)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { error } = await service
    .from('campus_stop_coords')
    .delete()
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
