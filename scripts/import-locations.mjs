// busRoutes의 location/time 데이터 → class_enrollments JSONB 업데이트
// Usage: node scripts/import-locations.mjs
// 동작: arr_schedule/dep_schedule 에 {월_loc, 화_loc, ...} 키를 추가

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'
const CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'
const HTML_PATH = join(__dirname, '../../0504/중계폴리_반편성현황_v35.html')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function parseKoreanName(raw) {
  // "김도현 (Peter Kim)" → "김도현"
  // "강다은(2026년 3월)" → "강다은"
  const m = raw.match(/^([^\s(（]+(?:\s+[^\s(（]+)*)/)
  return m ? m[1].trim() : raw.trim()
}

// 섹션명 → direction
function getDirection(sectionName) {
  if (sectionName.includes('등원')) return 'arr'
  if (sectionName.includes('하원')) return 'dep'
  return null
}

// 섹션명 → 세션 타입 키워드 (매칭용)
function getSessionKeyword(sectionName) {
  if (sectionName.includes('유치부')) return '유치부'
  if (sectionName.includes('매일반')) return '매일반'
  if (sectionName.includes('3일반')) return ['월수금', '3일반']
  if (sectionName.includes('2일반')) return ['화목', '2일반']
  return null
}

async function main() {
  console.log('HTML 파일 읽기...')
  const content = readFileSync(HTML_PATH, 'utf8')

  // MONTHS_DATA 추출
  const match = content.match(/var MONTHS_DATA\s*=\s*(\{[\s\S]*?\});\s*\nvar/)
  if (!match) throw new Error('MONTHS_DATA not found')
  const MONTHS_DATA = JSON.parse(match[1])
  const months = Object.keys(MONTHS_DATA)
  console.log('처리할 월:', months)

  // DB에서 모든 학생 캐시 (이름 → student_id)
  const { data: students } = await supabase
    .from('campus_students').select('id, name').eq('campus_id', CAMPUS_ID)
  const studentByName = {}
  for (const s of students ?? []) studentByName[s.name] = s.id
  console.log(`DB 학생 수: ${Object.keys(studentByName).length}`)

  // DB에서 세션 + 반 + 수강 정보 로드
  const { data: sessions } = await supabase
    .from('class_sessions').select('id, name, month').eq('campus_id', CAMPUS_ID)
  const { data: classes } = await supabase
    .from('classes').select('id, session_id').eq('campus_id', CAMPUS_ID)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id, class_id, arr_schedule, dep_schedule')
    .eq('campus_id', CAMPUS_ID).eq('is_waitlist', false)

  // 맵 빌드: student_id → enrollments[]
  const enrollmentsByStudent = {}
  for (const enr of enrollments ?? []) {
    if (!enrollmentsByStudent[enr.student_id]) enrollmentsByStudent[enr.student_id] = []
    enrollmentsByStudent[enr.student_id].push(enr)
  }

  // 반 → 세션 맵
  const sessionByClass = {}
  for (const cls of classes ?? []) sessionByClass[cls.id] = cls.session_id
  const sessionById = {}
  for (const sess of sessions ?? []) sessionById[sess.id] = sess

  let updated = 0, notFound = 0, skipped = 0

  for (const month of months) {
    const busRoutes = MONTHS_DATA[month]?.busRoutes ?? []
    console.log(`\n=== ${month} (${busRoutes.length}개 섹션) ===`)

    for (const route of busRoutes) {
      const direction = getDirection(route.name)
      if (!direction) { console.log(`  [스킵] ${route.name} - 방향 불명`); continue }

      const sessKeyword = getSessionKeyword(route.name)
      const keywords = Array.isArray(sessKeyword) ? sessKeyword : [sessKeyword]

      console.log(`  [${route.name}] direction=${direction}`)

      for (const bus of route.buses ?? []) {
        for (const stu of bus.students ?? []) {
          if (!stu.location) { skipped++; continue }

          const korName = parseKoreanName(stu.name)
          const studentId = studentByName[korName]

          if (!studentId) {
            console.log(`    ⚠ 학생 없음: "${korName}" (원본: "${stu.name}")`)
            notFound++
            continue
          }

          const studentEnrollments = enrollmentsByStudent[studentId] ?? []

          // 해당 월 + 세션 타입에 맞는 수강 찾기
          const targetEnrollments = studentEnrollments.filter(enr => {
            const sessId = sessionByClass[enr.class_id]
            const sess = sessId ? sessionById[sessId] : null
            if (!sess) return false
            if (sess.month !== month) return false
            return keywords.some(kw => sess.name.includes(kw))
          })

          if (targetEnrollments.length === 0) {
            // 월 무관하게 세션 타입만으로 시도
            const fallback = studentEnrollments.filter(enr => {
              const sessId = sessionByClass[enr.class_id]
              const sess = sessId ? sessionById[sessId] : null
              if (!sess) return false
              return keywords.some(kw => sess.name.includes(kw))
            })
            if (fallback.length === 0) {
              skipped++
              continue
            }
            targetEnrollments.push(...fallback)
          }

          // 탑승 요일 추출
          const days = Object.keys(stu.days ?? {}).filter(d => stu.days[d])
          if (days.length === 0) { skipped++; continue }

          for (const enr of targetEnrollments) {
            const scheduleKey = direction === 'arr' ? 'arr_schedule' : 'dep_schedule'
            const currentSchedule = { ...(enr[scheduleKey] ?? {}) }

            // 각 요일에 _loc 키 설정
            let changed = false
            for (const day of days) {
              const locKey = day + '_loc'
              if (currentSchedule[locKey] !== stu.location) {
                currentSchedule[locKey] = stu.location
                changed = true
              }
            }
            // 승차 시간 (_time 키): 방향별 한 번만 저장
            const timeVal = stu.time ?? null
            if (timeVal && currentSchedule['_time'] !== timeVal) {
              currentSchedule['_time'] = timeVal
              changed = true
            }

            if (!changed) { skipped++; continue }

            const { error } = await supabase
              .from('class_enrollments')
              .update({ [scheduleKey]: currentSchedule })
              .eq('student_id', studentId)
              .eq('class_id', enr.class_id)

            if (error) {
              console.log(`    ❌ 업데이트 실패: ${korName} - ${error.message}`)
            } else {
              updated++
            }
          }
        }
      }
    }
  }

  console.log('\n=== 완료 ===')
  console.log(`업데이트: ${updated}, 학생 없음: ${notFound}, 스킵: ${skipped}`)
}

main().catch(console.error)
