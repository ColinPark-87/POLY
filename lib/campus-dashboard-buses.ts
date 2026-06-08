// 대시보드 "차량안탐(셔틀 미이용)" 집계 헬퍼.
//
// 배경: 요일별 호차 배정에서 "셔틀 안 타는 학생"을 표시하는 방식이 두 갈래였다.
//   ① 드롭다운에서 "없음"(빈값) 선택 → 스케줄에 값이 없음 → 대시보드에 아무것도 안 뜸
//   ② "차량안탐" 버스(대치 campus_buses에 존재) 선택 → 차량안탐 카드에 집계
// 같은 의미인데 표기가 달라 혼란. 본 헬퍼는 "실제 셔틀 미이용(빈값)" 학생을
// 그룹별 운행 요일에 한해 "차량안탐" 버킷으로 함께 집계해 일관되게 표시한다.
//
// 주의 사항:
// - 복수 enrollment(유치부 정규+방과후 등): 한 학생이 같은 요일 다른 enrollment에서
//   실제 버스를 타면 그 요일은 미이용이 아니다 → 학생 단위로 실탑승 요일을 먼저 모은다.
// - 요일제 반(2일반=화목, 3일반=월수금): 그 그룹이 운행하지 않는 요일은 집계하지 않는다.
//   → 그룹 운행 요일 = 그 그룹에서 실제 버스 탑승이 1건이라도 있는 요일.

export const NO_SHUTTLE_BUS = '차량안탐'
const DAYS = ['월', '화', '수', '목', '금'] as const
type Day = typeof DAYS[number]

export interface DashEnr {
  student_id: string
  group: string
  arr_schedule: Record<string, string> | null
  dep_schedule: Record<string, string> | null
}

// 실제 버스값인지 ('' 빈값, '_loc' 접미 키 제외)
function isRealBus(v: string | undefined | null): v is string {
  return !!v && !v.endsWith('_loc')
}

type DayCount = Record<Day, number>
const emptyDayCount = (): DayCount => ({ 월: 0, 화: 0, 수: 0, 목: 0, 금: 0 })

// 그룹별 차량안탐(빈값) 요일 카운트를 방향별로 반환. 그룹 운행요일에 한해, 학생 단위 중복 제거.
export function computeNoShuttleByGroup(
  enrs: DashEnr[],
  groups: readonly string[],
): { arr: Record<string, DayCount>; dep: Record<string, DayCount> } {
  const groupSet = new Set(groups)
  // 1) 학생별 실탑승 요일(방향별) + 그룹별 운행요일(등원∪하원 통합 = 그 그룹이 활동하는 요일)
  const realArr = new Map<string, Set<Day>>()
  const realDep = new Map<string, Set<Day>>()
  const grpDays: Record<string, Set<Day>> = {}
  for (const g of groups) grpDays[g] = new Set()

  for (const e of enrs) {
    if (!groupSet.has(e.group)) continue
    for (const day of DAYS) {
      if (isRealBus(e.arr_schedule?.[day])) {
        if (!realArr.has(e.student_id)) realArr.set(e.student_id, new Set())
        realArr.get(e.student_id)!.add(day)
        grpDays[e.group].add(day)
      }
      if (isRealBus(e.dep_schedule?.[day])) {
        if (!realDep.has(e.student_id)) realDep.set(e.student_id, new Set())
        realDep.get(e.student_id)!.add(day)
        grpDays[e.group].add(day)
      }
    }
  }

  // 2) 그룹 운행요일 중 실탑승이 없는 학생 → 차량안탐 (학생|요일 단위 중복 제거, 방향별)
  const arr: Record<string, DayCount> = {}
  const dep: Record<string, DayCount> = {}
  const arrSeen = new Set<string>()
  const depSeen = new Set<string>()
  for (const e of enrs) {
    if (!groupSet.has(e.group)) continue
    for (const day of grpDays[e.group]) {
      const ka = `${e.student_id}|${day}`
      if (!realArr.get(e.student_id)?.has(day) && !arrSeen.has(ka)) {
        arrSeen.add(ka)
        if (!arr[e.group]) arr[e.group] = emptyDayCount()
        arr[e.group][day]++
      }
      if (!realDep.get(e.student_id)?.has(day) && !depSeen.has(ka)) {
        depSeen.add(ka)
        if (!dep[e.group]) dep[e.group] = emptyDayCount()
        dep[e.group][day]++
      }
    }
  }
  return { arr, dep }
}
