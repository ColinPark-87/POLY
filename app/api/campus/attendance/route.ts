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

  // 1. 최신 월 파악 (class-roster와 동일하게 월 기준 필터)
  const { data: allMonthRows } = await serviceClient
    .from('class_sessions')
    .select('month')
    .eq('campus_id', profile.campus_id)
  const months = [...new Set((allMonthRows ?? []).map((r: any) => r.month as string))].sort((a, b) => {
    const parse = (m: string) => { const p = m.match(/\d+/g); return p ? Number(p[0]) * 100 + Number(p[1]) : 0 }
    return parse(b) - parse(a)
  })
  const latestMonth = months[0] ?? ''

  // 최신 월의 세션 전체 조회
  const { data: allSessions, error: sessErr } = await serviceClient
    .from('class_sessions')
    .select('id, name, time_range, sort_order, days')
    .eq('campus_id', profile.campus_id)
    .eq('month', latestMonth)
    .order('sort_order')
    .order('created_at')

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })
  if (!allSessions?.length) return NextResponse.json([])

  // 오늘 요일 (KST = UTC+9) — 필터링 아닌 메타 전달용
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayDay = ['일','월','화','수','목','금','토'][kstNow.getUTCDay()]

  // 전체 세션 표시 (필터 없음) — 오늘 해당 여부는 is_today 플래그로 전달
  const sessions = allSessions.map((s: any) => ({
    ...s,
    is_today: !s.days || s.days.includes(todayDay),
  }))

  const sessionIds = sessions.map(s => s.id)

  // 2. 반 목록
  const { data: classes, error: clsErr } = await serviceClient
    .from('classes')
    .select('id, session_id, level, room, teacher, color, sort_order, days')
    .in('session_id', sessionIds)
    .order('sort_order')
    .order('id')

  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 })
  if (!classes?.length) return NextResponse.json([])

  const classIds = classes.map(c => c.id)

  // 3. 전체 수강생 (class_enrollments → campus_students)
  const { data: enrollments } = await serviceClient
    .from('class_enrollments')
    .select('class_id, student_id, sort_order, campus_students(name, english_name)')
    .in('class_id', classIds)
    .neq('is_waitlist', true)
    .order('sort_order')

  const enrollmentsByClass = new Map<string, { student_id: string; name: string; english_name: string | null }[]>()
  for (const e of (enrollments ?? []) as any[]) {
    const list = enrollmentsByClass.get(e.class_id) ?? []
    list.push({
      student_id: e.student_id,
      name: (e.campus_students as any)?.name ?? '',
      english_name: (e.campus_students as any)?.english_name ?? null,
    })
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
        student_english_name: s.english_name,
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
      class_session_days: sess.days ?? null,
      class_session_is_today: sess.is_today as boolean,
      class_days: c.days ?? null,
      // 반 days 있으면 우선, 없으면 세션 days 상속
      class_is_today: c.days
        ? c.days.includes(todayDay)
        : sess.is_today as boolean,
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
