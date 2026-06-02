import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'

  const service = createServiceClient()
  const { data: me } = await service
    .from('users').select('campus_id, role, position').eq('id', user.id).single()

  if (!me?.campus_id) {
    return NextResponse.json({ error: '캠퍼스 정보가 없습니다.', requests: [] }, { status: 400 })
  }
  if (!isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.', requests: [] }, { status: 403 })
  }

  const { data, error } = await service
    .from('leave_requests')
    .select(`
      id, type, start_date, end_date, days_used, reason,
      signature_data_url, status, created_at,
      users!user_id(id, name, email, position)
    `)
    .eq('campus_id', me.campus_id)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message, requests: [] }, { status: 400 })

  return NextResponse.json({ requests: data ?? [] })
}
