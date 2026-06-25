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
  const { data: sessions } = classIds.length > 0
    ? await serviceClient
        .from('attendance_sessions')
        .select('*, attendance_records(student_id, status, pre_marked, note, campus_students(name))')
        .in('class_id', classIds)
        .eq('session_date', date)
    : { data: [] }

  const sessionMap = new Map((sessions ?? []).map((s: any) => [s.class_id, s]))

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  const result = (classes ?? []).map((c: any) => {
    const session = sessionMap.get(c.id) ?? null
    const records: any[] = session?.attendance_records ?? []
    const startTimeParsed = parseStartTime(c.class_sessions.time_range)

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
      students: records.map((r: any) => ({
        student_id: r.student_id,
        student_name: r.campus_students?.name ?? '',
        status: r.status,
        pre_marked: r.pre_marked,
        note: r.note,
      })),
      absent_count: records.filter((r: any) => r.status === 'absent').length,
      late_count: records.filter((r: any) => r.status === 'late').length,
    }
  })

  return NextResponse.json(result)
}
