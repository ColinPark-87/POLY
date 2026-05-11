/**
 * Bus Assignment Analysis: Firebase May 2026 vs Supabase
 * Per-route (유치부/매일반/3일반/2일반) × per-direction comparison
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU';
const FIREBASE_BASE = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com';
const TARGET_MONTH = '2026년 5월';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function normalizeName(name) {
  return name.trim().replace(/\s*\(.*?\)\s*$/, '').trim();
}

function hasActiveDays(days) {
  if (!days) return false;
  return Object.values(days).some(v => v === true);
}

// Firebase route name → { label, dir }
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

// Supabase session name → label (matching getSessionLabel() from route.ts)
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

// ── Step 1: Firebase May 2026 ─────────────────────────────────────────────────
console.log('=== Step 1: Firebase May 2026 ===');

const fbResp = await fetch(`${FIREBASE_BASE}/poly_class/months/${encodeURIComponent(TARGET_MONTH)}.json`);
const fbData = await fbResp.json();
if (!fbData) throw new Error('No Firebase data');

// fbBuses[label][dir][bus] = Set<name>
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

console.log('Firebase 루트별 요약:');
for (const [label, dirs] of Object.entries(fbBuses)) {
  for (const [dir, buses] of Object.entries(dirs)) {
    const total = Object.values(buses).reduce((s, st) => s + st.size, 0);
    if (total > 0) {
      const busDetail = Object.entries(buses).sort().map(([b, s]) => `${b}:${s.size}`).join(' ');
      console.log(`  ${label} ${dir === 'arr' ? '등원' : '하원'}: ${total}명 [${busDetail}]`);
    }
  }
}

// ── Step 2: Supabase May 2026 ─────────────────────────────────────────────────
console.log('\n=== Step 2: Supabase May 2026 ===');

const { data: campuses } = await supabase.from('campuses').select('id, name');
const campus = campuses.find(c => c.name?.includes('중계'));
console.log(`Campus: ${campus.name} (${campus.id})`);

const { data: sessions } = await supabase
  .from('class_sessions')
  .select('id, name, time_range')
  .eq('campus_id', campus.id)
  .eq('month', TARGET_MONTH);
console.log(`Sessions:`);
for (const s of sessions) console.log(`  ${s.name} (${s.id})`);

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
const supaBuses = {};
// enrollmentIndex[name][label] = [enrollment, ...]
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
    enrollmentIndex[korName][label][dir].push(enr);

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

console.log('Supabase 루트별 요약:');
for (const [label, dirs] of Object.entries(supaBuses)) {
  for (const [dir, buses] of Object.entries(dirs)) {
    const total = Object.values(buses).reduce((s, st) => s + st.size, 0);
    if (total > 0) {
      const busDetail = Object.entries(buses).sort().map(([b, s]) => `${b}:${s.size}`).join(' ');
      console.log(`  ${label} ${dir === 'arr' ? '등원' : '하원'}: ${total}명 [${busDetail}]`);
    }
  }
}

// ── Step 3: Compare ───────────────────────────────────────────────────────────
console.log('\n=== Step 3: 불일치 분석 ===');

const toRemove = []; // { enrollmentId, studentName, label, dir, bus }
let allSame = true;

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
        allSame = false;
        console.log(`\n[${label} ${dirLabel}] ${bus}: Firebase=${fbSet.size}명, Supabase=${supaSet.size}명`);
        if (onlyInSupa.length > 0) {
          console.log(`  ⚠️  Supabase만 있음 (제거대상): ${onlyInSupa.join(', ')}`);
          for (const name of onlyInSupa) {
            const enrList = enrollmentIndex[name]?.[label]?.[dir] || [];
            for (const enr of enrList) {
              toRemove.push({ enrollmentId: enr.id, studentName: name, label, dir, bus });
            }
          }
        }
        if (onlyInFb.length > 0) {
          console.log(`  ❓ Firebase만 있음 (Supabase 미등록): ${onlyInFb.join(', ')}`);
        }
      }
    }
  }
}

if (allSame) console.log('✅ 모든 호차 인원수 일치!');

// ── Step 4: Summarize ─────────────────────────────────────────────────────────
console.log('\n=== Step 4: 제거 계획 ===');
console.log(`총 제거 대상: ${toRemove.length}건`);
for (const r of toRemove) {
  console.log(`  [${r.enrollmentId}] ${r.studentName} - ${r.label} ${r.dir === 'arr' ? '등원' : '하원'} ${r.bus}`);
}

writeFileSync(
  'C:/Users/user/Desktop/Colin 작업폴더/leave-system/bus_analysis.json',
  JSON.stringify({ toRemove, fbBuses: serializeSets(fbBuses), supaBuses: serializeSets(supaBuses) }, null, 2)
);
console.log('\n✅ 저장: bus_analysis.json');

function serializeSets(obj) {
  if (obj instanceof Set) return [...obj].sort();
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serializeSets(v)]));
  }
  return obj;
}
