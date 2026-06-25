#!/usr/bin/env node
// wide-apply.mjs <송도|송파> [--commit]
// 호차 생성(기사/안전/정원) + 세션 time_range 자동설정 + enrollment 스케줄 업데이트. upsert/update만.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const CAMP=process.argv[2]; const COMMIT=process.argv.includes('--commit')
const ALLOWED=['송도','송파','광명','목동','수지','운정','위례','유성','분당','광교']
if(!ALLOWED.includes(CAMP)){console.error('usage: wide-apply.mjs <'+ALLOWED.join('|')+'> [--commit]');process.exit(1)}
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const dry=JSON.parse(fs.readFileSync(A+`${CAMP}_dryrun.json`,'utf8'))
const busMeta=JSON.parse(fs.readFileSync(A+`${CAMP}_buses.json`,'utf8'))

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name===CAMP)
console.log(`=== ${CAMP} apply ${COMMIT?'[COMMIT]':'[DRY]'} ===`)

// 1) 호차 생성/갱신 (기사/안전/정원)
const {data:existBuses}=await sb.from('campus_buses').select('*').eq('campus_id',c.id)
const have=new Set((existBuses||[]).map(b=>b.name))
const busRows=busMeta.map((b,i)=>{const r={campus_id:c.id,name:b.name,sort_order:i,driver:b.driver||null,safety:b.safety||null};if(b.capacity!=null)r.capacity=b.capacity;return r})
const toAdd=busRows.filter(b=>!have.has(b.name))
console.log(`buses: 기존 ${have.size}, 추가 ${toAdd.length} [${toAdd.map(b=>b.name+(b.capacity?'/'+b.capacity:'')).join(', ')}]`)
if(COMMIT&&toAdd.length){const {error}=await sb.from('campus_buses').insert(toAdd);if(error)console.error(' bus insert',error.message);else console.log(' buses inserted')}

// 2) 세션 time_range 자동계산 (built 학생의 classtime 다수결)
function rangeOf(classtime){const m=String(classtime).match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);if(!m)return null
  const isYu=/유치/.test(classtime)
  const conv=(h,mm,after)=>{h=+h;if(after&&h<12)h+=12;return String(h).padStart(2,'0')+':'+mm}
  return conv(m[1],m[2],!isYu)+'~'+conv(m[3],m[4],true)}
const {data:sessions}=await sb.from('class_sessions').select('*').eq('campus_id',c.id)
const sessName2Id={};for(const s of sessions)sessName2Id[s.name]=s
// session -> classtime 빈도 + 데이터(등하원시간) 수집
const sessCt={}, sessArr={}, sessDep={}
const toMin=t=>{const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null}
const toHHMM=mn=>`${String(Math.floor(mn/60)).padStart(2,'0')}:${String(mn%60).padStart(2,'0')}`
for(const b of dry.built){
  if(b.classtime){const k=b.session;(sessCt[k]=sessCt[k]||{});sessCt[k][b.classtime]=(sessCt[k][b.classtime]||0)+1}
  const at=toMin(b.arr&&b.arr['_time']); if(at!=null){(sessArr[b.session]=sessArr[b.session]||[]).push(at)}
  const dt=toMin(b.dep&&b.dep['_time']); if(dt!=null){(sessDep[b.session]=sessDep[b.session]||[]).push(dt)}
}
function dataRange(sname){
  const a=(sessArr[sname]||[]).sort((x,y)=>x-y), d=(sessDep[sname]||[]).sort((x,y)=>x-y)
  // 중앙값 등원 ~ 중앙값 하원 (이상치 영향 줄임)
  if(!a.length&&!d.length)return null
  const med=arr=>arr.length?arr[Math.floor(arr.length/2)]:null
  const s=med(a), e=med(d)
  if(s==null||e==null)return null
  return toHHMM(s)+'~'+toHHMM(e)
}
console.log('세션 time_range:')
for(const s of sessions){
  const cts=sessCt[s.name]||{}
  const top=Object.entries(cts).sort((a,b)=>b[1]-a[1])[0]
  const tr=(top&&rangeOf(top[0]))||dataRange(s.name)   // classtime 범위 우선, 없으면 데이터 기반
  console.log(`  ${s.name}: 현재='${s.time_range||''}' → '${tr||'(데이터없음)'}'  ${top?'['+top[0]+']':''}`)
  if(COMMIT&&tr&&s.time_range!==tr){const {error}=await sb.from('class_sessions').update({time_range:tr}).eq('id',s.id);if(error)console.error('  tr err',error.message);else console.log('   updated')}
}

// 3) enrollment 스케줄 업데이트
const items=dry.built.filter(b=>(b.arr&&Object.keys(b.arr).length)||(b.dep&&Object.keys(b.dep).length))
console.log(`스케줄 업데이트 대상: ${items.length}`)
let ok=0,fail=0
for(const b of items){if(!COMMIT)continue;const {error}=await sb.from('class_enrollments').update({arr_schedule:b.arr,dep_schedule:b.dep}).eq('id',b.enrollment_id).eq('campus_id',c.id);if(error){fail++;console.error(' upd',b.student,error.message)}else ok++}
if(COMMIT)console.log(`업데이트 완료: ok=${ok} fail=${fail}`)
else console.log('(DRY)')
console.log(`요약: 빌드 ${dry.built.length}, 스케줄있음 ${items.length}, 미매칭 ${dry.unmatched.length}, 모호 ${dry.ambiguous.length}, 미이용 ${dry.noShuttle.length}`)
