import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.app_metadata?.user_role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? String(new Date().getFullYear())
  const month = searchParams.get('month') ?? String(new Date().getMonth() + 1).padStart(2, '0')

  const startDate = `${year}-${month}-01`
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10)

  const [{ data: leaves }, { data: holidays }] = await Promise.all([
    service
      .from('leave_requests')
      .select('id, type, start_date, end_date, days_used, status, campus_id, users(name), campuses(name)')
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate),
    service
      .from('holidays')
      .select('id, date, name, campus_id')
      .gte('date', startDate)
      .lte('date', endDate),
  ])

  return NextResponse.json({ leaves: leaves ?? [], holidays: holidays ?? [] })
}
