import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campusId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { name, position, annual_days } = await request.json()
  if (!name || !position) return NextResponse.json({ error: '이름과 직책은 필수입니다.' }, { status: 400 })

  // 동명이인 체크
  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('campus_id', campusId)
    .eq('name', name)
    .single()
  if (existing) return NextResponse.json({ error: `'${name}' 이름의 직원이 이미 등록되어 있습니다.` }, { status: 400 })

  // 임시 Supabase auth 계정 생성 (첫 로그인 시 실제 이메일+비밀번호로 교체됨)
  const syntheticEmail = `${crypto.randomUUID()}@campus.internal`
  const tempPassword = crypto.randomUUID()

  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: syntheticEmail,
    password: tempPassword,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const { error: userErr } = await service.from('users').insert({
    id: authData.user.id,
    campus_id: campusId,
    email: syntheticEmail,
    name,
    position,
    role: 'employee',
    is_active: true,
  })

  if (userErr) {
    await service.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: userErr.message }, { status: 400 })
  }

  // 올해 연차 부여
  const year = new Date().getFullYear()
  await service.from('leave_grants').insert({
    user_id: authData.user.id,
    campus_id: campusId,
    year,
    total_days: annual_days ?? 15,
    carried_over: 0,
    extra_days: 0,
  })

  return NextResponse.json({ ok: true })
}
