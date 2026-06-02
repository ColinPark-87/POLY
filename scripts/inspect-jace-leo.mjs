// Jace Kim, Leo Kim 정보 + 5월 유치부 방과후 enrollment 확인
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(envText.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
}))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'

async function main() {
  // 1) Jace Kim, Leo Kim 후보
  const { data: kims } = await supabase
    .from('campus_students')
    .select('id, name, english_name, grade, is_active')
    .eq('campus_id', CAMPUS_ID)
    .or('english_name.ilike.%Jace%,english_name.ilike.%Leo%')
  console.log('=== Jace/Leo 후보 ===')
  for (const s of kims) {
    console.log(`  ${s.name} (${s.english_name}) | grade=${s.grade} | is_active=${s.is_active} | id=${s.id}`)
  }

  // 2) 5월 유치부 방과후 세션 + 클래스
  const { data: sessions } = await supabase
    .from('class_sessions').select('id, name')
    .eq('campus_id', CAMPUS_ID).eq('month', '2026년 5월')
  console.log('\n=== 2026년 5월 세션 ===')
  for (const s of sessions) console.log(`  ${s.name} | id=${s.id}`)

  const bangwahuSess = sessions.filter(s => /유치부\s*방과후/.test(s.name))
  const bangwahuSessIds = bangwahuSess.map(s => s.id)
  const { data: bangwahuClasses } = await supabase
    .from('classes').select('id, level, room, teacher, session_id')
    .in('session_id', bangwahuSessIds)
  console.log('\n=== 5월 유치부 방과후 반들 ===')
  for (const c of bangwahuClasses) console.log(`  ${c.level} (room=${c.room}, teacher=${c.teacher}) | id=${c.id}`)

  // 3) 5월 유치부 방과후 enrollment들
  const classIds = bangwahuClasses.map(c => c.id)
  const { data: enrs } = await supabase
    .from('class_enrollments')
    .select('id, student_id, class_id, is_waitlist, arr_schedule, dep_schedule, campus_students(name, english_name, grade)')
    .in('class_id', classIds)
  console.log('\n=== 5월 유치부 방과후 enrollment (전체) ===')
  for (const e of enrs) {
    const s = e.campus_students
    console.log(`  ${s?.name} (${s?.english_name}, ${s?.grade}) | class=${e.class_id} | waitlist=${e.is_waitlist} | enrId=${e.id}`)
  }

  // 4) Leo Kim 의 모든 5월 enrollment
  const leo = kims.find(k => /leo/i.test(k.english_name ?? ''))
  if (leo) {
    const { data: leoEnrs } = await supabase
      .from('class_enrollments')
      .select('id, class_id, is_waitlist, classes(level, session_id, class_sessions(name, month))')
      .eq('student_id', leo.id)
    console.log(`\n=== ${leo.name} (${leo.english_name}) 의 모든 enrollment ===`)
    for (const e of leoEnrs) {
      const c = e.classes
      console.log(`  ${c?.class_sessions?.month} | ${c?.class_sessions?.name} | ${c?.level} | waitlist=${e.is_waitlist} | enrId=${e.id}`)
    }
  }

  // 5) Jace Kim 의 모든 5월 enrollment
  const jace = kims.find(k => /jace/i.test(k.english_name ?? ''))
  if (jace) {
    const { data: jaceEnrs } = await supabase
      .from('class_enrollments')
      .select('id, class_id, is_waitlist, classes(level, session_id, class_sessions(name, month))')
      .eq('student_id', jace.id)
    console.log(`\n=== ${jace.name} (${jace.english_name}) 의 모든 enrollment ===`)
    for (const e of jaceEnrs) {
      const c = e.classes
      console.log(`  ${c?.class_sessions?.month} | ${c?.class_sessions?.name} | ${c?.level} | waitlist=${e.is_waitlist} | enrId=${e.id}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
