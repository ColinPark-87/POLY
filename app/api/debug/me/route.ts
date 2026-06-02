import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 디버그 엔드포인트 — 본사 관리자만 접근 가능
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: requester } = await service.from('users').select('role').eq('id', user.id).maybeSingle()
  if (requester?.role !== 'hq_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // id로 조회
  const { data: byId, error: idErr } = await service
    .from('users')
    .select('id, name, role, position, campus_id, email')
    .eq('id', user.id)
    .maybeSingle()

  // email로 조회
  const { data: byEmail, error: emailErr } = await service
    .from('users')
    .select('id, name, role, position, campus_id, email')
    .eq('email', user.email ?? '')
    .maybeSingle()

  return NextResponse.json({
    auth: {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata,
    },
    byId: { data: byId, error: idErr?.message },
    byEmail: { data: byEmail, error: emailErr?.message },
  })
}
