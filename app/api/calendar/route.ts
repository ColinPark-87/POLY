import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()
  const month = searchParams.get('month')

  const start = month ? `${year}-${month.padStart(2, '0')}-01` : `${year}-01-01`
  const end = month
    ? new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10)
    : `${year}-12-31`

  const { data: profile } = await supabase
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .single()

  const { data: myLeaves } = await supabase
    .from('leave_requests')
    .select('type, start_date, end_date, status')
    .eq('user_id', user.id)
    .in('status', ['approved', 'pending'])
    .gte('start_date', start)
    .lte('end_date', end)

  const { data: campusLeaves } = await supabase
    .from('leave_requests')
    .select('type, start_date, end_date, users(name)')
    .eq('campus_id', profile?.campus_id ?? '')
    .eq('status', 'approved')
    .gte('start_date', start)
    .lte('end_date', end)
    .neq('user_id', user.id)

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, name')
    .or(`campus_id.is.null,campus_id.eq.${profile?.campus_id ?? ''}`)
    .gte('date', start)
    .lte('date', end)

  return NextResponse.json({ myLeaves, campusLeaves, holidays })
}
