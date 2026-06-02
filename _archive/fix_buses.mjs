/**
 * Bus Assignment Fix Script
 * Removes stale arr/dep schedules from Supabase based on Firebase May 2026 reference
 *
 * Strategy:
 * - For each enrollment where the student appears in Supabase bus group
 *   but NOT in Firebase for that same group (route+bus):
 *   → clear the day keys from that schedule direction
 *
 * Safety: preserve _time key and only clear day slots
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU';
const FIREBASE_BASE = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com';
const TARGET_MONTH = '2026년 5월';
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

console.log(DRY_RUN ? '🔍 DRY RUN 모드 (실제 수정 없음)' : '⚡ LIVE 모드 (실제 수정)');

// Better normalization: strips (English), [day info], * annotations, trailing Korean notes
function normalizeName(name) {
  if (!name) return '';
  const isKorean = s => /^[\uAC00-\uD7AF]+$/.test(s);
  let r = name
    .replace(/\s*\(.*?\)/g, '')   // remove all (...) groups
    .replace(/\s*\[.*?\]/g, '')   // remove all [...] groups
    .replace(/\s*\*.*$/s, '')     // remove * and everything after
    .replace(/\s+/g, ' ')
    .trim();

  // If result has spaces, extract only the name portion
  const parts = r.split(' ');
  if (parts.length > 1 && isKorean(parts[0])) {
    if (parts[0].length >= 2) {
      // e.g. "김태인 승차만 상명초" → "김태인"
      return parts[0];
    } else if (parts[0].length === 1 && isKorean(parts[1])) {
      // e.g. "한 휘" (one-char surname) → "한휘"
      return parts[0] + parts[1];
    }
  }
  return r;
}

function hasActiveDays(days) {
  if (!days) return false;
  return Object.values(days).some(v => v === true);
}

function parseRouteName(name) {
  const dir = name.includes('하원') ? 'dep' : 'arr';
  let label;
  if (name.includes('유치부')) label = '유치부';
  else if (name.includes('매일반')) label = '매일반';
  else if (name.includes('3일반')) label = '3일반';
  else if (name.includes('2일반')) label = '2일반';
  else label = name;
  return { label, dir };
}

function getSessionLabel(name, dir) {
  if (!name) return '';
  if (name.includes('방과후')) {
    if (name.includes('유치부')) return '유치부';
    return dir === 'dep' ? '매일반' : '방과후';
  }
  if (name.includes('유치부')) return '유치부';
  if (name.includes('매일반')) return '매일반';
  if (name.includes('월수금') || name.includes('3일반')) return '3일반';
  if (name.includes('화목') || name.includes('2일반')) return '2일반';
  return name;
}

// ── Load Firebase ─────────────────────────────────────────────────────────────
console.log('\n=== Firebase May 2026 ===');
const fbResp = await fetch(`${FIREBASE_BASE}/poly_class/months/${encodeURIComponent(TARGET_MONTH)}.json`);
const fbData = await fbResp.json();

// fbBuses[label][dir][bus] = Set<normalized_name>
const fbBuses = {};
for (const route of fbData.busRoutes || []) {
  const { label, dir } = parseRouteName(route.name || '');
  if (!fbBuses[label]) fbBuses[label] = { arr: {}, dep: {} };
  for (const bus of route.buses || []) {
    const busName = bus.bus;
    if (!fbBuses[label][dir][busName]) fbBuses[label][dir][busName] = new Set();
    for (const student of bus.students || []) {
      if (!hasActiveDays(student.days)) continue;
      if (!student.name || student.name.includes('없음') || student.name.includes('승차시간')) continue;
      const name = normalizeName(student.name);
      if (name) fbBuses[label][dir][busName].add(name);
    }
  }
}
console.log('Firebase 루트별:');
for (const [label, dirs] of Object.entries(fbBuses)) {
  for (const [dir, buses] of Object.entries(dirs)) {
    const total = Object.values(buses).reduce((s, st) => s + st.size, 0);
    if (total > 0) {
      const busDetail = Object.entries(buses).sort().map(([b, s]) => `${b}:${s.size}`).join(' ');
      console.log(`  ${label} ${dir === 'arr' ? '등원' : '하원'}: ${total}명 [${busDetail}]`);
    }
  }
}

// ── Load Supabase ─────────────────────────────────────────────────────────────
console.log('\n=== Supabase May 2026 ===');
const { data: campuses } = await supabase.from('campuses').select('id, name');
const campus = campuses.find(c => c.name?.includes('중계'));

const { data: sessions } = await supabase
  .from('class_sessions')
  .select('id, name, time_range')
  .eq('campus_id', campus.id)
  .eq('month', TARGET_MONTH);
const sessionIds = sessions.map(s => s.id);
const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s.name]));

const { data: classes } = await supabase
  .from('classes').select('id, session_id').in('session_id', sessionIds);
const classSessionMap = Object.fromEntries(classes.map(c => [c.id, c.session_id]));
const classIds = classes.map(c => c.id);

let allEnrollments = [];
let from = 0;
while (true) {
  const { data: page, error } = await supabase
    .from('class_enrollments')
    .select('id, class_id, student_id, arr_schedule, dep_schedule, campus_students(id, name)')
    .in('class_id', classIds)
    .eq('is_waitlist', false)
    .range(from, from + 999);
  if (error) throw error;
  allEnrollments.push(...page);
  if (page.length < 1000) break;
  from += 1000;
}
console.log(`Enrollments: ${allEnrollments.length}`);

// supaBuses[label][dir][bus] = Set<name>
// enrollmentIndex[name][label][dir] = [enrollment]
const supaBuses = {};
const enrollmentIndex = {};

for (const enr of allEnrollments) {
  const student = enr.campus_students;
  if (!student) continue;
  const korName = normalizeName(student.name || '');
  if (!korName) continue;

  const sessionId = classSessionMap[enr.class_id];
  const sessionName = sessionMap[sessionId];

  for (const dir of ['arr', 'dep']) {
    const sched = dir === 'arr' ? enr.arr_schedule : enr.dep_schedule;
    if (!sched) continue;

    const label = getSessionLabel(sessionName, dir);
    if (!label) continue;

    if (!supaBuses[label]) supaBuses[label] = { arr: {}, dep: {} };
    if (!enrollmentIndex[korName]) enrollmentIndex[korName] = {};
    if (!enrollmentIndex[korName][label]) enrollmentIndex[korName][label] = {};
    if (!enrollmentIndex[korName][label][dir]) enrollmentIndex[korName][label][dir] = [];
    enrollmentIndex[korName][label][dir].push({ ...enr, sessionName });

    const buses = new Set(
      Object.entries(sched)
        .filter(([k]) => !k.includes('_'))
        .map(([, v]) => v)
        .filter(v => v && v !== 'null')
    );
    for (const bus of buses) {
      if (!supaBuses[label][dir][bus]) supaBuses[label][dir][bus] = new Set();
      supaBuses[label][dir][bus].add(korName);
    }
  }
}

console.log('Supabase 루트별:');
for (const [label, dirs] of Object.entries(supaBuses)) {
  for (const [dir, buses] of Object.entries(dirs)) {
    const total = Object.values(buses).reduce((s, st) => s + st.size, 0);
    if (total > 0) {
      const busDetail = Object.entries(buses).sort().map(([b, s]) => `${b}:${s.size}`).join(' ');
      console.log(`  ${label} ${dir === 'arr' ? '등원' : '하원'}: ${total}명 [${busDetail}]`);
    }
  }
}

// ── Compare and find removals ─────────────────────────────────────────────────
console.log('\n=== 불일치 분석 (정규화 개선 후) ===');

const removalMap = new Map(); // enrollmentId -> { id, name, label, dir, field, currentSched }
let discrepancyCount = 0;

const allLabels = new Set([...Object.keys(fbBuses), ...Object.keys(supaBuses)]);
for (const label of [...allLabels].sort()) {
  for (const [dir, dirLabel] of [['arr', '등원'], ['dep', '하원']]) {
    const fbDirBuses = fbBuses[label]?.[dir] || {};
    const supaDirBuses = supaBuses[label]?.[dir] || {};

    const allBusNames = new Set([...Object.keys(fbDirBuses), ...Object.keys(supaDirBuses)]);
    for (const bus of [...allBusNames].sort()) {
      const fbSet = fbDirBuses[bus] || new Set();
      const supaSet = supaDirBuses[bus] || new Set();
      const onlyInSupa = [...supaSet].filter(n => !fbSet.has(n)).sort();
      const onlyInFb = [...fbSet].filter(n => !supaSet.has(n)).sort();

      if (onlyInSupa.length > 0 || onlyInFb.length > 0) {
        discrepancyCount++;
        console.log(`\n[${label} ${dirLabel}] ${bus}: Firebase=${fbSet.size}, Supabase=${supaSet.size}`);
        if (onlyInSupa.length > 0) {
          console.log(`  ⚠️  제거대상: ${onlyInSupa.join(', ')}`);
          for (const name of onlyInSupa) {
            const enrList = enrollmentIndex[name]?.[label]?.[dir] || [];
            for (const enr of enrList) {
              if (!removalMap.has(enr.id)) {
                const sched = dir === 'arr' ? enr.arr_schedule : enr.dep_schedule;
                const hasBus = sched && Object.entries(sched).some(([k, v]) => !k.includes('_') && v);
                if (hasBus) {
                  removalMap.set(enr.id, {
                    id: enr.id,
                    name,
                    label,
                    dir,
                    field: dir === 'arr' ? 'arr_schedule' : 'dep_schedule',
                    sessionName: enr.sessionName,
                    currentSched: sched,
                  });
                }
              }
            }
          }
        }
        if (onlyInFb.length > 0) {
          console.log(`  ❓ Supabase 미등록: ${onlyInFb.join(', ')}`);
        }
      }
    }
  }
}

const removals = [...removalMap.values()];
console.log(`\n총 불일치 버스: ${discrepancyCount}건`);
console.log(`제거 대상 enrollment: ${removals.length}건`);

// ── Group by student for review ───────────────────────────────────────────────
console.log('\n=== 제거 계획 상세 ===');
const byStudent = {};
for (const r of removals) {
  if (!byStudent[r.name]) byStudent[r.name] = [];
  byStudent[r.name].push(r);
}

let totalRemovalsArr = 0, totalRemovalsDep = 0;
for (const [name, items] of Object.entries(byStudent).sort()) {
  console.log(`\n${name}:`);
  for (const r of items) {
    const dirLabel = r.dir === 'arr' ? '등원' : '하원';
    console.log(`  [${r.id}] ${r.label} ${dirLabel} | 세션: ${r.sessionName} | 현재: ${JSON.stringify(r.currentSched)}`);
    if (r.dir === 'arr') totalRemovalsArr++; else totalRemovalsDep++;
  }
}
console.log(`\n등원 제거: ${totalRemovalsArr}건, 하원 제거: ${totalRemovalsDep}건`);

// ── Execute removals ──────────────────────────────────────────────────────────
console.log('\n=== 실행 ===');

const DAYS = ['월', '화', '수', '목', '금'];
let successCount = 0, errorCount = 0;
const results = [];

for (const r of removals) {
  const currentSched = { ...(r.currentSched || {}) };

  // Clear day slots and location slots, preserve _time
  for (const d of DAYS) {
    delete currentSched[d];
    delete currentSched[d + '_loc'];
    delete currentSched[d + '_time'];
  }

  if (DRY_RUN) {
    console.log(`  [DRY] ${r.name} | ${r.field} 초기화 | enrollment: ${r.id}`);
    results.push({ ...r, status: 'dry_run' });
    successCount++;
    continue;
  }

  const { error } = await supabase
    .from('class_enrollments')
    .update({ [r.field]: Object.keys(currentSched).length ? currentSched : {} })
    .eq('id', r.id);

  if (error) {
    console.error(`  ❌ ${r.name} | ${r.field} | ${error.message}`);
    results.push({ ...r, status: 'error', error: error.message });
    errorCount++;
  } else {
    console.log(`  ✅ ${r.name} | ${r.field} 초기화 완료`);
    results.push({ ...r, status: 'success' });
    successCount++;
  }
}

console.log(`\n완료: 성공 ${successCount}건, 오류 ${errorCount}건`);

writeFileSync('C:/Users/user/Desktop/Colin 작업폴더/leave-system/fix_results.json', JSON.stringify({
  dryRun: DRY_RUN,
  summary: { total: removals.length, success: successCount, error: errorCount },
  results
}, null, 2));
console.log('결과 저장: fix_results.json');
