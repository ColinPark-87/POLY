import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()
  const month = searchParams.get('month')

  const yearNum = parseInt(year)
  const monthNum = month ? parseInt(month) : null

  const start = monthNum
    ? `${year}-${String(monthNum).padStart(2, '0')}-01`
    : `${year}-01-01`
  const end = monthNum
    ? new Date(Date.UTC(yearNum, monthNum, 0)).toISOString().slice(0, 10)
    : `${year}-12-31`

  // Use service client for all DB queries to bypass RLS
  const service = createServiceClient()

  const { data: profile } = await service
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .single()

  const campusId = profile?.campus_id ?? ''

  const [campusLeavesResult, holidaysResult] = await Promise.all([
    campusId
      ? service
          .from('leave_requests')
          .select('type, start_date, end_date, user_id, status')
          .eq('campus_id', campusId)
          .in('status', ['approved', 'pending'])
          .gte('start_date', start)
          .lte('start_date', end)
      : Promise.resolve({ data: [] as { type: string; start_date: string; end_date: string; user_id: string; status: string }[] }),
    service
      .from('holidays')
      .select('date, name')
      .or(`campus_id.is.null,campus_id.eq.${campusId}`)
      .gte('date', start)
      .lte('date', end),
  ])

  // Lookup names for all campus users in this leave list
  const campusLeavesRaw = campusLeavesResult.data ?? []
  const userIds = [...new Set(campusLeavesRaw.map(l => l.user_id))]
  const { data: usersData } = userIds.length > 0
    ? await service.from('users').select('id, name').in('id', userIds)
    : { data: [] as { id: string; name: string }[] }

  const userMap: Record<string, string> = {}
  for (const u of usersData ?? []) userMap[u.id] = u.name

  const campusLeaves = campusLeavesRaw.map(l => ({
    type: l.type,
    start_date: l.start_date,
    end_date: l.end_date,
    status: l.status,
    is_mine: l.user_id === user.id,
    users: { name: userMap[l.user_id] ?? '' },
  }))

  // 월간 직원별 연차 소진 요약 (승인된 것만)
  const LEAVE_DAYS: Record<string, number> = { annual: 1, half_am: 0.5, half_pm: 0.5, quarter: 0.25, sick: 1 }
  const summaryMap: Record<string, { name: string; annual: number; half: number; quarter: number; sick: number; total: number }> = {}
  for (const l of campusLeavesRaw.filter(l => l.status === 'approved')) {
    const name = userMap[l.user_id] ?? '알 수 없음'
    if (!summaryMap[name]) summaryMap[name] = { name, annual: 0, half: 0, quarter: 0, sick: 0, total: 0 }
    if (l.type === 'annual') { summaryMap[name].annual++; summaryMap[name].total += 1 }
    else if (l.type === 'half_am' || l.type === 'half_pm') { summaryMap[name].half++; summaryMap[name].total += 0.5 }
    else if (l.type === 'quarter') { summaryMap[name].quarter++; summaryMap[name].total += 0.25 }
    else if (l.type === 'sick') { summaryMap[name].sick++; summaryMap[name].total += 1 }
  }
  const summary = Object.values(summaryMap).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  return NextResponse.json({
    campusLeaves,
    holidays: holidaysResult.data ?? [],
    summary,
  })
}
