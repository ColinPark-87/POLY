import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const COMMIT=process.argv.includes('--commit')
const authById=new Map()
for(let page=1;page<=20;page++){const {data}=await sb.auth.admin.listUsers({page,perPage:1000});for(const u of data.users)authById.set(u.id,u);if(!data.users.length||data.users.length<1000)break}
const {data:campuses}=await sb.from('campuses').select('id,name'); const campMap=Object.fromEntries(campuses.map(c=>[c.id,c.name]))
const {data:users}=await sb.from('users').select('id,name,email,role,is_active,campus_id')
const norm=s=>(s||'').trim().toLowerCase()
// 대상: 활성 + hq_admin 아님 + auth.email≠users.email + users.email이 유효(@campus.internal 아님)
const targets=users.filter(u=>u.is_active!==false && u.role!=='hq_admin' && u.email && !u.email.includes('@campus.internal') && authById.get(u.id) && norm(authById.get(u.id).email)!==norm(u.email))
console.log(`=== 이메일 동기화 대상 ${targets.length}건 ${COMMIT?'[COMMIT]':'[DRY]'} ===`)
for(const u of targets){
  const a=authById.get(u.id)
  console.log(`  [${campMap[u.campus_id]}] ${u.name}: auth ${a.email} → ${u.email}`)
  if(COMMIT){
    const {error}=await sb.auth.admin.updateUserById(u.id,{email:u.email.toLowerCase(),email_confirm:true})
    console.log(error?`    ❌ ${error.message}`:'    ✅ 동기화 완료')
  }
}
if(!COMMIT)console.log('\n(DRY — 실제 적용하려면 --commit)')
