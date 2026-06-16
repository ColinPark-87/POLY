// 호차 명단 카드(학생설정 풀편집)에서 저장 시 보낼 POST 바디를 만드는 순수 함수.
// API(/api/campus/vehicles, action=update_enrollment_schedule)의 두 모드 계약을 그대로 따른다.
//  - 단일 호차 모드: { days, bus_name, old_bus_name, location, pickup_time, (day_locations/day_times) }
//  - 요일별 호차 모드: { day_buses, day_locations, day_times }  // 빈 호차값 = 그 요일 제거
// 서버 로직: app/api/campus/vehicles/route.ts 의 'update_enrollment_schedule' 참고.

export const WEEKDAYS = ['월', '화', '수', '목', '금'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export interface RosterEditState {
  studentId: string
  classId: string
  direction: 'arr' | 'dep'
  perDay: boolean
  // 단일 호차 모드
  bus: string // '' = 미배정
  oldBus: string
  location: string
  time: string // '' = 없음
  days: string[] // 탑승 요일
  // 요일별 호차 모드 (perDay=true) — 편집기 현재값(요일별)
  dayBus: Record<string, string>
  dayLoc: Record<string, string>
  dayTime: Record<string, string>
  // 요일별 모드 원본값 (변경된 요일만 보내기 위한 비교 기준). 없으면 전부 변경으로 간주.
  orig?: {
    dayBus: Record<string, string>
    dayLoc: Record<string, string>
    dayTime: Record<string, string>
  }
}

export interface ScheduleUpdateBody {
  action: 'update_enrollment_schedule'
  student_id: string
  class_id: string
  direction: 'arr' | 'dep'
  days?: string[]
  bus_name?: string
  old_bus_name?: string
  location?: string
  pickup_time?: string
  day_buses?: Record<string, string>
  day_locations?: Record<string, string>
  day_times?: Record<string, string>
}

/**
 * 편집 상태 → 저장 POST 바디.
 * perDay=false: 모든 탑승 요일에 단일 호차/장소/시간 적용.
 * perDay=true : 요일마다 다른 호차/장소/시간. 탑승하지 않는 요일은 호차 ''로 보내 제거.
 */
export function buildScheduleUpdate(s: RosterEditState): ScheduleUpdateBody {
  const base: ScheduleUpdateBody = {
    action: 'update_enrollment_schedule',
    student_id: s.studentId,
    class_id: s.classId,
    direction: s.direction,
  }

  if (!s.perDay) {
    return {
      ...base,
      days: [...s.days],
      bus_name: s.bus || undefined,
      old_bus_name: s.oldBus || undefined,
      location: s.location,
      pickup_time: s.time || undefined,
    }
  }

  // 요일별 모드: 원본 대비 "변경된 요일만" 보낸다 (서버 mode 2 = day_buses).
  // 변경 안 한 요일은 건드리지 않아 다른 호차/복수 enrollment 배정을 보존한다.
  const orig = s.orig ?? { dayBus: {}, dayLoc: {}, dayTime: {} }
  const day_buses: Record<string, string> = {}
  const day_locations: Record<string, string> = {}
  const day_times: Record<string, string> = {}
  for (const d of WEEKDAYS) {
    const nb = (s.dayBus[d] ?? '').trim() // 편집기 현재 호차 ('' = 탑승 안 함)
    const nl = (s.dayLoc[d] ?? '').trim()
    const nt = (s.dayTime[d] ?? '').trim()
    const ob = (orig.dayBus[d] ?? '').trim()
    const ol = (orig.dayLoc[d] ?? '').trim()
    const ot = (orig.dayTime[d] ?? '').trim()
    if (nb === ob && nl === ol && nt === ot) continue // 변경 없음 → 건드리지 않음
    day_buses[d] = nb
    if (nb) {
      // 탑승 요일: 장소·시간은 요일값 우선, 없으면 공통값으로 채워 빈 배정 방지
      day_locations[d] = nl || s.location
      const t = nt || s.time
      if (t) day_times[d] = t
    }
  }
  return { ...base, day_buses, day_locations, day_times }
}

/**
 * 서버: enrollment의 arr_schedule/dep_schedule JSON을 편집 요청에 맞게 변형하는 순수 함수.
 * (app/api/campus/vehicles/route.ts 의 update_enrollment_schedule 핸들러가 호출)
 *
 * 시간 저장 불변식: 한 enrollment의 시간은 "공유 _time" XOR "요일별 {요일}_time" 둘 중 하나로만
 * 표현한다(섞지 않는다). 차량관리는 _time을, 개설반 현황(StudentDetailModal)은 요일별 _time을
 * 우선 읽으므로, 섞이면 두 화면의 시간이 어긋난다.
 *
 * 핵심 수정: 한 학생이 요일별로 다른 호차를 타서(예: 수=2호차/15:03, 월·금=5호차/15:22)
 * 한 enrollment가 여러 호차로 나뉘는 경우, 한쪽(예: 5호차)을 단일 모드로 저장할 때 공유 _time으로
 * 합치면 dayList 밖 요일(수)의 시간까지 5호차 시간(15:22)으로 덮어써졌다.
 * → dayList 밖에 배정이 남아있으면 공유 _time을 그 요일들의 요일별 _time으로 먼저 이관한 뒤,
 *   편집 요일만 요일별 _time으로 적용하고 _time은 비워(요일별 모드로 전환) 다른 요일 시간을 보존한다.
 */
export function applyEnrollmentSchedule(
  current: Record<string, string>,
  p: {
    days?: string[]
    bus_name?: string
    old_bus_name?: string
    location?: string
    pickup_time?: string
    day_locations?: Record<string, string>
    day_times?: Record<string, string>
    day_buses?: Record<string, string>
  },
): Record<string, string> {
  const sched: Record<string, string> = { ...current }
  const allDays: readonly string[] = WEEKDAYS
  const dayBusesMap =
    p.day_buses && typeof p.day_buses === 'object' ? p.day_buses : null
  const dayList: string[] = dayBusesMap
    ? Object.keys(dayBusesMap).filter(d => allDays.includes(d))
    : Array.isArray(p.days)
      ? p.days
      : []

  // ── 호차·장소 반영 ────────────────────────────────────────────────
  if (dayBusesMap) {
    // 요일별 호차 직접 지정 모드 — 지정한 요일만 반영, 나머지 요일은 그대로 둠.
    for (const d of dayList) {
      const b = dayBusesMap[d]
      const busChanged = sched[d] !== b
      if (b) sched[d] = b
      else {
        delete sched[d]
        delete sched[d + '_loc']
        delete sched[d + '_time']
        continue
      }
      if (p.day_locations && Object.prototype.hasOwnProperty.call(p.day_locations, d)) {
        const dl = p.day_locations[d]
        if (dl) sched[d + '_loc'] = dl
        else delete sched[d + '_loc']
      } else if (busChanged) {
        delete sched[d + '_loc']
      }
    }
  } else {
    // 같은 호차에서 요일을 줄일 때만 빠진 요일을 제거(호차 이동 시엔 미선택 요일의 기존 배정 보존).
    const reducingSameBus = !!p.bus_name && (!p.old_bus_name || p.old_bus_name === p.bus_name)
    if (reducingSameBus) {
      for (const d of allDays) {
        if (sched[d] === p.bus_name && !dayList.includes(d)) {
          delete sched[d]
          delete sched[d + '_loc']
        }
      }
    }
    for (const d of dayList) {
      if (p.bus_name) sched[d] = p.bus_name
      else delete sched[d]
      const dloc =
        p.day_locations && Object.prototype.hasOwnProperty.call(p.day_locations, d)
          ? p.day_locations[d]
          : p.location
      if (dloc === '' || dloc === null || dloc === undefined) delete sched[d + '_loc']
      else sched[d + '_loc'] = dloc
    }
  }

  // ── 시간 반영 ─────────────────────────────────────────────────────
  // dayList 밖에 배정이 남아있는 요일(요일별로 다른 호차를 타는 학생)의 시간을 보존하기 위해
  // 기존 공유 _time을 먼저 그 요일들의 요일별 _time으로 이관한다.
  const otherDays = allDays.filter(d => !dayList.includes(d) && sched[d])
  const prevShared = sched['_time']
  if (prevShared && otherDays.length > 0) {
    for (const d of otherDays) {
      if (!sched[d + '_time']) sched[d + '_time'] = prevShared
    }
  }
  if (p.day_times && Object.keys(p.day_times).length > 0) {
    // 요일별 시간 — 각 요일 _time 설정, 공유 _time 제거
    for (const d of dayList) {
      const dt = p.day_times[d]
      if (dt) sched[d + '_time'] = dt
      else delete sched[d + '_time']
    }
    delete sched['_time']
  } else if (p.pickup_time !== undefined) {
    if (otherDays.length > 0) {
      // 다른 요일에 다른 호차/시간 배정이 남아있음 → 요일별 모드로 전환해 그 시간들을 보존.
      delete sched['_time']
      for (const d of dayList) {
        if (p.pickup_time) sched[d + '_time'] = p.pickup_time
        else delete sched[d + '_time']
      }
    } else {
      // 단일 호차 전 요일 — 공유 _time 하나로 통일(공통 케이스)
      if (p.pickup_time) sched['_time'] = p.pickup_time
      else delete sched['_time']
      for (const d of allDays) delete sched[d + '_time']
    }
  }
  return sched
}

/**
 * 차량관리 "전체 적용"(호차 시간 일괄변경) 서버 로직의 순수 함수.
 * (route.ts 의 bulk_update_location_time / bulk_set_time 핸들러가 호출)
 *
 * 한 enrollment에서 `busName`(+선택적 location)을 타는 요일의 시간만 `newTime`으로 바꾸되,
 * 다른 호차를 타는 다른 요일의 시간은 보존한다.
 *
 * 버그(2026-06-16, 중계 3호차 한휘): 기존 핸들러가 무조건 `sched._time = newTime` +
 * 요일별시간 삭제(clearPerDayTimes)를 해, 월=3호차/화수목금=6호차인 학생의 3호차 시간을
 * 바꾸면 공유 _time이 모든 요일에 적용돼 6호차(화수목금) 시간까지 같이 바뀌었다.
 * → applyEnrollmentSchedule 와 동일한 "_time XOR {요일}_time" 불변식으로 수정:
 *   다른 호차 요일이 남아있으면 공유 _time을 그 요일들로 이관 후 요일별 모드로 전환한다.
 */
export function applyBulkTimeToSchedule(
  current: Record<string, string>,
  busName: string,
  location: string | null | undefined,
  newTime: string,
): Record<string, string> {
  const sched: Record<string, string> = { ...current }
  const allDays: readonly string[] = WEEKDAYS
  // 이 호차(+위치)를 타는 요일 = 변경 대상
  const targetDays = allDays.filter(
    d => sched[d] === busName && (!location || sched[d + '_loc'] === location),
  )
  if (targetDays.length === 0) return sched // 해당 호차/위치 탑승 없음 → 변경 없음
  // 변경 대상이 아닌, 다른 배정이 남아있는 요일(요일별 다른 호차/위치) → 시간 보존 필요
  const otherDays = allDays.filter(d => sched[d] && !targetDays.includes(d))
  if (otherDays.length > 0) {
    // 요일별 모드로 전환: 기존 공유 _time을 다른 요일로 이관 → 대상요일만 newTime → 공유 _time 제거
    const prevShared = sched['_time']
    if (prevShared) {
      for (const d of otherDays) if (!sched[d + '_time']) sched[d + '_time'] = prevShared
    }
    for (const d of targetDays) sched[d + '_time'] = newTime
    delete sched['_time']
  } else {
    // 단일 호차 전 요일 → 공유 _time 하나로 통일
    sched['_time'] = newTime
    for (const d of allDays) delete sched[d + '_time']
  }
  return sched
}

/**
 * 학생 데이터에서 요일별(다른 호차/장소/시간) 편집이 필요한지 판정.
 * 요일에 따라 호차·장소·시간 중 하나라도 다르면 true.
 */
export function detectPerDay(opts: {
  days: string[]
  baseBus: string
  baseLoc: string
  baseTime: string
  dayBus: Record<string, string>
  dayLoc: Record<string, string>
  dayTime: Record<string, string>
}): boolean {
  const { days, baseBus, baseLoc, baseTime, dayBus, dayLoc, dayTime } = opts
  if (days.length === 0) return false
  const buses = new Set(days.map(d => (dayBus[d] ?? '').trim() || baseBus))
  const locs = new Set(days.map(d => (dayLoc[d] ?? '').trim() || baseLoc))
  const times = new Set(days.map(d => (dayTime[d] ?? '').trim() || baseTime))
  return buses.size > 1 || locs.size > 1 || times.size > 1
}
