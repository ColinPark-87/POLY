// 캠퍼스 대시보드 '총 학생' 집계 로직 (순수 함수 — 테스트 가능)
//
// 모집단 정의: 비대기(non-waitlist) 수강 등록된 "고유" 학생.
//  - 같은 학생이 여러 반을 수강해도 1명으로 집계 (student_id 기준 중복 제거)
//  - 방과후 반만 있는 학생보다 정규 반 정보를 우선 표기
//  - 수강 등록이 없는 활성 학생(반 미배정·중복 레코드)은 포함하지 않음
//    → 개설반 현황의 '6월 인원'·'전체 학생'과 동일 기준

export interface ClassInfo {
  level: string
  session: string
  sessionId: string
}

export interface EnrollmentRow {
  student_id: string | null
  class_id: string
  is_waitlist: boolean | null
  campus_students: Record<string, unknown> | null
}

export interface EnrolledStudent {
  id: string
  name: string
  english_name: string | null
  grade: string | null
  school: string | null
  zip_code: string | null
  address: string | null
  detail_address: string | null
  apartment: string | null
  level: string
  session: string
}

const isBangwahu = (name: string) => /방과후|afterschool/i.test(name)

export function buildEnrolledStudents(
  enrollments: EnrollmentRow[],
  classMap: Record<string, ClassInfo>,
  gradeFromLevel: (level: string) => string | null,
): EnrolledStudent[] {
  // 개설반 현황과 동일: !is_waitlist (null, false 모두 포함, 대기자 제외)
  const activeEnrollments = enrollments.filter(e => !e.is_waitlist)

  // 학생별 대표 반 — 방과후 아닌 반 우선
  const enrollMap: Record<string, { level: string; session: string }> = {}
  for (const e of activeEnrollments) {
    if (!e.student_id) continue
    const info = classMap[e.class_id] ?? { level: '', session: '', sessionId: '' }
    const isBak = isBangwahu(info.session)
    const existing = enrollMap[e.student_id]
    if (!existing || (isBangwahu(existing.session) && !isBak)) {
      enrollMap[e.student_id] = { level: info.level, session: info.session }
    }
  }

  // 고유 학생 목록 (수강 등록된 학생만)
  const seen = new Set<string>()
  const result: EnrolledStudent[] = []
  for (const e of activeEnrollments) {
    if (!e.student_id || seen.has(e.student_id)) continue
    seen.add(e.student_id)
    const s = e.campus_students as Record<string, unknown> | null
    const lvl = enrollMap[e.student_id]?.level ?? ''
    result.push({
      id: e.student_id,
      name: (s?.name as string) ?? '',
      english_name: (s?.english_name as string | null) ?? null,
      grade: (s?.grade as string | null) || gradeFromLevel(lvl) || null,
      school: (s?.school as string | null) ?? null,
      zip_code: (s?.zip_code as string | null) ?? null,
      address: (s?.address as string | null) ?? null,
      detail_address: (s?.detail_address as string | null) ?? null,
      apartment: (s?.apartment as string | null) ?? null,
      level: lvl,
      session: enrollMap[e.student_id]?.session ?? '',
    })
  }
  return result
}
