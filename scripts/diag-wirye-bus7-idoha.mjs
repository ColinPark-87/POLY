#!/usr/bin/env node
// diag-wirye-bus7-idoha.mjs (읽기전용)
// 위례 7호차 유치부 등원 — 이도하 학생 _loc 저장값 + 등록정류장 대조.
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const txt = fs.readFileSync(path.resolve('.env.local'), 'utf8')
  const env = {}
  for (const line of txt.split(/\r?\n/)) { const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '') }
  return env
}
const ENV = loadEnv()
const URL = ENV.NEXT_PUBLIC_SUPABASE_URL, KEY = ENV.SUPABASE_SERVICE_ROLE_KEY
const CAMPUS = '위례', DAYS = ['월', '화', '수', '목', '금']

function normStop(s) { return (s ?? '').replace(/\s+/g, ' ').trim() }
async function sbGet(q) { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${q} ${r.status} ${await r.text()}`); return r.json() }
async function sbAll(table, q) { const out = []; for (let f = 0; ; f += 1000) { const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${f}-${f + 999}` } }); if (!r.ok) throw new Error(`${table} ${r.status}`); const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break } return out }

async function main() {
  const campuses = await sbGet('campuses?select=id,name')
  const campus = campuses.find(c => c.name && c.name.includes(CAMPUS)); if (!campus) throw new Error(`캠퍼스 '${CAMPUS}' 없음 — 후보: ${campuses.map(c=>c.name).join(', ')}`)
  console.log(`캠퍼스 ${campus.name} id=${campus.id}`)

  // 학생 이도하 검색
  const stu = await sbGet(`campus_students?select=id,name,english_name&campus_id=eq.${campus.id}&name=eq.${encodeURIComponent('이도하')}`)
  console.log(`\n=== 이도하 학생 (${stu.length}명) ===`)
  for (const s of stu) console.log(`  id=${s.id} name=${s.name} eng=${s.english_name}`)

  for (const s of stu) {
    const enr = await sbAll('class_enrollments', `select=class_id,arr_schedule,dep_schedule,is_waitlist&student_id=eq.${s.id}`)
    console.log(`\n--- enrollments for ${s.name} (${enr.length}) ---`)
    for (const e of enr) {
      const cls = (await sbGet(`classes?select=*&id=eq.${e.class_id}`))[0]
      const sess = cls ? (await sbGet(`class_sessions?select=name,month&id=eq.${cls.session_id}`))[0] : null
      console.log(`  class=${JSON.stringify(cls)} session=${sess?.name} month=${sess?.month} waitlist=${e.is_waitlist}`)
      console.log(`    arr_schedule=${JSON.stringify(e.arr_schedule)}`)
      console.log(`    dep_schedule=${JSON.stringify(e.dep_schedule)}`)
    }
  }

  // 등록 정류장 (7호차)
  let regRows = []
  try { regRows = await sbAll('campus_registered_stops', `select=stop_name,bus_name,direction,default_time&campus_id=eq.${campus.id}`) } catch (e) { console.log('(campus_registered_stops 조회 실패)', e.message) }
  console.log(`\n=== campus_registered_stops 7호차 ===`)
  for (const r of regRows.filter(r => r.bus_name === '7호차')) console.log(`  [${r.direction}] '${r.stop_name}' (norm='${normStop(r.stop_name)}') default_time=${r.default_time}`)

  // 좌표
  const coordRows = await sbAll('campus_stop_coords', `select=stop_name,lat,lng&campus_id=eq.${campus.id}`)
  console.log(`\n=== campus_stop_coords (e편한세상 매칭) ===`)
  for (const c of coordRows.filter(c => c.stop_name && c.stop_name.includes('e편한') )) console.log(`  '${c.stop_name}' (${c.lat},${c.lng})`)
}
main().catch(e => { console.error('오류:', e); process.exit(1) })
