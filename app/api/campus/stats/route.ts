import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .single()

  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  const [
    { count: totalEmployees },
    { count: pendingCount },
    { data: onLeaveToday },
    { data: recentRequests },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true })
      .eq('campus_id', campusId).eq('is_active', true).eq('role', 'employee'),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true })
      .eq('campus_id', campusId).eq('status', 'pending'),
    supabase.from('leave_requests')
      .select('user_id, users(name)')
      .eq('campus_id', campusId)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
    supabase.from('leave_requests')
      .select('id, type, start_date, end_date, days_used, status, created_at, users(name)')
      .eq('campus_id', campusId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return NextResponse.json({
    totalEmployees: totalEmployees ?? 0,
    pendingCount: pendingCount ?? 0,
    onLeaveTodayCount: (onLeaveToday ?? []).length,
    onLeaveTodayNames: (onLeaveToday ?? []).map((r: { users: { name: string } | null }) => r.users?.name ?? '').filter(Boolean),
    recentRequests: recentRequests ?? [],
  })
}
