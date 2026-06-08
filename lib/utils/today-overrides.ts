// '오늘만 탑승추가'(pickup_overrides)를 today 뷰에 합성할 때의 순수 로직.
// 서버 today GET에서 enrollment 루프로 이미 그려진 학생(renderedIds)은 건드리지 않고,
// 아직 어떤 호차에도 안 나타난 '비결석 + 호차지정' override만 골라 합성 entry를 만든다.
// (결석 override는 별도 결석 패스에서 처리하므로 여기서 제외)

export interface OverrideRow {
  student_id: string
  bus_name: string | null
  is_absent: boolean
  location?: string | null
  pickup_time?: string | null
}

export interface SynthStudentEntry {
  student_id: string
  class_id: string
  name: string
  english_name: string | null
  override: true
  location: string | null
  days: string[]
  busByDay: Record<string, string>
  dayLocs: Record<string, string>
  pickup_time: string | null
  is_bangwaHu: false
}

/**
 * 합성 대상 override만 선별.
 *  - 결석(is_absent)이 아니고
 *  - 호차(bus_name)가 지정돼 있고
 *  - 아직 today 뷰에 그려지지 않은(renderedIds에 없는) 학생
 * 이미 그려진 학생(정상 등록 후 override로 이동된 학생 포함)은 제외 → 중복 방지.
 */
export function selectOrphanOverrides(overrides: OverrideRow[], renderedIds: Set<string>): OverrideRow[] {
  return overrides.filter(ov => !ov.is_absent && !!ov.bus_name && !renderedIds.has(ov.student_id))
}

/** override + 학생 기본정보 → today 합성 entry (오늘 요일만 표시). */
export function buildSynthEntry(
  ov: OverrideRow,
  student: { name: string; english_name: string | null },
  dayKey: string,
): SynthStudentEntry {
  return {
    student_id: ov.student_id,
    class_id: '',
    name: student.name,
    english_name: student.english_name,
    override: true,
    location: ov.location ?? null,
    days: [dayKey],
    busByDay: {},
    dayLocs: {},
    pickup_time: ov.pickup_time ?? null,
    is_bangwaHu: false,
  }
}
