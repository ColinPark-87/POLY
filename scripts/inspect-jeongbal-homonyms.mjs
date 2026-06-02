// 정발 캠퍼스에서 한 student_id가 여러 반에 enroll된 케이스 추출 (READ-ONLY)
// 최신 개설반(class_sessions.month 최신값) 기준
//
// 사용:
//   cd leave-system
//   node scripts/inspect-jeongbal-homonyms.mjs
//
// 출력:
//   - 최신월
//   - 다중등록 학생 수 / 총 enrollment 수
//   - 학생별 상세 리스트 (이름·영문·학년·등록된 반 목록)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(envText.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
}))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // 1. 정발 campus_id
  const { data: campuses, error: cErr } = await supabase
    .from('campuses').select('id, name').ilike('name', '%정발%')
  if (cErr) throw cErr
  if (!campuses?.length) throw new Error('정발 캠퍼스 없음')
  const campus = campuses[0]
  console.log(`캠퍼스: ${campus.name} (${campus.id})`)

  // 2. 최신 개설월
  const { data: months } = await supabase
    .from('class_sessions').select('month')
    .eq('campus_id', campus.id).eq('is_active', true)
    .order('month', { ascending: false }).limit(50)
  const uniqueMonths = [...new Set((months ?? []).map(m => m.month))]
  if (!uniqueMonths.length) throw new Error('개설반 없음')
  const latestMonth = uniqueMonths[0]
  console.log(`최신 개설월: ${latestMonth}`)
  console.log(`전체 월 목록: ${uniqueMonths.slice(0, 5).join(', ')}${uniqueMonths.length > 5 ? '...' : ''}`)

  // 3. 해당 월의 모든 class_id 수집
  const { data: sessions } = await supabase
    .from('class_sessions').select('id, name')
    .eq('campus_id', campus.id).eq('month', latestMonth)
  const sessionIds = (sessions ?? []).map(s => s.id)
  const sessNameMap = Object.fromEntries((sessions ?? []).map(s => [s.id, s.name]))

  const { data: classes } = await supabase
    .from('classes').select('id, level, session_id, room, teacher')
    .in('session_id', sessionIds)
  const classMap = Object.fromEntries((classes ?? []).map(c => [c.id, c]))
  const classIds = (classes ?? []).map(c => c.id)

  // 4. enrollments 조회 (waitlist 제외)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('id, class_id, student_id')
    .in('class_id', classIds).eq('is_waitlist', false)

  console.log(`최신월 반 수: ${classIds.length}, enrollment 수: ${enrollments?.length ?? 0}`)

  // 5. student_id별 그룹핑
  const byStudent = {}
  for (const e of enrollments ?? []) {
    if (!byStudent[e.student_id]) byStudent[e.student_id] = []
    byStudent[e.student_id].push(e)
  }
  const multiIds = Object.keys(byStudent).filter(sid => byStudent[sid].length >= 2)
  console.log(`\n다중등록 학생 수: ${multiIds.length}명`)
  console.log(`이 중 splitting 대상 enrollment 수: ${multiIds.reduce((s, id) => s + (byStudent[id].length - 1), 0)}건`)

  if (!multiIds.length) {
    console.log('\n→ 분리 대상 없음')
    return
  }

  // 6. 학생 상세 조회
  const { data: students } = await supabase
    .from('campus_students').select('id, name, english_name, grade, is_active')
    .in('id', multiIds)
  const stuMap = Object.fromEntries((students ?? []).map(s => [s.id, s]))

  // 7. 출력
  const sorted = multiIds.map(sid => ({ sid, s: stuMap[sid], enrs: byStudent[sid] }))
    .sort((a, b) => (b.enrs.length - a.enrs.length) || (a.s?.name ?? '').localeCompare(b.s?.name ?? ''))

  console.log('\n────────────────────────────────────────')
  console.log('다중등록 학생 리스트 (반 수 내림차순)')
  console.log('────────────────────────────────────────')
  for (const row of sorted) {
    const s = row.s ?? { name: '???', english_name: '', grade: '', is_active: null }
    const classes = row.enrs.map(e => {
      const c = classMap[e.class_id]
      const sessName = sessNameMap[c?.session_id]
      return `${c?.level ?? '?'}(${sessName ?? '?'})`
    }).join(', ')
    console.log(`  · [${row.enrs.length}반] ${s.name} | ${s.english_name ?? ''} | grade=${s.grade ?? ''} | active=${s.is_active}`)
    console.log(`        → ${classes}`)
  }

  // 8. 요약
  const distrib = {}
  for (const row of sorted) {
    const n = row.enrs.length
    distrib[n] = (distrib[n] ?? 0) + 1
  }
  console.log('\n────────────────────────────────────────')
  console.log('분포: ')
  for (const [n, cnt] of Object.entries(distrib).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${n}개 반 등록 학생: ${cnt}명`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
