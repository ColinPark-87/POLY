#!/usr/bin/env node
// verify-named-campuses-0617.mjs  (READ-ONLY — DB에 일절 쓰지 않음)
// 사용자 보고: 대전/목동/분당/송도/송파/운정/정발 7개 캠퍼스 지도 마커가 불안정(flaky).
// 점검:
//   1) 센터 좌표(campus_stop_coords where stop_name==캠퍼스명) lat/lng + 도시 sanity check
//   2) 상위 15개 아파트명 + 빈도, 제네릭/모호 브랜드명 플래그
//   3) clean(단일 단지명) vs noisy(동/호수 숫자, ★ 등) 개수
//   4) campus_place_spots 수동 오버라이드 유무(kind, count)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv () {
  const t = fs.readFileSync(path.resolve('.env.local'), 'utf8')
  const e = {}
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return e
}
const ENV = loadEnv()
const sb = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TARGETS = ['대전', '목동', '분당', '송도', '송파', '운정', '정발']

// 캠퍼스별 기대 좌표(대략) + 허용 박스(±0.25도 ≈ ±~25km)
const EXPECT = {
  대전: { lat: 36.30, lng: 127.40, city: '대전' },
  목동: { lat: 37.53, lng: 126.87, city: '서울 양천' },
  분당: { lat: 37.38, lng: 127.12, city: '성남 분당' },
  송도: { lat: 37.39, lng: 126.64, city: '인천 연수' },
  송파: { lat: 37.50, lng: 127.10, city: '서울 송파' },
  운정: { lat: 37.73, lng: 126.73, city: '파주 운정' },
  정발: { lat: 37.66, lng: 126.77, city: '고양 일산(정발산)' }
}
const TOL = 0.25

const NOISE = new Set(['', '없음', '미입력'])

// 제네릭/모호: 지역 수식어 없는 전국구 브랜드명 단독
const GENERIC_BRANDS = ['푸르지오', '자이', 'e편한세상', 'e-편한세상', '이편한세상', '롯데캐슬', '래미안', '힐스테이트', '아이파크', '더샵', '센트럴파크', '코오롱하늘채', '한라비발디', '두산위브', 'sk뷰', 'SK뷰']

async function all (table, campusId, cols, order) {
  const out = []
  for (let f = 0;; f += 1000) {
    let q = sb.from(table).select(cols).eq('campus_id', campusId).range(f, f + 999)
    if (order) q = q.order(order)
    const { data, error } = await q
    if (error) { console.error(table, error.message); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

function norm (s) { return (s || '').replace(/\s+/g, '').trim() }

// 정규화 후 브랜드 단독명인지 판정 (지역 수식어 없음)
function isGenericApt (raw) {
  const a = norm(raw).toLowerCase()
  if (!a) return false
  for (const b of GENERIC_BRANDS) {
    const bn = b.toLowerCase()
    // 정확히 그 브랜드만(+선택적 아파트/차수숫자 정도) 있고, 그 외 지역 수식어가 없는 경우
    if (a === bn || a === bn + '아파트' || a.replace(/\d+차?/g, '') === bn || a.replace(/아파트/g, '') === bn) return true
  }
  return false
}

// noisy: 동/호수 숫자, ★, 괄호 내 메모, 슬래시 등
function isNoisy (raw) {
  const a = (raw || '').trim()
  if (!a) return false
  if (/[★☆※*]/.test(a)) return true
  if (/\d{3,}/.test(a)) return true // 호수/번지 큰 숫자
  if (/\d+\s*동/.test(a)) return true // ###동
  if (/\d+\s*호/.test(a)) return true // ###호
  if (/[()/\\]/.test(a)) return true // 괄호/슬래시 메모
  if (/[,;|]/.test(a)) return true
  return false
}

const result = {}
const allCampuses = (await sb.from('campuses').select('id,name,code').order('name')).data || []

for (const tname of TARGETS) {
  const c = allCampuses.find(x => norm(x.name) === norm(tname) || norm(x.name).includes(norm(tname)))
  if (!c) { result[tname] = { error: '캠퍼스 미발견' }; continue }

  // 1) 센터 좌표
  const coords = await all('campus_stop_coords', c.id, 'stop_name,lat,lng')
  const center = coords.find(r => norm(r.stop_name) === norm(c.name) && Number.isFinite(r.lat) && Number.isFinite(r.lng))
  const anyCoord = coords.find(r => Number.isFinite(r.lat) && Number.isFinite(r.lng))
  const exp = EXPECT[tname]
  let centerStatus = '없음'
  let centerFlag = ''
  let cLat = null; let cLng = null
  if (center) {
    cLat = center.lat; cLng = center.lng
    const dLat = Math.abs(center.lat - exp.lat)
    const dLng = Math.abs(center.lng - exp.lng)
    if (dLat <= TOL && dLng <= TOL) { centerStatus = 'OK' } else { centerStatus = 'WRONG'; centerFlag = `기대 ~${exp.lat}/${exp.lng}(${exp.city})에서 벗어남` }
  } else if (anyCoord) {
    cLat = anyCoord.lat; cLng = anyCoord.lng
    centerStatus = '이름매칭없음(폴백)'
    centerFlag = `stop_name==캠퍼스명 행 없음; 첫 좌표 ${anyCoord.stop_name}`
  } else {
    centerStatus = '좌표없음'
  }

  // 2) 아파트 집계
  const students = await all('campus_students', c.id, 'apartment,school,is_active')
  const active = students.filter(s => s.is_active !== false)
  const aptCounts = new Map()
  let cleanN = 0; let noisyN = 0; let blankN = 0
  const genericSet = new Map()
  for (const s of active) {
    const raw = (s.apartment || '').trim()
    if (NOISE.has(raw)) { blankN++; continue }
    aptCounts.set(raw, (aptCounts.get(raw) || 0) + 1)
    if (isNoisy(raw)) noisyN++; else cleanN++
    if (isGenericApt(raw)) genericSet.set(raw, (genericSet.get(raw) || 0) + 1)
  }
  const top15 = [...aptCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

  // 4) place spots
  const spots = await all('campus_place_spots', c.id, 'kind,name,lat,lng,hidden')
  const spotKinds = new Map()
  for (const sp of spots) { if (sp.hidden) continue; spotKinds.set(sp.kind || '?', (spotKinds.get(sp.kind || '?') || 0) + 1) }

  result[tname] = {
    campusName: c.name,
    code: c.code,
    center: { lat: cLat, lng: cLng, status: centerStatus, flag: centerFlag },
    activeStudents: active.length,
    aptWithValue: aptCounts.size,
    blank: blankN,
    clean: cleanN,
    noisy: noisyN,
    top15,
    generic: [...genericSet.entries()].sort((a, b) => b[1] - a[1]),
    placeSpots: { total: spots.filter(s => !s.hidden).length, byKind: [...spotKinds.entries()] }
  }
}

// ===== 출력 =====
const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

console.log('\n================ 7개 캠퍼스 지도 마커 진단 (READ-ONLY) ================\n')

console.log('--- 1) 센터 좌표 sanity check ---')
console.log(pad('캠퍼스', 8) + pad('code', 7) + pad('센터 lat', 12) + pad('센터 lng', 12) + pad('판정', 18) + '비고')
console.log('-'.repeat(95))
for (const t of TARGETS) {
  const r = result[t]
  if (r.error) { console.log(pad(t, 8) + r.error); continue }
  const cc = r.center
  const mark = cc.status === 'OK' ? 'OK' : cc.status === 'WRONG' ? 'WRONG(다른지역)' : cc.status
  console.log(pad(t, 8) + pad(r.code || '-', 7) + pad(cc.lat ?? '-', 12) + pad(cc.lng ?? '-', 12) + pad(mark, 18) + (cc.flag || ''))
}

console.log('\n--- 2) 아파트명 clean vs noisy + 제네릭 플래그 ---')
console.log(pad('캠퍼스', 8) + padL('활성', 6) + padL('아파트값', 9) + padL('빈값', 6) + padL('clean', 7) + padL('noisy', 7) + '  제네릭(모호) 단독브랜드명')
console.log('-'.repeat(95))
for (const t of TARGETS) {
  const r = result[t]
  if (r.error) continue
  const gen = r.generic.length ? r.generic.map(([n, c]) => `${n}×${c}`).join(', ') : '-'
  console.log(pad(t, 8) + padL(r.activeStudents, 6) + padL(r.aptWithValue, 9) + padL(r.blank, 6) + padL(r.clean, 7) + padL(r.noisy, 7) + '  ' + gen)
}

console.log('\n--- 3) 캠퍼스별 상위 15 아파트명 ---')
for (const t of TARGETS) {
  const r = result[t]
  if (r.error) continue
  console.log(`\n[${t}] (${r.campusName})`)
  for (const [n, cnt] of r.top15) {
    const tags = []
    if (isGenericApt(n)) tags.push('GENERIC')
    if (isNoisy(n)) tags.push('noisy')
    console.log('   ' + padL(cnt, 3) + '  ' + pad(n, 28) + (tags.length ? '[' + tags.join(',') + ']' : ''))
  }
}

console.log('\n--- 4) campus_place_spots 수동 오버라이드 ---')
console.log(pad('캠퍼스', 8) + padL('spot수', 8) + '  종류별')
console.log('-'.repeat(60))
for (const t of TARGETS) {
  const r = result[t]
  if (r.error) continue
  const byKind = r.placeSpots.byKind.length ? r.placeSpots.byKind.map(([k, c]) => `${k}:${c}`).join(', ') : '(없음)'
  console.log(pad(t, 8) + padL(r.placeSpots.total, 8) + '  ' + byKind)
}

// JSON dump
const outDir = path.resolve('scripts', '_out')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'verify-named-campuses-0617.json')
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')
console.log(`\nJSON dump → ${outPath}`)
