// 본사(HQ) 계정 추가 도구.
// 본사 계정 = role='hq_admin' + campus_id=null (전 캠퍼스 열람/편집, 차량 운행현황 등 HQ 뷰에서
// 캠퍼스 탭으로 광교·수지 등 아무 캠퍼스나 선택 가능).
//
// 사용:  node scripts/create-hq-account.mjs <email> <이름> [임시비밀번호]
//   비밀번호 생략 시 랜덤 생성해 출력(최초 1회용, 로그인 후 즉시 변경).
//   이미 있는 이메일이면 role만 hq_admin·campus_id=null로 승격.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'

const [email, name, pwArg] = process.argv.slice(2)
if (!email || !name) { console.error('사용법: node scripts/create-hq-account.mjs <email> <이름> [임시비밀번호]'); process.exit(1) }

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n')
  .map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// 이미 users 행 있으면 승격
const { data: existing } = await sb.from('users').select('id,role,campus_id').eq('email', email).maybeSingle()
if (existing) {
  const { error } = await sb.from('users').update({ role: 'hq_admin', campus_id: null, is_active: true }).eq('id', existing.id)
  if (error) { console.error('승격 실패:', error.message); process.exit(1) }
  console.log(`기존 계정 ${email} → 본사(hq_admin, campus_id=null)로 승격 완료. 비밀번호는 그대로.`)
  process.exit(0)
}

const password = pwArg || randomBytes(9).toString('base64url')
const { data: auth, error: authErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
if (authErr || !auth.user) { console.error('Auth 생성 실패:', authErr?.message); process.exit(1) }
const { error: uErr } = await sb.from('users').insert({ id: auth.user.id, email, name, role: 'hq_admin', campus_id: null, is_active: true })
if (uErr) { await sb.auth.admin.deleteUser(auth.user.id); console.error('users 삽입 실패:', uErr.message); process.exit(1) }
console.log(`본사 계정 생성 완료
  email: ${email}
  임시 비밀번호: ${password}   ← 로그인 후 즉시 변경
  role: hq_admin / campus_id: null`)
process.exit(0)
