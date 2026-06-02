import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// One-time fix: position='원장' 직원의 role을 campus_admin으로 업데이트 (본사 전용)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: requester } = await service.from('users').select('role').eq('id', user.id).single()
  if (requester?.role !== 'hq_admin') return NextResponse.json({ error: '본사 관리자 전용' }, { status: 403 })

  const { data, error } = await service
    .from('users')
    .update({ role: 'campus_admin' })
    .eq('role', 'employee')
    .eq('position', '원장')
    .select('id, name, campus_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fixed: data?.length ?? 0, users: data })
}
