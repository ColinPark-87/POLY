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

  const { data: classes, error } = await serviceClient
    .from('classes')
    .select(`
      id, level, room, teacher, color,
      class_sessions!inner(id, name, time_range, is_active)
    `)
    .eq('campus_id', profile.campus_id)
    .eq('class_sessions.is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const classIds = (classes ?? []).map((c: any) => c.id)
  if (classIds.length === 0) return NextResponse.json([])

  // 전체 수강생 조회 (attendance_records 없어도 학생 표시)
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

  // 오늘 출결 세션 + 기록 조회 (테이블 미생성 시 빈 배열로 폴백)
  let sessionMap = new Map<string, any>()
  try {
    const { data: sessions, error: sessErr } = await serviceClient
      .from('attendance_sessions')
      .select('*, attendance_records(student_id, status, pre_marked, note)')
      .in('class_id', classIds)
      .eq('session_date', date)
    if (!sessErr && sessions) {
      sessionMap = new Map(sessions.map((s: any) => [s.class_id, s]))
    }
  } catch {
    // attendance 테이블 미생성 → 빈 맵 유지
  }

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  const result = (classes ?? []).map((c: any) => {
    const session = sessionMap.get(c.id) ?? null
    const records: any[] = session?.attendance_records ?? []
    const recordMap = new Map(records.map((r: any) => [r.student_id, r]))
    const startTimeParsed = parseStartTime(c.class_sessions.time_range)
    const allStudents = enrollmentsByClass.get(c.id) ?? []

    const students = allStudents.map((s) => {
      const r = recordMap.get(s.student_id)
      return {
        student_id: s.student_id,
        student_name: s.name,
        status: r?.status ?? 'present',
        pre_marked: r?.pre_marked ?? false,
        note: r?.note ?? null,
      }
    })

    const absent_count = students.filter(s => s.status === 'absent').length
    const late_count = students.filter(s => s.status === 'late').length

    return {
      class_id: c.id,
      campus_id: profile.campus_id,
      class_level: c.level,
      class_room: c.room,
      class_teacher: c.teacher,
      class_color: c.color ?? '#3b82f6',
      class_session_id: c.class_sessions.id,
      class_session_name: c.class_sessions.name,
      class_session_time_range: c.class_sessions.time_range,
      start_time_parsed: startTimeParsed,
      ui_status: resolveUiStatus(session?.completed_at ?? null, startTimeParsed, nowMinutes),
      attendance_session: session ? {
        id: session.id,
        class_id: session.class_id,
        campus_id: session.campus_id,
        session_date: session.session_date,
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        created_at: session.created_at,
      } : null,
      students,
      absent_count,
      late_count,
    }
  })

  return NextResponse.json(result)
}
