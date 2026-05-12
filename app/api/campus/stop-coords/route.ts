import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
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
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json()
  const coords: Record<string, { lat: number; lng: number }> = body.coords ?? {}

  const rows = Object.entries(coords).map(([stop_name, { lat, lng }]) => ({
    campus_id: campusId,
    stop_name,
    lat,
    lng,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) return NextResponse.json({ ok: true, saved: 0 })

  const { error } = await service
    .from('campus_stop_coords')
    .upsert(rows, { onConflict: 'campus_id,stop_name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, saved: rows.length })
}

// PATCH: 정류장명 변경 (campus_stop_coords + class_enrollments location 동시 변경)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { oldName, newName, lat, lng } = await request.json()
  if (!oldName || !newName) return NextResponse.json({ error: '이름 필요' }, { status: 400 })

  // 1) campus_stop_coords: 기존 행 삭제 후 새 이름으로 삽입
  await service.from('campus_stop_coords').delete().eq('campus_id', campusId).eq('stop_name', oldName)
  if (lat !== undefined && lng !== undefined) {
    await service.from('campus_stop_coords').upsert(
      { campus_id: campusId, stop_name: newName, lat, lng, updated_at: new Date().toISOString() },
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
  const { data: profile } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { error } = await service
    .from('campus_stop_coords')
    .delete()
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
