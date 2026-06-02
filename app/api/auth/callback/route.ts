import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// 이메일 링크 인증 콜백. 이 앱에서 이메일 링크는 '비밀번호 재설정' 용도뿐이므로
// 세션 수립에 성공하면 항상 /update-password 로 보낸다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()

  // 1) token_hash 방식 (이메일 템플릿이 {{ .TokenHash }} 사용) — 기기·브라우저·쿠키 무관하게 동작
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}/update-password`)
  }

  // 2) PKCE code 방식 (동일 브라우저에서 요청·열람한 경우)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}/update-password`)
  }

  return NextResponse.redirect(`${origin}/login?error=reset-link-expired`)
}
