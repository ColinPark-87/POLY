import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.app_metadata?.user_role
  if (role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: campuses },
    { count: totalEmployees },
    { count: pendingTotal },
    { data: onLeaveToday },
  ] = await Promise.all([
    service.from('campuses').select('id, name, code, is_active').order('name'),
    service.from('users').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('is_active', true),
    service.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('leave_requests')
      .select('campus_id')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
  ])

  const { data: pendingByCampus } = await service
    .from('leave_requests')
    .select('campus_id')
    .eq('status', 'pending')

  const pendingMap: Record<string, number> = {}
  for (const r of pendingByCampus ?? []) {
    pendingMap[r.campus_id] = (pendingMap[r.campus_id] ?? 0) + 1
  }

  const onLeaveMap: Record<string, number> = {}
  for (const r of onLeaveToday ?? []) {
    onLeaveMap[r.campus_id] = (onLeaveMap[r.campus_id] ?? 0) + 1
  }

  const campusSummaries = (campuses ?? []).map(c => ({
    id: c.id,
    name: c.name,
    code: c.code,
    is_active: c.is_active,
    pending: pendingMap[c.id] ?? 0,
    onLeaveToday: onLeaveMap[c.id] ?? 0,
  }))

  return NextResponse.json({
    totalCampuses: (campuses ?? []).length,
    activeCampuses: (campuses ?? []).filter(c => c.is_active).length,
    totalEmployees: totalEmployees ?? 0,
    pendingTotal: pendingTotal ?? 0,
    campusSummaries,
  })
}
