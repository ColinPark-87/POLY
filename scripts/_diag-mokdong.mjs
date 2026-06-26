import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

// auth.users 전체 수집
const authById=new Map(), authByEmail=new Map()
for(let page=1;page<=20;page++){const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});if(error){console.error(error.message);break}for(const u of data.users){authById.set(u.id,u);if(u.email)authByEmail.set(u.email.toLowerCase(),u)}if(!data.users.length||data.users.length<1000)break}

const {data:campuses}=await sb.from('campuses').select('id,name')
const mok=campuses.filter(c=>c.name.includes('목동'))
console.log('목동 관련 캠퍼스:', mok.map(c=>`${c.name}(${c.id.slice(0,8)})`).join(', '))
const c=campuses.find(x=>x.name==='목동')
if(!c){console.log('정확히 "목동" 캠퍼스 없음 — 위 목록에서 확인'); process.exit(0)}

const {data:users}=await sb.from('users').select('id,name,email,role,position,is_active').eq('campus_id',c.id).order('role')

console.log(`\n===== 목동 (id=${c.id}) 직원 ${users.length}명 =====`)
console.log('\n## 1) 원장/관리자급 권한 보유자 (role=campus_admin/hq_admin 또는 직책에 원장·부원장)')
for(const u of users){
  const isAdmin = u.role==='campus_admin'||u.role==='hq_admin'
  const posAdmin = (u.position||'').includes('원장')||(u.position||'').includes('부원장')
  if(isAdmin||posAdmin){
    console.log(`  ${u.name} | role=${u.role} | 직책=${u.position||'-'} | ${u.email}${u.is_active===false?' (퇴사)':''}`)
  }
}

console.log('\n## 전체 직원 목록 (참고)')
for(const u of users) console.log(`  ${u.name} | role=${u.role} | 직책=${u.position||'-'} | ${u.email}${u.is_active===false?' (퇴사)':''}`)

console.log('\n## 2) 이수빈 로그인 진단')
const targets=users.filter(u=>u.name&&u.name.includes('이수빈'))
if(!targets.length) console.log('  목동에 "이수빈" 없음')
for(const u of targets){
  const byId=authById.get(u.id)
  const byEmail=u.email?authByEmail.get(u.email.toLowerCase()):null
  console.log(`  이수빈: users.id=${u.id} email=${u.email} role=${u.role}`)
  console.log(`    auth(by id)      : ${byId?`있음 id=${byId.id} authEmail=${byId.email} confirmed=${!!byId.email_confirmed_at}`:'❌ 없음'}`)
  console.log(`    auth(by email)   : ${byEmail?`있음 id=${byEmail.id} confirmed=${!!byEmail.email_confirmed_at}`:'❌ 없음'}`)
  let diag='✅ 정상 (id=auth, 이메일 일치)'
  if(!byId && byEmail) diag='⚠️ users.id ≠ auth.id → HQ 비번변경이 엉뚱한/없는 auth로 감 → 새 비번 로그인 불가. 근본해결: users.id를 auth.id로 동기화 or auth.id를 email기준으로 재생성'
  else if(!byId && !byEmail) diag='❌ auth 계정 자체가 없음 → 로그인 불가. auth 계정 생성 필요'
  else if(byId && byEmail && byId.id!==byEmail.id) diag='⚠️ id와 email이 서로 다른 auth 계정 → 충돌'
  else if(byId && !byEmail) diag='⚠️ users.email ≠ auth.email (desync) → 로그인 이메일 불일치'
  console.log(`    진단: ${diag}`)
}
