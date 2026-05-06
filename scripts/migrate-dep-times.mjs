#!/usr/bin/env node
// migrate-dep-times.mjs
// Firebase 유치부/초등부 하원 시간 → Supabase dep_schedule._time 마이그레이션

const FIREBASE_URL = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class.json'
const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'

const DAYS = ['월', '화', '수', '목', '금']

// "3:30" → "15:30", "2:55-3:00" → "14:55", "6:15-20" → "18:15"
function normalizeTime(t) {
  if (!t) return null
  // 범위 형식에서 첫 번째 시간만 추출: "2:55-3:00", "6:15-20", "4:50-55" 등
  const first = String(t).split(/[-~]/)[0].trim()
  const m = first.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
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

  // 월 이름 기준 정렬 (최신 월 우선) → 최신 월 데이터가 이전 월을 덮어씀
  // ex) "2025년 3월" < "2025년 4월" < "2025년 5월"
  monthKeys.sort((a, b) => {
    const parse = s => {
      const m = s.match(/(\d{4})년\s*(\d{1,2})월/)
      return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0
    }
    return parse(a) - parse(b)
  })

  // Firebase 이름에서 한국어 이름만 추출: "양세인 (Bella Yang) 신규" → "양세인"
  function extractKoreanName(rawName) {
    if (!rawName) return ''
    return rawName
      .replace(/\(.*?\)/g, '')          // (영어명) 또는 (2026년 3월) 등 괄호 제거
      .replace(/\[.*?\]/g, '')          // [월,수,금 3:10] 등 대괄호 제거
      .replace(/\d{4}년\s*\d+월/, '')   // 날짜 형식 제거
      .replace(/\s*(신규|하원만|특강.*)\s*/g, '')  // 신규, 하원만, 특강... 제거
      .replace(/\*.*$/, '')             // * 이후 메모 제거
      .trim()
  }

  // 2. 모든 하원 학생 시간 수집 (key: "이름|호차" → 정규화된 시간)
  const studentTimings = new Map() // "이름|1호차" → "15:30"

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
          // 원본 이름으로도 저장, 한국어만 추출한 이름으로도 저장
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

  // 3. Supabase campus_students 전체 조회
  console.log('Supabase 학생 목록 조회...')
  const students = await sbGet('campus_students?select=id,name&limit=2000')
  const nameToId = new Map(students.map(s => [s.name, s.id]))
  console.log(`학생 ${students.length}명 조회`)

  // 4. Supabase class_enrollments 전체 조회
  console.log('Supabase 수강등록 조회...')
  const enrollments = await sbGet('class_enrollments?select=student_id,class_id,dep_schedule&limit=5000')
  console.log(`수강등록 ${enrollments.length}건 조회`)

  // 5. 매칭 & 업데이트
  let updated = 0, skipped = 0, noMatch = 0

  for (const enr of enrollments) {
    const depSched = enr.dep_schedule || {}

    // 이미 올바른 시간이 있으면 건너뜀
    if (depSched._time && /^\d{2}:\d{2}$/.test(depSched._time) && depSched._time >= '08:00') {
      skipped++
      continue
    }

    // 이 enrollment에서 하원 호차 찾기
    const busSet = new Set(DAYS.map(d => depSched[d]).filter(Boolean))
    if (busSet.size === 0) continue

    // 학생 이름 찾기
    const student = students.find(s => s.id === enr.student_id)
    if (!student) continue

    // Firebase에서 매칭 시간 찾기
    let newTime = null
    for (const busName of busSet) {
      const key = `${student.name}|${busName}`
      if (studentTimings.has(key)) {
        newTime = studentTimings.get(key)
        break
      }
    }

    if (!newTime) {
      noMatch++
      continue
    }

    // dep_schedule 업데이트
    const newDepSched = { ...depSched, _time: newTime }
    await sbPatch(
      `class_enrollments?student_id=eq.${enr.student_id}&class_id=eq.${enr.class_id}`,
      { dep_schedule: newDepSched }
    )
    console.log(`  ✓ ${student.name} (${[...busSet].join(',')}) → ${newTime}`)
    updated++
  }

  console.log(`\n완료!`)
  console.log(`  업데이트: ${updated}건`)
  console.log(`  건너뜀 (이미 올바른 시간): ${skipped}건`)
  console.log(`  Firebase 매칭 없음: ${noMatch}건`)
}

main().catch(err => { console.error('오류:', err); process.exit(1) })
