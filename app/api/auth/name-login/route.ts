import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { campus_id, name, password } = await request.json()
  if (!campus_id || !name || !password) {
    return NextResponse.json({ error: '캠퍼스, 이름, 비밀번호를 입력해주세요.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: records } = await service
    .from('users')
    .select('id, email, role, position')
    .eq('campus_id', campus_id)
    .eq('name', name)
    .limit(2)

  if (!records || records.length === 0) {
    return NextResponse.json({ error: '해당 캠퍼스에 등록된 이름이 없습니다.' }, { status: 404 })
  }
  if (records.length > 1) {
    return NextResponse.json({ error: '동명이인이 있어 이메일 로그인을 사용해야 합니다.' }, { status: 409 })
  }
  const record = records[0]

  // 계정 미설정 상태: 임시 이메일(@campus.internal)
  if (record.email.endsWith('@campus.internal')) {
    // SETUP_PIN 설정 시에만 초기설정에 설정코드 입력 요구 (미설정 시 false → 기존 동작)
    return NextResponse.json({ needs_setup: true, setup_code_required: !!process.env.SETUP_PIN })
  }

  // 이름으로 이메일 조회 후 Supabase 로그인
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: record.email, password })
  if (error) return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })

  return NextResponse.json({ email: record.email, role: record.role, position: record.position ?? '' })
}
