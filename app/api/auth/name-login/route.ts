import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { campus_id, name, password } = await request.json()
  if (!campus_id || !name || !password) {
    return NextResponse.json({ error: '캠퍼스, 이름, 비밀번호를 입력해주세요.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: record } = await service
    .from('users')
    .select('id, email, role')
    .eq('campus_id', campus_id)
    .eq('name', name)
    .single()

  if (!record) {
    return NextResponse.json({ error: '해당 캠퍼스에 등록된 이름이 없습니다.' }, { status: 404 })
  }

  // 계정 미설정 상태: 임시 이메일(@campus.internal)
  if (record.email.endsWith('@campus.internal')) {
    return NextResponse.json({ needs_setup: true })
  }

  // 이름으로 이메일 조회 후 Supabase 로그인
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: record.email, password })
  if (error) return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })

  return NextResponse.json({ role: record.role })
}
