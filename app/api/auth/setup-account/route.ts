import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { campus_id, name, email, password, setup_code } = await request.json()
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
    .maybeSingle()

  if (!record) {
    return NextResponse.json({ error: '등록된 직원을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 이미 실이메일이 설정된 계정은 setup-account 차단 (계정 탈취 방지)
  // 초기 셋업은 @campus.internal 더미 이메일에서만 허용
  if (!record.email || !record.email.endsWith('@campus.internal')) {
    return NextResponse.json(
      { error: '이미 초기설정된 계정입니다. 일반 로그인을 사용하거나 비밀번호 찾기를 이용하세요.' },
      { status: 409 }
    )
  }

  // 사전 계정탈취 방지(opt-in): SETUP_PIN 환경변수가 설정된 경우에만 설정코드 일치를 요구.
  // 미설정 시 기존 동작 그대로(영향 없음). 활성화하려면 Vercel 에 SETUP_PIN 을 넣고
  // 직원들에게 코드를 별도(오프라인)로 안내하면, 이름+캠퍼스만 아는 제3자의 선점 설정이 차단됨.
  const requiredPin = process.env.SETUP_PIN ?? ''
  if (requiredPin) {
    const provided = String(setup_code ?? '')
    const pinOk = provided.length === requiredPin.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(requiredPin))
    if (!pinOk) {
      return NextResponse.json({ error: '설정 코드가 올바르지 않습니다. 관리자에게 문의하세요.' }, { status: 403 })
    }
  }

  // 이메일 중복 확인 (.maybeSingle: 미존재 시 에러 없이 null → 가드 정상 동작)
  const { data: emailCheck } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
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

  const { data: updated } = await service.from('users').select('role, position').eq('id', record.id).single()
  return NextResponse.json({ ok: true, role: updated?.role ?? 'employee', position: updated?.position ?? '' })
}
