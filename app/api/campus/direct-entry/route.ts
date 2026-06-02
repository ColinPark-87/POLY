import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calcUsedDays } from '@/lib/utils/leave-calc'
import type { LeaveType } from '@/lib/types'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }
  const { user_id, type, start_date, end_date, reason } = await request.json()

  // 반차/반반차는 단일 일자만 허용 (다일 구간 시 0.5/0.25 과소집계 방지)
  if ((type === 'half_am' || type === 'half_pm' || type === 'quarter') && start_date !== end_date) {
    return NextResponse.json({ error: '반차/반반차는 하루만 입력할 수 있습니다.' }, { status: 400 })
  }

  // 대상 사용자가 같은 캠퍼스인지 확인 (cross-campus 입력 방지)
  const { data: target } = await service.from('users').select('campus_id').eq('id', user_id).maybeSingle()
  if (!target || target.campus_id !== me.campus_id) {
    return NextResponse.json({ error: '대상 직원이 자기 캠퍼스에 속해있지 않습니다.' }, { status: 403 })
  }

  const { data: holidays } = await service
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
