import { NextResponse } from 'next/server'
import { randomBytes, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'admin@poly.local'
const ADMIN_NAME = 'admin'

// One-time admin account bootstrap. Only callable if no hq_admin exists yet.
// POST /api/auth/create-admin
export async function POST(request: Request) {
  // 부트스트랩 보호: 서버에 설정된 ADMIN_BOOTSTRAP_TOKEN 을 x-bootstrap-token 헤더로
  // 제시해야만 동작. 미설정 시 차단(fail closed) — 운영 중에는 이미 본사 관리자가 있어
  // 정상 흐름에 영향 없음. 토큰을 모르는 무인증 호출자는 hq_admin 을 생성할 수 없음.
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN ?? ''
  const provided = request.headers.get('x-bootstrap-token') ?? ''
  const tokenOk = expected.length > 0 && provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  if (!tokenOk) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  // 이미 hq_admin 이 한 명이라도 있으면 bootstrap 차단 (무인증 호출 방어)
  const { data: anyAdmin } = await service
    .from('users')
    .select('id')
    .eq('role', 'hq_admin')
    .limit(1)
    .maybeSingle()
  if (anyAdmin) {
    return NextResponse.json({ error: '이미 본사 관리자가 존재합니다.' }, { status: 403 })
  }

  // Check if admin already exists by email
  const { data: existing } = await service
    .from('users')
    .select('id, role')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, message: '이미 존재하는 계정입니다.', role: existing.role })
  }

  // CSPRNG 임시 비밀번호 — 응답에 반환되어 최초 1회만 사용
  const tempPassword = randomBytes(12).toString('base64url')

  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? '계정 생성 실패' }, { status: 500 })
  }

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

  return NextResponse.json({
    ok: true,
    message: '관리자 계정이 생성되었습니다. 즉시 비밀번호를 변경하세요.',
    email: ADMIN_EMAIL,
    tempPassword,
  })
}
