import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail, leaveApprovedEmailHtml, leaveRejectedEmailHtml } from '@/lib/email'
import { LEAVE_TYPE_LABELS } from '@/lib/types'
import type { LeaveType } from '@/lib/types'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { status, reviewer_note } = await request.json()
  if (!['approved', 'rejected', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: '유효하지 않은 상태' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: me } = await service
    .from('users').select('campus_id, name, role, position').eq('id', user.id).single()

  // 승인/반려/취소는 캠퍼스 관리자(원장/부원장/본사)만 가능
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  // 해당 신청 조회
  const { data: req, error: fetchErr } = await service
    .from('leave_requests')
    .select(`id, type, start_date, end_date, days_used, campus_id, user_id,
             users!user_id(name, email)`)
    .eq('id', id)
    .eq('campus_id', me?.campus_id ?? '')
    .single()

  if (fetchErr || !req) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })

  const { error: updateErr } = await service
    .from('leave_requests')
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_note: reviewer_note ?? null,
    })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })

  // 이메일 발송
  const usersRaw = req.users as unknown
  const employee: { name: string; email: string } | null = Array.isArray(usersRaw)
    ? (usersRaw[0] ?? null)
    : (usersRaw as { name: string; email: string } | null)
  if (employee?.email) {
    if (status === 'approved') {
      await sendEmail({
        to: [{ email: employee.email, name: employee.name }],
        subject: `[연차 승인] ${LEAVE_TYPE_LABELS[req.type as LeaveType]} 신청이 승인되었습니다`,
        htmlContent: leaveApprovedEmailHtml({
          employeeName: employee.name,
          leaveType: LEAVE_TYPE_LABELS[req.type as LeaveType],
          startDate: req.start_date,
          endDate: req.end_date,
          daysUsed: req.days_used,
          reviewerNote: reviewer_note,
        }),
      })
    } else {
      await sendEmail({
        to: [{ email: employee.email, name: employee.name }],
        subject: `[연차 반려] ${LEAVE_TYPE_LABELS[req.type as LeaveType]} 신청이 반려되었습니다`,
        htmlContent: leaveRejectedEmailHtml({
          employeeName: employee.name,
          leaveType: LEAVE_TYPE_LABELS[req.type as LeaveType],
          startDate: req.start_date,
          endDate: req.end_date,
          reviewerNote: reviewer_note,
        }),
      })
    }
  }

  return NextResponse.json({ ok: true })
}
