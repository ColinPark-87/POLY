import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()

  const showAll = request.nextUrl.searchParams.get('all') === 'true'

  let query = service
    .from('users')
    .select('id, name, email, position, role, is_active, company_hired_at, campus_hired_at, terminated_at, created_at, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics, perm_enroll_edit')
    .eq('campus_id', me?.campus_id ?? '')
    .order('created_at', { ascending: true })

  if (!showAll) query = query.eq('is_active', true)

  const { data } = await query

  return NextResponse.json({ employees: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }
  const myCampusId = me.campus_id ?? null

  const body = await request.json()
  const rawEmail = typeof body.email === 'string' ? body.email : ''
  const email = rawEmail.trim().toLowerCase()
  const { name, position, company_hired_at, campus_hired_at } = body

  if (!email || !name) return NextResponse.json({ error: '이메일과 이름은 필수입니다.' }, { status: 400 })

  // 1) 동일 이메일 프로필 사전 진단 — 사용자에게 의미있는 안내 제공
  const { data: existingProfiles } = await service
    .from('users')
    .select('id, name, campus_id, is_active')
    .ilike('email', email)
    .limit(5)

  const existing = (existingProfiles ?? [])[0]
  if (existing) {
    if (existing.campus_id === myCampusId) {
      if (existing.is_active) {
        return NextResponse.json(
          { error: `이미 등록된 직원입니다 (${existing.name}).` },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: `퇴사 처리된 직원입니다 (${existing.name}). 퇴사자 목록에서 '복구'를 사용하세요.` },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: '이 이메일은 다른 캠퍼스 직원으로 등록되어 있습니다. 본사에 문의하세요.' },
      { status: 400 }
    )
  }

  // 임시 비밀번호 생성 (CSPRNG 기반, 12자리 base64url)
  const tempPassword = randomBytes(9).toString('base64url')

  // 2) Supabase Auth 계정 생성 — 프로필은 없는데 auth.users에만 남은 고아 레코드는 자동 정리 후 재시도
  let { data: authData, error: authErr } = await service.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) {
    const msg = (authErr.message ?? '').toLowerCase()
    const isCollision = msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate')
    if (isCollision) {
      let orphanId: string | null = null
      for (let page = 1; page <= 10 && !orphanId; page++) {
        const { data: list } = await service.auth.admin.listUsers({ page, perPage: 1000 })
        const match = list?.users?.find(u => (u.email ?? '').toLowerCase() === email)
        if (match) orphanId = match.id
        if (!list?.users?.length || list.users.length < 1000) break
      }
      if (orphanId) {
        await service.auth.admin.deleteUser(orphanId)
        const retry = await service.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        })
        authData = retry.data
        authErr = retry.error
      }
    }
  }

  if (authErr || !authData?.user) {
    return NextResponse.json({ error: authErr?.message ?? '계정 생성 실패' }, { status: 400 })
  }

  // 3) users 테이블에 프로필 생성 — 실패 시 방금 만든 auth 계정 롤백
  const { error: profileErr } = await service.from('users').insert({
    id: authData.user.id,
    campus_id: myCampusId,
    email,
    name,
    position: position ?? '',
    role: 'employee',
    company_hired_at: company_hired_at ?? null,
    campus_hired_at: campus_hired_at ?? null,
    is_active: true,
  })

  if (profileErr) {
    await service.auth.admin.deleteUser(authData.user.id).catch(() => {})
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, tempPassword })
}
