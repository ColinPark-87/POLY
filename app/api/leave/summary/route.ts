import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const year = new Date().getFullYear()

  const { data: grant } = await supabase
    .from('leave_grants')
    .select('*')
    .eq('user_id', user.id)
    .eq('year', year)
    .single()

  const { data: requests } = await supabase
    .from('leave_requests')
    .select('days_used, status, type, start_date, end_date, created_at')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: pending } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, days_used, created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const usedDays = (requests ?? []).reduce((sum, r) => sum + r.days_used, 0)
  const totalDays = grant ? grant.total_days + grant.carried_over + grant.extra_days : 0
  const remainingDays = totalDays - usedDays

  return NextResponse.json({
    year,
    totalDays,
    usedDays,
    remainingDays,
    recentApproved: requests ?? [],
    pendingRequests: pending ?? [],
  })
}
