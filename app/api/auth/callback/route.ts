import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // 해당 앱에서는 이메일 링크를 통한 인증이 '비밀번호 재설정' 밖에 없으므로,
      // 코드를 세션으로 교환한 후 무조건 /update-password 로 리다이렉트합니다.
      return NextResponse.redirect(`${origin}/update-password`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/?error=auth-callback-failed`)
}
