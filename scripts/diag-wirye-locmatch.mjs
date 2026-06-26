import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
const norm=s=>(s??'').replace(/\s+/g,' ').trim()
const splitLoc=s=>{const m=String(s??'').match(/^(\d{1,2}:\d{2}(?:\s*[-~]\s*\d{1,2}:\d{2})?)\s+(.+)$/);return m?m[2].trim():(s??'')}
async function g(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});if(!r.ok)throw new Error(q+' '+r.status+await r.text());return r.json()}
async function gAll(t,q){const o=[];for(let f=0;;f+=1000){const r=await fetch(`${U}/rest/v1/${t}?${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`,Range:`${f}-${f+999}`}});if(!r.ok)throw new Error(t+' '+r.status);const rows=await r.json();o.push(...rows);if(rows.length<1000)break}return o}
const c=(await g('campuses?select=id,name')).find(x=>x.name&&x.name.includes('위례'))
const coords=await g(`campus_stop_coords?select=stop_name&campus_id=eq.${c.id}`)
const exact=new Set(coords.map(x=>x.stop_name)), normSet=new Set(coords.map(x=>norm(x.stop_name)))
const sess=await g(`class_sessions?select=id&campus_id=eq.${c.id}`)
const cls=await gAll('classes',`select=id,session_id&session_id=in.(${sess.map(s=>s.id).join(',')})`)
const ids=cls.map(x=>x.id)
const enr=[]; for(let i=0;i<ids.length;i+=80){const ch=ids.slice(i,i+80);if(!ch.length)break;enr.push(...await gAll('class_enrollments',`select=arr_schedule,dep_schedule&class_id=in.(${ch.join(',')})`))}
const DAYS=['월','화','수','목','금']
const locs=new Set()
for(const e of enr)for(const sched of [e.arr_schedule,e.dep_schedule]){if(!sched)continue;for(const d of DAYS){const v=sched[d+'_loc'];if(v){locs.add(splitLoc(v))}}}
console.log(`distinct student stop locs: ${locs.size}, coords: ${coords.length}`)
console.log(`\n=== locs with NO exact coord ===`)
let normOnly=0,none=0
for(const l of [...locs].sort()){ if(exact.has(l))continue; const nm=normSet.has(norm(l)); if(nm){normOnly++;console.log(`  NORM-ONLY (bug!): '${l}'`)} else {none++} }
console.log(`\nnorm-only mismatch (real exact-match bug): ${normOnly}`)
console.log(`genuinely no coord (needs pin): ${none}`)
console.log(`\n=== genuinely-missing locs (first 40) ===`)
for(const l of [...locs].filter(l=>!exact.has(l)&&!normSet.has(norm(l))).sort().slice(0,40))console.log(`  '${l}'`)
