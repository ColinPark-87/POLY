#!/usr/bin/env node
// diag-bus2-mon-polyline.mjs (읽기전용)
// 중계 유치부 하원 2호차 월요일 실제 TMAP 도로 폴리라인을 받아
// cleanRoutePolyline 적용 후 '자기교차(loop)' 구간을 측정. (한국 IP 필요)
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() { const txt = fs.readFileSync(path.resolve('.env.local'), 'utf8'); const e = {}; for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, '') } return e }
const E = loadEnv(), BASE = E.NEXT_PUBLIC_SUPABASE_URL, K = E.SUPABASE_SERVICE_ROLE_KEY, TKEY = E.NEXT_PUBLIC_TMAP_APP_KEY
const g = async q => { const r = await fetch(BASE + '/rest/v1/' + q, { headers: { apikey: K, Authorization: `Bearer ${K}` } }); return r.json() }
const norm = s => (s || '').replace(/\s+/g, ' ').trim()

// ── route-geometry.ts 인라인 복제 ──
function approxDeg(a, b) { const dLat = a[0] - b[0], dLng = (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180); return Math.hypot(dLat, dLng) }
function trimRouteToDestination(pts, dest, tailRatio = 0.85) {
  if (pts.length < 2) return pts
  const tailStart = Math.max(1, Math.floor(pts.length * tailRatio)); let minDist = Infinity, minIdx = pts.length - 1
  for (let i = tailStart; i < pts.length; i++) { const d = approxDeg(pts[i], dest); if (d <= minDist) { minDist = d; minIdx = i } }
  return pts.slice(0, minIdx + 1)
}
function foldSpuriousLoops(pts, stopCoords = [], { loopEps = 0.0003, stopEps = 0.00045, tinyEps = 0.0007 } = {}) {
  if (pts.length < 4) return pts
  const result = [...pts]; let i = 0
  while (i < result.length - 2) {
    let jFar = -1
    for (let j = result.length - 1; j >= i + 2; j--) { if (approxDeg(result[i], result[j]) < loopEps) { jFar = j; break } }
    if (jFar >= i + 2) {
      let exc = 0; for (let m = i + 1; m <= jFar; m++) { const d = approxDeg(result[i], result[m]); if (d > exc) exc = d }
      if (exc >= tinyEps) {
        const passesStop = stopCoords.length > 0 && result.slice(i + 1, jFar + 1).some(p => stopCoords.some(s => approxDeg(p, s) < stopEps))
        if (passesStop) { i++; continue }
      }
      result.splice(i + 1, jFar - i)
    } else i++
  }
  return result
}
const cleanRoutePolyline = (pts, dest, stopCoords = []) => foldSpuriousLoops(trimRouteToDestination(pts, dest), stopCoords)

// chunkStops 복제
function chunkStops(stops) { const MAX = 7; if (stops.length <= MAX) return [stops]; const c = []; let i = 0; while (i < stops.length - 1) { c.push(stops.slice(i, i + MAX)); if (i + MAX >= stops.length) break; i += MAX - 1 } return c }

async function routeSegment(seg) {
  const start = seg[0], end = seg[seg.length - 1], wp = seg.slice(1, -1)
  const body = { startX: '' + start.lng, startY: '' + start.lat, startName: start.name, endX: '' + end.lng, endY: '' + end.lat, endName: end.name, reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0', trafficInfo: 'N' }
  if (wp.length) body.passList = wp.map(w => `${w.lng},${w.lat}`).join('_')
  const res = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', { method: 'POST', headers: { appKey: TKEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(body).toString() })
  const text = await res.text(); if (!res.ok) throw new Error(`tmap ${res.status}: ${text.slice(0, 200)}`)
  const data = JSON.parse(text); const coordinates = []
  for (const f of data.features ?? []) if (f.geometry?.type === 'LineString') for (const c of f.geometry.coordinates ?? []) coordinates.push([c[1], c[0]])
  return coordinates
}

// 선분 교차 판정
function ccw(a, b, c) { return (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]) }
function segInt(p1, p2, p3, p4) {
  const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

async function main() {
  const camp = (await g('campuses?select=id,name')).find(c => c.name === '중계')
  const rows = await g('campus_stop_coords?select=stop_name,lat,lng&campus_id=eq.' + camp.id)
  const coord = n => { const r = rows.find(x => norm(x.stop_name) === norm(n)); return r ? { lat: r.lat, lng: r.lng } : null }
  const order = ['중계', '신안동진', '중계1동 주민센터 건너편', '소문난 감자탕', '불암대림아파트', '온곡초', '포레나노원A 후문', '수락산 벨리체']
  let stops = order.map(n => { const c = coord(n); if (!c) throw new Error('좌표없음: ' + n); return { name: n, lat: c.lat, lng: c.lng } })

  // ── route-order.ts(NN+2-opt) 인라인 복제: 학원(첫 정류장) 고정, 나머지 지리순 재배치 ──
  if (process.env.GEO !== '0') {
    const D = (a, b) => { const dLat = a.lat - b.lat, dLng = (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180); return Math.hypot(dLat, dLng) }
    const school = stops[0], rest = stops.slice(1)
    // NN
    const rem = [...rest], nn = []; let cur = school
    while (rem.length) { let bi = 0, bd = Infinity; for (let i = 0; i < rem.length; i++) { const d = D(cur, rem[i]); if (d < bd) { bd = d; bi = i } } const [p] = rem.splice(bi, 1); nn.push(p); cur = p }
    // 2-opt (start=school 고정, end 자유)
    const o = nn, n = o.length; let imp = true, gd = 0
    while (imp && gd++ < 60) { imp = false; for (let i = 0; i < n - 1; i++) for (let k = i + 1; k < n; k++) { const prev = i === 0 ? school : o[i - 1], a = o[i], b = o[k], next = k < n - 1 ? o[k + 1] : null; const bef = D(prev, a) + (next ? D(b, next) : 0), aft = D(prev, b) + (next ? D(a, next) : 0); if (aft < bef - 1e-12) { let lo = i, hi = k; while (lo < hi) { const t = o[lo]; o[lo] = o[hi]; o[hi] = t; lo++; hi-- } imp = true } } }
    stops = [school, ...o]
    console.log('지리순서 적용:', stops.map(s => s.name).join(' → '))
  } else {
    console.log('시간순(원본):', stops.map(s => s.name).join(' → '))
  }

  const chunks = chunkStops(stops)
  console.log(`정류장 ${stops.length}개 → ${chunks.length}구간`)
  let pts = []
  for (const seg of chunks) {
    const sp = await routeSegment(seg)
    if (pts.length && sp.length) { const [pl, pn] = pts[pts.length - 1], [nl, nn] = sp[0]; pts.push(...(pl === nl && pn === nn ? sp.slice(1) : sp)) }
    else pts.push(...sp)
  }
  const dest = [stops[stops.length - 1].lat, stops[stops.length - 1].lng]
  const stopCoords = stops.map(s => [s.lat, s.lng])
  const cleaned = cleanRoutePolyline(pts, dest, stopCoords)
  console.log(`원본 폴리라인 ${pts.length}점 → cleanRoutePolyline ${cleaned.length}점`)

  // 자기교차 측정 (인접 선분 제외)
  const crossings = []
  for (let i = 0; i < cleaned.length - 1; i++) {
    for (let j = i + 2; j < cleaned.length - 1; j++) {
      if (i === 0 && j === cleaned.length - 2) continue
      if (segInt(cleaned[i], cleaned[i + 1], cleaned[j], cleaned[j + 1])) {
        // 가장 가까운 정류장 찾기
        const mid = [(cleaned[i][0] + cleaned[j][0]) / 2, (cleaned[i][1] + cleaned[j][1]) / 2]
        let best = '', bd = Infinity
        for (const s of stops) { const d = approxDeg(mid, [s.lat, s.lng]); if (d < bd) { bd = d; best = s.name } }
        crossings.push({ i, j, near: best, distM: Math.round(bd * 111000) })
      }
    }
  }
  const structural = crossings.filter(c => c.distM > 150) // 정류장 진입·이탈 노이즈 제외
  console.log(`\n자기교차 총 ${crossings.length}건 (정류장 진입노이즈 제외 '구조적' ${structural.length}건)`)
  const seen = new Set()
  for (const c of crossings) { const k = c.near; if (seen.has(k)) continue; seen.add(k); console.log(`  ✗ 교차 부근: ${c.near} (≈${c.distM}m)${c.distM > 150 ? ' [구조적]' : ''}`) }

  // 각 정류장을 폴리라인이 실제로 지나는지 (≈60m 이내 점 존재)
  console.log(`\n정류장 통과 확인(≈60m 이내 폴리라인 점):`)
  for (const s of stops) { const hit = cleaned.some(p => approxDeg(p, [s.lat, s.lng]) < 0.00054); console.log(`  ${hit ? '✓' : '✗ 미통과'} ${s.name}`) }
}
main().catch(e => { console.error('오류:', e.message); process.exit(1) })
