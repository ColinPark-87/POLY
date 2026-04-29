import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calcUsedDays } from '@/lib/utils/leave-calc'
import type { LeaveType } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()
  const { user_id, type, start_date, end_date, reason } = await request.json()

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .or(`campus_id.is.null,campus_id.eq.${me?.campus_id ?? ''}`)
    .gte('date', start_date)
    .lte('date', end_date)

  const holidayDates = (holidays ?? []).map((h: { date: string }) => h.date)
  const days_used = calcUsedDays(type as LeaveType, start_date, end_date, holidayDates)

  const { error } = await service.from('leave_requests').insert({
    campus_id: me?.campus_id,
    user_id,
    type,
    start_date,
    end_date,
    days_used,
    reason: reason ?? null,
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    reviewer_note: '원장 직접 입력',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
