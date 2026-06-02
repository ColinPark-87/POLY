import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!profile || !isCampusAdminLike(profile.role ?? '', profile.position ?? '')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const campusId = profile.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const [
    { data: employees },
    { data: grants },
    { data: approvedLeave },
    { data: pendingRequests },
  ] = await Promise.all([
    service.from('users').select('id, position, role, is_active').eq('campus_id', campusId).eq('is_active', true),
    service.from('leave_grants').select('user_id, total_days, carried_over, extra_days').eq('campus_id', campusId).eq('year', year),
    service.from('leave_requests').select('user_id, type, days_used').eq('campus_id', campusId).eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
    service.from('leave_requests').select('id, type, start_date, end_date, days_used, reason, signature_data_url, created_at, users!user_id(name, position)').eq('campus_id', campusId).eq('status', 'pending').order('created_at', { ascending: true }),
  ])

  const totalEmployees = (employees ?? []).filter(e => e.role === 'employee').length
  const pendingCount = (pendingRequests ?? []).length

  const grantByUser: Record<string, number> = {}
  for (const g of grants ?? []) {
    grantByUser[g.user_id] = g.total_days + g.carried_over + g.extra_days
  }

  const usedByUser: Record<string, number> = {}
  for (const r of approvedLeave ?? []) {
    const days = r.type === 'quarter' ? 0.25 : r.days_used
    usedByUser[r.user_id] = (usedByUser[r.user_id] ?? 0) + days
  }

  // Group by position (dept)
  const deptMap: Record<string, { count: number; grantedDays: number; usedDays: number }> = {}
  for (const emp of employees ?? []) {
    const dept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (!deptMap[dept]) deptMap[dept] = { count: 0, grantedDays: 0, usedDays: 0 }
    deptMap[dept].count++
    deptMap[dept].grantedDays += grantByUser[emp.id] ?? 0
    deptMap[dept].usedDays += usedByUser[emp.id] ?? 0
  }

  const deptStats = Object.entries(deptMap).map(([dept, stats]) => ({ dept, ...stats }))

  return NextResponse.json({ year, totalEmployees, pendingCount, deptStats, pendingRequests: pendingRequests ?? [] })
}
