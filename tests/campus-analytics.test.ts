import { describe, it, expect } from 'vitest'
import { buildEnrolledStudents, type ClassInfo, type EnrollmentRow } from '@/lib/campus-analytics'

// 중계 캠퍼스 303 vs 300 버그 재현용 미니 픽스처
const classMap: Record<string, ClassInfo> = {
  'c-mgt': { level: 'MGT1C', session: '초등부 매일반', sessionId: 's-daily' },
  'c-s1':  { level: 'S1C',   session: '초등부 매일반', sessionId: 's-daily' },
  'c-gt':  { level: 'GT1B',  session: '초등부 월수금', sessionId: 's-wsg' },
  'c-bak': { level: 'AS1',   session: '초등부 방과후', sessionId: 's-bak' },
}

const stu = (name: string) => ({ name, english_name: null, grade: null, school: null, zip_code: null, address: null, detail_address: null, apartment: null })
const gradeFromLevel = () => null

describe('buildEnrolledStudents — 대시보드 총 학생 집계', () => {
  it('비대기 수강 등록된 고유 학생만 집계한다 (오펀/대기/미배정 제외)', () => {
    const enrollments: EnrollmentRow[] = [
      // 실제 재원생 (정규 반, 비대기) — 집계 대상
      { student_id: 'hong-real', class_id: 'c-mgt', is_waitlist: false, campus_students: stu('홍지안') },
      { student_id: 'kim-real',  class_id: 'c-s1',  is_waitlist: false, campus_students: stu('김민결') },
      { student_id: 'kang-real', class_id: 'c-gt',  is_waitlist: false, campus_students: stu('강수호') },
      // 중복 레코드 — 대기(waitlist)만 있음 → 제외 (실DB의 홍지안/김민결 오펀)
      { student_id: 'hong-dup',  class_id: 'c-gt',  is_waitlist: true,  campus_students: stu('홍지안') },
      { student_id: 'kim-dup',   class_id: 'c-gt',  is_waitlist: true,  campus_students: stu('김민결') },
      // 강수호 오펀(강수호-dup)은 수강 등록 자체가 없으므로 enrollment 행에 등장하지 않음 → 구조적으로 제외
    ]
    const result = buildEnrolledStudents(enrollments, classMap, gradeFromLevel)
    const ids = result.map(r => r.id).sort()
    expect(ids).toEqual(['hong-real', 'kang-real', 'kim-real'])
    expect(result.length).toBe(3) // 6명의 레코드 중 실제 학생 3명만
  })

  it('한 학생이 여러 반을 수강해도 1명으로 집계한다 (수강건수 아님)', () => {
    const enrollments: EnrollmentRow[] = [
      { student_id: 'a', class_id: 'c-mgt', is_waitlist: false, campus_students: stu('A') },
      { student_id: 'a', class_id: 'c-gt',  is_waitlist: false, campus_students: stu('A') },
    ]
    expect(buildEnrolledStudents(enrollments, classMap, gradeFromLevel).length).toBe(1)
  })

  it('정규 반 + 방과후 동시 수강 시 정규 반 레벨을 우선 표기한다', () => {
    const enrollments: EnrollmentRow[] = [
      { student_id: 'b', class_id: 'c-bak', is_waitlist: false, campus_students: stu('B') },
      { student_id: 'b', class_id: 'c-mgt', is_waitlist: false, campus_students: stu('B') },
    ]
    const [row] = buildEnrolledStudents(enrollments, classMap, gradeFromLevel)
    expect(row.session).toBe('초등부 매일반')
    expect(row.level).toBe('MGT1C')
  })

  it('grade가 비어있으면 level에서 학년을 추론한다', () => {
    const enrollments: EnrollmentRow[] = [
      { student_id: 'c', class_id: 'c-mgt', is_waitlist: false, campus_students: stu('C') },
    ]
    const [row] = buildEnrolledStudents(enrollments, classMap, (lvl) => lvl ? '1학년' : null)
    expect(row.grade).toBe('1학년')
  })
})
