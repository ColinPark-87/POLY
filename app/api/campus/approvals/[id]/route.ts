import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail, leaveApprovedEmailHtml, leaveRejectedEmailHtml } from '@/lib/email'
import { LEAVE_TYPE_LABELS } from '@/lib/types'
import type { LeaveType } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { status, reviewer_note } = await request.json()
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: '유효하지 않은 상태' }, { status: 400 })
  }

  const { data: me } = await supabase
    .from('users').select('campus_id, name').eq('id', user.id).single()

  // 해당 신청 조회
  const { data: req, error: fetchErr } = await supabase
    .from('leave_requests')
    .select(`id, type, start_date, end_date, days_used, campus_id, user_id,
             users(name, email)`)
    .eq('id', id)
    .eq('campus_id', me?.campus_id ?? '')
    .single()

  if (fetchErr || !req) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })

  const service = await createServiceClient()
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
  const employee = req.users as { name: string; email: string } | null
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
