import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcUsedDays } from '@/lib/utils/leave-calc'
import type { LeaveType } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { type, start_date, end_date, reason, signature_data_url } = body

  if (!signature_data_url) {
    return NextResponse.json({ error: '서명이 필요합니다.' }, { status: 400 })
  }

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .or(`campus_id.is.null,campus_id.eq.${user.app_metadata?.campus_id ?? '00000000-0000-0000-0000-000000000000'}`)
    .gte('date', start_date)
    .lte('date', end_date)

  const holidayDates = (holidays ?? []).map((h: { date: string }) => h.date)
  const days_used = calcUsedDays(type as LeaveType, start_date, end_date, holidayDates)

  const year = new Date(start_date).getFullYear()
  const { data: grant } = await supabase
    .from('leave_grants')
    .select('total_days, carried_over, extra_days')
    .eq('user_id', user.id)
    .eq('year', year)
    .single()

  if (!grant) {
    return NextResponse.json({ error: `${year}년 연차 부여 정보가 없습니다.` }, { status: 400 })
  }

  const { data: approved } = await supabase
    .from('leave_requests')
    .select('days_used')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)

  const usedSoFar = (approved ?? []).reduce((s: number, r: { days_used: number }) => s + r.days_used, 0)
  const totalDays = grant.total_days + grant.carried_over + grant.extra_days

  if (usedSoFar + days_used > totalDays) {
    return NextResponse.json({
      error: `잔여 연차가 부족합니다. (잔여: ${totalDays - usedSoFar}일)`
    }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .single()

  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      campus_id: profile!.campus_id,
      user_id: user.id,
      type,
      start_date,
      end_date,
      days_used,
      reason,
      signature_data_url,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ request: data })
}
