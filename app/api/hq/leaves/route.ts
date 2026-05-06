import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campus_id')
  const status = searchParams.get('status') ?? 'approved'
  const year = searchParams.get('year') ?? String(new Date().getFullYear())

  let query = service
    .from('leave_requests')
    .select(`
      id, type, start_date, end_date, days_used, reason,
      signature_data_url, status, created_at, campus_id,
      users!user_id(id, name, position, email),
      campuses(id, name)
    `)
    .in('status', status === 'all' ? ['approved', 'pending', 'rejected'] : [status])
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
    .order('created_at', { ascending: false })

  if (campusId) {
    query = query.eq('campus_id', campusId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ leaves: data ?? [] })
}
