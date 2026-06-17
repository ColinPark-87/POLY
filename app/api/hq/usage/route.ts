import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { aggregateUsage, type UsageRow } from '@/lib/usage-log'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const sp = new URL(request.url).searchParams
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const from = sp.get('from') || new Date(Date.now() + 9 * 3600 * 1000 - 6 * 86400000).toISOString().slice(0, 10)
  const to = sp.get('to') || today
  const fromIso = new Date(`${from}T00:00:00+09:00`).toISOString()
  const toIso = new Date(`${to}T23:59:59+09:00`).toISOString()

  const rows: UsageRow[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await service.from('usage_logs')
      .select('event_type, area, campus_id, user_id, user_name, role, created_at')
      .gte('created_at', fromIso).lte('created_at', toIso)
      .order('created_at').range(f, f + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as UsageRow[]))
    if (!data || data.length < 1000) break
  }
  const { data: campuses } = await service.from('campuses').select('id, name')
  const campusMap: Record<string, string> = {}
  for (const c of campuses ?? []) campusMap[c.id] = c.name
  return NextResponse.json({ from, to, ...aggregateUsage(rows, campusMap) })
}
