import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// One-time fix: quarter type leave_requests stored as 0.3 should be 0.25 (본사 전용)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: requester } = await service.from('users').select('role').eq('id', user.id).single()
  if (requester?.role !== 'hq_admin') return NextResponse.json({ error: '본사 관리자 전용' }, { status: 403 })

  // Fix days_used = 0.3 for quarter type → 0.25
  const { data, error, count } = await service
    .from('leave_requests')
    .update({ days_used: 0.25 })
    .eq('type', 'quarter')
    .gte('days_used', 0.28)
    .lte('days_used', 0.32)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fixed: data?.length ?? count ?? 0 })
}
