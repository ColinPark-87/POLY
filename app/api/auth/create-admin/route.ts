import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'admin@poly.local'
const ADMIN_NAME = 'admin'

// One-time admin account creation endpoint
// POST /api/auth/create-admin
export async function POST() {
  const service = createServiceClient()

  // Check if admin already exists
  const { data: existing } = await service
    .from('users')
    .select('id, role')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, message: '이미 존재하는 계정입니다.', role: existing.role })
  }

  // Create auth user
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: 'poly7659**',
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? '계정 생성 실패' }, { status: 500 })
  }

  // Create users table entry
  const { error: userErr } = await service.from('users').insert({
    id: authData.user.id,
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    role: 'hq_admin',
    is_active: true,
  })

  if (userErr) {
    await service.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: '관리자 계정이 생성되었습니다.', email: ADMIN_EMAIL })
}
