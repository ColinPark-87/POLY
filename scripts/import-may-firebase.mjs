// Firebase에서 2026년 5월 데이터를 Supabase로 임포트
// Usage: node scripts/import-may-firebase.mjs
// classes 테이블: level(레벨), room(선생님명), teacher(교실명=Firebase room)

import { createClient } from '@supabase/supabase-js'
import https from 'https'

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'
const CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'
const FB_BASE = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com'
const TARGET_MONTH = '2026년 5월'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(encodeURI(url), res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}

function getSessionKeyword(fbName) {
  if (fbName.includes('방과후')) return '방과후'
  if (fbName.includes('매일반')) return '매일반'
  if (fbName.includes('월수금')) return '월수금'
  if (fbName.includes('화목')) return '화목'
  if (fbName.includes('유치부')) return '유치부'
  return null
}

function getTimeRange(fbName) {
  const m = fbName.match(/(\d+:\d+~\d+:\d+)/)
  return m ? m[1] : null
}

async function main() {
  console.log('Firebase 5월 데이터 가져오는 중...')
  const fbSessions = await fetchJSON(`${FB_BASE}/poly_class/months/${TARGET_MONTH}/classData/sessions.json`)
  const fbSessionArr = Array.isArray(fbSessions) ? fbSessions : Object.values(fbSessions ?? {})
  console.log(`Firebase 세션: ${fbSessionArr.length}개`)

  // Supabase: 5월 세션 로드
  const { data: dbSessions } = await supabase
    .from('class_sessions').select('*').eq('campus_id', CAMPUS_ID).eq('month', TARGET_MONTH)

  // Supabase: 5월 classes 전체 로드 (session_id 기준)
  const sessionIds = (dbSessions ?? []).map(s => s.id)
  const { data: dbClasses } = sessionIds.length
    ? await supabase.from('classes').select('*').in('session_id', sessionIds)
    : { data: [] }

  // 학생 캐시
  const { data: students } = await supabase
    .from('campus_students').select('id, name').eq('campus_id', CAMPUS_ID)
  const studentByName = {}
  // 이름 정규화: 공백 제거 버전도 함께 인덱싱 (허 윤 ↔ 허윤 매칭)
  for (const s of students ?? []) {
    studentByName[s.name] = s.id
    studentByName[s.name.replace(/\s/g, '')] = s.id
  }
  console.log(`DB 학생: ${Object.keys(studentByName).length}명`)

  let enrCreated = 0, enrSkipped = 0, notFound = 0

  for (const fbSess of fbSessionArr) {
    const keyword = getSessionKeyword(fbSess.name)
    if (!keyword) { console.log(`[스킵] 매핑 실패: ${fbSess.name}`); continue }

    // DB 세션 찾기
    let dbSess = (dbSessions ?? []).find(s => s.name.includes(keyword))
    if (!dbSess) {
      const tr = getTimeRange(fbSess.name)
      const { data: created, error } = await supabase.from('class_sessions').insert({
        campus_id: CAMPUS_ID, name: fbSess.name, month: TARGET_MONTH, time_range: tr,
        sort_order: ['유치부','방과후','매일반','월수금','화목'].indexOf(keyword) + 1,
      }).select().single()
      if (error) { console.log(`세션 생성 실패: ${fbSess.name} - ${error.message}`); continue }
      dbSess = created
      dbSessions.push(dbSess)
      sessionIds.push(dbSess.id)
      console.log(`  새 세션 생성: ${fbSess.name}`)
    } else {
      // time_range 업데이트
      const tr = getTimeRange(fbSess.name)
      if (tr && dbSess.time_range !== tr) {
        await supabase.from('class_sessions').update({ time_range: tr }).eq('id', dbSess.id)
        dbSess.time_range = tr
        console.log(`  time_range 업데이트: ${dbSess.name} → ${tr}`)
      }
    }

    console.log(`\n[${fbSess.name}] → DB: ${dbSess.name} (${dbSess.time_range ?? '시간미정'})`)

    // 이 세션의 DB classes (teacher = Firebase room)
    const sessClasses = (dbClasses ?? []).filter(c => c.session_id === dbSess.id)
    // key: level|teacher (교실명)
    const classByKey = {}
    for (const c of sessClasses) classByKey[`${c.level}|${c.teacher}`] = c

    for (const fbClass of fbSess.classes ?? []) {
      const fbLevel = fbClass.level ?? ''
      const fbRoom = fbClass.room ?? ''   // Firebase room = DB teacher (교실명)
      const key = `${fbLevel}|${fbRoom}`

      let dbClass = classByKey[key]
      if (!dbClass) {
        // 없으면 생성: level=fbLevel, teacher=fbRoom (교실명)
        const { data: created, error } = await supabase.from('classes').insert({
          campus_id: CAMPUS_ID, session_id: dbSess.id,
          level: fbLevel, teacher: fbRoom,
        }).select().single()
        if (error) { console.log(`  반 생성 실패: ${fbLevel} ${fbRoom} - ${error.message}`); continue }
        dbClass = created
        classByKey[key] = dbClass
        ;(dbClasses ?? []).push(dbClass)
        console.log(`  새 반 생성: ${fbLevel} ${fbRoom}`)
      }

      // 이 반의 기존 enrollment 전부 삭제 (5월 데이터 교체)
      await supabase.from('class_enrollments')
        .delete().eq('class_id', dbClass.id).eq('campus_id', CAMPUS_ID)

      // Firebase 학생 enrollment 생성
      for (const stu of fbClass.students ?? []) {
        // "안재현 (Jayden Ahn) 신규" → "안재현 신규", "허 윤 (Yun Huh)" → "허 윤"
        const korName = (stu.name ?? '')
          .replace(/\([^)]*\)/g, '')   // 괄호 제거
          .replace(/\s+/g, ' ')        // 다중공백 → 단일
          .trim()
        const studentId = studentByName[korName] ?? studentByName[korName.replace(/\s/g, '')]
        if (!studentId) {
          if (korName) { console.log(`    학생 없음: "${korName}"`); notFound++ }
          continue
        }

        const arr_schedule = {}
        const dep_schedule = {}
        for (const [day, bus] of Object.entries(stu.arr ?? {})) if (bus) arr_schedule[day] = bus
        for (const [day, loc] of Object.entries(stu.arrLoc ?? {})) if (loc) arr_schedule[day + '_loc'] = loc
        for (const [day, bus] of Object.entries(stu.dep ?? {})) if (bus) dep_schedule[day] = bus
        for (const [day, loc] of Object.entries(stu.depLoc ?? {})) if (loc) dep_schedule[day + '_loc'] = loc

        const { error } = await supabase.from('class_enrollments').upsert({
          campus_id: CAMPUS_ID, student_id: studentId, class_id: dbClass.id,
          is_waitlist: false, arr_schedule, dep_schedule,
        }, { onConflict: 'student_id,class_id' })

        if (error) { enrSkipped++; console.log(`    enrollment 실패: ${korName} - ${error.message}`) }
        else enrCreated++
      }
    }
  }

  // 검증
  console.log('\n=== 검증 ===')
  const { data: finalSessions } = await supabase
    .from('class_sessions').select('id, name').eq('campus_id', CAMPUS_ID).eq('month', TARGET_MONTH)
  let grandTotal = 0
  for (const sess of finalSessions ?? []) {
    const { data: cls } = await supabase.from('classes').select('id').eq('session_id', sess.id)
    const ids = (cls ?? []).map(c => c.id)
    if (!ids.length) continue
    const { count } = await supabase.from('class_enrollments')
      .select('*', { count: 'exact', head: true }).in('class_id', ids).eq('is_waitlist', false)
    console.log(`  ${sess.name}: ${count}명`)
    grandTotal += (count ?? 0)
  }
  console.log(`  합계: ${grandTotal}명`)

  console.log('\n=== 완료 ===')
  console.log(`enrollment 생성/업데이트: ${enrCreated}, 실패: ${enrSkipped}, 학생 없음: ${notFound}`)
}

main().catch(console.error)
