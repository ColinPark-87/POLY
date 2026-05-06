// 4월 → 5월 데이터 복사 스크립트
// Usage: node scripts/copy-month.mjs [source] [target]
// Default: '2026년 4월' → '2026년 5월'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU'
const CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const SOURCE = process.argv[2] ?? '2026년 4월'
const TARGET = process.argv[3] ?? '2026년 5월'

async function main() {
  console.log(`${SOURCE} → ${TARGET} 복사`)

  // 대상 월 이미 있으면 건너뜀
  const { data: existing } = await supabase
    .from('class_sessions').select('id').eq('campus_id', CAMPUS_ID).eq('month', TARGET).limit(1)
  if (existing?.length) {
    console.log(`⚠ ${TARGET} 데이터 이미 있음 (${existing.length}개). 중단.`)
    return
  }

  // 원본 세션 조회
  const { data: sessions, error: sessErr } = await supabase
    .from('class_sessions').select('*').eq('campus_id', CAMPUS_ID).eq('month', SOURCE).order('sort_order')
  if (sessErr) throw sessErr
  if (!sessions?.length) { console.log(`⚠ ${SOURCE} 세션 없음`); return }

  console.log(`세션 ${sessions.length}개 발견`)
  let totalClasses = 0, totalEnrollments = 0

  for (const sess of sessions) {
    // 새 세션 생성
    const { data: newSess, error: newSessErr } = await supabase
      .from('class_sessions').insert({
        campus_id: CAMPUS_ID,
        name: sess.name,
        time_range: sess.time_range,
        month: TARGET,
        sort_order: sess.sort_order,
      }).select('id').single()
    if (newSessErr) { console.error('세션 생성 오류:', newSessErr.message, sess.name); continue }

    console.log(`  ✓ 세션: ${sess.name}`)

    // 원본 반 조회
    const { data: classes } = await supabase
      .from('classes').select('*').eq('session_id', sess.id)
    for (const cls of classes ?? []) {
      const { data: newCls, error: clsErr } = await supabase
        .from('classes').insert({
          campus_id: CAMPUS_ID,
          session_id: newSess.id,
          level: cls.level,
          teacher: cls.teacher,
          room: cls.room,
          color: cls.color,
          sort_order: cls.sort_order,
        }).select('id').single()
      if (clsErr) { console.error('  반 생성 오류:', clsErr.message, cls.level); continue }
      totalClasses++

      // 수강생 복사
      const { data: enrollments } = await supabase
        .from('class_enrollments').select('*').eq('class_id', cls.id)
      if (!enrollments?.length) continue

      const newEnrollments = enrollments.map(e => ({
        class_id: newCls.id,
        student_id: e.student_id,
        campus_id: CAMPUS_ID,
        arr_schedule: e.arr_schedule,
        dep_schedule: e.dep_schedule,
        is_waitlist: e.is_waitlist,
      }))

      const { error: enrErr } = await supabase
        .from('class_enrollments').insert(newEnrollments)
      if (enrErr) { console.error('  수강 복사 오류:', enrErr.message); continue }
      totalEnrollments += enrollments.length
    }
  }

  console.log(`\n=== 완료 ===`)
  console.log(`세션: ${sessions.length}, 반: ${totalClasses}, 수강: ${totalEnrollments}`)
}

main().catch(console.error)
