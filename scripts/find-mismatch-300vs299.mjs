// 캠퍼스 대시보드 300 vs 개설반 현황 299 차이 원인 학생 찾기
// Usage: node scripts/find-mismatch-300vs299.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(envText.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
}))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973' // 중계 캠퍼스

const parseMonth = (m) => { const p = m.match(/\d+/g); return p ? Number(p[0]) * 100 + Number(p[1]) : 0 }

async function main() {
  // 1) 최근 월
  const { data: monthRows } = await supabase
    .from('class_sessions').select('month').eq('campus_id', CAMPUS_ID)
  const months = [...new Set((monthRows ?? []).map(s => s.month))].sort((a, b) => parseMonth(b) - parseMonth(a))
  const targetMonth = months[0]
  console.log(`\n=== 대상 월: ${targetMonth} ===\n`)

  // 2) 세션, 클래스
  const { data: sessions } = await supabase
    .from('class_sessions').select('id, name')
    .eq('campus_id', CAMPUS_ID).eq('month', targetMonth)
  const sessionIds = sessions.map(s => s.id)
  const sessNameById = Object.fromEntries(sessions.map(s => [s.id, s.name]))
  const bangwahuSessIds = new Set(sessions.filter(s => /방과후/.test(s.name)).map(s => s.id))

  const { data: classes } = await supabase
    .from('classes').select('id, session_id, level').in('session_id', sessionIds)
  const classMap = Object.fromEntries(classes.map(c => [c.id, c]))

  // 3) 모든 enrollment (waitlist 제외)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id, class_id, is_waitlist')
    .in('class_id', classes.map(c => c.id))
  const active = enrollments.filter(e => !e.is_waitlist)

  // 4) 그룹별 학생 집합
  const enrolledAny = new Set()              // 모든 세션(방과후 포함)
  const enrolledNonBangwahu = new Set()      // 방과후 제외
  const enrolledBangwahuOnly = new Set()
  const bangwahuStudents = new Set()
  for (const e of active) {
    const cls = classMap[e.class_id]
    if (!cls) continue
    enrolledAny.add(e.student_id)
    if (bangwahuSessIds.has(cls.session_id)) bangwahuStudents.add(e.student_id)
    else enrolledNonBangwahu.add(e.student_id)
  }
  for (const sid of bangwahuStudents) {
    if (!enrolledNonBangwahu.has(sid)) enrolledBangwahuOnly.add(sid)
  }

  // 5) 활성 campus_students
  const { data: activeStudents } = await supabase
    .from('campus_students')
    .select('id, name, english_name, grade, is_active, created_at')
    .eq('campus_id', CAMPUS_ID).eq('is_active', true)

  const activeIds = new Set(activeStudents.map(s => s.id))

  // 6) 분류
  const unassigned = activeStudents.filter(s => !enrolledAny.has(s.id))
  const bangwahuOnlyStudents = activeStudents.filter(s => enrolledBangwahuOnly.has(s.id))
  const enrolledButInactive = []
  // 등록되어 있지만 is_active=false인 학생도 체크
  const allEnrolledIds = [...enrolledAny]
  const { data: enrolledStudentRows } = await supabase
    .from('campus_students')
    .select('id, name, is_active')
    .in('id', allEnrolledIds)
  for (const s of enrolledStudentRows) {
    if (!s.is_active) enrolledButInactive.push(s)
  }

  // 7) 수강건수 계산 (개설반 현황 방식)
  const grandSessTotal = active.filter(e => {
    const cls = classMap[e.class_id]
    return cls && !bangwahuSessIds.has(cls.session_id)
  }).length

  console.log('=== 수치 비교 ===')
  console.log(`개설반 현황 (방과후 제외 수강건수):   ${grandSessTotal}`)
  console.log(`개설반 현황 (방과후 제외 고유 학생): ${enrolledNonBangwahu.size}`)
  console.log(`수강 등록된 고유 학생 (방과후 포함): ${enrolledAny.size}`)
  console.log(`활성 campus_students (is_active=true): ${activeStudents.length}`)
  console.log(`  └ 그중 5월 어느 반에도 미등록 (반 미배정): ${unassigned.length}`)
  console.log(`  └ 그중 방과후만 등록: ${bangwahuOnlyStudents.length}`)
  console.log(`수강 등록되었지만 is_active=false 학생: ${enrolledButInactive.length}`)

  console.log('\n=== 대시보드 "총 학생" 계산 분해 ===')
  console.log(`= (5월 수강 고유학생 = ${enrolledAny.size}) + (활성 미배정 = ${unassigned.length}) = ${enrolledAny.size + unassigned.length}`)

  console.log('\n=== 반 미배정 활성 학생 목록 ===')
  if (unassigned.length === 0) console.log('(없음)')
  for (const s of unassigned) {
    console.log(`  - ${s.name} (${s.english_name ?? '-'}) | grade=${s.grade ?? '-'} | id=${s.id} | created=${s.created_at?.slice(0,10)}`)
  }

  console.log('\n=== 방과후만 등록된 활성 학생 목록 ===')
  if (bangwahuOnlyStudents.length === 0) console.log('(없음)')
  for (const s of bangwahuOnlyStudents) {
    console.log(`  - ${s.name} (${s.english_name ?? '-'}) | grade=${s.grade ?? '-'} | id=${s.id}`)
  }

  console.log('\n=== 등록되어 있는데 is_active=false인 학생 ===')
  if (enrolledButInactive.length === 0) console.log('(없음)')
  for (const s of enrolledButInactive) {
    console.log(`  - ${s.name} | id=${s.id}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
