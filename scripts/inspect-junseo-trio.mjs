// 김준서 3명 모두의 전체 enrollment 확인
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

const TARGETS = [
  { id: 'e824eb3a-2c13-4d46-9932-af82f2f4be39', desc: 'Leo Kim 6세 (현재 5월 방과후 enrollment 보유)' },
  { id: 'fa7e49a2-80d1-4583-b283-bdb216dabc1f', desc: 'Leo Kim 3학년' },
  { id: '5dd60610-da3c-41ae-9361-f63c3e9ce79c', desc: 'Jace Kim (grade=null)' },
]

async function main() {
  for (const t of TARGETS) {
    const { data: s } = await supabase
      .from('campus_students')
      .select('id, name, english_name, grade, is_active, school, created_at')
      .eq('id', t.id).single()
    console.log(`\n────────────────────────────────────────`)
    console.log(`${t.desc}`)
    console.log(`  ${s.name} (${s.english_name}) | grade=${s.grade} | school=${s.school} | is_active=${s.is_active} | created=${s.created_at?.slice(0,10)}`)
    const { data: enrs } = await supabase
      .from('class_enrollments')
      .select('id, class_id, is_waitlist, classes(level, session_id, class_sessions(name, month))')
      .eq('student_id', t.id)
    if (enrs.length === 0) { console.log('  → 모든 월 enrollment 없음'); continue }
    enrs.sort((a,b) => (a.classes?.class_sessions?.month ?? '').localeCompare(b.classes?.class_sessions?.month ?? ''))
    for (const e of enrs) {
      const c = e.classes; const sess = c?.class_sessions
      console.log(`  · ${sess?.month} | ${sess?.name} | ${c?.level} | waitlist=${e.is_waitlist}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
