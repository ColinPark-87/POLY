import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const { data: employees } = await supabase
    .from('users')
    .select('id, name, position, is_active')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('role', 'employee')
    .order('name')

  const { data: grants } = await supabase
    .from('leave_grants')
    .select('user_id, total_days, carried_over, extra_days')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('year', year)

  const { data: approved } = await supabase
    .from('leave_requests')
    .select('user_id, days_used, start_date')
    .eq('campus_id', me?.campus_id ?? '')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)

  const grantMap: Record<string, { total: number }> = {}
  for (const g of grants ?? []) {
    grantMap[g.user_id] = { total: g.total_days + g.carried_over + g.extra_days }
  }

  // Build monthly breakdown: index 0 = January, index 11 = December
  const monthlyMap: Record<string, number[]> = {}
  for (const r of approved ?? []) {
    if (!monthlyMap[r.user_id]) {
      monthlyMap[r.user_id] = Array(12).fill(0)
    }
    const monthIndex = new Date(r.start_date).getMonth() // 0-based
    monthlyMap[r.user_id][monthIndex] += r.days_used
  }

  const rows = (employees ?? []).map(emp => {
    const monthly = monthlyMap[emp.id] ?? Array(12).fill(0)
    const totalUsed = monthly.reduce((sum, v) => sum + v, 0)
    const total = grantMap[emp.id]?.total ?? 0
    return {
      id: emp.id,
      name: emp.name,
      position: emp.position,
      is_active: emp.is_active,
      total,
      monthly,
      totalUsed,
      remaining: total - totalUsed,
    }
  })

  return NextResponse.json({ rows, year })
}
