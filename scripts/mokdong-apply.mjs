#!/usr/bin/env node
// mokdong-apply.mjs [--commit]   목동매그넷 차량 적용 (호차 생성 + enrollment 스케줄 업데이트)
// 기본은 DRY(미수정). --commit 시에만 DB 쓰기. update/upsert만(삭제 없음).
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const COMMIT=process.argv.includes('--commit')
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const dry=JSON.parse(fs.readFileSync(A+'목동_dryrun.json','utf8'))
const CAMPUS='목동매그넷'

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name===CAMPUS)
if(!c){console.error('no campus');process.exit(1)}
console.log(`=== ${CAMPUS} apply ${COMMIT?'[COMMIT]':'[DRY]'} ===`)

// 1) 호차 생성 (1,2,3,5,6,7,8,9). upsert by (campus_id,name)
const busNames=['1호차','2호차','3호차','5호차','6호차','7호차','8호차','9호차']
const {data:existBuses}=await sb.from('campus_buses').select('*').eq('campus_id',c.id)
const have=new Set((existBuses||[]).map(b=>b.name))
const toAdd=busNames.filter(n=>!have.has(n)).map((n,i)=>({campus_id:c.id,name:n,sort_order:busNames.indexOf(n)}))
console.log(`buses: 기존 ${have.size}, 추가 ${toAdd.length} [${toAdd.map(b=>b.name).join(',')}]`)
if(COMMIT && toAdd.length){const {error}=await sb.from('campus_buses').insert(toAdd);if(error)console.error('bus insert',error.message);else console.log('  buses inserted')}

// 2) enrollment 스케줄 업데이트
const items=dry.built.filter(b=>(b.arr&&Object.keys(b.arr).length)||(b.dep&&Object.keys(b.dep).length))
console.log(`스케줄 업데이트 대상: ${items.length} enrollments (빈값 제외)`)
let ok=0,fail=0
for(const b of items){
  if(!COMMIT) continue
  const {error}=await sb.from('class_enrollments').update({arr_schedule:b.arr,dep_schedule:b.dep}).eq('id',b.enrollment_id).eq('campus_id',c.id)
  if(error){fail++;console.error('  upd',b.student,error.message)}else ok++
}
if(COMMIT)console.log(`업데이트 완료: ok=${ok} fail=${fail}`)
else console.log('(DRY: 쓰지 않음. --commit 로 실행)')
console.log(`\n요약: 매칭/빌드 ${dry.built.length}, 스케줄있음 ${items.length}, 미매칭 ${dry.unmatched.length}, 모호 ${dry.ambiguous.length}, 미이용 ${dry.noShuttle.length}`)
