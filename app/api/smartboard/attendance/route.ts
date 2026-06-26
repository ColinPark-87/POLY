import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // KST 기준 날짜 (현재팝업판단·관리페이지와 일치 — UTC 쓰면 새벽시간대 날짜 어긋남)
  const session_date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { class_id, records } = await req.json() as {
    class_id: string
    records: { student_id: string; status: AttendanceStatus }[]
  }
  if (!class_id) return NextResponse.json({ error: 'class_id 필요' }, { status: 400 })

  const serviceClient = createServiceClient()

  // campus_id는 교실(classroom) 기준 — metadata.campus_id 틀릴 수 있음
  let campus_id: string = user.user_metadata.campus_id ?? ''
  const classroomId = user.user_metadata.classroom_id
  if (classroomId) {
    const { data: room } = await serviceClient
      .from('classrooms').select('campus_id').eq('id', classroomId).maybeSingle()
    if (room?.campus_id) campus_id = room.campus_id
  }
  if (!campus_id) return NextResponse.json({ error: 'campus_id 없음' }, { status: 400 })

  const { data: session, error: sessErr } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  const { error: recErr } = await serviceClient
    .from('attendance_records')
    .upsert(
      records.map(r => ({
        attendance_session_id: session.id,
        student_id: r.student_id,
        status: r.status,
        pre_marked: false,
        recorded_by: 'teacher' as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'attendance_session_id,student_id' }
    )

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  await serviceClient
    .from('attendance_sessions')
    .update({ completed_at: new Date().toISOString(), completed_by: 'teacher' })
    .eq('id', session.id)

  // 강제 팝업이었으면 클리어
  try {
    const classroomId = user.user_metadata?.classroom_id
    if (classroomId) {
      await serviceClient.from('classrooms')
        .update({ force_popup_class_id: null })
        .eq('id', classroomId).eq('force_popup_class_id', class_id)
    }
  } catch { /* 비핵심 */ }

  try {
    await serviceClient
      .from('smartboard_devices')
      .upsert(
        { class_id, campus_id, last_seen: new Date().toISOString() },
        { onConflict: 'class_id' }
      )
  } catch { /* 비핵심 */ }

  return NextResponse.json({ ok: true, session_id: session.id })
}
