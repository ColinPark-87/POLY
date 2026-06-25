import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseStartTime, toMinutes } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

// 스마트보드: 내 교실(classroom_id)의 오늘 수업 중 "지금 팝업 떠야 하는" 반 + 학생 반환
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const debug = new URL(req.url).searchParams.get('debug') === '1'
  const classroomId: string = user.user_metadata.classroom_id ?? ''
  if (!classroomId) {
    return NextResponse.json({ active: null, ...(debug ? { debug: { reason: 'no classroom_id in account', metadata: user.user_metadata } } : {}) })
  }

  const svc = createServiceClient()

  // 교실 정보 — campus_id는 교실 기준(metadata보다 권위 있음)
  const { data: room } = await svc
    .from('classrooms').select('popup_minutes_before, force_popup_class_id, campus_id').eq('id', classroomId).maybeSingle()
  const roomDefault = room?.popup_minutes_before ?? 2
  const forcePopupClassId = room?.force_popup_class_id ?? null
  const campusId: string = room?.campus_id ?? user.user_metadata.campus_id ?? ''
  if (!campusId) {
    return NextResponse.json({ active: null, ...(debug ? { debug: { reason: 'no campus_id on classroom', classroomId } } : {}) })
  }

  // 교실 변경 코드 (campus 설정)
  let changeCode = '7659'
  try {
    const { data: campusRow } = await svc.from('campuses').select('smartboard_change_code').eq('id', campusId).maybeSingle()
    if (campusRow?.smartboard_change_code) changeCode = campusRow.smartboard_change_code
  } catch { /* 컬럼 미생성 */ }

  // 최신 월 세션
  const { data: monthRows } = await svc
    .from('class_sessions').select('month').eq('campus_id', campusId)
  const months = [...new Set((monthRows ?? []).map((r: any) => r.month as string))].sort((a, b) => {
    const p = (m: string) => { const x = m.match(/\d+/g); return x ? Number(x[0]) * 100 + Number(x[1]) : 0 }
    return p(b) - p(a)
  })
  // 교실 이름 (반 매칭용)
  const { data: roomMeta } = await svc.from('classrooms').select('display_name').eq('id', classroomId).maybeSingle()
  const roomName = (roomMeta?.display_name ?? '').toLowerCase()

  // 현재 날짜의 월 우선 (오늘이 6월이면 "2026년 6월"), 없으면 반 있는 최신 월
  const kstM = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const currentMonthStr = `${kstM.getUTCFullYear()}년 ${kstM.getUTCMonth() + 1}월`
  const monthOrder = months.includes(currentMonthStr)
    ? [currentMonthStr, ...months.filter(m => m !== currentMonthStr)]
    : months

  let latestMonth = ''
  let sessions: any[] = []
  let classes: any[] = []
  for (const m of monthOrder) {
    const { data: ss } = await svc
      .from('class_sessions')
      .select('id, name, time_range, days')
      .eq('campus_id', campusId).eq('month', m)
    if (!ss?.length) continue
    const ids = ss.map((s: any) => s.id)
    let cc: any[] | null = null
    const full = await svc
      .from('classes')
      .select('id, session_id, level, room, classroom_id, days, popup_minutes_before, smartboard_time_range')
      .in('session_id', ids)
    if (!full.error) {
      cc = full.data
    } else {
      // 일부 컬럼 미생성 시 폴백
      const basic = await svc
        .from('classes')
        .select('id, session_id, level, room')
        .in('session_id', ids)
      cc = (basic.data ?? []).map((c: any) => ({ ...c, classroom_id: null, days: null, popup_minutes_before: null, smartboard_time_range: null }))
    }
    if (cc?.length) { latestMonth = m; sessions = ss; classes = cc; break }
  }
  const sessMap = new Map(sessions.map((s: any) => [s.id, s]))

  const myClasses = (classes ?? []).filter((c: any) =>
    c.classroom_id === classroomId || (c.room ?? '').toLowerCase() === roomName
  )

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

  // 1) 강제 팝업 우선 (시간 무관, 전체 반에서 검색)
  if (forcePopupClassId) {
    const cls = (classes ?? []).find((c: any) => c.id === forcePopupClassId)
    if (cls) {
      const sess = sessMap.get(cls.session_id)
      const timeRange = cls.smartboard_time_range ?? sess?.time_range ?? ''
      const { data: existing } = await svc
        .from('attendance_sessions').select('id').eq('class_id', cls.id).eq('session_date', today).maybeSingle()
      return NextResponse.json({ active: await buildActive(cls, sess ?? {}, timeRange, existing?.id ?? null, true), changeCode })
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

    return NextResponse.json({ active: await buildActive(cls, sess, timeRange, existing?.id ?? null, false), changeCode })
  }

  return NextResponse.json({
    active: null,
    changeCode,
    ...(debug ? { debug: {
      classroomId, campusId, roomName, latestMonth, months, todayDay, nowMin, forcePopupClassId,
      totalClasses: (classes ?? []).length,
      myClassCount: myClasses.length,
      myClasses: myClasses.map((c: any) => {
        const s = sessMap.get(c.session_id)
        return { id: c.id, level: c.level, room: c.room, classroom_id: c.classroom_id, days: c.days ?? s?.days, time_range: c.smartboard_time_range ?? s?.time_range }
      }),
    } } : {}),
  })
}
