import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseStartTime, toMinutes } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

// 스마트보드: 내 교실(classroom_id)의 오늘 수업 중 "지금 팝업 떠야 하는" 반 + 학생 반환
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const classroomId: string = user.user_metadata.classroom_id ?? ''
  const campusId: string = user.user_metadata.campus_id ?? ''
  if (!classroomId || !campusId) return NextResponse.json({ active: null })

  const svc = createServiceClient()

  // 교실 기본 팝업 분 + 강제 팝업
  const { data: room } = await svc
    .from('classrooms').select('popup_minutes_before, force_popup_class_id').eq('id', classroomId).maybeSingle()
  const roomDefault = room?.popup_minutes_before ?? 2
  const forcePopupClassId = room?.force_popup_class_id ?? null

  // 최신 월 세션
  const { data: monthRows } = await svc
    .from('class_sessions').select('month').eq('campus_id', campusId)
  const months = [...new Set((monthRows ?? []).map((r: any) => r.month as string))].sort((a, b) => {
    const p = (m: string) => { const x = m.match(/\d+/g); return x ? Number(x[0]) * 100 + Number(x[1]) : 0 }
    return p(b) - p(a)
  })
  const latestMonth = months[0] ?? ''

  const { data: sessions } = await svc
    .from('class_sessions')
    .select('id, name, time_range, days')
    .eq('campus_id', campusId).eq('month', latestMonth)
  const sessMap = new Map((sessions ?? []).map((s: any) => [s.id, s]))
  const sessionIds = (sessions ?? []).map((s: any) => s.id)
  if (!sessionIds.length) return NextResponse.json({ active: null })

  // 이 교실(classroom_id 또는 room 이름 매칭)의 반들
  const { data: roomMeta } = await svc.from('classrooms').select('display_name').eq('id', classroomId).maybeSingle()
  const roomName = (roomMeta?.display_name ?? '').toLowerCase()

  const { data: classes } = await svc
    .from('classes')
    .select('id, session_id, level, room, classroom_id, days, popup_minutes_before, smartboard_time_range')
    .in('session_id', sessionIds)

  const myClasses = (classes ?? []).filter((c: any) =>
    c.classroom_id === classroomId || (c.room ?? '').toLowerCase() === roomName
  )
  if (!myClasses.length) return NextResponse.json({ active: null })

  // 오늘 요일
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayDay = ['일','월','화','수','목','금','토'][kstNow.getUTCDay()]
  const nowMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()
  const today = kstNow.toISOString().split('T')[0]

  // 학생 명단 빌드 헬퍼
  async function buildActive(cls: any, sess: any, timeRange: string, existingId: string | null, forced: boolean) {
    const { data: enrollments } = await svc
      .from('class_enrollments')
      .select('student_id, campus_students(name)')
      .eq('class_id', cls.id).neq('is_waitlist', true)
    let preAbsent = new Set<string>()
    if (existingId) {
      const { data: recs } = await svc
        .from('attendance_records')
        .select('student_id, status, pre_marked')
        .eq('attendance_session_id', existingId)
      preAbsent = new Set((recs ?? []).filter((r: any) => r.pre_marked && r.status === 'absent').map((r: any) => r.student_id))
    }
    const students = (enrollments ?? []).map((e: any) => ({
      student_id: e.student_id,
      student_name: (e.campus_students as any)?.name ?? '',
      pre_marked_absent: preAbsent.has(e.student_id),
    }))
    return { class_id: cls.id, class_level: cls.level, session_name: sess.name, time_range: timeRange, forced, students }
  }

  // 1) 강제 팝업 우선 (시간 무관)
  if (forcePopupClassId) {
    const cls = myClasses.find((c: any) => c.id === forcePopupClassId)
    if (cls) {
      const sess = sessMap.get(cls.session_id)
      const timeRange = cls.smartboard_time_range ?? sess?.time_range ?? ''
      const { data: existing } = await svc
        .from('attendance_sessions').select('id').eq('class_id', cls.id).eq('session_date', today).maybeSingle()
      return NextResponse.json({ active: await buildActive(cls, sess ?? {}, timeRange, existing?.id ?? null, true) })
    }
  }

  // 2) 시간 기반 팝업
  for (const cls of myClasses) {
    const sess = sessMap.get(cls.session_id)
    if (!sess) continue
    const days = cls.days ?? sess.days
    if (days && !days.includes(todayDay)) continue

    const timeRange = cls.smartboard_time_range ?? sess.time_range
    if (!timeRange) continue

    const startMin = toMinutes(parseStartTime(timeRange))
    const popupMin = startMin - (cls.popup_minutes_before ?? roomDefault)
    if (nowMin < popupMin || nowMin > startMin + 90) continue

    const { data: existing } = await svc
      .from('attendance_sessions')
      .select('id, completed_at')
      .eq('class_id', cls.id).eq('session_date', today).maybeSingle()
    if (existing?.completed_at) continue

    return NextResponse.json({ active: await buildActive(cls, sess, timeRange, existing?.id ?? null, false) })
  }

  return NextResponse.json({ active: null })
}
