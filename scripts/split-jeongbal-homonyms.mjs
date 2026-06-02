// 정발 캠퍼스 동명이인 일괄 분리
// 한 student_id가 최신 개설월에서 N개 반에 enroll된 경우 → (N-1)개의 새 campus_students row 생성,
// 해당 enrollment들의 student_id를 새 row로 재할당
//
// 기본은 dry-run. 실제 적용은 --apply 필요.
//
// 사용:
//   cd leave-system
//   node scripts/split-jeongbal-homonyms.mjs         # dry-run
//   node scripts/split-jeongbal-homonyms.mjs --apply # 실제 실행

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(envText.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
}))

const APPLY = process.argv.includes('--apply')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log(APPLY ? '── APPLY MODE (DB 변경) ──' : '── DRY-RUN (변경 없음) ──')

  // 1. 정발 캠퍼스
  const { data: campuses } = await supabase
    .from('campuses').select('id, name').ilike('name', '%정발%')
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

  // 3. 해당 월의 class_id 수집
  const { data: sessions } = await supabase
    .from('class_sessions').select('id, name, sort_order')
    .eq('campus_id', campus.id).eq('month', latestMonth)
  const sessionIds = (sessions ?? []).map(s => s.id)
  const sessMap = Object.fromEntries((sessions ?? []).map(s => [s.id, s]))

  const { data: classes } = await supabase
    .from('classes').select('id, level, session_id, sort_order')
    .in('session_id', sessionIds)
  const classMap = Object.fromEntries((classes ?? []).map(c => [c.id, c]))
  const classIds = (classes ?? []).map(c => c.id)

  // 4. enrollments (waitlist 제외)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('id, class_id, student_id, sort_order')
    .in('class_id', classIds).eq('is_waitlist', false)

  // 5. student_id별 그룹
  const byStudent = {}
  for (const e of enrollments ?? []) {
    if (!byStudent[e.student_id]) byStudent[e.student_id] = []
    byStudent[e.student_id].push(e)
  }
  const multiIds = Object.keys(byStudent).filter(sid => byStudent[sid].length >= 2)
  if (!multiIds.length) {
    console.log('분리 대상 없음. 종료.')
    return
  }

  // 6. 학생 정보 일괄 조회 (school/apartment 포함)
  const { data: students } = await supabase
    .from('campus_students').select('id, name, english_name, grade, school, apartment, enrolled_at, is_active')
    .in('id', multiIds)
  const stuMap = Object.fromEntries((students ?? []).map(s => [s.id, s]))

  // 반 level로 grade/school 결정 (ECP* → 유치부/학교비움, 그 외 → 초등부/원본학교복사)
  const fieldsForLevel = (level, originalSchool) => {
    const isEcp = /^ecp/i.test(level ?? '')
    return isEcp ? { grade: '유치부', school: null } : { grade: '초등부', school: originalSchool ?? null }
  }

  // 7. 각 학생: enrollment을 정렬해서 첫 번째는 원본 row 갱신, 나머지는 새 row 생성 + 재할당
  let totalNewStudents = 0
  let totalReassigned = 0
  let totalOrigUpdated = 0
  const summary = []

  for (const sid of multiIds) {
    const enrs = byStudent[sid].slice().sort((a, b) => {
      const ca = classMap[a.class_id], cb = classMap[b.class_id]
      const sa = sessMap[ca?.session_id], sb = sessMap[cb?.session_id]
      return (sa?.sort_order ?? 0) - (sb?.sort_order ?? 0)
          || (ca?.sort_order ?? 0) - (cb?.sort_order ?? 0)
          || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
    const stu = stuMap[sid]
    if (!stu) {
      console.log(`  ⚠ student_id ${sid} 정보 없음 — 스킵`)
      continue
    }
    const keepEnr = enrs[0]
    const moveEnrs = enrs.slice(1)
    const keepLevel = classMap[keepEnr.class_id]?.level
    const keepFields = fieldsForLevel(keepLevel, stu.school)

    const lines = [
      `  · ${stu.name} (${stu.english_name ?? ''}) — ${enrs.length}반 → ${enrs.length}명의 학생 row`,
      `      원본 갱신: ${keepLevel} → ${keepFields.grade}${keepFields.school ? ` (학교=${keepFields.school})` : ' (학교비움)'}`,
    ]

    if (APPLY) {
      const { error: updOrigErr } = await supabase.from('campus_students')
        .update({ grade: keepFields.grade, school: keepFields.school }).eq('id', sid)
      if (updOrigErr) {
        console.log(`      ⚠ 원본 갱신 실패: ${updOrigErr.message}`)
      } else {
        totalOrigUpdated++
      }
    }

    for (const me of moveEnrs) {
      const c = classMap[me.class_id]
      const sess = sessMap[c?.session_id]
      const fields = fieldsForLevel(c?.level, stu.school)
      lines.push(`      신규: ${c?.level} (${sess?.name}) → ${fields.grade}${fields.school ? ` (학교=${fields.school})` : ' (학교비움)'}`)

      if (APPLY) {
        const { data: newStu, error: insErr } = await supabase
          .from('campus_students').insert({
            campus_id: campus.id,
            name: stu.name,
            english_name: stu.english_name ?? null,
            grade: fields.grade,
            school: fields.school,
            apartment: stu.apartment ?? null,
            is_active: true,
            enrolled_at: new Date().toISOString().slice(0, 10),
            notes: `동명이인 일괄분리: 원본 ${sid} 에서 분리 (${latestMonth})`,
          }).select('id').single()
        if (insErr || !newStu) {
          console.log(`      ⚠ 학생 생성 실패: ${insErr?.message}`)
          continue
        }
        const { error: updErr } = await supabase
          .from('class_enrollments').update({ student_id: newStu.id }).eq('id', me.id)
        if (updErr) {
          console.log(`      ⚠ enrollment ${me.id} 업데이트 실패: ${updErr.message}`)
          continue
        }
        totalNewStudents++
        totalReassigned++
      }
    }
    summary.push(lines.join('\n'))
  }

  console.log('\n────────────────────────────────────────')
  console.log('분리 계획')
  console.log('────────────────────────────────────────')
  console.log(summary.join('\n'))

  console.log('\n────────────────────────────────────────')
  console.log(`대상 학생: ${multiIds.length}명`)
  if (APPLY) {
    console.log(`새 학생 생성: ${totalNewStudents}개`)
    console.log(`원본 학생 정보 갱신: ${totalOrigUpdated}개`)
    console.log(`enrollment 재할당: ${totalReassigned}개`)
  } else {
    const wouldCreate = multiIds.reduce((s, id) => s + (byStudent[id].length - 1), 0)
    console.log(`(dry-run) 생성될 새 학생: ${wouldCreate}개, 갱신될 원본: ${multiIds.length}개, 재할당될 enrollment: ${wouldCreate}개`)
    console.log('\n실행: node scripts/split-jeongbal-homonyms.mjs --apply')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
