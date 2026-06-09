#!/usr/bin/env node
// diag-time-outliers.mjs  (읽기전용 진단)
// 같은 (캠퍼스·방향·호차·정류장)에서 대표시간과 크게 벗어난 학생 탑승시간(outlier) 추출.
// - 현재 달(targetMonth)만 (과거 달 잔재 제외)
// - 정류장 매칭은 공백 무시(normStop)
// - 데이터 변경 없음. 콘솔 + scripts/_out/time-outliers.json 으로만 출력.
import fs from 'node:fs'
import path from 'node:path'

// ── .env.local 로드 (키 하드코딩 회피) ──────────────────────────────
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
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('.env.local에 SUPABASE_URL/SERVICE_KEY 없음'); process.exit(1) }

const DAYS = ['월', '화', '수', '목', '금']
const OUTLIER_MIN = 15  // 대표시간과 이 분(分) 이상 벗어나면 outlier 후보
const OUTLIER_MAX = 90  // 이 분 초과는 '같은 세션 내 오타'가 아니라 반대방향/세션혼선 → 별도(clean 스크립트 영역)라 제외

// route.ts getSessionLabel과 동일 — 노선은 이 세션 라벨 단위로 그려짐. 같은 라벨 안에서만 outlier 비교.
function getSessionLabel(name, dir) {
  if (!name) return ''
  if (name.includes('방과후')) { if (name.includes('유치부')) return '유치부'; return dir === 'dep' ? '매일반' : '방과후' }
  if (name.includes('유치부')) return '유치부'
  if (name.includes('매일반') || name.includes('5일')) return '매일반'
  if (name.includes('월수금') || name.includes('3일')) return '3일반'
  if (name.includes('화목') || name.includes('2일')) return '2일반'
  return name
}

// route.ts와 동일한 헬퍼들 -----------------------------------------------
function parseTimeMinNorm(t) {
  if (!t) return 9999
  const m = String(t).match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1]); if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}
function parseLocTime(loc) {
  if (!loc) return { cleanLoc: null }
  const m = String(loc).match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/)
  return m ? { cleanLoc: m[2].trim() } : { cleanLoc: loc }
}
function normStop(s) { return (s ?? '').replace(/\s+/g, ' ').trim() }
function fmtMin(min) { const h = Math.floor(min / 60), mm = String(min % 60).padStart(2, '0'); return `${h}:${mm}` }
function pickTargetMonth(months) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1
  const cur = `${y}년 ${m}월`
  const next = `${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월`
  if (months.includes(next)) return next
  if (months.includes(cur)) return cur
  return months[0] ?? ''
}

async function sbGet(pathQ) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathQ}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${pathQ} → ${res.status} ${await res.text()}`)
  return res.json()
}
// 페이지네이션(기본 1000행 제한 회피)
async function sbGetAll(table, query) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Range: `${from}-${to}`, Prefer: 'count=exact' },
    })
    if (!res.ok) throw new Error(`GET ${table} → ${res.status} ${await res.text()}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function main() {
  const campuses = await sbGet('campuses?select=id,name')
  const report = []

  for (const campus of campuses) {
    const monthRows = await sbGet(`class_sessions?select=month&campus_id=eq.${campus.id}`)
    const months = [...new Set(monthRows.map(r => r.month))]
    if (!months.length) continue
    const targetMonth = pickTargetMonth(months)

    const sessions = await sbGet(`class_sessions?select=id,name,time_range&campus_id=eq.${campus.id}&month=eq.${encodeURIComponent(targetMonth)}`)
    if (!sessions.length) continue
    const sessMap = Object.fromEntries(sessions.map(s => [s.id, s]))
    const sessionIds = sessions.map(s => s.id)

    const classes = await sbGetAll('classes', `select=id,session_id&session_id=in.(${sessionIds.join(',')})`)
    if (!classes.length) continue
    const classToSess = Object.fromEntries(classes.map(c => [c.id, c.session_id]))
    const classIds = classes.map(c => c.id)

    // 청크로 enrollment 조회 (in 절 길이 제한 회피)
    const enrollments = []
    for (let i = 0; i < classIds.length; i += 100) {
      const chunk = classIds.slice(i, i + 100)
      const rows = await sbGetAll('class_enrollments',
        `select=student_id,class_id,arr_schedule,dep_schedule,campus_students(name,english_name)&class_id=in.(${chunk.join(',')})`)
      enrollments.push(...rows)
    }

    for (const direction of ['arr', 'dep']) {
      // groups[bus|stop] = { records: [{name, time, day, sessName}], }
      const groups = new Map()
      for (const enr of enrollments) {
        const sched = direction === 'arr' ? enr.arr_schedule : enr.dep_schedule
        if (!sched) continue
        const sess = sessMap[classToSess[enr.class_id]]
        const sessName = sess?.name ?? ''
        const sessLabel = getSessionLabel(sessName, direction)
        const name = enr.campus_students?.name ?? enr.student_id
        const common = sched['_time'] ?? sched['time'] ?? null
        for (const day of DAYS) {
          const bus = sched[day]
          if (!bus || typeof bus !== 'string') continue
          const { cleanLoc } = parseLocTime(sched[day + '_loc'] ?? null)
          const loc = normStop(cleanLoc)
          if (!loc) continue
          const time = sched[day + '_time'] ?? common
          if (!time) continue
          const key = `${bus}|${loc}|${sessLabel}`
          if (!groups.has(key)) groups.set(key, { bus, loc, sessLabel, records: [] })
          groups.get(key).records.push({ name, time, min: parseTimeMinNorm(time), day, sessName, student_id: enr.student_id })
        }
      }

      for (const { bus, loc, sessLabel, records } of groups.values()) {
        if (records.length < 2) continue
        // 대표시간 = 최빈 normalized 시간 (동률이면 가장 많은 인원의 시간)
        const tally = new Map()
        for (const r of records) {
          const k = r.min
          if (!tally.has(k)) tally.set(k, { min: k, count: 0, students: new Set() })
          const e = tally.get(k); e.count++; e.students.add(r.student_id)
        }
        const sorted = [...tally.values()].sort((a, b) => b.students.size - a.students.size || a.min - b.min)
        const rep = sorted[0]
        const outliers = records.filter(r => { const d = Math.abs(r.min - rep.min); return d >= OUTLIER_MIN && d <= OUTLIER_MAX })
        if (!outliers.length) continue
        // outlier 학생들의 distinct (이름·시간·요일)
        const seen = new Set()
        const outList = []
        for (const o of outliers) {
          const k = `${o.student_id}${o.min}${o.day}`
          if (seen.has(k)) continue
          seen.add(k)
          outList.push({ name: o.name, time: o.time, day: o.day, sessName: o.sessName, devMin: o.min - rep.min })
        }
        report.push({
          campus: campus.name, month: targetMonth, direction: direction === 'arr' ? '등원' : '하원',
          session: sessLabel, bus, stop: loc,
          repTime: fmtMin(rep.min), repCount: rep.students.size, totalRiders: new Set(records.map(r => r.student_id)).size,
          outliers: outList,
        })
      }
    }
  }

  // 정렬: 캠퍼스 → 방향 → 호차 → outlier 많은 순
  report.sort((a, b) =>
    a.campus.localeCompare(b.campus, 'ko') || a.direction.localeCompare(b.direction, 'ko') ||
    a.bus.localeCompare(b.bus, 'ko', { numeric: true }) || b.outliers.length - a.outliers.length)

  // 콘솔 출력
  console.log(`\n=== 탑승시간 outlier 진단 (같은 세션 내, 대표시간 ±${OUTLIER_MIN}~${OUTLIER_MAX}분) ===\n`)
  if (!report.length) { console.log('outlier 없음.') }
  let curCampus = ''
  for (const r of report) {
    if (r.campus !== curCampus) { curCampus = r.campus; console.log(`\n##### ${r.campus} (${r.month}) #####`) }
    console.log(`\n[${r.direction}·${r.session}] ${r.bus} · ${r.stop}`)
    console.log(`   대표시간 ${r.repTime} (${r.repCount}명) / 정류장 총 ${r.totalRiders}명`)
    for (const o of r.outliers) {
      const sign = o.devMin > 0 ? `+${o.devMin}` : `${o.devMin}`
      console.log(`   ⚠ ${o.name} : ${o.time} (${o.day}, ${sign}분) [${o.sessName}]`)
    }
  }

  const outDir = path.resolve('scripts/_out')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'time-outliers.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n\n총 ${report.length}개 (호차·정류장) 그룹에서 outlier 발견. → scripts/_out/time-outliers.json`)
}

main().catch(err => { console.error('오류:', err); process.exit(1) })
