#!/usr/bin/env node
// 하네스 미해결 학생들 DB 상태 직접 확인

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// 스크린샷에서 확인된 학생들 + "DB 없음" 학생들
const TARGET_NAMES = [
  '이이래', '한원', '손채린', '이슬봄', '박시유', '명하주',  // DB에 없다고 나온 학생들
  '이지아', '권준범', '문선우', '이로이', '염하준', '엄한빈', '임세연', '김민서', '서다은',  // 잘못된 시간
  '윤채원',  // Firebase 불일치
]

async function main() {
  const students = await sbGet('campus_students?select=id,name&limit=2000')
  const sessions = await sbGet('class_sessions?select=id,name&limit=500')
  const classes = await sbGet('classes?select=id,session_id&limit=2000')
  const enrollments = await sbGet('class_enrollments?select=student_id,class_id,arr_schedule,dep_schedule&limit=5000')

  const sessMap = Object.fromEntries(sessions.map(s => [s.id, s.name]))
  const classToSess = Object.fromEntries(classes.map(c => [c.id, c.session_id]))
  const enrByStu = new Map()
  for (const e of enrollments) {
    if (!enrByStu.has(e.student_id)) enrByStu.set(e.student_id, [])
    enrByStu.get(e.student_id).push(e)
  }

  console.log('=== 대상 학생 DB 상태 ===\n')

  for (const targetName of TARGET_NAMES) {
    // 정확한 이름 + 유사 이름 찾기
    const exact = students.filter(s => s.name === targetName)
    const similar = students.filter(s => s.name !== targetName && s.name.includes(targetName.slice(0,2)))

    if (exact.length === 0 && similar.length === 0) {
      console.log(`❌ [${targetName}] DB에 없음 (유사 이름도 없음)`)
      continue
    }

    const matches = [...exact, ...similar]
    for (const stu of matches) {
      const label = stu.name === targetName ? '' : ` (← 유사: ${targetName} 검색)`
      const enrs = enrByStu.get(stu.id) || []
      if (!enrs.length) {
        console.log(`⚠  [${stu.name}]${label} 수강 없음`)
        continue
      }
      console.log(`✓  [${stu.name}]${label} 수강 ${enrs.length}건:`)
      for (const e of enrs) {
        const sessName = sessMap[classToSess[e.class_id]] || '?'
        const depTime = e.dep_schedule?._time ?? e.dep_schedule?.time ?? null
        const arrTime = e.arr_schedule?._time ?? e.arr_schedule?.time ?? null
        const depRaw = JSON.stringify(e.dep_schedule || {})
        console.log(`     class:${e.class_id} 세션:${sessName} | 등원:${arrTime} | 하원:${depTime}`)
        if (depTime) console.log(`     dep_schedule raw: ${depRaw.substring(0, 120)}`)
      }
    }
    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
