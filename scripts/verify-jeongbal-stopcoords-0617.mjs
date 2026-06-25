#!/usr/bin/env node
// READ-ONLY: 정발 차량 정류장 좌표 커버리지 점검 — 마스터 스케줄 _loc 정류장명이
// campus_stop_coords 에 좌표로 존재하는지(없으면 지도에 노선/정류장 안 그려짐).
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const norm=s=>(s??'').replace(/\s+/g,'').trim()
async function all(table,campusId,cols){const out=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(table).select(cols).eq('campus_id',campusId).range(f,f+999);if(error){console.error(table,error.message);break}out.push(...(data||[]));if(!data||data.length<1000)break}return out}

function pickTargetMonth(months){const kst=new Date(Date.now()+9*3600*1000);const cur=`${kst.getUTCFullYear()}년 ${kst.getUTCMonth()+1}월`;const m=kst.getUTCMonth()+1,y=kst.getUTCFullYear();const next=`${m===12?y+1:y}년 ${m===12?1:m+1}월`;if(months.includes(next))return next;if(months.includes(cur))return cur;return months[0]??''}

const {data:campuses}=await sb.from('campuses').select('id,name,code')
for(const NAME of ['정발','송파']){
  const c=campuses.find(x=>x.name===NAME); if(!c){console.log(`${NAME} 없음`);continue}
  console.log(`\n===== ${NAME} (${c.code}) =====`)
  const coords=await all('campus_stop_coords',c.id,'stop_name,lat,lng')
  const coordKeys=new Set(coords.map(r=>norm(r.stop_name)))
  console.log('campus_stop_coords:',coords.length)
  const sessions=await all('class_sessions',c.id,'id,month,time_range,name')
  const months=[...new Set(sessions.map(s=>s.month))]
  const tgt=pickTargetMonth(months)
  const tgtIds=sessions.filter(s=>s.month===tgt).map(s=>s.id)
  console.log('targetMonth:',tgt,' 세션',tgtIds.length,'개')
  const {data:classes}=await sb.from('classes').select('id').in('session_id',tgtIds)
  const clIds=(classes||[]).map(x=>x.id)
  let enr=[]
  for(let i=0;i<clIds.length;i+=200){const {data}=await sb.from('class_enrollments').select('arr_schedule,dep_schedule,is_waitlist').in('class_id',clIds.slice(i,i+200)).eq('is_waitlist',false);enr.push(...(data||[]))}
  // 모든 _loc 정류장명 수집 (dep+arr)
  const locs=new Map() // norm -> {raw, count}
  for(const e of enr){
    for(const sched of [e.dep_schedule,e.arr_schedule]){
      if(!sched) continue
      for(const k of Object.keys(sched)){
        if(k.endsWith('_loc')){
          const raw=String(sched[k]||'').replace(/\s*\(.*?\)\s*/g,'').trim() // 괄호 시간 등 제거 근사
          const v=String(sched[k]||'').trim()
          if(v){const nk=norm(v);const cur=locs.get(nk)||{raw:v,count:0};cur.count++;locs.set(nk,cur)}
        }
      }
    }
  }
  const locArr=[...locs.entries()]
  const matched=locArr.filter(([nk])=>coordKeys.has(nk))
  const unmatched=locArr.filter(([nk])=>!coordKeys.has(nk))
  console.log(`enrollment 정류장(고유): ${locArr.length}  좌표매칭: ${matched.length}  미매칭: ${unmatched.length}`)
  if(unmatched.length){
    console.log('  ❌ 좌표 없는 정류장(상위, 노선/정류장 안 그려짐):')
    for(const [nk,v] of unmatched.sort((a,b)=>b[1].count-a[1].count).slice(0,15)) console.log(`     "${v.raw}" ×${v.count}`)
  }
}
