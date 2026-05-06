import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const { data: employees } = await service
    .from('users')
    .select('id, name, position, is_active')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('role', 'employee')
    .order('name')

  const { data: grants } = await service
    .from('leave_grants')
    .select('user_id, total_days, carried_over, extra_days')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('year', year)

  const { data: approved } = await service
    .from('leave_requests')
    .select('user_id, days_used, type')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('end_date', `${year}-12-31`)

  const grantMap: Record<string, { total: number }> = {}
  for (const g of grants ?? []) {
    grantMap[g.user_id] = { total: g.total_days + g.carried_over + g.extra_days }
  }

  const usedMap: Record<string, number> = {}
  for (const r of approved ?? []) {
    const days = r.type === 'quarter' ? 0.25 : r.days_used
    usedMap[r.user_id] = (usedMap[r.user_id] ?? 0) + days
  }

  const rows = (employees ?? []).map(emp => ({
    id: emp.id,
    name: emp.name,
    position: emp.position,
    is_active: emp.is_active,
    total: grantMap[emp.id]?.total ?? 0,
    used: usedMap[emp.id] ?? 0,
    remaining: (grantMap[emp.id]?.total ?? 0) - (usedMap[emp.id] ?? 0),
  }))

  return NextResponse.json({ rows, year })
}
