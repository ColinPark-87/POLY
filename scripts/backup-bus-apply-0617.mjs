#!/usr/bin/env node
// backup-bus-apply-0616.mjs  (읽기전용 백업 = 복구구간)
// 목적: 버스 적용 작업 전 대상 캠퍼스(중계 레퍼런스 + 목동매그넷·송도·송파) 전체 DB 스냅샷.
// 각 테이블 전체 행을 JSON으로 저장 → 문제 시 이 파일로 복원 가능.
// 데이터 변경 없음.
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

// 대상: 중계(레퍼런스, 읽기전용) + 작업 대상 3곳
const TARGET_NAMES = ["중계", "광교", "분당"]
// 캠퍼스 스코프 테이블들. 정렬키는 안전한 컬럼으로.
const TABLES = [
  { t: 'campus_students', order: 'name' },
  { t: 'class_sessions', order: 'name' },
  { t: 'classes', order: 'id' },
  { t: 'class_enrollments', order: 'id' },
  { t: 'campus_buses', order: 'name' },
  { t: 'campus_stop_coords', order: 'stop_name' },
  { t: 'campus_registered_stops', order: 'stop_name' },
  { t: 'pickup_overrides', order: 'date' },
]

async function fetchAllScoped(table, campusId, order) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').eq('campus_id', campusId).order(order).range(from, from + 999)
    if (error) { console.error(`  [${table}] ${error.message}`); return { rows: out, error: error.message } }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { rows: out, error: null }
}

async function main() {
  const stamp = '2026-06-17'
  const outDir = path.resolve('_archive', 'backups', `bus-apply-${stamp}`)
  fs.mkdirSync(outDir, { recursive: true })

  const { data: campuses, error } = await sb.from('campuses').select('*')
  if (error) { console.error('campuses error:', error.message); process.exit(1) }

  const manifest = { generatedAt: new Date().toISOString(), stamp, campuses: {} }

  for (const nm of TARGET_NAMES) {
    const c = campuses.find(x => x.name === nm)
    if (!c) { console.error('NOT FOUND campus:', nm); continue }
    console.log(`\n=== backup ${c.name} (${c.id}) ===`)
    const bundle = { campus: c, tables: {} }
    const counts = {}
    for (const { t, order } of TABLES) {
      const { rows, error } = await fetchAllScoped(t, c.id, order)
      bundle.tables[t] = rows
      counts[t] = error ? `ERR:${error}` : rows.length
      console.log(`  ${t}: ${counts[t]}`)
    }
    const file = path.join(outDir, `${c.code}_${c.name}.json`)
    fs.writeFileSync(file, JSON.stringify(bundle, null, 2), 'utf8')
    manifest.campuses[c.name] = { id: c.id, code: c.code, file: path.basename(file), counts }
  }

  fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log('\nBACKUP DIR:', outDir)
}
main().catch(e => { console.error(e); process.exit(1) })
