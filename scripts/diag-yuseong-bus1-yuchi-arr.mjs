#!/usr/bin/env node
// diag-yuseong-bus1-yuchi-arr.mjs (읽기전용)
// 유성 유치부 등원 1호차 — 정류장명(raw _loc / parsed) + 좌표테이블/등록정류장 대조.
// "4번 정류장 미설정" 이 미설정 목록에 안 뜨고/이름변경 안되고/핀저장 안되는 원인 진단.
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
const CAMPUS = '유성', BUS = '1호차', DAYS = ['월', '화', '수', '목', '금']

function parseLocTime(loc) { if (!loc) return null; const m = String(loc).match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/); return m ? m[2].trim() : loc }
function normStop(s) { return (s ?? '').replace(/\s+/g, ' ').trim() }
function isYuchi(name) { return !!name && name.includes('유치부') }
function pickTargetMonth(months) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000); const y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1
  const cur = `${y}년 ${m}월`, next = `${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월`
  if (months.includes(next)) return next; if (months.includes(cur)) return cur; return months[months.length - 1] ?? ''
}
async function sbGet(q) { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${q} ${r.status} ${await r.text()}`); return r.json() }
async function sbAll(table, q) { const out = []; for (let f = 0; ; f += 1000) { const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${f}-${f + 999}` } }); if (!r.ok) throw new Error(`${table} ${r.status}`); const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break } return out }

async function main() {
  const campuses = await sbGet('campuses?select=id,name')
  const campus = campuses.find(c => c.name === CAMPUS); if (!campus) throw new Error(`캠퍼스 '${CAMPUS}' 없음`)
  console.log(`캠퍼스 ${CAMPUS} id=${campus.id}`)
  const monthRows = await sbGet(`class_sessions?select=month&campus_id=eq.${campus.id}`)
  const month = pickTargetMonth([...new Set(monthRows.map(r => r.month))])
  console.log(`대상 월: ${month}`)
  const sessions = await sbGet(`class_sessions?select=id,name&campus_id=eq.${campus.id}&month=eq.${encodeURIComponent(month)}`)
  const yuchiSessIds = new Set(sessions.filter(s => isYuchi(s.name)).map(s => s.id))
  const classes = await sbAll('classes', `select=id,session_id&session_id=in.(${sessions.map(s => s.id).join(',')})`)
  const yuchiClassIds = classes.filter(c => yuchiSessIds.has(c.session_id)).map(c => c.id)

  const enr = []
  for (let i = 0; i < yuchiClassIds.length; i += 100) {
    const chunk = yuchiClassIds.slice(i, i + 100)
    if (!chunk.length) break
    enr.push(...await sbAll('class_enrollments', `select=student_id,class_id,arr_schedule,campus_students(name)&class_id=in.(${chunk.join(',')})`))
  }

  const coordRows = await sbAll('campus_stop_coords', `select=stop_name,lat,lng&campus_id=eq.${campus.id}`)
  const coordsByRaw = new Map(coordRows.map(c => [c.stop_name, c]))
  const coordsByNorm = new Map(coordRows.map(c => [normStop(c.stop_name), c]))

  let regRows = []
  try { regRows = await sbAll('campus_registered_stops', `select=stop_name,bus_name,direction&campus_id=eq.${campus.id}`) } catch (e) { console.log('(campus_registered_stops 조회 실패)', e.message) }

  console.log(`\n=== ${CAMPUS} 유치부 등원 ${BUS} 정류장 (요일 합집합) ===`)
  // 정류장명 -> { rawSet, days, names }
  const stops = new Map()
  let emptyCount = 0
  for (const e of enr) {
    const sched = e.arr_schedule; if (!sched) continue
    for (const day of DAYS) {
      if (sched[day] !== BUS) continue
      const rawLoc = sched[day + '_loc'] ?? null
      const parsed = parseLocTime(rawLoc)
      const norm = normStop(parsed)
      const key = norm || '«빈값(미설정)»'
      if (!norm) emptyCount++
      if (!stops.has(key)) stops.set(key, { raws: new Set(), days: new Set(), names: new Set() })
      const s = stops.get(key)
      s.raws.add(JSON.stringify(rawLoc)); s.days.add(day); s.names.add(e.campus_students?.name ?? e.student_id)
    }
  }
  for (const [name, s] of stops) {
    const c = coordsByNorm.get(normStop(name)) ?? coordsByRaw.get(name)
    const coordStr = c ? `좌표✅ (${c.lat},${c.lng}) [DB키='${c.stop_name}']` : '좌표❌ 미설정'
    console.log(`\n• "${name}"  ${coordStr}`)
    console.log(`   요일=${[...s.days].join('')}  인원=${s.names.size}  raw_loc샘플=${[...s.raws].slice(0,4).join(' | ')}`)
  }
  console.log(`\n빈값(_loc 없음/공백) 항목 수: ${emptyCount}`)
  const emptyBucket = stops.get('«빈값(미설정)»')
  if (emptyBucket) console.log(`탑승장소 미설정 학생: ${[...emptyBucket.names].join(', ')}`)

  console.log(`\n=== campus_stop_coords 전체 (${coordRows.length}개) ===`)
  for (const c of coordRows) console.log(`   '${c.stop_name}'`)

  const regBus1 = regRows.filter(r => r.bus_name === BUS && r.direction === 'arr')
  console.log(`\n=== campus_registered_stops (${BUS} 등원, ${regBus1.length}개) ===`)
  for (const r of regBus1) console.log(`   '${r.stop_name}'`)
}
main().catch(e => { console.error('오류:', e); process.exit(1) })
