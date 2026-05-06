/**
 * 등원 시간 마이그레이션 스크립트
 * 구 HTML(반편성현황 v34)의 busRoutes 등원 섹션에서 학생별 승차 시간을 추출하여
 * Supabase class_enrollments.arr_schedule._time 에 업데이트합니다.
 *
 * 실행: node scripts/migrate-arr-time.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createContext, runInContext } from 'vm'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'

const HTML_FILE = path.join(
  __dirname,
  '../../Raw/_processed/0423/연습/중계폴리_반편성현황_v34.html'
)

const DRY_RUN = process.argv.includes('--dry-run')

// ── 1. HTML에서 MONTHS_DATA 추출 ──────────────────────────────────────────────
function extractMonthsData(html) {
  const lines = html.split('\n')
  // MONTHS_DATA 할당이 있는 줄 찾기
  const dataLine = lines.find(l => /var MONTHS_DATA\s*=/.test(l))
  if (!dataLine) throw new Error('MONTHS_DATA 변수를 HTML에서 찾지 못했습니다.')

  // 안전한 sandbox에서 실행
  const sandbox = { MONTHS_DATA: null }
  createContext(sandbox)
  try {
    runInContext(dataLine, sandbox, { timeout: 10000 })
  } catch (e) {
    throw new Error(`MONTHS_DATA 파싱 실패: ${e.message}`)
  }
  if (!sandbox.MONTHS_DATA) throw new Error('MONTHS_DATA가 null입니다.')
  return sandbox.MONTHS_DATA
}

// ── 2. 등원 섹션에서 이름 → 시간 매핑 추출 ──────────────────────────────────
function buildArrTimeMap(monthsData) {
  // 여러 월이 있으면 나중 월 데이터가 앞 것을 덮어씀 (최신 데이터 우선)
  const map = {} // name → time

  const entries = Object.entries(monthsData)
  // 월 순서 정렬 (숫자 기준)
  entries.sort(([a], [b]) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0
    const numB = parseInt(b.replace(/\D/g, '')) || 0
    return numA - numB
  })

  for (const [month, md] of entries) {
    const busRoutes = Array.isArray(md?.busRoutes) ? md.busRoutes : []
    for (const section of busRoutes) {
      // 등원 섹션만 처리
      if (!section?.name?.includes('등원')) continue
      for (const bus of section.buses || []) {
        for (const stu of bus.students || []) {
          if (stu?.name && stu?.time) {
            map[stu.name] = stu.time
          }
        }
      }
    }
  }

  return map
}

// ── 3. 이름 정규화 (짧은 이름 매칭용) ─────────────────────────────────────────
function shortName(name) {
  // "홍 길동" → "홍길동", "홍길동(7)" → "홍길동"
  return name.replace(/\s+/g, '').replace(/\(.*?\)/g, '').trim()
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== 등원 시간 마이그레이션 ${DRY_RUN ? '[DRY RUN]' : ''} ===\n`)

  // 1) HTML 파싱
  console.log('HTML 파일 읽는 중...')
  const html = readFileSync(HTML_FILE, 'utf-8')

  let monthsData
  try {
    monthsData = extractMonthsData(html)
  } catch (e) {
    console.error('HTML 파싱 오류:', e.message)
    process.exit(1)
  }

  const arrTimeMap = buildArrTimeMap(monthsData)
  const arrTimeMapShort = {}
  for (const [name, time] of Object.entries(arrTimeMap)) {
    arrTimeMapShort[shortName(name)] = time
  }
  console.log(`등원 시간 보유 학생 수: ${Object.keys(arrTimeMap).length}명\n`)

  // 2) Supabase 연결
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 3) campus_students 전체 조회
  console.log('학생 목록 조회 중...')
  const { data: allStudents, error: stuErr } = await supabase
    .from('campus_students')
    .select('id, name')
    .limit(10000)
  if (stuErr) { console.error('학생 조회 실패:', stuErr.message); process.exit(1) }

  // id → name, name → id 매핑
  const idToName = {}
  const nameToId = {}
  const shortNameToId = {}
  for (const s of allStudents) {
    idToName[s.id] = s.name
    nameToId[s.name] = s.id
    shortNameToId[shortName(s.name)] = s.id
  }
  console.log(`전체 학생: ${allStudents.length}명`)

  // 4) class_enrollments 전체 조회 (arr_schedule이 없거나 _time이 없는 것)
  console.log('수강 목록 조회 중...')
  const { data: enrollments, error: enrErr } = await supabase
    .from('class_enrollments')
    .select('id, student_id, arr_schedule')
    .limit(10000)
  if (enrErr) { console.error('수강 조회 실패:', enrErr.message); process.exit(1) }
  console.log(`전체 수강 레코드: ${enrollments.length}건\n`)

  // 5) 업데이트 대상 필터 및 처리
  let updated = 0
  let alreadyHas = 0
  let noTimeData = 0
  let noStudent = 0
  const errors = []
  const preview = []

  for (const enr of enrollments) {
    const sched = enr.arr_schedule || {}

    // 이미 _time 있으면 스킵
    if (sched._time) { alreadyHas++; continue }

    // 학생 이름 찾기
    const studentName = idToName[enr.student_id]
    if (!studentName) { noStudent++; continue }

    // 시간 찾기 (정확한 이름 → 짧은 이름 순서)
    const arrTime =
      arrTimeMap[studentName] ||
      arrTimeMapShort[shortName(studentName)] ||
      null

    if (!arrTime) { noTimeData++; continue }

    preview.push({ name: studentName, time: arrTime, enr_id: enr.id })

    if (!DRY_RUN) {
      const newSched = { ...sched, _time: arrTime }
      const { error } = await supabase
        .from('class_enrollments')
        .update({ arr_schedule: newSched })
        .eq('id', enr.id)

      if (error) {
        errors.push({ name: studentName, error: error.message })
        console.error(`  오류: ${studentName} - ${error.message}`)
      } else {
        updated++
        console.log(`  ✓ ${studentName} → ${arrTime}`)
      }
    }
  }

  // 6) 결과 출력
  console.log('\n=== 결과 ===')
  if (DRY_RUN) {
    console.log(`업데이트 예정: ${preview.length}건`)
    console.log('\n[업데이트 예정 목록]')
    for (const p of preview) {
      console.log(`  ${p.name} → ${p.time}`)
    }
  } else {
    console.log(`업데이트 완료: ${updated}건`)
    if (errors.length) console.log(`오류: ${errors.length}건`)
  }
  console.log(`이미 시간 있음 (스킵): ${alreadyHas}건`)
  console.log(`HTML에 시간 데이터 없음: ${noTimeData}건`)
  console.log(`학생 ID 매칭 실패: ${noStudent}건`)

  if (noTimeData > 0) {
    console.log('\n[시간 데이터 없는 학생 샘플]')
    let count = 0
    for (const enr of enrollments) {
      if (count >= 10) break
      const sched = enr.arr_schedule || {}
      if (sched._time) continue
      const name = idToName[enr.student_id]
      if (!name) continue
      const t = arrTimeMap[name] || arrTimeMapShort[shortName(name)]
      if (!t) {
        console.log(`  - ${name}`)
        count++
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
