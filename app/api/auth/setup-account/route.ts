import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { campus_id, name, email, password } = await request.json()
  if (!campus_id || !name || !email || !password) {
    return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
  }

  const service = createServiceClient()

  // 이름+캠퍼스로 직원 조회
  const { data: record } = await service
    .from('users')
    .select('id, email')
    .eq('campus_id', campus_id)
    .eq('name', name)
    .single()

  if (!record) {
    return NextResponse.json({ error: '등록된 직원을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 이메일 중복 확인
  const { data: emailCheck } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .single()
  if (emailCheck && emailCheck.id !== record.id) {
    return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 400 })
  }

  // Supabase auth 이메일+비밀번호 변경
  const { error: updateErr } = await service.auth.admin.updateUserById(record.id, {
    email,
    password,
    email_confirm: true,
  })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })

  // users 테이블 업데이트
  await service.from('users').update({ email }).eq('id', record.id)

  // 바로 로그인 처리
  const supabase = await createClient()
  const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
  if (loginErr) return NextResponse.json({ error: loginErr.message }, { status: 401 })

  return NextResponse.json({ ok: true, role: 'employee' })
}
