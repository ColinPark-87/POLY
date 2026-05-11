#!/usr/bin/env node
// fix-dep-times-force.mjs
// Firebase 하원 시간 → Supabase dep_schedule._time 강제 덮어쓰기
// 기존 migrate-dep-times.mjs는 _time >= '08:00' 이면 건너뜀 → 잘못된 등원 시간도 스킵됨
// 이 스크립트는 Firebase 매칭이 있으면 기존 값 무관하게 항상 덮어씀

const FIREBASE_URL = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class.json'
const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'

const DAYS = ['월', '화', '수', '목', '금']

// "3:30" → "15:30", "2:55-3:00" → "14:55", "6:15-20" → "18:15"
function normalizeTime(t) {
  if (!t) return null
  const first = String(t).split(/[-~]/)[0].trim()
  const m = first.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// Firebase 이름에서 한국어 이름만 추출
function extractKoreanName(rawName) {
  if (!rawName) return ''
  return rawName
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\d{4}년\s*\d+월/, '')
    .replace(/\s*(신규|하원만|특강.*)\s*/g, '')
    .replace(/\*.*$/, '')
    .trim()
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
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`)
}

async function main() {
  // 1. Firebase 데이터 가져오기
  console.log('Firebase 데이터 로딩...')
  const fb = await fetch(FIREBASE_URL).then(r => r.json())
  const months = fb.months || {}
  const monthKeys = Object.keys(months)
  console.log(`Firebase 월 목록: ${monthKeys.join(', ')}`)

  // 최신 월이 이전 월을 덮어씀
  monthKeys.sort((a, b) => {
    const parse = s => {
      const m = s.match(/(\d{4})년\s*(\d{1,2})월/)
      return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0
    }
    return parse(a) - parse(b)
  })

  // 2. 하원 학생 시간 수집 (이름|호차 → 정규화된 시간)
  const studentTimings = new Map()

  for (const monthKey of monthKeys) {
    const busRoutes = months[monthKey]?.busRoutes || []
    for (const sec of busRoutes) {
      if (!sec.name?.includes('하원')) continue
      for (const busEntry of sec.buses || []) {
        const busName = busEntry.bus
        if (!busName) continue
        for (const stu of busEntry.students || []) {
          if (!stu.name || !stu.time) continue
          const normalized = normalizeTime(stu.time)
          if (!normalized) continue
          const rawKey = `${stu.name}|${busName}`
          const cleanName = extractKoreanName(stu.name)
          const cleanKey = `${cleanName}|${busName}`
          studentTimings.set(rawKey, normalized)
          if (cleanName && cleanName !== stu.name) {
            studentTimings.set(cleanKey, normalized)
          }
        }
      }
    }
  }

  console.log(`수집된 하원 시간: ${studentTimings.size}건`)
  if (studentTimings.size === 0) {
    console.log('하원 데이터 없음. 종료.')
    return
  }

  // 3. Supabase 학생 목록 조회
  console.log('Supabase 학생 목록 조회...')
  const students = await sbGet('campus_students?select=id,name&limit=2000')
  const idToName = new Map(students.map(s => [s.id, s.name]))
  console.log(`학생 ${students.length}명 조회`)

  // 4. Supabase 수강등록 전체 조회
  console.log('Supabase 수강등록 조회...')
  const enrollments = await sbGet('class_enrollments?select=student_id,class_id,dep_schedule&limit=5000')
  console.log(`수강등록 ${enrollments.length}건 조회`)

  // 5. 매칭 & 업데이트
  let updated = 0, unchanged = 0, noMatch = 0, noBus = 0

  for (const enr of enrollments) {
    const depSched = enr.dep_schedule || {}
    const busSet = new Set(DAYS.map(d => depSched[d]).filter(Boolean))
    if (busSet.size === 0) { noBus++; continue }

    const studentName = idToName.get(enr.student_id)
    if (!studentName) continue

    // Firebase에서 시간 찾기
    let newTime = null
    let matchedBus = null
    for (const busName of busSet) {
      const key = `${studentName}|${busName}`
      if (studentTimings.has(key)) {
        newTime = studentTimings.get(key)
        matchedBus = busName
        break
      }
    }

    if (!newTime) {
      noMatch++
      continue
    }

    const currentTime = depSched._time ?? null

    // 기존 시간과 동일하면 건너뜀
    if (currentTime === newTime) {
      unchanged++
      continue
    }

    // 항상 Firebase 시간으로 덮어씀
    const newDepSched = { ...depSched, _time: newTime }
    await sbPatch(
      `class_enrollments?student_id=eq.${enr.student_id}&class_id=eq.${enr.class_id}`,
      { dep_schedule: newDepSched }
    )

    const changeNote = currentTime ? `${currentTime} → ${newTime}` : `(없음) → ${newTime}`
    console.log(`  ✓ ${studentName} (${matchedBus}) ${changeNote}`)
    updated++
  }

  console.log(`\n완료!`)
  console.log(`  업데이트: ${updated}건`)
  console.log(`  동일 (건너뜀): ${unchanged}건`)
  console.log(`  Firebase 매칭 없음: ${noMatch}건`)
  console.log(`  하원 버스 없음: ${noBus}건`)
}

main().catch(err => { console.error('오류:', err); process.exit(1) })
