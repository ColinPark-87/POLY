import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campusId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.app_metadata?.user_role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: campus },
    { count: totalEmployees },
    { count: pendingCount },
    { data: onLeaveToday },
    { data: recentRequests },
    { data: employees },
  ] = await Promise.all([
    service.from('campuses').select('id, name, code, is_active').eq('id', campusId).single(),
    service.from('users').select('*', { count: 'exact', head: true }).eq('campus_id', campusId).eq('role', 'employee').eq('is_active', true),
    service.from('leave_requests').select('*', { count: 'exact', head: true }).eq('campus_id', campusId).eq('status', 'pending'),
    service.from('leave_requests').select('user_id, users(name)').eq('campus_id', campusId).eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    service.from('leave_requests').select('id, type, start_date, end_date, days_used, status, created_at, users(name)').eq('campus_id', campusId).order('created_at', { ascending: false }).limit(10),
    service.from('users').select('id, name, position, is_active, campus_hired_at').eq('campus_id', campusId).eq('role', 'employee').order('name'),
  ])

  return NextResponse.json({
    campus,
    totalEmployees: totalEmployees ?? 0,
    pendingCount: pendingCount ?? 0,
    onLeaveTodayCount: (onLeaveToday ?? []).length,
    onLeaveTodayNames: (onLeaveToday ?? []).map((r: { users: unknown }) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users
      return (u as { name: string } | null)?.name ?? ''
    }).filter(Boolean),
    recentRequests: recentRequests ?? [],
    employees: employees ?? [],
  })
}
