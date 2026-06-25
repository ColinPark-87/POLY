import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseStartTime, resolveUiStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users')
    .select('campus_id, role, position')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = req.nextUrl.searchParams
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  // 1. 활성 세션 목록 (class-roster 방식과 동일)
  const { data: sessions, error: sessErr } = await serviceClient
    .from('class_sessions')
    .select('id, name, time_range, sort_order')
    .eq('campus_id', profile.campus_id)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })
  if (!sessions?.length) return NextResponse.json([])

  const sessionIds = sessions.map(s => s.id)

  // 2. 반 목록
  const { data: classes, error: clsErr } = await serviceClient
    .from('classes')
    .select('id, session_id, level, room, teacher, color, sort_order')
    .in('session_id', sessionIds)
    .order('sort_order')
    .order('id')

  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 })
  if (!classes?.length) return NextResponse.json([])

  const classIds = classes.map(c => c.id)

  // 3. 전체 수강생 (class_enrollments → campus_students)
  const { data: enrollments } = await serviceClient
    .from('class_enrollments')
    .select('class_id, student_id, sort_order, campus_students(name)')
    .in('class_id', classIds)
    .eq('is_waitlist', false)
    .order('sort_order')

  const enrollmentsByClass = new Map<string, { student_id: string; name: string }[]>()
  for (const e of (enrollments ?? []) as any[]) {
    const list = enrollmentsByClass.get(e.class_id) ?? []
    list.push({ student_id: e.student_id, name: (e.campus_students as any)?.name ?? '' })
    enrollmentsByClass.set(e.class_id, list)
  }

  // 4. 오늘 출결 기록 (테이블 미생성 시 빈 맵으로 폴백)
  let sessionMap = new Map<string, any>()
  try {
    const { data: attSessions, error: attErr } = await serviceClient
      .from('attendance_sessions')
      .select('*, attendance_records(student_id, status, pre_marked, note)')
      .in('class_id', classIds)
      .eq('session_date', date)
    if (!attErr && attSessions) {
      sessionMap = new Map(attSessions.map((s: any) => [s.class_id, s]))
    }
  } catch {
    // attendance 테이블 미생성 → 빈 맵
  }

  const sessMap = new Map(sessions.map(s => [s.id, s]))
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  const result = (classes ?? []).map((c: any) => {
    const sess = sessMap.get(c.session_id)!
    const attSession = sessionMap.get(c.id) ?? null
    const records: any[] = attSession?.attendance_records ?? []
    const recordMap = new Map(records.map((r: any) => [r.student_id, r]))
    const allStudents = enrollmentsByClass.get(c.id) ?? []
    const startTimeParsed = sess.time_range ? parseStartTime(sess.time_range) : '00:00'

    const students = allStudents.map(s => {
      const r = recordMap.get(s.student_id)
      return {
        student_id: s.student_id,
        student_name: s.name,
        status: r?.status ?? 'present',
        pre_marked: r?.pre_marked ?? false,
        note: r?.note ?? null,
      }
    })

    return {
      class_id: c.id,
      campus_id: profile.campus_id,
      class_level: c.level,
      class_room: c.room,
      class_teacher: c.teacher,
      class_color: c.color ?? '#3b82f6',
      class_session_id: c.session_id,
      class_session_name: sess.name,
      class_session_time_range: sess.time_range ?? '',
      start_time_parsed: startTimeParsed,
      ui_status: resolveUiStatus(attSession?.completed_at ?? null, startTimeParsed, nowMinutes),
      attendance_session: attSession ? {
        id: attSession.id,
        class_id: attSession.class_id,
        campus_id: attSession.campus_id,
        session_date: attSession.session_date,
        completed_at: attSession.completed_at,
        completed_by: attSession.completed_by,
        created_at: attSession.created_at,
      } : null,
      students,
      absent_count: students.filter(s => s.status === 'absent').length,
      late_count: students.filter(s => s.status === 'late').length,
    }
  })

  return NextResponse.json(result)
}
