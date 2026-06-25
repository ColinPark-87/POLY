#!/usr/bin/env node
// verify-jeongbal-vehicles-0617.mjs (READ-ONLY) — 정발 차량(마스터 스케줄) 표시 안되는 원인 점검.
// 비교군: 정상 표시되는 캠퍼스(중계). 핵심함정=세션 time_range 비면 화면 빔.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

async function all(table,campusId,cols){const out=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(table).select(cols).eq('campus_id',campusId).range(f,f+999);if(error){console.error(table,error.message);break}out.push(...(data||[]));if(!data||data.length<1000)break}return out}

function pickTargetMonth(months){ // route의 pickTargetMonth 근사: 가장 최근(내림차순 첫번째)
  return months[0] ?? ''
}

const {data:campuses}=await sb.from('campuses').select('id,name,code')
for(const NAME of ['정발','중계']){
  const c=campuses.find(x=>x.name===NAME); if(!c){console.log(`\n### ${NAME}: 캠퍼스 없음`);continue}
  console.log(`\n===== ${NAME} (${c.code} / ${c.id}) =====`)
  const sessions=await all('class_sessions',c.id,'id,name,month,time_range,sort_order')
  const months=[...new Set(sessions.map(s=>s.month))].sort((a,b)=>{const p=m=>{const x=(m||'').match(/\d+/g);return x&&x.length>=2?+x[0]*100+ +x[1]:0};return p(b)-p(a)})
  console.log('class_sessions:',sessions.length,' / months:',JSON.stringify(months))
  const tgt=pickTargetMonth(months)
  console.log('추정 targetMonth(최근월):',tgt)
  const tgtSessions=sessions.filter(s=>s.month===tgt)
  console.log(`targetMonth 세션 ${tgtSessions.length}개:`)
  for(const s of tgtSessions) console.log(`   - "${s.name}" time_range=${JSON.stringify(s.time_range)} sort=${s.sort_order}`)
  const emptyTR=tgtSessions.filter(s=>!s.time_range||!String(s.time_range).trim())
  if(tgtSessions.length && emptyTR.length===tgtSessions.length) console.log('   ⚠️ targetMonth 전 세션 time_range 비어있음 → 마스터 스케줄 화면 빔 가능')
  else if(emptyTR.length) console.log(`   ⚠️ time_range 빈 세션 ${emptyTR.length}개`)

  const buses=await all('campus_buses',c.id,'id,name,sort_order')
  console.log('campus_buses:',buses.length, buses.map(b=>b.name).join(', '))
  const regStops=await all('campus_registered_stops',c.id,'stop_name,bus_name,direction,default_time')
  console.log('campus_registered_stops:',regStops.length,' (dep:',regStops.filter(r=>r.direction==='dep').length,'/ arr:',regStops.filter(r=>r.direction==='arr').length,')')

  // 해당월 반/등록 + 스케줄 채움 여부
  const tgtIds=tgtSessions.map(s=>s.id)
  if(tgtIds.length){
    const {data:classes}=await sb.from('classes').select('id,session_id').in('session_id',tgtIds)
    console.log('classes(targetMonth):',(classes||[]).length)
    const clIds=(classes||[]).map(x=>x.id)
    if(clIds.length){
      let enr=[]
      for(let i=0;i<clIds.length;i+=200){const {data}=await sb.from('class_enrollments').select('student_id,arr_schedule,dep_schedule,is_waitlist').in('class_id',clIds.slice(i,i+200)).eq('is_waitlist',false);enr.push(...(data||[]))}
      const hasDep=enr.filter(e=>e.dep_schedule&&Object.keys(e.dep_schedule).length>0).length
      const hasArr=enr.filter(e=>e.arr_schedule&&Object.keys(e.arr_schedule).length>0).length
      console.log(`class_enrollments(비대기): ${enr.length}  dep_schedule채움:${hasDep}  arr_schedule채움:${hasArr}`)
      // 샘플 스케줄
      const sample=enr.find(e=>e.dep_schedule&&Object.keys(e.dep_schedule).length>0)||enr[0]
      if(sample) console.log('   샘플 dep_schedule:',JSON.stringify(sample.dep_schedule),' arr:',JSON.stringify(sample.arr_schedule))
    }
  }
}
