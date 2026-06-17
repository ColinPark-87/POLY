import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
// 1) auth.users 전체 수집 (id/email)
const authById=new Map(), authByEmail=new Map()
for(let page=1;page<=20;page++){
  const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000})
  if(error){console.error('listUsers',error.message);break}
  for(const u of data.users){authById.set(u.id,u); if(u.email)authByEmail.set(u.email.toLowerCase(),u)}
  if(!data.users.length||data.users.length<1000)break
}
console.log('auth.users 총:',authById.size)
const {data:campuses}=await sb.from('campuses').select('id,name')
for(const NM of ['대치','목동매그넷','목동']){
  const c=campuses.find(x=>x.name===NM); if(!c){console.log(`\n## ${NM}: 캠퍼스 없음`);continue}
  const {data:users}=await sb.from('users').select('id,name,email,role,is_active').eq('campus_id',c.id)
  console.log(`\n===== ${NM} (직원 ${users.length}) =====`)
  let mismatch=0
  for(const u of users){
    const byId=authById.get(u.id)
    const byEmail=u.email?authByEmail.get(u.email.toLowerCase()):null
    const idOK=!!byId
    const emailOK=!!byEmail
    const idEqEmailAuth = byId && byEmail && byId.id===byEmail.id
    let flag=''
    if(!idOK && emailOK){flag='⚠️ID불일치(이메일로만 auth매칭→리셋 깨짐)';mismatch++}
    else if(!idOK && !emailOK){flag='❌auth계정 없음';mismatch++}
    else if(idOK && emailOK && byId.id!==byEmail.id){flag='⚠️id와 email이 서로 다른 auth';mismatch++}
    else if(idOK && !emailOK){flag='⚠️users.email≠auth.email'}
    if(flag) console.log(`  ${u.name}/${u.email}/${u.role}${u.is_active===false?'(퇴사)':''}  ${flag}  users.id=${u.id.slice(0,8)} ${byEmail?'authByEmail='+byEmail.id.slice(0,8):''} ${byId?'confirmed='+!!byId.email_confirmed_at:''}`)
  }
  console.log(`  → 정상 ${users.length-mismatch} / 문제 ${mismatch}`)
}
