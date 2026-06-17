import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logUsage } from '@/lib/usage-log'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return NextResponse.json({ error: error.message }, { status: 401 })

  const serviceClient = createServiceClient()

  // ID로 먼저 조회, 없으면 이메일로 대체 조회
  let { data: profile } = await serviceClient
    .from('users')
    .select('id, role, campus_id, position')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile) {
    const { data: byEmail } = await serviceClient
      .from('users')
      .select('id, role, campus_id, position')
      .eq('email', data.user.email ?? '')
      .maybeSingle()

    // 이메일로 찾은 경우 auth user ID를 users 테이블 ID로 동기화
    if (byEmail) {
      profile = byEmail
      await serviceClient.auth.admin.updateUserById(data.user.id, { email: data.user.email })
      // users 테이블 id는 PK라 변경 불가 — 대신 auth 쪽 id를 업데이트할 수 없으므로
      // 세션은 auth user id 기준이나, 이후 조회는 email 기반으로 처리
    }
  }

  console.log('[login-api] user.id:', data.user.id, 'profile:', profile)

  // 파일럿 사용현황: 로그인 성공 기록(비차단 — 실패해도 로그인 정상)
  await logUsage(serviceClient, { event_type: 'login', campusId: profile?.campus_id ?? null, userId: data.user.id, userName: data.user.email ?? null, role: profile?.role ?? 'employee' })

  return NextResponse.json({ user: data.user, role: profile?.role ?? 'employee', position: profile?.position ?? '' })
}
