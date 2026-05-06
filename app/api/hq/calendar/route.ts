import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? String(new Date().getFullYear())
  const month = searchParams.get('month') ?? String(new Date().getMonth() + 1).padStart(2, '0')
  const campusId = searchParams.get('campus_id')

  const monthNum = parseInt(month)
  const yearNum = parseInt(year)
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
  // Last day of month: use UTC to avoid timezone offset issues
  const lastDay = new Date(Date.UTC(yearNum, monthNum, 0))
  const endDate = lastDay.toISOString().slice(0, 10)

  // Query without foreign-key joins — use a separate users lookup instead
  let leavesQuery = service
    .from('leave_requests')
    .select('id, type, start_date, end_date, days_used, status, campus_id, user_id')
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('start_date', startDate)

  let holidaysQuery = service
    .from('holidays')
    .select('id, date, name, campus_id')
    .gte('date', startDate)
    .lte('date', endDate)

  if (campusId) {
    leavesQuery = leavesQuery.eq('campus_id', campusId)
    holidaysQuery = holidaysQuery.or(`campus_id.eq.${campusId},campus_id.is.null`)
  }

  const [{ data: leavesRaw, error: leavesErr }, { data: holidays }] = await Promise.all([leavesQuery, holidaysQuery])

  if (leavesErr) {
    return NextResponse.json({ error: leavesErr.message }, { status: 500 })
  }

  // Fetch user names separately
  const userIds = [...new Set((leavesRaw ?? []).map(l => l.user_id))]
  const campusIds = [...new Set((leavesRaw ?? []).map(l => l.campus_id).filter(Boolean))]

  const [{ data: usersData }, { data: campusesData }] = await Promise.all([
    userIds.length > 0
      ? service.from('users').select('id, name').in('id', userIds)
      : Promise.resolve({ data: [] }),
    campusIds.length > 0
      ? service.from('campuses').select('id, name').in('id', campusIds)
      : Promise.resolve({ data: [] }),
  ])

  const userMap: Record<string, string> = {}
  for (const u of usersData ?? []) userMap[u.id] = u.name

  const campusMap: Record<string, string> = {}
  for (const c of campusesData ?? []) campusMap[c.id] = c.name

  const leaves = (leavesRaw ?? []).map(l => ({
    ...l,
    users: { name: userMap[l.user_id] ?? '' },
    campuses: { name: campusMap[l.campus_id] ?? '' },
  }))

  return NextResponse.json({ leaves, holidays: holidays ?? [] })
}
