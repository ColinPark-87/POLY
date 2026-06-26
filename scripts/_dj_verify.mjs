import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
async function g(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});if(!r.ok)throw new Error(q+' '+r.status);return r.json()}
const c=(await g('campuses?select=id,name')).find(x=>x.name.includes('대전'))
const sess=await g(`class_sessions?select=id,name,time_range&campus_id=eq.${c.id}`)
console.log('=== sessions time_range ===');for(const s of sess)console.log(`  ${s.name}: '${s.time_range}'`)
console.log('buses:',(await g(`campus_buses?select=name&campus_id=eq.${c.id}`)).map(b=>b.name).join(','))
console.log('registered_stops:',(await g(`campus_registered_stops?select=stop_name&campus_id=eq.${c.id}`)).length)
const cls=await g(`classes?select=id,session_id&session_id=in.(${sess.map(s=>s.id).join(',')})`)
const csess=Object.fromEntries(cls.map(x=>[x.id,sess.find(s=>s.id===x.session_id)?.name]))
let enr=[];for(let i=0;i<cls.length;i+=30){const ch=cls.slice(i,i+30).map(x=>x.id);enr.push(...await g(`class_enrollments?select=student_id,class_id,arr_schedule,dep_schedule&class_id=in.(${ch.join(',')})`))}
const DAYS=['월','화','수','목','금']
const hb=s=>s&&DAYS.some(d=>s[d])
console.log('enrollments:',enr.length,' with arr배차:',enr.filter(e=>hb(e.arr_schedule)).length,' with dep배차:',enr.filter(e=>hb(e.dep_schedule)).length)
// per-bus headcount (arr)
const busCnt={}
for(const e of enr){const s=e.arr_schedule;if(!s)continue;const buses=new Set(DAYS.map(d=>s[d]).filter(Boolean));for(const b of buses)busCnt[b]=(busCnt[b]||0)+1}
console.log('arr 호차별 학생수:',JSON.stringify(busCnt))
// sample a known student 이도하? no, 대전. sample first arr
const ex=enr.find(e=>hb(e.arr_schedule));console.log('sample:',JSON.stringify(ex.arr_schedule),'/dep',JSON.stringify(ex.dep_schedule))
