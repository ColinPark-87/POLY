import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campusId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const [{ data: employees }, { data: grants }, { data: approved }] = await Promise.all([
    service
      .from('users')
      .select('id, name, position, role, is_active, campus_hired_at, company_hired_at')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .order('name'),
    service
      .from('leave_grants')
      .select('user_id, total_days, carried_over, extra_days')
      .eq('campus_id', campusId)
      .eq('year', year),
    service
      .from('leave_requests')
      .select('user_id, days_used, start_date, type')
      .eq('campus_id', campusId)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`),
  ])

  const grantMap: Record<string, { total: number; base: number; carried: number; extra: number }> = {}
  for (const g of grants ?? []) {
    grantMap[g.user_id] = {
      total: g.total_days + g.carried_over + g.extra_days,
      base: g.total_days,
      carried: g.carried_over,
      extra: g.extra_days,
    }
  }

  const usedMap: Record<string, number> = {}
  for (const r of approved ?? []) {
    const days = r.type === 'quarter' ? 0.25 : r.days_used
    usedMap[r.user_id] = (usedMap[r.user_id] ?? 0) + days
  }

  const rows = (employees ?? []).map(emp => {
    const grant = grantMap[emp.id] ?? { total: 0, base: 0, carried: 0, extra: 0 }
    const totalUsed = usedMap[emp.id] ?? 0
    return {
      id: emp.id,
      name: emp.name,
      position: emp.position || (emp.role === 'campus_admin' ? '원장' : '기타'),
      campus_hired_at: emp.campus_hired_at,
      company_hired_at: emp.company_hired_at,
      baseDays: grant.base,
      carriedOver: grant.carried,
      extraDays: grant.extra,
      total: grant.total,
      totalUsed,
      remaining: grant.total - totalUsed,
    }
  })

  return NextResponse.json({ rows, year })
}
