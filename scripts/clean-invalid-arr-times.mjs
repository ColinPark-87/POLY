#!/usr/bin/env node
// clean-invalid-arr-times.mjs
// arr_schedule._time 중 세션별 최소 등원 시간보다 이른 값을 NULL로 정리
// (하원 시간이 등원 칸에 잘못 기록된 경우 제거)
//
// 세션별 최소 등원 시간:
//   유치부 (유치부, 유치부 방과후) → 아침 등원 정상이므로 검사 안 함
//   초등부 매일반 / 화목 / 월수금 → 학교 끝나고 오므로 13:00 이후

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'

// 시간 문자열 → 24시간 기준 분 (정규화 없음 - arr은 아침/오후 모두 그대로 사용)
function parseTimeMin(t) {
  if (!t) return 9999
  const m = String(t).match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

// 세션별 최소 등원 시간(분)
// 유치부 계열은 아침 등원이므로 0 반환 (검사 안 함)
function getMinArrTime(sessionName) {
  if (!sessionName) return 0
  if (sessionName.includes('유치부')) return 0  // 아침 등원 정상
  // 초등부: 학교 끝나고 오므로 13:00 이후
  if (sessionName.includes('초등부') || sessionName.includes('매일반') ||
      sessionName.includes('화목') || sessionName.includes('월수금')) {
    return 13 * 60  // 13:00
  }
  return 0
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`)
}

async function main() {
  console.log('세션 목록 조회...')
  const sessions = await sbGet('class_sessions?select=id,name&limit=500')
  const sessMap = Object.fromEntries(sessions.map(s => [s.id, s.name]))

  console.log('반 목록 조회...')
  const classes = await sbGet('classes?select=id,session_id&limit=2000')
  const classToSess = Object.fromEntries(classes.map(c => [c.id, c.session_id]))

  console.log('학생 목록 조회...')
  const students = await sbGet('campus_students?select=id,name&limit=2000')
  const idToName = Object.fromEntries(students.map(s => [s.id, s.name]))

  console.log('수강등록 조회...')
  const enrollments = await sbGet('class_enrollments?select=student_id,class_id,arr_schedule&limit=5000')
  console.log(`총 ${enrollments.length}건`)

  let cleaned = 0, valid = 0, noTime = 0, skipped = 0

  for (const enr of enrollments) {
    const arrSched = enr.arr_schedule || {}
    const rawTime = arrSched._time ?? arrSched.time ?? null
    if (!rawTime) { noTime++; continue }

    const sessId = classToSess[enr.class_id]
    const sessName = sessId ? sessMap[sessId] : null
    const minMin = getMinArrTime(sessName)

    if (minMin === 0) { skipped++; continue }  // 유치부 등 검사 안 함

    const actualMin = parseTimeMin(rawTime)

    if (actualMin < minMin) {
      // 잘못된 시간 → _time 제거
      const newSched = { ...arrSched }
      delete newSched._time
      delete newSched.time
      await sbPatch(
        `class_enrollments?student_id=eq.${enr.student_id}&class_id=eq.${enr.class_id}`,
        { arr_schedule: newSched }
      )
      const hh = Math.floor(minMin / 60), mm = String(minMin % 60).padStart(2, '0')
      console.log(`  ✗ ${idToName[enr.student_id] ?? enr.student_id} [${sessName}] arr ${rawTime} → 삭제 (최소 ${hh}:${mm} 미만)`)
      cleaned++
    } else {
      valid++
    }
  }

  console.log(`\n완료!`)
  console.log(`  정리(삭제): ${cleaned}건`)
  console.log(`  유효(유지): ${valid}건`)
  console.log(`  시간없음:   ${noTime}건`)
  console.log(`  유치부(skip): ${skipped}건`)
}

main().catch(err => { console.error('오류:', err); process.exit(1) })
