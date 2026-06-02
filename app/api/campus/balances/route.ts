import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  // ── 월별 상세 내역 조회 ──────────────────────────────────────
  if (searchParams.get('detail') === '1') {
    const userId = searchParams.get('user_id')
    const month = parseInt(searchParams.get('month') ?? '1') // 1~12
    if (!userId) return NextResponse.json({ error: 'user_id 필요' }, { status: 400 })
    const mm = String(month).padStart(2, '0')
    const start = `${year}-${mm}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
    const { data: records } = await service
      .from('leave_requests')
      .select('id,type,status,start_date,end_date,days_used,reason,created_at')
      .eq('campus_id', me.campus_id ?? '')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .gte('start_date', start).lte('start_date', end)
      .order('start_date', { ascending: true })
    return NextResponse.json({ records: records ?? [] })
  }

  const { data: employees } = await service
    .from('users')
    .select('id, name, position, role, is_active, campus_hired_at, company_hired_at')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('is_active', true)
    .order('name')

  const { data: grants } = await service
    .from('leave_grants')
    .select('user_id, total_days, carried_over, extra_days')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('year', year)

  const { data: approved } = await service
    .from('leave_requests')
    .select('user_id, days_used, start_date, type')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)

  const grantMap: Record<string, { total: number; base: number; carried: number; extra: number }> = {}
  for (const g of grants ?? []) {
    grantMap[g.user_id] = {
      total: g.total_days + g.carried_over + g.extra_days,
      base: g.total_days,
      carried: g.carried_over,
      extra: g.extra_days,
    }
  }

  const monthlyMap: Record<string, number[]> = {}
  const typeMap: Record<string, { annualDays: number; halfDays: number; quarterDays: number }> = {}

  for (const r of approved ?? []) {
    if (!monthlyMap[r.user_id]) monthlyMap[r.user_id] = Array(12).fill(0)
    if (!typeMap[r.user_id]) typeMap[r.user_id] = { annualDays: 0, halfDays: 0, quarterDays: 0 }

    const days = r.type === 'quarter' ? 0.25 : r.days_used
    const monthIndex = new Date(r.start_date).getMonth()
    monthlyMap[r.user_id][monthIndex] += days

    if (r.type === 'quarter') typeMap[r.user_id].quarterDays += days
    else if (r.type === 'half_am' || r.type === 'half_pm') typeMap[r.user_id].halfDays += days
    else typeMap[r.user_id].annualDays += days
  }

  const rows = (employees ?? []).map(emp => {
    const monthly = monthlyMap[emp.id] ?? Array(12).fill(0)
    const totalUsed = monthly.reduce((sum, v) => sum + v, 0)
    const grant = grantMap[emp.id] ?? { total: 0, base: 0, carried: 0, extra: 0 }
    const types = typeMap[emp.id] ?? { annualDays: 0, halfDays: 0, quarterDays: 0 }
    return {
      id: emp.id,
      name: emp.name,
      position: emp.position || (emp.role === 'campus_admin' ? '원장' : '기타'),
      role: emp.role,
      is_active: emp.is_active,
      campus_hired_at: emp.campus_hired_at,
      company_hired_at: emp.company_hired_at,
      baseDays: grant.base,
      carriedOver: grant.carried,
      extraDays: grant.extra,
      total: grant.total,
      monthly,
      annualDays: types.annualDays,
      halfDays: types.halfDays,
      quarterDays: types.quarterDays,
      totalUsed,
      remaining: grant.total - totalUsed,
    }
  })

  return NextResponse.json({ rows, year })
}
