import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()

  const showAll = request.nextUrl.searchParams.get('all') === 'true'

  let query = service
    .from('users')
    .select('id, name, email, position, role, is_active, company_hired_at, campus_hired_at, terminated_at, created_at')
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

  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()

  const body = await request.json()
  const { email, name, position, company_hired_at, campus_hired_at } = body

  if (!email || !name) return NextResponse.json({ error: '이메일과 이름은 필수입니다.' }, { status: 400 })

  // 임시 비밀번호 생성 (8자리 랜덤)
  const tempPassword = Math.random().toString(36).slice(2, 10)

  // Supabase Auth 계정 생성
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // users 테이블에 프로필 생성
  const { error: profileErr } = await service.from('users').insert({
    id: authData.user.id,
    campus_id: me?.campus_id,
    email,
    name,
    position: position ?? '',
    role: 'employee',
    company_hired_at: company_hired_at ?? null,
    campus_hired_at: campus_hired_at ?? null,
    is_active: true,
  })

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, tempPassword })
}
