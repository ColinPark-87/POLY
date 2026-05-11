#!/usr/bin/env node
/**
 * verify-harness.mjs v2
 * Firebase 경로 + 스크린샷 기준 ↔ Supabase DB 등하원 시간 검증 하네스
 *
 * 3단계 에이전트 구조:
 *   [Plan]     → Firebase + 스크린샷 데이터 수집, 비교 대상 목록 생성
 *   [Execute]  → 불일치 탐지 + 자동 수정 (유효한 시간만)
 *   [Evaluate] → 일치율 계산, 100% 미달 시 Execute 재실행
 *
 * 종료 조건: 일치율 100% 또는 자동 수정 불가 케이스만 남음
 */

const FIREBASE_URL = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class.json'
const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'
const DAYS = ['월', '화', '수', '목', '금']
const MAX_LOOPS = 5

// ── 스크린샷 기준 데이터 (0507 폴더 JPG에서 추출) ─────────────────────────
// 형식: { name, bus, dir, expected_time, section, note }
// expected_time: null = 시간 확인 불가 (섹션 위치만 검증)
const SCREENSHOT_REFERENCE = [
  // 하1.JPG - 유치부 하원
  // 이이래: DB에 없는 학생 (skip)
  { name: '김도율',  bus: '1호차', dir: 'dep', expected_time: '15:30', section: '유치부 하원' },
  { name: '문채윤',  bus: '8호차', dir: 'dep', expected_time: null,    section: '초등부 매일반 하원' }, // 매일반 하원 - dep 시간 없음(정상: 14:25 삭제됨)
  // 한원: DB에 없는 학생 (skip)
  { name: '박지우',  bus: '3호차', dir: 'dep', expected_time: '15:07', section: '유치부 하원' },
  { name: '손채민',  bus: '3호차', dir: 'dep', expected_time: '15:07', section: '유치부 하원' }, // 스크린샷 '손채린' → DB '손채민'
  { name: '조하윤',  bus: '3호차', dir: 'dep', expected_time: null,    section: '유치부 하원' },
  // 유치부 하원에 잘못 표시됐던 케이스 (이제 제거됐어야 함)
  { name: '이지아',  bus: '3호차', dir: 'dep', expected_time: null,    section: '유치부 하원', note: '9:00은 등원시간 - dep에 없어야 함' },
  { name: '권준범',  bus: '7호차', dir: 'dep', expected_time: null,    section: '유치부 하원', note: '9:10은 등원시간' },

  // 하2.JPG - 매일반 하원
  { name: '주선호',  bus: '3호차', dir: 'dep', expected_time: null,    section: '매일반 하원', note: '14:29는 등원시간 - 16:30 이후여야 함' },
  { name: '문선우',  bus: '3호차', dir: 'dep', expected_time: null,    section: '매일반 하원', note: '14:29는 등원시간' },
  { name: '이로이',  bus: '7호차', dir: 'dep', expected_time: null,    section: '매일반 하원', note: '9:07은 등원시간' },
  { name: '이로원',  bus: '7호차', dir: 'dep', expected_time: null,    section: '매일반 하원', note: '9:07은 등원시간' },
  // 이슬봄: DB에 없는 학생 (skip)

  // 하3.JPG - 3일반 하원
  // 박시유: DB '박시우' 등 이름 불일치 → skip
  { name: '염하준',  bus: null,    dir: 'dep', expected_time: null,    section: '3일반 하원', note: '16:02는 등원시간 - 18:05 이후여야 함' },
  // 명하주: DB에 없는 학생 (skip)

  // 하4.JPG - 2일반 하원
  { name: '이지성',  bus: '3호차', dir: 'dep', expected_time: null,    section: '2일반 하원', note: '14:31은 등원시간 - 18:50 이후여야 함' },
  { name: '엄한빈',  bus: '7호차', dir: 'dep', expected_time: null,    section: '2일반 하원', note: '14:28은 등원시간' },
  { name: '임세연',  bus: '6호차', dir: 'dep', expected_time: null,    section: '2일반 하원', note: '18:15는 18:50 미만' },
  { name: '김민서',  bus: '6호차', dir: 'dep', expected_time: null,    section: '2일반 하원', note: '18:15는 18:50 미만' },
  { name: '서다은',  bus: '6호차', dir: 'dep', expected_time: null,    section: '2일반 하원', note: '18:15는 18:50 미만' },
]

// ── 세션별 최소 하원 시간 ─────────────────────────────────────────────────
function getMinDepBySection(section) {
  if (!section) return 0
  if (section.includes('2일반') || section.includes('화목')) return 18 * 60 + 50
  if (section.includes('3일반') || section.includes('월수금')) return 18 * 60 + 5
  if (section.includes('매일반') || section.includes('방과후')) return 16 * 60 + 30
  if (section.includes('유치부')) return 14 * 60 + 30
  return 0
}

// ── 세션별 최소 등원 시간 ─────────────────────────────────────────────────
// 유치부 계열: 아침 등원 정상 → 0 (검사 안 함)
// 초등부 계열: 학교 끝나고 오므로 13:00 이후
function getMinArrBySection(section) {
  if (!section) return 0
  if (section.includes('유치부')) return 0
  if (section.includes('초등부') || section.includes('매일반') ||
      section.includes('화목') || section.includes('월수금')) return 13 * 60
  return 0
}

function parseTimeMin(t) {
  if (!t) return 9999
  const m = String(t).match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}

function normalizeTime(t) {
  if (!t) return null
  const first = String(t).split(/[-~]/)[0].trim()
  const m = first.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function extractKoreanName(rawName) {
  if (!rawName) return ''
  return rawName
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/\d{4}년\s*\d+월/, '')
    .replace(/\s*(신규|하원만|특강.*)\s*/g, '')
    .replace(/\*.*$/, '').trim()
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

// ── PLAN AGENT ─────────────────────────────────────────────────────────────

async function planAgent() {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  [PLAN AGENT] 데이터 수집 시작            ║')
  console.log('╚══════════════════════════════════════════╝')

  // Firebase 로드
  console.log('  → Firebase 로딩...')
  const fb = await fetch(FIREBASE_URL).then(r => r.json())
  const months = fb.months || {}
  const monthKeys = Object.keys(months).sort((a, b) => {
    const parse = s => { const m = s.match(/(\d{4})년\s*(\d{1,2})월/); return m ? parseInt(m[1])*100+parseInt(m[2]) : 0 }
    return parse(a) - parse(b)
  })
  console.log(`  → Firebase 월: ${monthKeys.join(', ')}`)

  // Firebase 이름|버스|방향 → 최신 시간
  const firebaseMap = new Map()
  for (const mk of monthKeys) {
    for (const route of months[mk]?.busRoutes || []) {
      const isArr = route.name?.includes('등원')
      const isDep = route.name?.includes('하원')
      if (!isArr && !isDep) continue
      const dir = isDep ? 'dep' : 'arr'

      for (const busEntry of route.buses || []) {
        const bus = busEntry.bus
        if (!bus) continue
        for (const stu of busEntry.students || []) {
          if (!stu.name) continue
          const time = normalizeTime(stu.time)
          const cleanName = extractKoreanName(stu.name)
          for (const name of [...new Set([stu.name, cleanName])].filter(Boolean)) {
            const key = `${name}|${bus}|${dir}`
            // 최신 월 데이터 우선 (이미 최신 순 정렬)
            if (time) firebaseMap.set(key, time)
          }
        }
      }
    }
  }
  console.log(`  → Firebase 매핑: ${firebaseMap.size}건`)

  // Supabase 로드
  console.log('  → Supabase 로딩...')
  const students = await sbGet('campus_students?select=id,name&limit=2000')
  const idToName = Object.fromEntries(students.map(s => [s.id, s.name]))
  const nameToId = Object.fromEntries(students.map(s => [s.name, s.id]))
  const sessions = await sbGet('class_sessions?select=id,name&limit=500')
  const sessMap = Object.fromEntries(sessions.map(s => [s.id, s.name]))
  const classes = await sbGet('classes?select=id,session_id&limit=2000')
  const classToSess = Object.fromEntries(classes.map(c => [c.id, c.session_id]))
  const enrollments = await sbGet('class_enrollments?select=student_id,class_id,arr_schedule,dep_schedule&limit=5000')
  console.log(`  → Supabase: 학생 ${students.length}명, 수강 ${enrollments.length}건`)

  // 비교 계획 생성 (student_id + class_id + dir 단위로 중복 제거)
  const planMap = new Map() // key: student_id|class_id|dir
  for (const enr of enrollments) {
    const name = idToName[enr.student_id]
    if (!name) continue
    const sessId = classToSess[enr.class_id]
    const sessName = sessId ? sessMap[sessId] : null

    for (const dir of ['arr', 'dep']) {
      const sched = dir === 'arr' ? (enr.arr_schedule || {}) : (enr.dep_schedule || {})
      const buses = [...new Set(DAYS.map(d => sched[d]).filter(Boolean))]
      if (!buses.length) continue

      // Firebase에서 시간 찾기 (첫 번째 매칭 버스 사용)
      let fbTime = null, fbBus = null
      for (const bus of buses) {
        const key = `${name}|${bus}|${dir}`
        if (firebaseMap.has(key)) { fbTime = firebaseMap.get(key); fbBus = bus; break }
      }
      if (!fbTime) continue

      // dep 방향: Firebase 값이 세션 최소 시간보다 이르면 신뢰하지 않음
      if (dir === 'dep' && sessName) {
        const minMin = getMinDepBySection(sessName)
        if (minMin > 0 && parseTimeMin(fbTime) < minMin) {
          continue
        }
      }

      // arr 방향: Firebase 값이 초등부 최소 등원 시간보다 이르면 신뢰하지 않음
      if (dir === 'arr' && sessName) {
        const minArrMin = getMinArrBySection(sessName)
        if (minArrMin > 0 && parseTimeMin(fbTime) < minArrMin) {
          continue
        }
      }

      const planKey = `${enr.student_id}|${enr.class_id}|${dir}`
      planMap.set(planKey, {
        student_id: enr.student_id, class_id: enr.class_id,
        name, bus: fbBus, dir,
        firebase_time: fbTime,
        db_time: sched._time ?? null,
        sched: { ...sched },
        session_name: sessName,
      })
    }
  }

  const plan = [...planMap.values()]
  console.log(`  → 비교 대상 (중복제거): ${plan.length}건`)
  return { plan, idToName, nameToId, enrollments }
}

// ── EXECUTE AGENT ──────────────────────────────────────────────────────────

async function executeAgent(plan) {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  [EXECUTE AGENT] 불일치 수정 시작         ║')
  console.log('╚══════════════════════════════════════════╝')

  let fixed = 0, alreadyMatch = 0, skipped = 0

  for (const item of plan) {
    if (!item.firebase_time) { skipped++; continue }
    if (item.db_time === item.firebase_time) { alreadyMatch++; continue }

    const schedKey = item.dir === 'arr' ? 'arr_schedule' : 'dep_schedule'
    const newSched = { ...item.sched, _time: item.firebase_time }
    try {
      await sbPatch(
        `class_enrollments?student_id=eq.${item.student_id}&class_id=eq.${item.class_id}`,
        { [schedKey]: newSched }
      )
      console.log(`  ✓ ${item.name} (${item.bus} ${item.dir === 'arr' ? '등원' : '하원'}) ${item.db_time ?? '없음'} → ${item.firebase_time}`)
      item.db_time = item.firebase_time
      item.sched._time = item.firebase_time
      fixed++
    } catch (e) {
      console.log(`  ✗ ${item.name} 수정 실패: ${e.message}`)
      skipped++
    }
  }
  console.log(`\n  수정: ${fixed}건 | 이미일치: ${alreadyMatch}건 | 건너뜀: ${skipped}건`)
  return { fixed, alreadyMatch, skipped }
}

// ── EVALUATE AGENT ─────────────────────────────────────────────────────────

async function evaluateAgent(plan, idToName, enrollments) {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  [EVALUATE AGENT] 일치율 평가 시작        ║')
  console.log('╚══════════════════════════════════════════╝')

  // DB 최신 상태 재조회
  const freshEnr = await sbGet('class_enrollments?select=student_id,class_id,arr_schedule,dep_schedule&limit=5000')
  const enrollMap = new Map(freshEnr.map(e => [`${e.student_id}|${e.class_id}`, e]))

  // ── 1) Firebase vs DB ───────────────────────────────────────────────────
  let total = 0, matched = 0
  const mismatches = []

  for (const item of plan) {
    if (!item.firebase_time) continue
    total++
    const enr = enrollMap.get(`${item.student_id}|${item.class_id}`)
    const sched = item.dir === 'arr' ? enr?.arr_schedule : enr?.dep_schedule
    const currentTime = sched?._time ?? null

    if (currentTime === item.firebase_time) {
      matched++
    } else {
      mismatches.push({ ...item, current_db_time: currentTime, source: 'Firebase' })
    }
  }

  const fbRate = total > 0 ? Math.round((matched / total) * 1000) / 10 : 100
  console.log(`\n  [Firebase 검증] 총 ${total}건 | 일치 ${matched}건 | 불일치 ${mismatches.length}건`)
  console.log(`  ★ Firebase 일치율: ${fbRate}%`)

  // ── 2) 스크린샷 기준 검증 ───────────────────────────────────────────────
  const nameToStudentId = Object.fromEntries(Object.entries(idToName).map(([k,v]) => [v,k]))
  let ssTotal = 0, ssPass = 0, ssFail = 0
  const ssResults = []

  for (const ref of SCREENSHOT_REFERENCE) {
    const sid = nameToStudentId[ref.name]
    if (!sid) {
      ssResults.push({ ...ref, status: '⚠ DB에 학생 없음' })
      continue
    }

    // 해당 학생의 모든 enrollment 찾기
    const studentEnrs = freshEnr.filter(e => e.student_id === sid)
    if (!studentEnrs.length) {
      ssResults.push({ ...ref, status: '⚠ 수강 없음' })
      continue
    }

    ssTotal++
    const anyEnr = studentEnrs[0]
    const sched = ref.dir === 'arr' ? anyEnr.arr_schedule : anyEnr.dep_schedule
    const dbTime = sched?._time ?? null
    const minMin = getMinDepBySection(ref.section)

    // note가 있는 케이스: 잘못된 시간이 제거됐는지 확인
    if (ref.note) {
      // dep이고 minMin 있으면 → db_time이 null이거나 최소시간 이상이어야 통과
      if (ref.dir === 'dep' && minMin > 0) {
        const isClean = !dbTime || parseTimeMin(dbTime) >= minMin
        if (isClean) {
          ssResults.push({ ...ref, db_time: dbTime, status: '✅ 잘못된시간 제거됨' })
          ssPass++
        } else {
          ssResults.push({ ...ref, db_time: dbTime, status: `❌ 여전히 잘못된 시간 (${dbTime})` })
          ssFail++
        }
      } else {
        ssResults.push({ ...ref, db_time: dbTime, status: '⚠ 수동확인필요' })
        ssTotal--
      }
    } else if (ref.expected_time) {
      // expected_time 비교
      const norm = normalizeTime(ref.expected_time) ?? ref.expected_time
      if (dbTime === norm) {
        ssResults.push({ ...ref, db_time: dbTime, status: '✅ 일치' })
        ssPass++
      } else {
        ssResults.push({ ...ref, db_time: dbTime, status: `❌ 불일치 (DB:${dbTime ?? '없음'} ≠ 기준:${norm})` })
        ssFail++
      }
    } else {
      ssResults.push({ ...ref, db_time: dbTime, status: `ℹ 시간: ${dbTime ?? '없음'}` })
      ssTotal--
    }
  }

  const ssRate = ssTotal > 0 ? Math.round((ssPass / ssTotal) * 1000) / 10 : 100
  console.log(`\n  [스크린샷 검증] 총 ${ssTotal}건 | 통과 ${ssPass}건 | 실패 ${ssFail}건`)
  console.log(`  ★ 스크린샷 일치율: ${ssRate}%`)

  console.log('\n  [스크린샷 검증 상세]')
  for (const r of ssResults) {
    const busStr = r.bus ? ` (${r.bus})` : ''
    const noteStr = r.note ? ` [${r.note}]` : ''
    console.log(`    ${r.status.padEnd(30)} ${r.name}${busStr} ${r.section}${noteStr}`)
  }

  if (mismatches.length > 0) {
    console.log('\n  [Firebase 불일치 상세]')
    for (const m of mismatches.slice(0, 20)) {
      console.log(`    - ${m.name} (${m.bus} ${m.dir==='arr'?'등원':'하원'}) DB:${m.current_db_time??'없음'} ≠ Firebase:${m.firebase_time}`)
    }
    if (mismatches.length > 20) console.log(`    ... 외 ${mismatches.length - 20}건`)
  }

  // 통합 일치율 (Firebase + 스크린샷)
  const combinedTotal = total + ssTotal
  const combinedMatched = matched + ssPass
  const combinedRate = combinedTotal > 0 ? Math.round((combinedMatched / combinedTotal) * 1000) / 10 : 100

  console.log(`\n  ══════════════════════════════════`)
  console.log(`  통합 일치율: ${combinedRate}%  (Firebase ${fbRate}% + 스크린샷 ${ssRate}%)`)
  console.log(`  ══════════════════════════════════`)

  return { fbRate, ssRate, combinedRate, mismatches, ssResults, ssFail }
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  등하원 시간 검증 하네스 v2.0                        ║')
  console.log('║  Firebase + 스크린샷 ↔ Supabase DB 100% 일치 목표   ║')
  console.log('╚══════════════════════════════════════════════════════╝')

  const { plan, idToName, enrollments } = await planAgent()

  if (!plan.length) {
    console.log('\n비교 대상 없음. Firebase 데이터를 확인하세요.')
    return
  }

  let loop = 0, finalFbRate = 0, finalSsRate = 0, finalRate = 0

  while (loop < MAX_LOOPS) {
    loop++
    console.log(`\n${'═'.repeat(54)}`)
    console.log(`  루프 ${loop}/${MAX_LOOPS}`)
    console.log('═'.repeat(54))

    const execResult = await executeAgent(plan)

    // plan sched 갱신
    const freshEnr = await sbGet('class_enrollments?select=student_id,class_id,arr_schedule,dep_schedule&limit=5000')
    const enrollMap = new Map(freshEnr.map(e => [`${e.student_id}|${e.class_id}`, e]))
    for (const item of plan) {
      const enr = enrollMap.get(`${item.student_id}|${item.class_id}`)
      if (enr) {
        item.sched = item.dir === 'arr' ? (enr.arr_schedule || {}) : (enr.dep_schedule || {})
        item.db_time = item.sched._time ?? null
      }
    }

    const evalResult = await evaluateAgent(plan, idToName, enrollments)
    finalFbRate = evalResult.fbRate
    finalSsRate = evalResult.ssRate
    finalRate = evalResult.combinedRate

    const allFixed = evalResult.fbRate >= 100 && evalResult.ssRate >= 100
    if (allFixed) {
      console.log('\n🎉 Firebase + 스크린샷 모두 100% 달성! 검증 완료.')
      break
    }
    if (execResult.fixed === 0) {
      console.log('\n⚠ 자동 수정 불가한 불일치가 남아있습니다.')
      console.log('  Firebase 원본 데이터 오류이거나 수동 입력이 필요합니다.')
      break
    }
    console.log(`\n  → 루프 ${loop+1} 재시도...`)
  }

  console.log('\n╔══════════════════════════════════════════╗')
  console.log(`║  Firebase 일치율:   ${String(finalFbRate+'%').padEnd(21)}║`)
  console.log(`║  스크린샷 일치율:   ${String(finalSsRate+'%').padEnd(21)}║`)
  console.log(`║  통합 일치율:       ${String(finalRate+'%').padEnd(21)}║`)
  console.log(`║  ${finalRate >= 100 ? '✅ PASS' : '❌ FAIL - 수동 확인 필요'}${' '.repeat(finalRate >= 100 ? 34 : 26)}║`)
  console.log('╚══════════════════════════════════════════╝')
}

main().catch(err => { console.error('하네스 오류:', err); process.exit(1) })
