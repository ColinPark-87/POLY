#!/usr/bin/env node
// diag-bus2-yuchi-dep.mjs (읽기전용)
// 중계 유치부 하원 2호차 — 요일별 정류장 순서(시간순)+좌표 덤프.
// 월요일만 지저분한 원인(좌표누락 / 시간순↔지리순 어긋남 / 월-only 우회 정류장) 진단.
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

const CAMPUS = '중계', BUS = '2호차', DAYS = ['월', '화', '수', '목', '금']

function parseTimeMinNorm(t) { if (!t) return 9999; const m = String(t).match(/(\d{1,2}):(\d{2})/); if (!m) return 9999; let h = parseInt(m[1]); if (h < 8) h += 12; return h * 60 + parseInt(m[2]) }
function parseLocTime(loc) { if (!loc) return { cleanLoc: null }; const m = String(loc).match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/); return m ? { cleanLoc: m[2].trim() } : { cleanLoc: loc } }
function normStop(s) { return (s ?? '').replace(/\s+/g, ' ').trim() }
function isYuchi(name) { return !!name && name.includes('유치부') }
function pickTargetMonth(months) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000); const y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1
  const cur = `${y}년 ${m}월`, next = `${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월`
  if (months.includes(next)) return next; if (months.includes(cur)) return cur; return months[0] ?? ''
}
function hav(a, b) { // m
  if (!a || !b) return null
  const R = 6371000, toR = d => d * Math.PI / 180
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}
async function sbGet(q) { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${q} ${r.status} ${await r.text()}`); return r.json() }
async function sbAll(table, q) { const out = []; for (let f = 0; ; f += 1000) { const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${f}-${f + 999}` } }); if (!r.ok) throw new Error(`${table} ${r.status}`); const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break } return out }

async function main() {
  const campuses = await sbGet('campuses?select=id,name')
  const campus = campuses.find(c => c.name === CAMPUS); if (!campus) throw new Error('캠퍼스 없음')
  const monthRows = await sbGet(`class_sessions?select=month&campus_id=eq.${campus.id}`)
  const month = pickTargetMonth([...new Set(monthRows.map(r => r.month))])
  const sessions = await sbGet(`class_sessions?select=id,name&campus_id=eq.${campus.id}&month=eq.${encodeURIComponent(month)}`)
  const yuchiSessIds = new Set(sessions.filter(s => isYuchi(s.name)).map(s => s.id))
  const classes = await sbAll('classes', `select=id,session_id&session_id=in.(${sessions.map(s => s.id).join(',')})`)
  const classToSess = Object.fromEntries(classes.map(c => [c.id, c.session_id]))
  const yuchiClassIds = classes.filter(c => yuchiSessIds.has(c.session_id)).map(c => c.id)

  const enr = []
  for (let i = 0; i < yuchiClassIds.length; i += 100) {
    const chunk = yuchiClassIds.slice(i, i + 100)
    enr.push(...await sbAll('class_enrollments', `select=student_id,class_id,dep_schedule,campus_students(name)&class_id=in.(${chunk.join(',')})`))
  }

  const coordRows = await sbAll('campus_stop_coords', `select=stop_name,lat,lng&campus_id=eq.${campus.id}`)
  const coords = {}; for (const c of coordRows) coords[normStop(c.stop_name)] = { lat: c.lat, lng: c.lng }

  console.log(`\n=== ${CAMPUS} 유치부 하원 ${BUS} (${month}) 요일별 노선 ===`)
  for (const day of DAYS) {
    const stopMap = new Map()
    for (const e of enr) {
      const sched = e.dep_schedule; if (!sched) continue
      if (sched[day] !== BUS) continue
      const { cleanLoc } = parseLocTime(sched[day + '_loc'] ?? null)
      const loc = normStop(cleanLoc); if (!loc) continue
      const time = sched[day + '_time'] ?? sched['_time'] ?? sched['time'] ?? null
      if (!stopMap.has(loc)) stopMap.set(loc, { loc, min: 9999, time: null, names: [] })
      const s = stopMap.get(loc); s.names.push(e.campus_students?.name ?? e.student_id)
      const tm = parseTimeMinNorm(time); if (tm < s.min) { s.min = tm; s.time = time }
    }
    const stops = [...stopMap.values()].sort((a, b) => a.min - b.min)
    console.log(`\n── ${day}요일 (${stops.length}정류장, ${stops.reduce((n, s) => n + s.names.length, 0)}명) ──`)
    let prev = null, total = 0
    for (const s of stops) {
      const c = coords[s.loc]
      const d = prev && c ? hav(prev, c) : null
      if (d != null) total += d
      const dStr = !c ? '⚠️좌표없음' : (d != null ? `+${d}m` : '(시작)')
      const flag = d != null && d > 1200 ? ' ⚠️' : ''
      console.log(`  ${s.time ?? '--:--'}  ${(s.loc + ' '.repeat(34)).slice(0, 34)} ${dStr.padStart(10)}${flag}  (${s.names.length}명: ${s.names.join(',')})`)
      if (c) prev = c
    }
    console.log(`   = 정류장간 누적 ${(total / 1000).toFixed(2)}km (학원 제외, 시간순)`)
  }
}
main().catch(e => { console.error('오류:', e); process.exit(1) })
