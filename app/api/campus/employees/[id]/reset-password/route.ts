import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()

  // 해당 직원이 같은 캠퍼스인지 확인
  const { data: target } = await supabase.from('users').select('campus_id').eq('id', id).single()
  if (target?.campus_id !== me?.campus_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const tempPassword = Math.random().toString(36).slice(2, 10)

  const { error } = await service.auth.admin.updateUserById(id, { password: tempPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await service.from('users').update({ needs_password_change: true }).eq('id', id)

  return NextResponse.json({ ok: true, tempPassword })
}
