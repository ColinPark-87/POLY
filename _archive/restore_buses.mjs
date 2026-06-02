/**
 * Step 2: Execute remaining 13 removals + restore incorrectly cleared schedules
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ulpevrblixfrbfwlfeoc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGV2cmJsaXhmcmJmd2xmZW9jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyOTc0NiwiZXhwIjoyMDkzMDA1NzQ2fQ.h5Jf47FVNH-3S04w9pkA5CqkAPCkHpjHXaD8sM4WOwU';
const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
console.log(DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE');

const DAYS = ['월', '화', '수', '목', '금'];

async function clearDep(id, name) {
  const { data: enr } = await supabase
    .from('class_enrollments').select('dep_schedule').eq('id', id).single();
  if (!enr) { console.log(`  ❌ ${name}: enrollment not found`); return; }
  const sched = { ...(enr.dep_schedule || {}) };
  for (const d of DAYS) { delete sched[d]; delete sched[d + '_loc']; delete sched[d + '_time']; }
  delete sched['_time'];
  const newSched = Object.keys(sched).length ? sched : {};
  if (DRY_RUN) { console.log(`  [DRY] CLEAR ${name} dep | was: ${JSON.stringify(enr.dep_schedule)}`); return; }
  const { error } = await supabase.from('class_enrollments').update({ dep_schedule: newSched }).eq('id', id);
  if (error) console.log(`  ❌ ${name}: ${error.message}`);
  else console.log(`  ✅ CLEAR ${name} dep`);
}

async function setDep(id, name, newSched) {
  if (DRY_RUN) { console.log(`  [DRY] RESTORE ${name} dep → ${JSON.stringify(newSched)}`); return; }
  const { error } = await supabase.from('class_enrollments').update({ dep_schedule: newSched }).eq('id', id);
  if (error) console.log(`  ❌ RESTORE ${name}: ${error.message}`);
  else console.log(`  ✅ RESTORE ${name} dep → ${JSON.stringify(newSched)}`);
}

// ── Part 1: Clear remaining wrong dep_schedules (유치부 regular session) ──────
console.log('\n=== Part 1: 남은 제거 13건 (유치부 세션 하원 초기화) ===');
const toRemove = [
  { id: 'bb6006f4-5e8d-4c78-8f98-3b7625d9771f', name: '김민선(유치부 dep 7호차)' },
  { id: '1c67231e-4e3e-4795-9c52-c73e9070e6a9', name: '김윤(유치부 dep 6호차)' },
  { id: '8a401d6b-91ca-4751-8d48-b1ffa1dcf69b', name: '김주안(유치부 dep 2호차)' },
  { id: 'c118f23a-e649-4f33-82f1-2db331534b6e', name: '김태안(유치부 dep 2호차)' },
  { id: '1db52b03-c70c-4b1d-a0d4-51a3d2eedab0', name: '박서준(유치부 dep 6호차)' },
  { id: 'b55263b1-2438-4bea-adf2-3e7db6c26c74', name: '박선하(유치부 dep 3호차)' },
  { id: '008e8470-c1df-4861-a643-60417cb3b024', name: '신동주(유치부 dep 1호차)' },
  { id: '1861288e-fefc-4fa9-9a95-f528a328a833', name: '안유비(유치부 dep 2호차)' },
  { id: '14c3c749-4b3f-4d24-8d52-a8e803c663ca', name: '이지아(유치부 dep 3호차)' },
  { id: 'f186200f-7ab2-4020-a90e-cf20c9605d8e', name: '이지아(유치부 dep 8호차)' },
  { id: '541c68f4-7b92-40fb-8039-dadf075ce367', name: '정유준(유치부 dep 7호차)' },
  { id: '5c381097-261b-4f54-878a-c60d418740e4', name: '지서율(유치부 dep 3호차)' },
  { id: 'd5e6e584-5b77-4f78-9296-f39aa7342631', name: '한서아(유치부 dep 6호차)' },
];

for (const r of toRemove) await clearDep(r.id, r.name);

// ── Part 2: Restore incorrectly cleared dep_schedules ─────────────────────────
// In step 1, we over-cleared some valid 유치부 방과후 dep_schedules.
// These were originally correct per Firebase but got cleared because their
// 유치부 regular session also had a (wrong) bus assignment in the same route.
console.log('\n=== Part 2: 잘못 초기화된 하원 스케줄 복원 ===');

const toRestore = [
  // 김주안: Firebase 유치부 하원 5호차 [목,화]
  {
    id: 'd530675d-10e6-4977-8607-1eb710924532',
    name: '김주안(방과후 dep 목:5호차)',
    sched: { '목': '5호차', '_time': '09:13', '목_loc': '중계약국' }
  },
  {
    id: 'e3a000ba-7fb4-49f8-b23e-607cc4dd2c39',
    name: '김주안(방과후 dep 화:5호차)',
    sched: { '화': '5호차', '_time': '09:13', '화_loc': '중계약국' }
  },
  // 김태안: Firebase 유치부 하원 5호차 [목,화]
  {
    id: 'cb7c119e-9061-4a36-a57d-5c5beff63422',
    name: '김태안(방과후 dep 목:5호차)',
    sched: { '목': '5호차', '_time': '09:13', '목_loc': '중계약국' }
  },
  {
    id: 'f38874f1-ecc5-43bb-9fb1-707c6e946176',
    name: '김태안(방과후 dep 화:5호차)',
    sched: { '화': '5호차', '_time': '09:13', '화_loc': '중계약국' }
  },
  // 안유비: Firebase 유치부 하원 2호차 [화]
  {
    id: '62956644-76e8-4a05-861b-ea1401943483',
    name: '안유비(방과후 dep 화:2호차)',
    sched: { '화': '2호차', '화_loc': '포레나노원A  후문' }
  },
  // 박서준: Firebase 유치부 하원 2호차 [목]
  {
    id: '86cc0bb6-1d0e-4501-a0d3-f1e989121605',
    name: '박서준(방과후 dep 목:2호차)',
    sched: { '목': '2호차' }
  },
  // 신동주: Firebase 유치부 하원 2호차 [화]
  {
    id: '81e8588f-4aad-4deb-98d7-4c8611ea1383',
    name: '신동주(방과후 dep 화:2호차)',
    sched: { '화': '2호차', '화_loc': '중계주공 5단지' }
  },
];

for (const r of toRestore) await setDep(r.id, r.name, r.sched);

console.log('\n완료');
