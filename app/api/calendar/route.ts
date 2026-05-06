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

  const [myLeavesResult, campusLeavesResult, holidaysResult] = await Promise.all([
    service
      .from('leave_requests')
      .select('type, start_date, end_date, status')
      .eq('user_id', user.id)
      .in('status', ['approved', 'pending'])
      .gte('start_date', start)
      .lte('start_date', end),
    campusId
      ? service
          .from('leave_requests')
          .select('type, start_date, end_date, user_id')
          .eq('campus_id', campusId)
          .eq('status', 'approved')
          .gte('start_date', start)
          .lte('start_date', end)
          .neq('user_id', user.id)
      : Promise.resolve({ data: [] as { type: string; start_date: string; end_date: string; user_id: string }[] }),
    service
      .from('holidays')
      .select('date, name')
      .or(`campus_id.is.null,campus_id.eq.${campusId}`)
      .gte('date', start)
      .lte('date', end),
  ])

  // Lookup names for campus leaves
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
    users: { name: userMap[l.user_id] ?? '' },
  }))

  return NextResponse.json({
    myLeaves: myLeavesResult.data ?? [],
    campusLeaves,
    holidays: holidaysResult.data ?? [],
  })
}
