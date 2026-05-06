import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getSessionGroup(name: string): string {
  if (name.includes('유치부')) return '유치부'
  if (name.includes('월수금')) return '3일반'
  if (name.includes('화목')) return '2일반'
  return '매일반'
}

function monthToNum(m: string): number {
  const p = m.match(/\d+/g)
  return p && p.length >= 2 ? Number(p[0]) * 100 + Number(p[1]) : 0
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const year = today.getFullYear()
  const dayMap: Record<number, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' }
  const todayDay = dayMap[today.getDay()] ?? null

  const [
    { data: campuses },
    { count: totalEmployees },
    { count: pendingTotal },
    { data: employeesByCampus },
    { data: grants },
    { data: approvedThisYear },
    { data: onLeaveToday },
    { data: allSessions },
  ] = await Promise.all([
    service.from('campuses').select('id, name, code, is_active').order('name'),
    service.from('users').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('is_active', true),
    service.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('users').select('campus_id').eq('is_active', true).in('role', ['employee', 'campus_admin']),
    service.from('leave_grants').select('user_id, campus_id, total_days, carried_over, extra_days').eq('year', year),
    service.from('leave_requests').select('user_id, campus_id, type, days_used').eq('status', 'approved')
      .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
    service.from('leave_requests').select('campus_id').eq('status', 'approved').lte('start_date', todayIso).gte('end_date', todayIso),
    service.from('class_sessions').select('id, campus_id, name, month').limit(10000),
  ])

  // 캠퍼스별 직원수
  const empCountMap: Record<string, number> = {}
  for (const u of employeesByCampus ?? []) {
    if (u.campus_id) empCountMap[u.campus_id] = (empCountMap[u.campus_id] ?? 0) + 1
  }

  // 캠퍼스별 총 부여 연차
  const grantedMap: Record<string, number> = {}
  for (const g of grants ?? []) {
    const total = (g.total_days ?? 0) + (g.carried_over ?? 0) + (g.extra_days ?? 0)
    grantedMap[g.campus_id] = (grantedMap[g.campus_id] ?? 0) + total
  }

  // 캠퍼스별 총 소진 연차
  const usedMap: Record<string, number> = {}
  for (const r of approvedThisYear ?? []) {
    const days = r.type === 'quarter' ? 0.25 : (r.days_used ?? 0)
    usedMap[r.campus_id] = (usedMap[r.campus_id] ?? 0) + days
  }

  // ── 학생 현황 ─────────────────────────────────────────────
  const latestMonthByCampus: Record<string, string> = {}
  for (const s of allSessions ?? []) {
    const curr = latestMonthByCampus[s.campus_id]
    if (!curr || monthToNum(s.month) > monthToNum(curr)) {
      latestMonthByCampus[s.campus_id] = s.month
    }
  }

  // 방과후 세션 제외 — 캠퍼스 대시보드 grandTotal(유치부+초등부)과 동일하게 맞춤
  const latestSessions = (allSessions ?? [])
    .filter(s => latestMonthByCampus[s.campus_id] === s.month && !s.name.includes('방과후'))
  const latestSessionIds = latestSessions.map(s => s.id)
  const sessMeta: Record<string, { campusId: string; group: string }> = {}
  for (const s of latestSessions) {
    sessMeta[s.id] = { campusId: s.campus_id, group: getSessionGroup(s.name) }
  }

  const { data: allClasses } = latestSessionIds.length
    ? await service.from('classes').select('id, session_id').in('session_id', latestSessionIds)
    : { data: [] as { id: string; session_id: string }[] }

  const classMeta: Record<string, { campusId: string; group: string }> = {}
  for (const c of allClasses ?? []) {
    const sm = sessMeta[c.session_id]
    if (sm) classMeta[c.id] = sm
  }

  const classIds = Object.keys(classMeta)
  const { data: allEnrollments } = classIds.length
    ? await service.from('class_enrollments')
        .select('class_id, student_id, campus_id, arr_schedule, dep_schedule, is_waitlist')
        .in('class_id', classIds).eq('is_waitlist', false).limit(10000)
    : { data: [] as { class_id: string; student_id: string; campus_id: string; arr_schedule: Record<string, string>; dep_schedule: Record<string, string>; is_waitlist: boolean }[] }

  const studentByCampus: Record<string, Record<string, number>> = {}
  for (const enr of allEnrollments ?? []) {
    const meta = classMeta[enr.class_id]
    if (!meta) continue
    const { campusId, group } = meta
    if (!studentByCampus[campusId]) studentByCampus[campusId] = {}
    studentByCampus[campusId][group] = (studentByCampus[campusId][group] ?? 0) + 1
  }

  const totalStudentByGroup: Record<string, number> = {}
  let totalStudents = 0
  for (const byGroup of Object.values(studentByCampus)) {
    for (const [group, count] of Object.entries(byGroup)) {
      totalStudentByGroup[group] = (totalStudentByGroup[group] ?? 0) + count
      totalStudents += count
    }
  }

  // ── 오늘 버스 현황 ─────────────────────────────────────────
  const busCountsByCampus: Record<string, { arr: number; dep: number }> = {}
  let totalTodayArr = 0
  let totalTodayDep = 0

  if (todayDay) {
    const { data: todayOverrides } = await service.from('pickup_overrides')
      .select('student_id, campus_id, direction, bus_name, is_absent').eq('date', todayIso)

    const ovArrByCampus: Record<string, Record<string, { bus_name: string | null; is_absent: boolean }>> = {}
    const ovDepByCampus: Record<string, Record<string, { bus_name: string | null; is_absent: boolean }>> = {}
    for (const ov of todayOverrides ?? []) {
      if (ov.direction === 'arr') {
        if (!ovArrByCampus[ov.campus_id]) ovArrByCampus[ov.campus_id] = {}
        ovArrByCampus[ov.campus_id][ov.student_id] = ov
      } else {
        if (!ovDepByCampus[ov.campus_id]) ovDepByCampus[ov.campus_id] = {}
        ovDepByCampus[ov.campus_id][ov.student_id] = ov
      }
    }

    for (const enr of allEnrollments ?? []) {
      const meta = classMeta[enr.class_id]
      if (!meta) continue
      const { campusId } = meta
      if (!busCountsByCampus[campusId]) busCountsByCampus[campusId] = { arr: 0, dep: 0 }

      const arrOv = ovArrByCampus[campusId]?.[enr.student_id]
      const arrBus = arrOv !== undefined
        ? (arrOv.is_absent ? null : arrOv.bus_name)
        : (enr.arr_schedule as Record<string, string>)?.[todayDay] ?? null
      if (arrBus) { busCountsByCampus[campusId].arr++; totalTodayArr++ }

      const depOv = ovDepByCampus[campusId]?.[enr.student_id]
      const depBus = depOv !== undefined
        ? (depOv.is_absent ? null : depOv.bus_name)
        : (enr.dep_schedule as Record<string, string>)?.[todayDay] ?? null
      if (depBus) { busCountsByCampus[campusId].dep++; totalTodayDep++ }
    }
  }

  const campusSummaries = (campuses ?? []).map(c => {
    const totalGranted = grantedMap[c.id] ?? 0
    const totalUsed = usedMap[c.id] ?? 0
    const remaining = totalGranted - totalUsed
    const usageRate = totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 100) : null
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      is_active: c.is_active,
      employeeCount: empCountMap[c.id] ?? 0,
      totalGranted,
      totalUsed,
      remaining,
      usageRate,
      studentCount: Object.values(studentByCampus[c.id] ?? {}).reduce((a, b) => a + b, 0),
      studentByGroup: studentByCampus[c.id] ?? {},
      todayArr: busCountsByCampus[c.id]?.arr ?? 0,
      todayDep: busCountsByCampus[c.id]?.dep ?? 0,
    }
  })

  return NextResponse.json({
    totalCampuses: (campuses ?? []).length,
    activeCampuses: (campuses ?? []).filter(c => c.is_active).length,
    totalEmployees: totalEmployees ?? 0,
    pendingTotal: pendingTotal ?? 0,
    onLeaveTodayTotal: (onLeaveToday ?? []).length,
    campusSummaries,
    year,
    totalStudents,
    totalStudentByGroup,
    todayDay,
    totalTodayArr,
    totalTodayDep,
  })
}
