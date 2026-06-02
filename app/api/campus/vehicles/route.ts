import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

const DAYS = ['월', '화', '수', '목', '금'] as const
type Day = typeof DAYS[number]

// 시간 표준화: 공통 _time을 설정/삭제할 때 요일별 {요일}_time override를 제거해
// 개설반 현황(StudentDetailModal: {요일}_time 우선)과 차량관리(_time)가 항상 같은 시간을 보게 함
function clearPerDayTimes(sched: Record<string, string>) {
  for (const d of DAYS) delete sched[d + '_time']
}

// 차량관리 대상 월 선택: 다음 달 개설반이 미리 생성돼 있으면 다음 달 우선,
// 없으면 현재 달, 그것도 없으면 가장 최신 달.
// (예: 현재 5월이라도 6월 개설반이 있으면 6월을 사용해 미리 노선 준비)
function pickTargetMonth(availableMonths: string[]): string {
  // 한국시간(KST, UTC+9) 기준 — 서버 UTC와 월 경계 오차 방지
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth() + 1 // 1~12
  const cur = `${y}년 ${m}월`
  const next = `${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월`
  if (availableMonths.includes(next)) return next
  if (availableMonths.includes(cur)) return cur
  return availableMonths[0] ?? ''
}

// 세션 이름에서 수업 가능 요일 반환 (빈 배열 = 필터 없음)
function getClassDays(sessionName: string | null): Day[] {
  if (!sessionName) return []
  if (/화목|2일/.test(sessionName)) return ['화', '목']
  if (/월수금|3일/.test(sessionName)) return ['월', '수', '금']
  return []
}

// 세션 이름에서 그룹 레이블 추출 (유치부/초등부 구분용)
// 유치부 방과후: 등원/하원 모두 유치부 그룹
// 초등 방과후: 하원→매일반, 등원→방과후
function getSessionLabel(name: string | null, dir: 'arr' | 'dep' = 'arr'): string {
  if (!name) return ''
  if (name.includes('방과후')) {
    if (name.includes('유치부')) return '유치부'
    return dir === 'dep' ? '매일반' : '방과후'
  }
  if (name.includes('유치부')) return '유치부'
  if (name.includes('매일반') || name.includes('5일')) return '매일반'
  if (name.includes('월수금') || name.includes('3일')) return '3일반'
  if (name.includes('화목') || name.includes('2일')) return '2일반'
  return name
}

// 시간 문자열을 24시간 기준 분으로 변환 (8 미만 시는 오후로 간주 +12)
function parseTimeMinNorm(t: string | null): number {
  if (!t) return 9999
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}

// 세션별 최소 하원 시간(분) — 이보다 이른 _time은 등원 시간이 잘못 기록된 것으로 판단
// ⚠️ 유치부를 방과후보다 먼저 체크: "유치부 방과후" 세션이 방과후(16:30)로 잘못 분류되는 버그 방지
function getMinDepTime(sessionName: string | null): number {
  if (!sessionName) return 0
  if (sessionName.includes('2일반') || sessionName.includes('화목')) return 18 * 60 + 50  // 18:50
  if (sessionName.includes('3일반') || sessionName.includes('월수금')) return 18 * 60 + 5   // 18:05
  if (sessionName.includes('유치부')) return 13 * 60 + 30  // 13:30 (유치부 방과후 포함)
  if (sessionName.includes('매일반') || sessionName.includes('방과후')) return 16 * 60 + 30  // 16:30
  return 0
}

// 세션별 최소 등원 시간(분) — 이보다 이른 _time은 하원 시간이 잘못 기록된 것으로 판단
// 유치부: 아침 등원 정상 → 검사 안 함
// 초등부 (매일반/화목/월수금): 학교 끝나고 오므로 13:00 이후
function getMinArrTime(sessionName: string | null): number {
  if (!sessionName) return 0
  if (sessionName.includes('유치부')) return 0  // 아침 등원 정상
  if (sessionName.includes('초등부') || sessionName.includes('매일반') ||
      sessionName.includes('화목') || sessionName.includes('월수금')) return 13 * 60  // 13:00
  return 0
}

// 장소 문자열 앞에 붙은 시간 파싱: "08:57 중계1동 어린이집" → { time: "08:57", cleanLoc: "중계1동 어린이집" }
function parseLocTime(loc: string | null): { time: string | null; cleanLoc: string | null } {
  if (!loc) return { time: null, cleanLoc: null }
  const m = loc.match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/)
  if (m) return { time: m[1].trim(), cleanLoc: m[2].trim() }
  return { time: null, cleanLoc: loc }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id)
    .single()

  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!permissions.vehicles) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const dateStr = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const direction = (searchParams.get('direction') ?? 'dep') as 'arr' | 'dep'
  const month = searchParams.get('month') ?? ''
  const master = searchParams.get('master') === 'true'  // 마스터 스케줄 모드

  const d = new Date(dateStr)
  const dayIdx = d.getDay()
  const dayMap: Record<number, Day> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' }
  const dayKey = dayMap[dayIdx] ?? '월'

  const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
  const availableMonths = [...new Set((allMonthRows ?? []).map(s => s.month))].sort((a, b) => {
    const parse = (m: string) => { const parts = m.match(/\d+/g); if (!parts || parts.length < 2) return 0; return Number(parts[0]) * 100 + Number(parts[1]) }
    return parse(b) - parse(a)
  })
  const targetMonth = (month && availableMonths.includes(month)) ? month : pickTargetMonth(availableMonths)

  const { data: sessions } = await service.from('class_sessions')
    .select('id, name, time_range').eq('campus_id', campusId).eq('month', targetMonth).order('sort_order')
  const sessionIds = (sessions ?? []).map(s => s.id)
  const sessionMap: Record<string, { name: string; time_range: string | null }> = {}
  for (const s of sessions ?? []) sessionMap[s.id] = { name: s.name, time_range: s.time_range }

  const classSessionMap: Record<string, string> = {}
  let enrollments: {
    student_id: string; class_id: string
    arr_schedule: Record<string, string>; dep_schedule: Record<string, string>
    campus_students: { name: string; english_name: string | null }
  }[] = []

  if (sessionIds.length) {
    const { data: classes } = await service.from('classes').select('id, session_id').in('session_id', sessionIds)
    for (const c of classes ?? []) classSessionMap[c.id] = c.session_id
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length) {
      const { data } = await service.from('class_enrollments')
        .select('student_id, class_id, arr_schedule, dep_schedule, campus_students(name, english_name)')
        .in('class_id', classIds).eq('is_waitlist', false)
      enrollments = (data ?? []) as unknown as typeof enrollments
    }
  }

  // 빈 정류장 마스터 (학생 0명 정류장) — 현재 방향만
  const { data: registeredStopRows } = await service.from('campus_registered_stops')
    .select('stop_name, bus_name, direction, default_time').eq('campus_id', campusId).eq('direction', direction)
  const registeredStops = registeredStopRows ?? []

  const { data: overrides } = await service.from('pickup_overrides')
    .select('*').eq('campus_id', campusId).eq('date', dateStr).eq('direction', direction)
  const overrideMap: Record<string, { bus_name: string | null; is_absent: boolean; location?: string | null; pickup_time?: string | null }> = {}
  for (const ov of overrides ?? []) overrideMap[ov.student_id] = {
    bus_name: ov.bus_name, is_absent: ov.is_absent,
    location: ov.location ?? null, pickup_time: ov.pickup_time ?? null,
  }

  interface StudentEntry {
    student_id: string; name: string; english_name: string | null
    class_id: string
    override?: boolean; location: string | null
    dayLocs?: Record<string, string>  // 요일별 탑승 장소 (같은 호차·요일별 다른 지점)
    days: string[]  // 해당 방향으로 탑승하는 요일 목록
    pickup_time: string | null  // arr_schedule["_time"] / dep_schedule["_time"]
    is_bangwaHu?: boolean  // 방과후 세션 + 하원 여부 (매일반 탭 내 유치 배지용)
  }

  interface TimeGroupRaw {
    session_name: string; time_range: string
    busMap: Record<string, StudentEntry[]>
    busLocationSets: Record<string, Set<string>>
  }

  const busMap: Record<string, StudentEntry[]> = {}
  const timeGroupRaw: Record<string, TimeGroupRaw> = {}
  const busLocationSets: Record<string, Set<string>> = {}

  for (const enr of enrollments) {
    const sched = direction === 'arr' ? enr.arr_schedule : enr.dep_schedule
    const sessionId = classSessionMap[enr.class_id]
    const sess = sessionId ? sessionMap[sessionId] : null
    const time_range = sess?.time_range ?? null
    const session_name = sess?.name ?? null
    // _time, time 키 모두 확인 (마이그레이션 데이터에 따라 키 이름 다를 수 있음)
    const rawPickupTime: string | null =
      (sched?.['_time'] as string | undefined) ||
      (sched?.['time'] as string | undefined) ||
      null
    // 방향별 최소 시간 미만이면 반대 방향 시간이 잘못 기록된 것으로 판단 → null 처리
    let pickup_time: string | null = rawPickupTime
    if (rawPickupTime) {
      if (direction === 'dep') {
        pickup_time = parseTimeMinNorm(rawPickupTime) >= getMinDepTime(session_name) ? rawPickupTime : null
      } else {
        const minArr = getMinArrTime(session_name)
        if (minArr > 0) {
          // 등원 시간 상한: 세션 시작 시간 이하여야 함 (초과 시 하원 시간이 잘못 저장된 것)
          const sessStartMin = time_range ? parseTimeMinNorm(time_range.split('~')[0]?.trim() ?? '') : 9999
          const tMin = parseTimeMinNorm(rawPickupTime)
          pickup_time = (tMin >= minArr && (sessStartMin >= 9999 || tMin <= sessStartMin)) ? rawPickupTime : null
        } else if (session_name?.includes('유치부')) {
          // 유치부 등원: 아침 시간만 허용 (13:00 이후는 하원 시간이 잘못 저장된 것)
          pickup_time = parseTimeMinNorm(rawPickupTime) < 13 * 60 ? rawPickupTime : null
        }
      }
    }

    if (master) {
      // ── 마스터 모드: 요일별 버스 배정 집계 (오늘 무관) ──────────────
      const allDays = ['월', '화', '수', '목', '금'] as const
      const busTodays: Record<string, string[]> = {}
      for (const day of allDays) {
        const bus = sched?.[day]
        if (bus && typeof bus === 'string') {
          if (!busTodays[bus]) busTodays[bus] = []
          busTodays[bus].push(day)
        }
      }
      for (const [busName, assignedDays] of Object.entries(busTodays)) {
        const firstDay = assignedDays[0]
        const rawLoc: string | null = sched?.[firstDay + '_loc'] ?? null
        const { cleanLoc } = parseLocTime(rawLoc)
        // per-day time 키도 확인: 월_time, 화_time 등
        const dayTime = (sched?.[firstDay + '_time'] as string | undefined) || null
        // locTime(위치 문자열 내 시간)은 방향 구분이 없으므로 사용하지 않음
        // → 방향별 defaultTime(session time_range 기반)으로 표시
        const resolvedTime = pickup_time || dayTime || null
        const location = cleanLoc
        // 요일별 장소 수집 (같은 호차라도 요일마다 다른 지점 지원)
        const dayLocs: Record<string, string> = {}
        for (const day of assignedDays) {
          const { cleanLoc: dl } = parseLocTime(sched?.[day + '_loc'] ?? null)
          if (dl) dayLocs[day] = dl
        }
        const entry: StudentEntry = {
          student_id: enr.student_id,
          class_id: enr.class_id,
          name: enr.campus_students?.name ?? '',
          english_name: enr.campus_students?.english_name ?? null,
          override: false,
          location,
          dayLocs,
          days: assignedDays,
          pickup_time: resolvedTime,
          is_bangwaHu: !!(session_name?.includes('방과후') && !session_name?.includes('유치부') && direction === 'dep'),
        }
        if (!busMap[busName]) busMap[busName] = []
        busMap[busName].push(entry)
        if (time_range) {
          const groupKey = getSessionLabel(session_name, direction) + '|' + time_range
          if (!timeGroupRaw[groupKey]) {
            timeGroupRaw[groupKey] = { session_name: session_name ?? '', time_range, busMap: {}, busLocationSets: {} }
          }
          const tg = timeGroupRaw[groupKey]
          if (!tg.busMap[busName]) tg.busMap[busName] = []
          tg.busMap[busName].push(entry)
          if (location) {
            if (!tg.busLocationSets[busName]) tg.busLocationSets[busName] = new Set()
            tg.busLocationSets[busName].add(location)
          }
        }
        if (location) {
          if (!busLocationSets[busName]) busLocationSets[busName] = new Set()
          busLocationSets[busName].add(location)
        }
      }
    } else {
      // ── 오늘 모드: 오늘 요일 기준 + override 적용 ──────────────────
      const ov = overrideMap[enr.student_id]
      let busName: string | null
      if (ov !== undefined) {
        busName = ov.is_absent ? null : ov.bus_name
      } else {
        busName = sched?.[dayKey] ?? null
      }
      if (!busName) continue

      const rawLoc2: string | null = sched?.[dayKey + '_loc'] ?? null
      const { cleanLoc: cleanLoc2 } = parseLocTime(rawLoc2)
      const dayTime2 = (sched?.[dayKey + '_time'] as string | undefined) || null
      // locTime은 방향 구분이 없으므로 사용하지 않음
      const resolvedTime2 = pickup_time || dayTime2 || null
      const location = cleanLoc2
      const allDays = ['월', '화', '수', '목', '금'] as const
      const scheduleDays = allDays.filter(day => {
        const v = sched?.[day]
        return v && typeof v === 'string' && !v.endsWith('_loc')
      })

      // override에 location/pickup_time이 있으면 우선 적용
      const finalLocation = (ov !== undefined && ov.location !== undefined) ? (ov.location ?? location) : location
      const finalTime = (ov !== undefined && ov.pickup_time !== undefined) ? (ov.pickup_time ?? resolvedTime2) : resolvedTime2
      const entry: StudentEntry = {
        student_id: enr.student_id,
        class_id: enr.class_id,
        name: enr.campus_students?.name ?? '',
        english_name: enr.campus_students?.english_name ?? null,
        override: ov !== undefined,
        location: finalLocation,
        days: scheduleDays,
        pickup_time: finalTime,
        is_bangwaHu: !!(session_name?.includes('방과후') && !session_name?.includes('유치부') && direction === 'dep'),
      }

      if (!busMap[busName]) busMap[busName] = []
      busMap[busName].push(entry)

      if (time_range) {
        const groupKey = getSessionLabel(session_name, direction) + '|' + time_range
        if (!timeGroupRaw[groupKey]) {
          timeGroupRaw[groupKey] = { session_name: session_name ?? '', time_range, busMap: {}, busLocationSets: {} }
        }
        const tg = timeGroupRaw[groupKey]
        if (!tg.busMap[busName]) tg.busMap[busName] = []
        tg.busMap[busName].push(entry)
        if (location) {
          if (!tg.busLocationSets[busName]) tg.busLocationSets[busName] = new Set()
          tg.busLocationSets[busName].add(location)
        }
      }
      if (location) {
        if (!busLocationSets[busName]) busLocationSets[busName] = new Set()
        busLocationSets[busName].add(location)
      }
    }
  }

  // 같은 학생이 여러 enrollment(유치부 + 유치부 방과후 등)로 같은 버스에 중복 등록된 경우 합산
  function dedupStudents(arr: StudentEntry[]): StudentEntry[] {
    const map = new Map<string, StudentEntry>()
    for (const s of arr) {
      if (map.has(s.student_id)) {
        const ex = map.get(s.student_id)!
        ex.days = [...new Set([...ex.days, ...s.days])]
      } else {
        map.set(s.student_id, { ...s })
      }
    }
    return [...map.values()]
  }
  for (const busName of Object.keys(busMap)) {
    busMap[busName] = dedupStudents(busMap[busName])
  }
  for (const tg of Object.values(timeGroupRaw)) {
    for (const busName of Object.keys(tg.busMap)) {
      tg.busMap[busName] = dedupStudents(tg.busMap[busName])
    }
  }

  // 오늘 결석 처리된 학생 목록
  const absentStudentIds = (overrides ?? [])
    .filter(ov => ov.is_absent)
    .map(ov => ov.student_id)
  interface AbsentEntry { student_id: string; name: string }
  const absentStudents: AbsentEntry[] = []
  if (absentStudentIds.length) {
    // enrollments에서 이름 찾기
    const nameMap: Record<string, string> = {}
    for (const enr of enrollments) {
      nameMap[enr.student_id] = enr.campus_students?.name ?? ''
    }
    for (const sid of absentStudentIds) {
      if (nameMap[sid]) absentStudents.push({ student_id: sid, name: nameMap[sid] })
    }
  }

  // 차량변경 요청 목록 모드
  if (searchParams.get('requests') === 'true') {
    const { data: changeReqs } = await service.from('bus_change_requests')
      .select('*').eq('campus_id', campusId)
      .order('status').order('created_at', { ascending: false })
      .limit(200)
    const pendingCount = (changeReqs ?? []).filter(r => r.status === 'pending').length
    return NextResponse.json({ requests: changeReqs ?? [], pendingCount })
  }

  const { data: buses } = await service.from('campus_buses').select('*').eq('campus_id', campusId).order('sort_order')

  // 세션 유형 우선순위: 유치부 → 매일반 → 3일반 → 2일반
  // 유치부 방과후: 항상 유치부(1) / 초등 방과후: 하원→매일반(2), 등원→1.5
  function sessPriority(name: string): number {
    if (name.includes('방과후')) {
      if (name.includes('유치부')) return 1
      return direction === 'dep' ? 2 : 1.5
    }
    if (name.includes('유치부')) return 1
    if (name.includes('매일반')) return 2
    if (name.includes('월수금') || name.includes('3일반')) return 3
    if (name.includes('화목') || name.includes('2일반')) return 4
    return 9
  }
  // "H:MM" 또는 "HH:MM" → 분 단위 숫자
  function parseTimeMin(t: string): number {
    const m = t.match(/(\d{1,2}):(\d{2})/)
    if (!m) return 9999
    return parseInt(m[1]) * 60 + parseInt(m[2])
  }

  // 빈 정류장 마스터 합집합: 학생 0명이어도 해당 호차의 location 후보로 노출.
  // 세션 정보가 없으므로 해당 호차가 등장하는 모든 timeGroup에 합치고, 글로벌 맵에도 추가.
  // (count=0이라 busMap엔 넣지 않음 — busLocations/busLocationMap 후보로만 노출)
  const registeredStopTimes: Record<string, string> = {}  // `${bus_name}|${stop_name}` → default_time
  for (const rs of registeredStops) {
    const bus = rs.bus_name
    const loc = rs.stop_name
    if (rs.default_time) registeredStopTimes[`${bus}|${loc}`] = rs.default_time
    if (!busLocationSets[bus]) busLocationSets[bus] = new Set()
    busLocationSets[bus].add(loc)
    for (const tg of Object.values(timeGroupRaw)) {
      if (!(bus in tg.busMap)) continue
      if (!tg.busLocationSets[bus]) tg.busLocationSets[bus] = new Set()
      tg.busLocationSets[bus].add(loc)
    }
  }

  // Convert to serializable format, sort by (세션우선순위, 시작시간)
  const timeGroups = Object.values(timeGroupRaw)
    .sort((a, b) => {
      const pa = sessPriority(a.session_name), pb = sessPriority(b.session_name)
      if (pa !== pb) return pa - pb
      return parseTimeMin(a.time_range) - parseTimeMin(b.time_range)
    })
    .map(tg => ({
      session_name: tg.session_name,
      time_range: tg.time_range,
      busMap: tg.busMap,
      busLocations: Object.fromEntries(
        Object.entries(tg.busLocationSets).map(([name, locs]) => [name, [...locs]])
      ) as Record<string, string[]>,
    }))

  const busLocationMap: Record<string, string[]> = {}
  for (const [name, locs] of Object.entries(busLocationSets)) {
    busLocationMap[name] = [...locs]
  }

  return NextResponse.json({
    busMap, buses: buses ?? [], dayKey, date: dateStr, month: targetMonth, availableMonths,
    timeGroups, busLocationMap, absentStudents,
    registeredStops, registeredStopTimes,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, position, role, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id)
    .single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  // 차량 편집 권한 — GET 과 동일한 resolvePermissions 사용 + restricted(POLY안전) 는 읽기 전용
  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!permissions.vehicles || permissions.vehiclesRestricted) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // class_id 가 자기 캠퍼스 소속인지 검증 (cross-campus 변조 차단)
  async function assertClassInCampus(classId: string): Promise<NextResponse | null> {
    if (!classId) return NextResponse.json({ error: 'class_id 누락' }, { status: 400 })
    const { data: cls } = await service.from('classes').select('session_id').eq('id', classId).maybeSingle()
    if (!cls) return NextResponse.json({ error: '반 없음' }, { status: 404 })
    const { data: sess } = await service.from('class_sessions').select('campus_id').eq('id', cls.session_id).maybeSingle()
    if (sess?.campus_id !== campusId) return NextResponse.json({ error: '다른 캠퍼스의 반은 수정할 수 없습니다.' }, { status: 403 })
    return null
  }

  const body = await request.json()
  const { action } = body

  // 세션명 기준 등하원 시간 유효성 검사
  function validatePickupTime(session_name: string | null, pickup_time: string | null, dir: 'arr' | 'dep', time_range?: string | null): boolean {
    if (!pickup_time || !session_name) return true
    if (dir === 'dep') return parseTimeMinNorm(pickup_time) >= getMinDepTime(session_name)
    const minArr = getMinArrTime(session_name)
    if (minArr === 0) return true  // 유치부 등 검사 안 함
    const tMin = parseTimeMinNorm(pickup_time)
    if (tMin < minArr) return false
    // 등원 시간 상한: 세션 시작 시간 이하여야 함
    if (time_range) {
      const sessStartMin = parseTimeMinNorm(time_range.split('~')[0]?.trim() ?? '')
      if (sessStartMin < 9999 && tMin > sessStartMin) return false
    }
    return true
  }

  if (action === 'set_override') {
    const { student_id, date, direction, bus_name, is_absent, location, pickup_time } = body
    const { data, error } = await service.from('pickup_overrides').upsert({
      student_id, campus_id: campusId, date, direction,
      bus_name: is_absent ? null : bus_name,
      is_absent: !!is_absent,
      location: is_absent ? null : (location ?? null),
      pickup_time: is_absent ? null : (pickup_time ?? null),
      created_by: user.id,
    }, { onConflict: 'student_id,date,direction' }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ override: data })
  }

  if (action === 'search_students') {
    const { query } = body
    const q = (query ?? '').trim()
    let qb = service.from('campus_students')
      .select('id, name, english_name')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .order('name')
    if (q) qb = qb.ilike('name', `%${q}%`)
    const { data } = await qb.limit(q ? 20 : 300)
    return NextResponse.json({ students: data ?? [] })
  }

  if (action === 'add_rider') {
    // 차량에 탑승자 추가: class_enrollment 스케줄 영구 업데이트 + 오늘 override
    const { student_id, date, direction: dir, bus_name, pickup_time, pickup_location, days, session_name } = body
    // GET과 동일하게 최신 달 세션만 검색 (다른 달 enrollment 오업데이트 방지)
    const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
    const availableMonths = [...new Set((allMonthRows ?? []).map((s: any) => s.month as string))].sort((a, b) => {
      const parse = (m: string) => { const parts = m.match(/\d+/g); if (!parts || parts.length < 2) return 0; return Number(parts[0]) * 100 + Number(parts[1]) }
      return parse(b) - parse(a)
    })
    const targetMonth = pickTargetMonth(availableMonths)
    const { data: campusSessions } = await service.from('class_sessions')
      .select('id, name').eq('campus_id', campusId).eq('month', targetMonth)
    const allSessRows = (campusSessions ?? []) as { id: string; name: string }[]

    // session_name이 있으면 해당 세션 유형으로 필터링
    let targetSessionIds: string[]
    if (session_name) {
      const targetLabel = getSessionLabel(session_name, dir)
      const matched = allSessRows.filter(s => getSessionLabel(s.name, dir) === targetLabel)
      targetSessionIds = matched.length > 0 ? matched.map(s => s.id) : allSessRows.map(s => s.id)
    } else {
      targetSessionIds = allSessRows.map(s => s.id)
    }

    const { data: targetClasses } = targetSessionIds.length
      ? await service.from('classes').select('id').in('session_id', targetSessionIds)
      : { data: null }
    const targetClassIds = (targetClasses ?? []).map((c: { id: string }) => c.id)

    const { data: enrList } = targetClassIds.length
      ? await service.from('class_enrollments')
          .select('class_id, arr_schedule, dep_schedule')
          .eq('student_id', student_id)
          .in('class_id', targetClassIds)
          .eq('is_waitlist', false)
      : { data: null }

    if (!enrList?.length) {
      return NextResponse.json({ error: '수강 데이터를 찾을 수 없습니다. 해당 학생의 수강 등록을 확인해주세요.' }, { status: 404 })
    }

    const enr = enrList[0]
    const schedKey = dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const currentSched = { ...(enr[schedKey] ?? {}) } as Record<string, string>
    const dayList: string[] = Array.isArray(days) ? days : []
    for (const d of dayList) {
      currentSched[d] = bus_name
      if (pickup_location) currentSched[d + '_loc'] = pickup_location
    }
    if (pickup_time) { currentSched['_time'] = pickup_time; clearPerDayTimes(currentSched) }
    const { error: updateError } = await service.from('class_enrollments')
      .update({ [schedKey]: currentSched })
      .eq('student_id', student_id)
      .eq('class_id', enr.class_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // 오늘 날짜 override 생성 (버스 배정만, location/pickup_time은 enrollment에 저장됨)
    const { data, error } = await service.from('pickup_overrides').upsert({
      student_id, campus_id: campusId, date, direction: dir,
      bus_name, is_absent: false,
      created_by: user.id,
    }, { onConflict: 'student_id,date,direction' }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ override: data, enrollment_updated: true })
  }

  if (action === 'add_bus') {
    const { name, capacity } = body
    const { data: existing } = await service.from('campus_buses').select('id').eq('campus_id', campusId).eq('name', name).maybeSingle()
    if (existing) return NextResponse.json({ error: '이미 존재하는 차량' }, { status: 409 })
    const insertData: Record<string, unknown> = { campus_id: campusId, name }
    if (capacity) insertData.capacity = Number(capacity)
    const { data, error } = await service.from('campus_buses').insert(insertData).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bus: data })
  }

  if (action === 'delete_bus') {
    const { bus_id } = body
    const { error } = await service.from('campus_buses').delete().eq('id', bus_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_enrollment_schedule') {
    const { student_id, class_id, direction: dir, days, bus_name, old_bus_name, location, pickup_time, day_locations } = body
    const campusErr = await assertClassInCampus(class_id)
    if (campusErr) return campusErr
    const { data: enr } = await service.from('class_enrollments')
      .select('arr_schedule, dep_schedule, class_id')
      .eq('student_id', student_id).eq('class_id', class_id).single()
    if (!enr) return NextResponse.json({ error: '수강 없음' }, { status: 404 })

    // 등하원 시간 유효성 검사
    if (pickup_time) {
      const { data: cls } = await service.from('classes').select('session_id').eq('id', class_id).single()
      if (cls) {
        const { data: sess } = await service.from('class_sessions').select('name, time_range').eq('id', cls.session_id).single()
        const sessName = sess?.name ?? null
        const sessTimeRange = sess?.time_range ?? null
        if (!validatePickupTime(sessName, pickup_time, dir, sessTimeRange)) {
          const label = dir === 'dep' ? '하원' : '등원'
          if (dir === 'arr' && sessTimeRange) {
            const sessStart = sessTimeRange.split('~')[0]?.trim() ?? ''
            return NextResponse.json({ error: `등원 시간 오류: ${sessName} 세션의 등원 시간은 세션 시작(${sessStart}) 이전이어야 합니다.` }, { status: 400 })
          }
          const minMin = dir === 'dep' ? getMinDepTime(sessName) : getMinArrTime(sessName)
          const minStr = `${Math.floor(minMin / 60)}:${String(minMin % 60).padStart(2, '0')}`
          return NextResponse.json({ error: `${label} 시간 오류: ${sessName} 세션의 최소 ${label} 시간(${minStr}) 이후여야 합니다.` }, { status: 400 })
        }
      }
    }

    const schedKey = dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const sched = { ...(enr[schedKey as keyof typeof enr] as Record<string,string> ?? {}) }
    const dayList: string[] = Array.isArray(days) ? days : []
    const allDays = ['월', '화', '수', '목', '금']

    // 대상 버스(이동이면 이동 전 버스, 아니면 현재 버스)로 배정된 요일 중 새 dayList에 없는 것 제거.
    // (기존엔 old_bus_name 없으면 제거가 안 돼, 같은 버스에서 요일만 빼면 저장돼도 안 빠지는 버그)
    const targetOldBus = old_bus_name ?? bus_name
    if (targetOldBus) {
      for (const d of allDays) {
        if (sched[d] === targetOldBus && !dayList.includes(d)) {
          delete sched[d]
          delete sched[d + '_loc']
        }
      }
    }

    for (const d of dayList) {
      if (bus_name) sched[d] = bus_name
      else delete sched[d]  // 미배정: 선택 요일의 버스 배정 제거
      // 요일별 장소(day_locations)가 있으면 그 요일은 개별 장소, 없으면 단일 location 적용
      const dloc = (day_locations && Object.prototype.hasOwnProperty.call(day_locations, d)) ? day_locations[d] : location
      if (dloc === '' || dloc === null || dloc === undefined) delete sched[d + '_loc']
      else sched[d + '_loc'] = dloc
    }
    if (pickup_time !== undefined) {
      if (pickup_time) sched['_time'] = pickup_time
      else delete sched['_time']
      clearPerDayTimes(sched)
    }
    const { error } = await service.from('class_enrollments')
      .update({ [schedKey]: sched })
      .eq('student_id', student_id).eq('class_id', class_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'submit_change_request') {
    const { student_id, student_name, class_id, direction: dir, from_bus, to_bus, days, location, pickup_time, note } = body
    if (!to_bus || !Array.isArray(days) || days.length === 0)
      return NextResponse.json({ error: '호차/요일 필수' }, { status: 400 })
    const campusErr = await assertClassInCampus(class_id)
    if (campusErr) return campusErr
    const { data, error } = await service.from('bus_change_requests').insert({
      campus_id: campusId, student_id, student_name, class_id, direction: dir,
      from_bus: from_bus || null, to_bus, days,
      location: location || null, pickup_time: pickup_time || null,
      note: note || null, created_by: user.id, status: 'pending',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data })
  }

  if (action === 'approve_change_request') {
    const { request_id } = body
    const { data: req } = await service.from('bus_change_requests')
      .select('*').eq('id', request_id).eq('campus_id', campusId).single()
    if (!req) return NextResponse.json({ error: '요청 없음' }, { status: 404 })
    if (req.status !== 'pending') return NextResponse.json({ error: '이미 처리됨' }, { status: 409 })

    // class_enrollments 스케줄 영구 업데이트
    const { data: enr } = await service.from('class_enrollments')
      .select('arr_schedule, dep_schedule')
      .eq('student_id', req.student_id).eq('class_id', req.class_id).single()
    if (enr) {
      const schedKey = req.direction === 'arr' ? 'arr_schedule' : 'dep_schedule'
      const sched = { ...(enr[schedKey] ?? {}) }
      for (const d of req.days) {
        sched[d] = req.to_bus
        if (req.location) sched[d + '_loc'] = req.location
        else delete sched[d + '_loc']
      }
      if (req.pickup_time) sched['_time'] = req.pickup_time
      await service.from('class_enrollments')
        .update({ [schedKey]: sched })
        .eq('student_id', req.student_id).eq('class_id', req.class_id)
    }

    const { data, error } = await service.from('bus_change_requests')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', request_id).eq('campus_id', campusId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data })
  }

  if (action === 'reject_change_request') {
    const { request_id } = body
    const { data, error } = await service.from('bus_change_requests')
      .update({ status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', request_id).eq('campus_id', campusId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data })
  }

  if (action === 'bulk_update_location_time') {
    // 같은 세션 + 같은 호차 + 같은 장소의 모든 학생 시간 일괄 변경
    const { bus_name, direction: dir, location, session_name, new_time } = body
    if (!bus_name || !new_time) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    const schedKey = dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const allDays = ['월', '화', '수', '목', '금']
    // 세션 이름으로 반 목록 조회
    const { data: sessions } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId)
      .ilike('name', `%${session_name ?? ''}%`)
    const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)
    if (!sessionIds.length) return NextResponse.json({ ok: true, updated: 0 })
    const { data: classes } = await service.from('classes').select('id').in('session_id', sessionIds)
    const classIds = (classes ?? []).map((c: { id: string }) => c.id)
    if (!classIds.length) return NextResponse.json({ ok: true, updated: 0 })
    const { data: enrollments } = await service.from('class_enrollments')
      .select('student_id, class_id, arr_schedule, dep_schedule')
      .in('class_id', classIds).eq('is_waitlist', false)
    const toUpdate: { student_id: string; class_id: string; sched: Record<string,string> }[] = []
    for (const enr of enrollments ?? []) {
      const sched = { ...(enr[schedKey as keyof typeof enr] as Record<string,string> ?? {}) }
      const onBusAtLoc = allDays.some(d => sched[d] === bus_name && (!location || sched[d + '_loc'] === location))
      if (!onBusAtLoc) continue
      sched['_time'] = new_time
      clearPerDayTimes(sched)
      toUpdate.push({ student_id: enr.student_id, class_id: enr.class_id, sched })
    }
    for (const u of toUpdate) {
      await service.from('class_enrollments')
        .update({ [schedKey]: u.sched })
        .eq('student_id', u.student_id).eq('class_id', u.class_id)
    }
    return NextResponse.json({ ok: true, updated: toUpdate.length })
  }

  if (action === 'bulk_set_time') {
    // 특정 버스에 탑승하는 모든 학생의 해당 방향 스케줄에 _time 일괄 설정
    const { bus_name, direction: dir, time, month: m } = body
    if (!bus_name || !time || !m) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    const { data: sessions } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId).eq('month', m)
    const sessionIds = (sessions ?? []).map(s => s.id)
    if (!sessionIds.length) return NextResponse.json({ ok: true, updated: 0 })
    const { data: classes } = await service.from('classes').select('id').in('session_id', sessionIds)
    const classIds = (classes ?? []).map(c => c.id)
    if (!classIds.length) return NextResponse.json({ ok: true, updated: 0 })
    const schedKey = dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const { data: enrollments } = await service.from('class_enrollments')
      .select('student_id, class_id, arr_schedule, dep_schedule').in('class_id', classIds).eq('is_waitlist', false)
    const days = ['월', '화', '수', '목', '금']
    const toUpdate: { student_id: string; class_id: string; sched: Record<string,string> }[] = []
    for (const enr of enrollments ?? []) {
      const sched = { ...(enr[schedKey as keyof typeof enr] as Record<string,string> ?? {}) }
      const hasBus = days.some(d => sched[d] === bus_name)
      if (hasBus) {
        sched['_time'] = time
        clearPerDayTimes(sched)
        toUpdate.push({ student_id: enr.student_id, class_id: enr.class_id, sched })
      }
    }
    for (const u of toUpdate) {
      await service.from('class_enrollments')
        .update({ [schedKey]: u.sched })
        .eq('student_id', u.student_id).eq('class_id', u.class_id)
    }
    return NextResponse.json({ ok: true, updated: toUpdate.length })
  }

  if (action === 'update_bus') {
    const { bus_id, name, driver, driver_phone, safety, safety_phone, kt_name, kt_phone, capacity } = body

    // 기존 차량 이름 조회 (이름 변경 여부 판단용)
    const { data: oldBus } = await service.from('campus_buses').select('name').eq('id', bus_id).eq('campus_id', campusId).single()
    const oldName = oldBus?.name as string | undefined

    const updateData: Record<string, unknown> = {
      driver: driver||null, driver_phone: driver_phone||null,
      safety: safety||null, safety_phone: safety_phone||null,
      kt_name: kt_name||null, kt_phone: kt_phone||null,
    }
    if (capacity !== undefined && capacity !== null && capacity !== '') {
      const n = Number(capacity)
      if (Number.isFinite(n) && n > 0) updateData.capacity = Math.round(n)
    }
    if (name && name.trim() && name !== oldName) updateData.name = name.trim()

    const { data, error } = await service.from('campus_buses')
      .update(updateData).eq('id', bus_id).eq('campus_id', campusId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 이름이 바뀐 경우 — 등원/하원 스케줄 + 오버라이드 일괄 업데이트
    if (updateData.name && oldName && updateData.name !== oldName) {
      const newName = updateData.name as string

      // pickup_overrides 업데이트
      await service.from('pickup_overrides').update({ bus_name: newName }).eq('campus_id', campusId).eq('bus_name', oldName)

      // class_enrollments JSONB 업데이트 (모든 요일 키 순회)
      const { data: enrollments } = await service.from('class_enrollments')
        .select('student_id, class_id, arr_schedule, dep_schedule').eq('campus_id', campusId)

      for (const enr of enrollments ?? []) {
        let changed = false
        const arrSched = { ...(enr.arr_schedule ?? {}) } as Record<string, string>
        const depSched = { ...(enr.dep_schedule ?? {}) } as Record<string, string>
        for (const key of Object.keys(arrSched)) {
          if (!key.includes('_') && arrSched[key] === oldName) { arrSched[key] = newName; changed = true }
        }
        for (const key of Object.keys(depSched)) {
          if (!key.includes('_') && depSched[key] === oldName) { depSched[key] = newName; changed = true }
        }
        if (changed) {
          await service.from('class_enrollments')
            .update({ arr_schedule: arrSched, dep_schedule: depSched })
            .eq('student_id', enr.student_id).eq('class_id', enr.class_id)
        }
      }
    }

    return NextResponse.json({ bus: data })
  }

  if (action === 'remove_rider') {
    const { student_id, class_id, direction: dir } = body
    const campusErr = await assertClassInCampus(class_id)
    if (campusErr) return campusErr
    const { data: enr } = await service.from('class_enrollments')
      .select('arr_schedule, dep_schedule')
      .eq('student_id', student_id).eq('class_id', class_id).single()
    if (!enr) return NextResponse.json({ error: '수강 없음' }, { status: 404 })
    const schedKey = dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const sched = { ...(enr[schedKey as keyof typeof enr] as Record<string,string> ?? {}) }
    for (const d of ['월', '화', '수', '목', '금']) {
      delete sched[d]
      delete sched[d + '_loc']
    }
    delete sched['_time']
    const { error } = await service.from('class_enrollments')
      .update({ [schedKey]: sched })
      .eq('student_id', student_id).eq('class_id', class_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
