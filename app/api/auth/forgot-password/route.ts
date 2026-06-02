import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'

// 등록 이메일을 일부 가린다: hong@gmail.com → ho***@gmail.com
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

// 비밀번호 재설정: 로그인과 동일하게 "캠퍼스+이름"(직원) 또는 "이메일"(본사/원장)로 계정을 찾아
// admin.generateLink(recovery) 토큰을 만들어 Brevo 로 발송한다. (Supabase 기본 메일 미사용)
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { campus_id?: string; name?: string; email?: string }
  const campusId = (body.campus_id ?? '').trim()
  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()

  const service = createServiceClient()

  let targetEmail: string | null = null
  let userName: string | null = null

  if (email) {
    const { data: u } = await service.from('users').select('name, email').eq('email', email).maybeSingle()
    if (!u) return NextResponse.json({ error: '가입된 이메일을 찾을 수 없습니다.' }, { status: 400 })
    targetEmail = u.email; userName = u.name
  } else if (campusId && name) {
    const { data: matches } = await service.from('users').select('name, email').eq('campus_id', campusId).eq('name', name)
    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: '해당 캠퍼스에서 그 이름의 계정을 찾을 수 없습니다.' }, { status: 400 })
    }
    if (matches.length > 1) {
      return NextResponse.json({ error: '같은 이름의 계정이 여러 개 있습니다. 원장/관리자에게 비밀번호 초기화를 요청하세요.' }, { status: 400 })
    }
    targetEmail = matches[0].email; userName = matches[0].name
  } else {
    return NextResponse.json({ error: '이름 또는 이메일을 입력해주세요.' }, { status: 400 })
  }

  // 이름 로그인 계정 등 실제 메일함이 없는 경우 — 관리자 초기화로 안내
  if (!targetEmail || targetEmail.endsWith('@campus.internal')) {
    return NextResponse.json(
      { error: `${userName ?? ''}님 계정은 등록된 이메일이 없어 재설정 메일을 받을 수 없습니다. 원장/관리자에게 비밀번호 초기화를 요청하세요.` },
      { status: 400 }
    )
  }

  const origin = new URL(request.url).origin
  const { data, error } = await service.auth.admin.generateLink({ type: 'recovery', email: targetEmail })
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? '재설정 링크 생성에 실패했습니다.' }, { status: 400 })
  }

  const resetUrl = `${origin}/api/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery`
  const result = await sendEmail({
    to: [{ email: targetEmail, name: userName ?? undefined }],
    subject: '[연차관리시스템] 비밀번호 재설정 안내',
    htmlContent: passwordResetEmailHtml({ resetUrl, userName: userName ?? undefined }),
  })
  if (!result.ok) {
    return NextResponse.json({ error: '메일 발송에 실패했습니다. 관리자에게 문의하세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, name: userName, maskedEmail: maskEmail(targetEmail) })
}
