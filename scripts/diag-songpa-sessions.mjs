#!/usr/bin/env node
// diag-songpa-sessions.mjs (읽기전용) — 송파 class_sessions 이름 + 유치부 enrollment _loc/bus 패턴 덤프
import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv();const URL=ENV.NEXT_PUBLIC_SUPABASE_URL,KEY=ENV.SUPABASE_SERVICE_ROLE_KEY
async function sbGet(q){const r=await fetch(`${URL}/rest/v1/${q}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});if(!r.ok)throw new Error(`${q} ${r.status} ${await r.text()}`);return r.json()}
async function sbAll(t,q){const out=[];for(let f=0;;f+=1000){const r=await fetch(`${URL}/rest/v1/${t}?${q}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,Range:`${f}-${f+999}`}});if(!r.ok)throw new Error(`${t} ${r.status}`);const rows=await r.json();out.push(...rows);if(rows.length<1000)break}return out}
function pickMonth(ms){const k=new Date(Date.now()+9*3600*1000);const y=k.getUTCFullYear(),m=k.getUTCMonth()+1;const cur=`${y}-${String(m).padStart(2,'0')}`,n=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;if(ms.includes(n))return n;if(ms.includes(cur))return cur;return ms.sort().pop()??''}
async function main(){
  const cs=await sbGet('campuses?select=id,name');const c=cs.find(x=>x.name==='송파');if(!c)throw new Error('송파 없음');
  console.log('송파 id=',c.id)
  const months=[...new Set((await sbGet(`class_sessions?select=month&campus_id=eq.${c.id}`)).map(r=>r.month))]
  const month=pickMonth(months); console.log('월목록:',months,'-> 대상',month)
  const sess=await sbGet(`class_sessions?select=*&campus_id=eq.${c.id}&month=eq.${encodeURIComponent(month)}`)
  console.log(`\n=== class_sessions (${month}, ${sess.length}개) cols=${Object.keys(sess[0]??{}).join(',')} ===`)
  for(const s of sess) console.log(`  name="${s.name}"  id=${s.id}`)
  // 유치부 세션의 enrollment arr/dep bus·loc 패턴
  const yuchi=sess.filter(s=>/유치|매일|일반|block|Block/i.test(s.name))
  console.log(`\n=== 매칭후보 세션 enrollment 샘플 ===`)
  for(const s of yuchi.slice(0,12)){
    const cls=await sbAll('classes',`select=id&session_id=eq.${s.id}`)
    if(!cls.length){console.log(`  [${s.name}] 반0`);continue}
    const enr=await sbAll('class_enrollments',`select=arr_schedule,dep_schedule,campus_students(name)&class_id=in.(${cls.map(x=>x.id).join(',')})`)
    const buses=new Set(),locs=new Set()
    for(const e of enr){for(const d of ['월','화','수','목','금']){if(e.arr_schedule?.[d])buses.add(e.arr_schedule[d]);if(e.dep_schedule?.[d])buses.add(e.dep_schedule[d]);if(e.arr_schedule?.[d+'_loc'])locs.add(e.arr_schedule[d+'_loc'])}}
    console.log(`  [${s.name}] 학생${enr.length} 호차={${[...buses].join(',')}} loc샘플=${[...locs].slice(0,3).join(' | ')}`)
  }
}
main().catch(e=>{console.error('오류:',e);process.exit(1)})
