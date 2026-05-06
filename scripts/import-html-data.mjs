// 반편성 HTML 데이터 -> Supabase 마이그레이션 스크립트
// Usage: node scripts/import-html-data.mjs

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

function parseStudentName(raw) {
  // "이지아 (Jia Lee)" -> { korean: "이지아", english: "Jia Lee" }
  const m = raw.match(/^(.+?)\s*\((.+?)\)$/)
  if (m) return { korean: m[1].trim(), english: m[2].trim() }
  return { korean: raw.trim(), english: null }
}

async function main() {
  console.log('HTML 파일 읽기...')
  const content = readFileSync(HTML_PATH, 'utf8')
  const match = content.match(/var MONTHS_DATA\s*=\s*(\{[\s\S]*?\});\s*\n/)
  if (!match) throw new Error('MONTHS_DATA not found in HTML')
  const MONTHS_DATA = eval('(' + match[1] + ')')
  const months = Object.keys(MONTHS_DATA)
  console.log('처리할 월:', months)

  // 기존 학생 캐시 (이름 → id)
  const { data: existingStudents } = await supabase
    .from('campus_students').select('id, name').eq('campus_id', CAMPUS_ID)
  const studentCache = {}
  for (const s of existingStudents ?? []) studentCache[s.name] = s.id

  // 기존 세션 캐시 (name+month → id)
  const { data: existingSessions } = await supabase
    .from('class_sessions').select('id, name, month').eq('campus_id', CAMPUS_ID)
  const sessionCache = {}
  for (const s of existingSessions ?? []) sessionCache[`${s.name}__${s.month}`] = s.id

  // 기존 반 캐시 (session_id+level → id)
  const { data: existingClasses } = await supabase
    .from('classes').select('id, session_id, level').eq('campus_id', CAMPUS_ID)
  const classCache = {}
  for (const c of existingClasses ?? []) classCache[`${c.session_id}__${c.level}`] = c.id

  let totalSessions = 0, totalClasses = 0, totalStudents = 0, totalEnrollments = 0

  for (const month of months) {
    const monthData = MONTHS_DATA[month]
    const sessions = monthData.classData.sessions

    for (let si = 0; si < sessions.length; si++) {
      const sess = sessions[si]
      const sessKey = `${sess.name}__${month}`

      let sessId = sessionCache[sessKey]
      if (!sessId) {
        const { data, error } = await supabase.from('class_sessions').insert({
          campus_id: CAMPUS_ID,
          name: sess.name,
          time_range: sess.time || null,
          month,
          sort_order: si,
        }).select('id').single()
        if (error) { console.error('세션 생성 오류:', error.message, sess.name, month); continue }
        sessId = data.id
        sessionCache[sessKey] = sessId
        totalSessions++
        console.log(`  [세션 생성] ${month} / ${sess.name}`)
      } else {
        console.log(`  [세션 기존] ${month} / ${sess.name}`)
      }

      for (let ci = 0; ci < sess.classes.length; ci++) {
        const cls = sess.classes[ci]
        const clsKey = `${sessId}__${cls.level}`

        let clsId = classCache[clsKey]
        if (!clsId) {
          const { data, error } = await supabase.from('classes').insert({
            campus_id: CAMPUS_ID,
            session_id: sessId,
            level: cls.level,
            teacher: cls.teacher || null,
            room: cls.room || null,
            color: '#2196F3',
            sort_order: ci,
          }).select('id').single()
          if (error) { console.error('반 생성 오류:', error.message, cls.level); continue }
          clsId = data.id
          classCache[clsKey] = clsId
          totalClasses++
          console.log(`    [반 생성] ${cls.level} (${cls.students.length}명)`)
        } else {
          console.log(`    [반 기존] ${cls.level}`)
        }

        // 수강생 등록
        for (const stu of cls.students) {
          const { korean, english } = parseStudentName(stu.name)

          let stuId = studentCache[korean]
          if (!stuId) {
            const { data, error } = await supabase.from('campus_students').insert({
              campus_id: CAMPUS_ID,
              name: korean,
              english_name: english,
              is_active: true,
            }).select('id').single()
            if (error) {
              // 중복이면 다시 조회
              const { data: found } = await supabase.from('campus_students')
                .select('id').eq('campus_id', CAMPUS_ID).eq('name', korean).maybeSingle()
              if (found) { stuId = found.id; studentCache[korean] = stuId }
              else { console.error('학생 생성 오류:', error.message, korean); continue }
            } else {
              stuId = data.id
              studentCache[korean] = stuId
              totalStudents++
            }
          }

          // 등록 (이미 있으면 upsert) — arrLoc/depLoc → [day]_loc 키로 병합
          const arr_schedule = { ...(stu.arr ?? {}) }
          const dep_schedule = { ...(stu.dep ?? {}) }
          if (stu.arrLoc) {
            for (const [day, loc] of Object.entries(stu.arrLoc)) {
              if (loc) arr_schedule[day + '_loc'] = loc
            }
          }
          if (stu.depLoc) {
            for (const [day, loc] of Object.entries(stu.depLoc)) {
              if (loc) dep_schedule[day + '_loc'] = loc
            }
          }
          const { error: enrErr } = await supabase.from('class_enrollments').upsert({
            class_id: clsId,
            student_id: stuId,
            campus_id: CAMPUS_ID,
            arr_schedule,
            dep_schedule,
            is_waitlist: false,
          }, { onConflict: 'class_id,student_id' })
          if (enrErr) console.error('수강 등록 오류:', enrErr.message, korean)
          else totalEnrollments++
        }
      }
    }
  }

  console.log('\n=== 완료 ===')
  console.log(`세션 신규: ${totalSessions}, 반 신규: ${totalClasses}, 학생 신규: ${totalStudents}, 수강등록: ${totalEnrollments}`)
}

main().catch(console.error)
