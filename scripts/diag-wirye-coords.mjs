import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
const norm=s=>(s??'').replace(/\s+/g,' ').trim()
async function g(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});if(!r.ok)throw new Error(q+' '+r.status+await r.text());return r.json()}
const c=(await g('campuses?select=id,name')).find(x=>x.name&&x.name.includes('위례'))
console.log('campus',c.name,c.id)
const coords=await g(`campus_stop_coords?select=stop_name,lat,lng&campus_id=eq.${c.id}`)
const reg=await g(`campus_registered_stops?select=stop_name,bus_name,direction,default_time&campus_id=eq.${c.id}`)
console.log(`\n=== campus_stop_coords (${coords.length}) ===`)
for(const x of coords)console.log(`  '${x.stop_name}'`)
console.log(`\n=== campus_registered_stops (${reg.length}) ===`)
for(const x of reg)console.log(`  [${x.direction}] ${x.bus_name} '${x.stop_name}' t=${x.default_time}`)
// which registered stops lack an exact coord
const coordKeys=new Set(coords.map(x=>x.stop_name))
const coordNorm=new Set(coords.map(x=>norm(x.stop_name)))
console.log(`\n=== registered stops with NO exact coord (but maybe norm-match) ===`)
for(const x of reg){ if(!coordKeys.has(x.stop_name)){ const nm=coordNorm.has(norm(x.stop_name))?'  <-- norm-MATCH exists!':''; console.log(`  [${x.direction}] ${x.bus_name} '${x.stop_name}'${nm}`)}}
