import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { email, password } = await request.json()
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호가 필요합니다.' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })

  const service = createServiceClient()

  const { data: existing } = await service.from('users').select('id').eq('email', email).maybeSingle()
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 400 })
  }

  const { error: updateErr } = await service.auth.admin.updateUserById(user.id, {
    email,
    password,
    email_confirm: true,
  })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })

  await service.from('users').update({ email }).eq('id', user.id)

  const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
  if (loginErr) return NextResponse.json({ error: loginErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
