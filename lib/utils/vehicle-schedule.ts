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
