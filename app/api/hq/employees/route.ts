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
  const campusId = searchParams.get('campus_id')

  let usersQuery = service
    .from('users')
    .select('id, name, email, position, role, is_active, campus_id')
    .order('name')

  if (campusId) usersQuery = usersQuery.eq('campus_id', campusId)

  const { data: users, error: usersError } = await usersQuery
  if (usersError) {
    console.error('[hq/employees] users query error:', usersError)
    return NextResponse.json({ employees: [], error: usersError.message }, { status: 500 })
  }

  const { data: campuses } = await service.from('campuses').select('id, name')
  const campusMap = new Map((campuses ?? []).map(c => [c.id, c.name]))

  const employees = (users ?? []).map(u => ({
    ...u,
    campuses: u.campus_id ? { name: campusMap.get(u.campus_id) ?? '알 수 없음' } : null,
  }))

  // 캠퍼스별 차량 수 (campus_buses 테이블 기준, 비차량 항목 제외)
  const { data: allBuses } = await service
    .from('campus_buses').select('campus_id, name').order('sort_order')

  // 결석, 안탐 등 실제 차량이 아닌 항목 제외
  const EXCLUDED = /결석|안탐|없음|기타|마미버스/
  const busesByCampus: Record<string, number> = {}
  for (const b of allBuses ?? []) {
    if (!b.campus_id || EXCLUDED.test(b.name)) continue
    busesByCampus[b.campus_id] = (busesByCampus[b.campus_id] ?? 0) + 1
  }
  const totalBuses = Object.values(busesByCampus).reduce((s, n) => s + n, 0)

  return NextResponse.json({ employees, totalBuses, busesByCampus })
}
