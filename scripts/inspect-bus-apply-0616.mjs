#!/usr/bin/env node
// inspect-bus-apply-0616.mjs  (읽기전용 진단)
// 목적: 버스 적용 작업 전 4개 캠퍼스(중계 레퍼런스 + 목동매그넷·송도·송파) 현황 파악.
// 데이터 변경 없음. 콘솔 + scripts/_out/bus-apply-inspect.json 출력.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const txt = fs.readFileSync(path.resolve('.env.local'), 'utf8')
  const env = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}
const ENV = loadEnv()
const sb = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TARGETS = ['중계', '목동', '송도', '송파']

async function fetchAll(table, campusId, cols = '*') {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order('id').range(from, from + 999)
    if (campusId) q = sb.from(table).select(cols).eq('campus_id', campusId).order('id').range(from, from + 999)
    const { data, error } = await q
    if (error) { console.error(`  [${table}] error:`, error.message); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function main() {
  const { data: campuses, error } = await sb.from('campuses').select('*').order('name')
  if (error) { console.error('campuses error:', error.message); process.exit(1) }
  console.log('=== ALL CAMPUSES ===')
  for (const c of campuses) console.log(`  ${c.name}  | code=${c.code} | id=${c.id} | active=${c.is_active}`)

  const report = { generatedAt: new Date().toISOString(), campuses: {} }

  for (const key of TARGETS) {
    const matches = campuses.filter(c => c.name.includes(key))
    for (const c of matches) {
      console.log(`\n================= ${c.name} (id=${c.id}) =================`)
      const students = await fetchAll('campus_students', c.id)
      const sessions = await fetchAll('class_sessions', c.id)
      const classes = await fetchAll('classes', c.id)
      const enrollments = await fetchAll('class_enrollments', c.id)
      const buses = await fetchAll('campus_buses', c.id)
      const stopCoords = await fetchAll('campus_stop_coords', c.id)
      let regStops = []
      try { regStops = await fetchAll('campus_registered_stops', c.id) } catch (e) {}

      const activeStudents = students.filter(s => s.is_active !== false)
      const months = [...new Set(sessions.map(s => s.month))]
      const sessionNames = sessions.map(s => `${s.month} :: ${s.name} (${s.time_range || ''})`)
      const busNames = buses.map(b => `${b.name}${b.capacity ? '(' + b.capacity + ')' : ''}`)

      // enrollment schedule shape sample
      const schedSample = enrollments.slice(0, 5).map(e => ({
        student_id: e.student_id, class_id: e.class_id,
        arr: e.arr_schedule, dep: e.dep_schedule,
      }))
      const withArr = enrollments.filter(e => e.arr_schedule && Object.keys(e.arr_schedule).length).length
      const withDep = enrollments.filter(e => e.dep_schedule && Object.keys(e.dep_schedule).length).length

      console.log(`  students(active/total): ${activeStudents.length}/${students.length}`)
      console.log(`  sessions: ${sessions.length}  | months: ${months.join(', ')}`)
      console.log(`  classes: ${classes.length}  | enrollments: ${enrollments.length} (arr_sched:${withArr}, dep_sched:${withDep})`)
      console.log(`  buses(${buses.length}): ${busNames.join(', ')}`)
      console.log(`  stop_coords: ${stopCoords.length}  | registered_stops: ${regStops.length}`)
      console.log(`  --- session names ---`)
      sessionNames.forEach(s => console.log('    ' + s))

      report.campuses[c.name] = {
        id: c.id, code: c.code,
        counts: { students: students.length, activeStudents: activeStudents.length, sessions: sessions.length, classes: classes.length, enrollments: enrollments.length, withArr, withDep, buses: buses.length, stopCoords: stopCoords.length, regStops: regStops.length },
        months, sessionNames, busNames,
        busDetail: buses.map(b => ({ name: b.name, driver: b.driver, driver_phone: b.driver_phone, safety: b.safety, capacity: b.capacity })),
        stopCoordsSample: stopCoords.slice(0, 8).map(s => ({ stop_name: s.stop_name, lat: s.lat, lng: s.lng })),
        schedSample,
        studentSample: activeStudents.slice(0, 8).map(s => ({ name: s.name, en: s.english_name, grade: s.grade, apt: s.apartment, school: s.school })),
      }
    }
  }

  const outDir = path.resolve('scripts/_out')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'bus-apply-inspect.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log('\nWROTE', outPath)
}
main().catch(e => { console.error(e); process.exit(1) })
