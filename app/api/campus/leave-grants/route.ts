import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  if (!me || !['campus_admin', 'hq_admin'].includes(me.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json()
  const { user_id, year, total_days, carried_over, extra_days } = body

  if (!user_id || !year) {
    return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
  }

  const { error } = await service.from('leave_grants').upsert({
    campus_id: me.campus_id,
    user_id,
    year: parseInt(year),
    total_days: parseFloat(total_days ?? 0),
    carried_over: parseFloat(carried_over ?? 0),
    extra_days: parseFloat(extra_days ?? 0),
  }, { onConflict: 'campus_id,user_id,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
