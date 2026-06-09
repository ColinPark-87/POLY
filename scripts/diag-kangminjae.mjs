import fs from 'node:fs'
import path from 'node:path'
const txt = fs.readFileSync(path.resolve('.env.local'), 'utf8'); const E = {}
for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m) E[m[1]] = m[2].trim() }
const BASE = E.NEXT_PUBLIC_SUPABASE_URL, K = E.SUPABASE_SERVICE_ROLE_KEY
const g = async q => { const r = await fetch(BASE + '/rest/v1/' + q, { headers: { apikey: K, Authorization: `Bearer ${K}` } }); return r.json() }
const norm = s => (s || '').replace(/\s+/g, ' ').trim()
const parseLoc = l => { if (!l) return null; const m = String(l).match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/); return m ? m[2].trim() : String(l).trim() }
const DAYS = ['월', '화', '수', '목', '금']

const camps = await g('campuses?select=id,name')
for (const camp of camps) {
  const sts = await g('campus_students?select=id,name,english_name&campus_id=eq.' + camp.id + '&name=eq.' + encodeURIComponent('강민재'))
  if (!sts.length) continue
  const coordRows = await g('campus_stop_coords?select=stop_name&campus_id=eq.' + camp.id)
  const coordExact = new Set(coordRows.map(r => (r.stop_name || '').trim()))
  const coordNorm = new Set(coordRows.map(r => norm(r.stop_name)))
  for (const s of sts) {
    console.log(`\n[${camp.name}] 강민재 (${s.english_name || ''}) id=${s.id}`)
    const en = await g('class_enrollments?select=class_id,arr_schedule,dep_schedule,classes(level,class_sessions(name,month))&student_id=eq.' + s.id)
    for (const e of en) {
      const ss = e.classes
      console.log(`  반: ${ss?.level || '?'} / ${ss?.class_sessions?.name || '?'} (${ss?.class_sessions?.month || '?'})`)
      for (const dir of ['arr_schedule', 'dep_schedule']) {
        const sc = e[dir]; if (!sc || !Object.keys(sc).length) continue
        console.log(`    ${dir}: ${JSON.stringify(sc)}`)
        for (const d of DAYS) {
          if (!sc[d]) continue
          const loc = parseLoc(sc[d + '_loc'])
          const hasExact = loc ? coordExact.has(loc.trim()) : false
          const hasNorm = loc ? coordNorm.has(norm(loc)) : false
          let flag = ''
          if (loc && !hasNorm) flag = ' ⚠️좌표없음'
          else if (loc && !hasExact && hasNorm) flag = ' ⚠️이름불일치(공백/표기)'
          else if (!loc) flag = ' ⚠️정류장(loc)없음'
          console.log(`      ${d}=${sc[d]}  정류장=${loc || '(없음)'}  좌표 exact:${hasExact} normStop:${hasNorm}${flag}`)
        }
      }
    }
  }
}
