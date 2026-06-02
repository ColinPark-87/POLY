// 정발 원장 비밀번호를 'poly7659**' 으로 리셋 (일회성)
// Usage: node scripts/reset-jeongbal-principal.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NEW_PASSWORD = 'poly7659**'

async function main() {
  // 1. 정발 캠퍼스 찾기
  const { data: campuses, error: campusErr } = await supabase
    .from('campuses')
    .select('id, name, code')
    .or('name.ilike.%정발%,code.eq.GB')

  if (campusErr) {
    console.error('캠퍼스 조회 실패:', campusErr.message)
    process.exit(1)
  }
  if (!campuses || campuses.length === 0) {
    console.error('정발 캠퍼스를 찾을 수 없습니다.')
    process.exit(1)
  }
  if (campuses.length > 1) {
    console.log('여러 캠퍼스 매치:', campuses)
  }
  const campus = campuses[0]
  console.log(`✓ 캠퍼스: ${campus.name} (${campus.code}) — ${campus.id}`)

  // 2. 해당 캠퍼스의 원장(campus_admin) 찾기
  const { data: admins, error: adminErr } = await supabase
    .from('users')
    .select('id, name, email, position, role, is_active')
    .eq('campus_id', campus.id)
    .eq('role', 'campus_admin')

  if (adminErr) {
    console.error('원장 조회 실패:', adminErr.message)
    process.exit(1)
  }
  if (!admins || admins.length === 0) {
    console.error('정발 원장(campus_admin)을 찾을 수 없습니다.')
    process.exit(1)
  }
  console.log(`✓ 원장 후보 ${admins.length}명:`)
  for (const a of admins) {
    console.log(`  - ${a.name} <${a.email}> ${a.is_active ? '' : '[비활성]'}`)
  }

  // 활성 원장 우선
  const target = admins.find(a => a.is_active) ?? admins[0]
  console.log(`\n→ 비밀번호 리셋 대상: ${target.name} <${target.email}>`)

  // 3. Supabase Auth 비밀번호 변경
  const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(target.id, {
    password: NEW_PASSWORD,
  })

  if (updErr) {
    console.error('비밀번호 변경 실패:', updErr.message)
    process.exit(1)
  }

  console.log(`\n✅ 완료 — ${target.name}님 비밀번호가 '${NEW_PASSWORD}' 으로 설정되었습니다.`)
  console.log(`   이메일: ${target.email}`)
  console.log(`   Auth user id: ${updated.user?.id}`)
}

main().catch(e => { console.error(e); process.exit(1) })
