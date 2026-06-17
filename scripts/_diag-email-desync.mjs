import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const authById=new Map()
for(let page=1;page<=20;page++){const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});if(error){console.error(error.message);break}for(const u of data.users)authById.set(u.id,u);if(!data.users.length||data.users.length<1000)break}
const {data:campuses}=await sb.from('campuses').select('id,name')
const campMap=Object.fromEntries(campuses.map(c=>[c.id,c.name]))
const {data:users}=await sb.from('users').select('id,name,email,role,is_active,campus_id')
const norm=s=>(s||'').trim().toLowerCase()
const desync=[], noAuth=[]
for(const u of users){
  if(u.is_active===false)continue
  const a=authById.get(u.id)
  if(!a){noAuth.push(u);continue}
  if(norm(a.email)!==norm(u.email)) desync.push({u,authEmail:a.email})
}
console.log(`활성 직원 ${users.filter(u=>u.is_active!==false).length} / auth계정 없음 ${noAuth.length} / 이메일 desync ${desync.length}\n`)
console.log('== 이메일 desync (UI/로그인용 users.email ≠ 실제 auth.email → 로그인 깨짐) ==')
for(const {u,authEmail} of desync) console.log(`  [${campMap[u.campus_id]||'?'}] ${u.name} (${u.role}) : users=${u.email}  ≠  auth=${authEmail}`)
if(noAuth.length){console.log('\n== auth 계정 없음 (로그인 불가) ==');for(const u of noAuth)console.log(`  [${campMap[u.campus_id]||'?'}] ${u.name} : ${u.email}`)}
