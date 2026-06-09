#!/usr/bin/env node
// fix-heoyungyeom-mon-time.mjs
// 중계 유치부 허윤겸: 월요일 2호차 포레나노원A 정렬시간 정리 → dep_schedule에 월_time:"15:27" 추가.
// (공통 _time=15:10이 월요일 2호차에 따라와 노선이 detour. 같은 정류장 타 학생은 15:27.)
// 수/목 6호차 임광아파트(_time 15:10)는 건드리지 않음. 변경 전 백업 + 재읽기 검증.
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const txt = fs.readFileSync(path.resolve('.env.local'), 'utf8'); const env = {}
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '') }
  return env
}
const E = loadEnv(); const BASE = E.NEXT_PUBLIC_SUPABASE_URL, K = E.SUPABASE_SERVICE_ROLE_KEY
const NEW_TIME = '15:27'

async function g(q) { const r = await fetch(`${BASE}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } }); if (!r.ok) throw new Error(`${q} ${r.status} ${await r.text()}`); return r.json() }
async function patch(q, body) {
  const r = await fetch(`${BASE}/rest/v1/${q}`, { method: 'PATCH', headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`PATCH ${q} ${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  const camp = (await g('campuses?select=id,name')).find(c => c.name === '중계')
  const sts = await g(`campus_students?select=id,name&campus_id=eq.${camp.id}&name=eq.${encodeURIComponent('허윤겸')}`)
  if (sts.length !== 1) throw new Error(`허윤겸 학생 ${sts.length}명 — 중단(동명이인 확인 필요)`)
  const sid = sts[0].id

  const enr = await g(`class_enrollments?select=student_id,class_id,dep_schedule,classes(class_sessions(name,month))&student_id=eq.${sid}`)
  const target = enr.filter(e => {
    const s = e.classes?.class_sessions
    return s?.month === '2026년 6월' && s?.name === '유치부' && e.dep_schedule?.['월'] === '2호차'
  })
  if (target.length !== 1) throw new Error(`대상 enrollment ${target.length}건 — 중단`)
  const t = target[0]
  const before = t.dep_schedule

  // 안전장치: 예상한 상태인지 확인
  if (before['월_loc'] !== '포레나노원A 후문') throw new Error(`월_loc 예상과 다름: ${before['월_loc']}`)
  if (before['월_time']) { console.log(`이미 월_time=${before['월_time']} 존재 → 변경 불필요`); return }

  // 백업
  const stamp = '20260609'
  const bdir = path.resolve('_archive/backups'); fs.mkdirSync(bdir, { recursive: true })
  const bpath = path.join(bdir, `enrollment_허윤겸_유치부_dep_pre-montime_${stamp}.json`)
  fs.writeFileSync(bpath, JSON.stringify({ student_id: sid, class_id: t.class_id, dep_schedule_before: before }, null, 2), 'utf8')
  console.log('백업:', bpath)
  console.log('변경 전 dep:', JSON.stringify(before))

  const after = { ...before, '월_time': NEW_TIME }
  const res = await patch(`class_enrollments?student_id=eq.${sid}&class_id=eq.${t.class_id}`, { dep_schedule: after })

  // 재읽기 검증
  const re = await g(`class_enrollments?select=dep_schedule&student_id=eq.${sid}&class_id=eq.${t.class_id}`)
  const got = re[0]?.dep_schedule
  console.log('변경 후 dep:', JSON.stringify(got))
  if (got?.['월_time'] !== NEW_TIME) throw new Error('검증 실패: 월_time 미반영')
  if (got?.['_time'] !== '15:10') throw new Error('검증 실패: _time 변형됨')
  if (got?.['수'] !== '6호차' || got?.['목'] !== '6호차') throw new Error('검증 실패: 수/목 6호차 변형됨')
  console.log('\n✅ 검증 통과: 월_time=15:27 추가, 나머지(_time·수/목 6호차) 보존.')
}
main().catch(e => { console.error('오류:', e.message); process.exit(1) })
