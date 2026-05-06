import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  // 본인 신청인지 확인 + 상태 확인
  const { data: req } = await service
    .from('leave_requests')
    .select('id, status, user_id, type, start_date, end_date, days_used, campus_id, users!user_id(name), campuses(name)')
    .eq('id', id)
    .single()

  if (!req) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })
  if (req.user_id !== user.id) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  if (!['pending', 'approved'].includes(req.status)) {
    return NextResponse.json({ error: '취소할 수 없는 상태입니다.' }, { status: 400 })
  }

  const { error } = await service
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 원장에게 취소 이메일 발송
  const { data: campusAdmin } = await service
    .from('users')
    .select('email, name')
    .eq('campus_id', req.campus_id)
    .eq('role', 'campus_admin')
    .eq('is_active', true)
    .single()

  if (campusAdmin?.email) {
    const { leaveCancelEmailHtml, sendEmail } = await import('@/lib/email')
    const { LEAVE_TYPE_LABELS } = await import('@/lib/types')
    const userName = Array.isArray(req.users) ? req.users[0]?.name : (req.users as { name: string } | null)?.name
    await sendEmail({
      to: [{ email: campusAdmin.email, name: campusAdmin.name }],
      subject: `[연차 취소] ${userName ?? ''}님의 연차 신청이 취소되었습니다`,
      htmlContent: leaveCancelEmailHtml({
        employeeName: userName ?? '',
        leaveType: LEAVE_TYPE_LABELS[req.type as keyof typeof LEAVE_TYPE_LABELS],
        startDate: req.start_date,
        endDate: req.end_date,
        daysUsed: req.days_used,
        previousStatus: req.status,
      }),
    })
  }

  return NextResponse.json({ ok: true })
}
