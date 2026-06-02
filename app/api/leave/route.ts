import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calcUsedDays } from '@/lib/utils/leave-calc'
import type { LeaveType } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')

  let query = supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (yearParam) {
    query = query
      .gte('start_date', `${yearParam}-01-01`)
      .lte('start_date', `${yearParam}-12-31`)
  }

  const { data: requests } = await query

  // Fetch reviewer names
  const reviewerIds = [...new Set((requests ?? []).map(r => r.reviewed_by).filter(Boolean))]
  let reviewerMap: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const { data: reviewers } = await supabase.from('users').select('id, name').in('id', reviewerIds)
    reviewerMap = Object.fromEntries((reviewers ?? []).map(r => [r.id, r.name]))
  }

  const result = (requests ?? []).map(r => ({
    ...r,
    reviewer_name: r.reviewed_by ? (reviewerMap[r.reviewed_by] ?? null) : null,
  }))

  return NextResponse.json({ requests: result })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: userProfile } = await service.from('users').select('campus_id, name').eq('id', user.id).single()

  const body = await request.json()
  const { type, start_date, end_date, reason, signature_data_url } = body

  if (!signature_data_url) {
    return NextResponse.json({ error: '서명이 필요합니다.' }, { status: 400 })
  }

  // 반차/반반차는 단일 일자만 허용 (다일 구간 신청 시 0.5/0.25로 과소집계되는 문제 방지)
  if ((type === 'half_am' || type === 'half_pm' || type === 'quarter') && start_date !== end_date) {
    return NextResponse.json({ error: '반차/반반차는 하루만 신청할 수 있습니다.' }, { status: 400 })
  }

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .or(`campus_id.is.null,campus_id.eq.${userProfile?.campus_id ?? '00000000-0000-0000-0000-000000000000'}`)
    .gte('date', start_date)
    .lte('date', end_date)

  const holidayDates = (holidays ?? []).map((h: { date: string }) => h.date)
  const days_used = calcUsedDays(type as LeaveType, start_date, end_date, holidayDates)

  // 병가·경조사·기타는 연차 잔여 체크 불필요
  const requiresGrantCheck = type === 'annual' || type === 'half_am' || type === 'half_pm' || type === 'quarter'

  if (requiresGrantCheck) {
    const year = new Date(start_date).getFullYear()
    const { data: grant } = await service
      .from('leave_grants')
      .select('total_days, carried_over, extra_days')
      .eq('user_id', user.id)
      .eq('year', year)
      .single()

    if (grant) {
      const { data: approved } = await service
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
    }
    // grant가 없으면 원장 승인 시 처리 — 신청은 허용
  }

  if (!userProfile?.campus_id) {
    return NextResponse.json({ error: '캠퍼스 정보가 없습니다. 관리자에게 문의하세요.' }, { status: 400 })
  }

  const { data, error } = await service
    .from('leave_requests')
    .insert({
      campus_id: userProfile.campus_id,
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

  // 원장 이메일 조회 후 발송
  const { data: campusAdmin } = await service
    .from('users')
    .select('email, name')
    .eq('campus_id', userProfile.campus_id)
    .eq('role', 'campus_admin')
    .eq('is_active', true)
    .single()

  if (campusAdmin?.email) {
    const { leaveRequestEmailHtml, sendEmail } = await import('@/lib/email')
    const { LEAVE_TYPE_LABELS } = await import('@/lib/types')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await sendEmail({
      to: [{ email: campusAdmin.email, name: campusAdmin.name }],
      subject: `[연차 신청] ${userProfile.name}님의 연차 신청`,
      htmlContent: leaveRequestEmailHtml({
        employeeName: userProfile.name ?? '',
        leaveType: LEAVE_TYPE_LABELS[type as LeaveType],
        startDate: start_date,
        endDate: end_date,
        daysUsed: days_used,
        reason: reason ?? null,
        approvalUrl: `${baseUrl}/campus/approvals`,
      }),
    })
  }

  return NextResponse.json({ request: data })
}
