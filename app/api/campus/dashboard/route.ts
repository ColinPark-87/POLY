import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

const DAYS = ['월', '화', '수', '목', '금'] as const
type Day = typeof DAYS[number]

// 세션 이름 → 수업 그룹 분류
function getSessionGroup(name: string): string {
  if (name.includes('유치부')) return '유치부'
  if (name.includes('월수금') || name.includes('3일')) return '3일반'
  if (name.includes('화목') || name.includes('2일')) return '2일반'
  return '매일반' // 매일반/5일/그 외
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!profile || !isCampusAdminLike(profile.role ?? '', profile.position ?? '')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const campusId = profile.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  // 최근 월 자동 선택
  const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
  const availableMonths = [...new Set((allMonthRows ?? []).map(s => s.month))].sort((a, b) => {
    const parse = (m: string) => { const p = m.match(/\d+/g); if (!p || p.length < 2) return 0; return Number(p[0]) * 100 + Number(p[1]) }
    return parse(b) - parse(a)
  })
  const targetMonth = availableMonths[0] ?? ''

  // ── 세션/반/수강생 조회 ─────────────────────────────────────
  const { data: sessions } = await service.from('class_sessions')
    .select('id,name,time_range').eq('campus_id', campusId).eq('month', targetMonth).order('sort_order')
  const sessionIds = (sessions ?? []).map(s => s.id)

  const { data: classes } = sessionIds.length
    ? await service.from('classes').select('id,session_id,level').in('session_id', sessionIds)
    : { data: [] as { id: string; session_id: string; level: string }[] }
  const classIds = (classes ?? []).map(c => c.id)

  // 클래스 → 세션 그룹 매핑
  const sessMap: Record<string, string> = Object.fromEntries((sessions ?? []).map(s => [s.id, s.name]))
  const classGroup: Record<string, string> = {}
  for (const c of classes ?? []) classGroup[c.id] = getSessionGroup(sessMap[c.session_id] ?? '')

  // 활성 학생 ID 목록 (퇴소 학생 제외)
  const { data: activeStudentRows } = await service.from('campus_students')
    .select('id').eq('campus_id', campusId).eq('is_active', true)
  const activeStudentIds = (activeStudentRows ?? []).map(s => s.id)

  // 수강생 (스케줄 포함) — 활성 학생만
  const { data: enrFull } = classIds.length && activeStudentIds.length
    ? await service.from('class_enrollments')
        .select('class_id,student_id,arr_schedule,dep_schedule,is_waitlist')
        .in('class_id', classIds).eq('is_waitlist', false).in('student_id', activeStudentIds)
    : { data: [] as { class_id: string; student_id: string; arr_schedule: Record<string,string>; dep_schedule: Record<string,string>; is_waitlist: boolean }[] }

  // Q1 통계
  const enrByClass: Record<string, number> = {}
  const uniqueStudentSet = new Set<string>()
  for (const e of enrFull ?? []) {
    enrByClass[e.class_id] = (enrByClass[e.class_id] ?? 0) + 1
    uniqueStudentSet.add(e.student_id)
  }
  const clsBySession: Record<string, string[]> = {}
  for (const c of classes ?? []) {
    if (!clsBySession[c.session_id]) clsBySession[c.session_id] = []
    clsBySession[c.session_id].push(c.id)
  }
  const sessionStats = (sessions ?? []).map(s => {
    const myCls = clsBySession[s.id] ?? []
    return {
      name: s.name, time_range: s.time_range,
      classCount: myCls.length,
      studentCount: myCls.reduce((n, cid) => n + (enrByClass[cid] ?? 0), 0),
      group: getSessionGroup(s.name),
    }
  })

  // Q1 enrollment history (monthly trend + delta)
  const curYear = new Date().getFullYear()
  const curMonthIdx = new Date().getMonth() // 0-indexed
  const { data: enrollHistory } = await service.from('enrollment_history')
    .select('type, effective_date, class_name')
    .eq('campus_id', campusId)
    .gte('effective_date', `${curYear}-01-01`)
    .in('type', ['enrolled', 'withdrawn'])

  function getHistoryGroup(cls: string): string {
    if (cls.includes('유치부') && !cls.includes('방과후')) return '유치부'
    if (cls.includes('방과후')) return '방과후'
    if (cls.includes('매일반')) return '매일반'
    if (cls.includes('월수금') || cls.includes('3일반')) return '3일반'
    if (cls.includes('화목') || cls.includes('2일반')) return '2일반'
    return '기타'
  }

  const monthlyEnroll: number[] = Array(12).fill(0)
  const monthlyWithdraw: number[] = Array(12).fill(0)
  const groupMonthlyEnroll: Record<string, number[]> = {}
  const groupMonthlyWithdraw: Record<string, number[]> = {}

  for (const h of enrollHistory ?? []) {
    const mi = parseInt(h.effective_date.slice(5, 7)) - 1
    const grp = getHistoryGroup(h.class_name ?? '')
    if (!groupMonthlyEnroll[grp]) {
      groupMonthlyEnroll[grp] = Array(12).fill(0)
      groupMonthlyWithdraw[grp] = Array(12).fill(0)
    }
    if (h.type === 'enrolled') { monthlyEnroll[mi]++; groupMonthlyEnroll[grp][mi]++ }
    else { monthlyWithdraw[mi]++; groupMonthlyWithdraw[grp][mi]++ }
  }

  // Q2: 요일×버스 탑승현황 — 그룹별 (중복 학생 제거: 같은 학생이 유치부+방과후 등 2개 반 수강 시 1명으로 집계)
  type BusDayMap = Record<string, Record<Day, number>>
  const arrByGroup: Record<string, BusDayMap> = { '유치부': {}, '매일반': {}, '3일반': {}, '2일반': {} }
  const depByGroup: Record<string, BusDayMap> = { '유치부': {}, '매일반': {}, '3일반': {}, '2일반': {} }
  const arrTotal: BusDayMap = {}
  const depTotal: BusDayMap = {}
  // 중복 방지: student_id+bus+day 조합을 이미 집계했는지 추적
  const arrSeen = new Set<string>()
  const depSeen = new Set<string>()

  for (const enr of enrFull ?? []) {
    const group = classGroup[enr.class_id] ?? '매일반'
    for (const day of DAYS) {
      const arrBus = (enr.arr_schedule as Record<string,string>)?.[day]
      if (arrBus && !day.endsWith('_loc') && !arrBus.endsWith('_loc')) {
        const key = `${enr.student_id}|${arrBus}|${day}`
        if (!arrSeen.has(key)) {
          arrSeen.add(key)
          if (!arrByGroup[group][arrBus]) arrByGroup[group][arrBus] = { 월:0, 화:0, 수:0, 목:0, 금:0 }
          arrByGroup[group][arrBus][day]++
          if (!arrTotal[arrBus]) arrTotal[arrBus] = { 월:0, 화:0, 수:0, 목:0, 금:0 }
          arrTotal[arrBus][day]++
        }
      }
      const depBus = (enr.dep_schedule as Record<string,string>)?.[day]
      if (depBus && !day.endsWith('_loc') && !depBus.endsWith('_loc')) {
        const key = `${enr.student_id}|${depBus}|${day}`
        if (!depSeen.has(key)) {
          depSeen.add(key)
          if (!depByGroup[group][depBus]) depByGroup[group][depBus] = { 월:0, 화:0, 수:0, 목:0, 금:0 }
          depByGroup[group][depBus][day]++
          if (!depTotal[depBus]) depTotal[depBus] = { 월:0, 화:0, 수:0, 목:0, 금:0 }
          depTotal[depBus][day]++
        }
      }
    }
  }

  // Q3: 연차 현황
  const [
    { data: employees },
    { data: grants },
    { data: approvedLeave },
    { data: pendingRequests },
    { data: leaveHistory },
  ] = await Promise.all([
    service.from('users').select('id,position,role,is_active').eq('campus_id', campusId).eq('is_active', true),
    service.from('leave_grants').select('user_id,total_days,carried_over,extra_days').eq('campus_id', campusId).eq('year', year),
    service.from('leave_requests').select('user_id,type,days_used').eq('campus_id', campusId).eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
    service.from('leave_requests')
      .select('id,type,start_date,end_date,days_used,reason,created_at,signature_data_url,users!user_id(name,position)')
      .eq('campus_id', campusId).eq('status', 'pending').order('created_at', { ascending: true }),
    service.from('leave_requests')
      .select('id,type,status,start_date,end_date,days_used,reason,created_at,reviewer_note,signature_data_url,users!user_id(name,position)')
      .eq('campus_id', campusId).in('status', ['approved', 'rejected'])
      .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
      .order('start_date', { ascending: false }).limit(100),
  ])

  const grantByUser: Record<string,number> = {}
  for (const g of grants ?? []) grantByUser[g.user_id] = g.total_days + g.carried_over + g.extra_days

  const usedByUser: Record<string,number> = {}
  for (const r of approvedLeave ?? []) {
    const days = r.type === 'quarter' ? 0.25 : r.days_used
    usedByUser[r.user_id] = (usedByUser[r.user_id] ?? 0) + days
  }

  const deptMap: Record<string, { count:number; grantedDays:number; usedDays:number }> = {}
  for (const emp of employees ?? []) {
    const dept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (!deptMap[dept]) deptMap[dept] = { count:0, grantedDays:0, usedDays:0 }
    deptMap[dept].count++
    deptMap[dept].grantedDays += grantByUser[emp.id] ?? 0
    deptMap[dept].usedDays += usedByUser[emp.id] ?? 0
  }

  // Q4: 오늘 탑승 (그룹별)
  const { data: busList } = await service.from('campus_buses').select('id,name,sort_order').eq('campus_id', campusId).order('sort_order')

  const today = new Date()
  const dayIdx = today.getDay()
  const dayMap2: Record<number, Day> = { 1:'월', 2:'화', 3:'수', 4:'목', 5:'금' }
  const todayDay = dayMap2[dayIdx] ?? null
  const dateStr = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-')
  const mondayOff = today.getDay() === 0 ? -6 : 1 - today.getDay()
  const monday = new Date(today); monday.setDate(today.getDate() + mondayOff)
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4)
  const fmtD = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
  const weekStartStr = fmtD(monday), weekEndStr = fmtD(friday)

  // { group -> { busName -> count } }
  const todayArrByGroup: Record<string, Record<string,number>> = { '유치부':{}, '매일반':{}, '3일반':{}, '2일반':{} }
  const todayDepByGroup: Record<string, Record<string,number>> = { '유치부':{}, '매일반':{}, '3일반':{}, '2일반':{} }
  const todayArrTotal: Record<string,number> = {}
  const todayDepTotal: Record<string,number> = {}

  const { data: overrides } = todayDay
    ? await service.from('pickup_overrides')
        .select('student_id,direction,bus_name,is_absent').eq('campus_id', campusId).eq('date', dateStr)
    : { data: [] as { student_id:string; direction:string; bus_name:string|null; is_absent:boolean }[] }

  if (todayDay) {
    const ovArr: Record<string,{bus_name:string|null;is_absent:boolean}> = {}
    const ovDep: Record<string,{bus_name:string|null;is_absent:boolean}> = {}
    for (const ov of overrides ?? []) {
      if (ov.direction === 'arr') ovArr[ov.student_id] = ov
      else ovDep[ov.student_id] = ov
    }

    for (const enr of enrFull ?? []) {
      const group = classGroup[enr.class_id] ?? '매일반'
      const arrOv = ovArr[enr.student_id]
      const arrBus = arrOv !== undefined
        ? (arrOv.is_absent ? null : arrOv.bus_name)
        : (enr.arr_schedule as Record<string,string>)?.[todayDay] ?? null
      if (arrBus && !arrBus.endsWith('_loc')) {
        if (!todayArrByGroup[group]) todayArrByGroup[group] = {}
        todayArrByGroup[group][arrBus] = (todayArrByGroup[group][arrBus] ?? 0) + 1
        todayArrTotal[arrBus] = (todayArrTotal[arrBus] ?? 0) + 1
      }
      const depOv = ovDep[enr.student_id]
      const depBus = depOv !== undefined
        ? (depOv.is_absent ? null : depOv.bus_name)
        : (enr.dep_schedule as Record<string,string>)?.[todayDay] ?? null
      if (depBus && !depBus.endsWith('_loc')) {
        if (!todayDepByGroup[group]) todayDepByGroup[group] = {}
        todayDepByGroup[group][depBus] = (todayDepByGroup[group][depBus] ?? 0) + 1
        todayDepTotal[depBus] = (todayDepTotal[depBus] ?? 0) + 1
      }
    }
  }

  const overrideCount = (overrides ?? []).length
  const absentCount = (overrides ?? []).filter((o: { is_absent: boolean }) => o.is_absent).length
  const changeCount = overrideCount - absentCount

  const { data: thisWeekLeave } = await service.from('leave_requests')
    .select('id,user_id,type,start_date,end_date,days_used,users!user_id(name,position)')
    .eq('campus_id', campusId).eq('status', 'approved')
    .lte('start_date', weekEndStr).gte('end_date', weekStartStr)

  return NextResponse.json({
    month: targetMonth,
    // Q1
    roster: {
      uniqueStudents: uniqueStudentSet.size,
      totalClasses: (classes ?? []).length,
      sessionStats,
      monthlyEnroll,
      monthlyWithdraw,
      groupMonthlyEnroll,
      groupMonthlyWithdraw,
      curMonthIdx,
    },
    // Q2
    buses: busList ?? [],
    arrByGroup, depByGroup,
    arrTotal, depTotal,
    // Q3
    leave: {
      totalEmployees: (employees ?? []).filter(e => e.role === 'employee').length,
      pendingCount: (pendingRequests ?? []).length,
      deptStats: Object.entries(deptMap).map(([dept, s]) => ({ dept, ...s })),
      pendingRequests: pendingRequests ?? [],
      leaveHistory: leaveHistory ?? [],
    },
    // Q4
    today: {
      day: todayDay, date: dateStr,
      arrByGroup: todayArrByGroup, depByGroup: todayDepByGroup,
      arrTotal: todayArrTotal, depTotal: todayDepTotal,
      overrideCount, absentCount, changeCount,
    },
    thisWeekLeave: thisWeekLeave ?? [],
  })
}
