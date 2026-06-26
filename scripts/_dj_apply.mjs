// 대전 차량 세팅 적용 — 백업 후 적용 (운영 DB). _apply.json 소비.
import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'}
async function get(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:H});if(!r.ok)throw new Error('GET '+q+' '+r.status+await r.text());return r.json()}
async function getAll(t,q){const o=[];for(let f=0;;f+=1000){const r=await fetch(`${U}/rest/v1/${t}?${q}`,{headers:{...H,Range:`${f}-${f+999}`}});if(!r.ok)throw new Error('GET '+t+' '+r.status);const rows=await r.json();o.push(...rows);if(rows.length<1000)break}return o}
async function post(t,body,prefer){const r=await fetch(`${U}/rest/v1/${t}`,{method:'POST',headers:{...H,Prefer:prefer||'return=minimal'},body:JSON.stringify(body)});if(!r.ok)throw new Error('POST '+t+' '+r.status+await r.text());return r}
async function patch(t,q,body){const r=await fetch(`${U}/rest/v1/${t}?${q}`,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify(body)});if(!r.ok)throw new Error('PATCH '+t+' '+q+' '+r.status+await r.text());return r}

const P=JSON.parse(fs.readFileSync('../산출물/대전차량_2026-06-26/_apply.json','utf8'))
const CID=P.campusId
const STAMP=process.argv[2]||'manual'   // timestamp passed from shell (Date.* 회피)
console.log('대전 campusId',CID,'apply updates',P.updates.length)

// ===== 1) BACKUP =====
const sess=await get(`class_sessions?select=id,name,time_range,month&campus_id=eq.${CID}`)
const buses=await getAll('campus_buses',`select=*&campus_id=eq.${CID}`)
const regs=await getAll('campus_registered_stops',`select=*&campus_id=eq.${CID}`)
const coords=await getAll('campus_stop_coords',`select=*&campus_id=eq.${CID}`)
const cls=await get(`classes?select=id,session_id&session_id=in.(${sess.map(s=>s.id).join(',')})`)
let enr=[]; for(let i=0;i<cls.length;i+=30){const ch=cls.slice(i,i+30).map(x=>x.id);enr.push(...await get(`class_enrollments?select=id,student_id,class_id,arr_schedule,dep_schedule&class_id=in.(${ch.join(',')})`))}
const backup={stamp:STAMP,campusId:CID,class_sessions:sess,campus_buses:buses,campus_registered_stops:regs,campus_stop_coords:coords,class_enrollments:enr}
const bpath=`../산출물/대전차량_2026-06-26/_backup_${STAMP}.json`
fs.writeFileSync(bpath,JSON.stringify(backup))
console.log('BACKUP saved:',bpath,'(enr',enr.length,'buses',buses.length,'regs',regs.length,'coords',coords.length,')')

if(process.argv.includes('--backup-only')){console.log('backup-only, stop.');process.exit(0)}

// ===== 2) session time_range =====
let tr=0
for(const [name,range] of Object.entries(P.sessionTimeRanges)){
  const s=sess.find(x=>x.name===name); if(!s){console.log('  세션없음:',name);continue}
  if(s.time_range&&s.time_range.trim()){console.log('  time_range 이미있음 유지:',name,s.time_range);continue}
  await patch('class_sessions',`id=eq.${s.id}`,{time_range:range}); tr++
}
console.log('time_range set:',tr)

// ===== 3) campus_buses upsert =====
await post('campus_buses',P.buses.map(name=>({campus_id:CID,name})),'resolution=merge-duplicates,return=minimal')
console.log('buses upserted:',P.buses.length)

// ===== 4) registered_stops upsert =====
const regRows=P.stops.map(s=>({campus_id:CID,stop_name:s.stop_name,bus_name:s.bus_name,direction:s.direction}))
for(let i=0;i<regRows.length;i+=200){await post('campus_registered_stops',regRows.slice(i,i+200),'resolution=merge-duplicates,return=minimal')}
console.log('registered_stops upserted:',regRows.length)

// ===== 5) enrollment schedules =====
let ok=0,fail=0
for(const u of P.updates){
  const body={}; if(u.arr_schedule)body.arr_schedule=u.arr_schedule; if(u.dep_schedule)body.dep_schedule=u.dep_schedule
  if(!Object.keys(body).length)continue
  body.updated_by='Colin'
  try{await patch('class_enrollments',`student_id=eq.${u.student_id}&class_id=eq.${u.class_id}`,body);ok++}
  catch(e){fail++; if(fail<=5)console.log('  FAIL',u.kr,e.message)}
}
console.log('enrollment schedules patched: ok',ok,'fail',fail)
console.log('\nDONE.')
