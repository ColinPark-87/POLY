interface SendEmailParams {
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
}

export async function sendEmail({ to, subject, htmlContent }: SendEmailParams) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set, skipping email send')
    return { ok: false, skipped: true }
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.SYSTEM_EMAIL_FROM ?? 'noreply@leave-system.com',
        name: process.env.SYSTEM_EMAIL_NAME ?? '연차관리시스템',
      },
      to,
      subject,
      htmlContent,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[email] Brevo error:', err)
    return { ok: false, error: err }
  }

  return { ok: true }
}

// ── 템플릿 함수들 ──

export function leaveRequestEmailHtml(params: {
  employeeName: string
  leaveType: string
  startDate: string
  endDate: string
  daysUsed: number
  reason: string | null
  approvalUrl: string
}) {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#4F7EF7;padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">연차 신청 알림</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">새로운 연차 신청이 접수되었습니다</p>
    </div>
    <div style="padding:32px 40px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">신청자</td><td style="padding:10px 0;font-size:14px;font-weight:600;">${params.employeeName}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${params.leaveType}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate} (${params.daysUsed}일)</td></tr>
        ${params.reason ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">사유</td><td style="padding:10px 0;font-size:14px;">${params.reason}</td></tr>` : ''}
      </table>
      <div style="margin-top:24px;">
        <a href="${params.approvalUrl}" style="display:inline-block;background:#4F7EF7;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">승인 페이지로 이동</a>
      </div>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}

export function leaveApprovedEmailHtml(params: {
  employeeName: string
  leaveType: string
  startDate: string
  endDate: string
  daysUsed: number
  reviewerNote?: string | null
}) {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#10B981;padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">✅ 연차 승인</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">연차 신청이 승인되었습니다</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#1E293B;">${params.employeeName}님, 연차가 승인되었습니다.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${params.leaveType}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate} (${params.daysUsed}일)</td></tr>
        ${params.reviewerNote ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">메모</td><td style="padding:10px 0;font-size:14px;">${params.reviewerNote}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}

export function leaveRejectedEmailHtml(params: {
  employeeName: string
  leaveType: string
  startDate: string
  endDate: string
  reviewerNote?: string | null
}) {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#EF4444;padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">❌ 연차 반려</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">연차 신청이 반려되었습니다</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#1E293B;">${params.employeeName}님, 연차 신청이 반려되었습니다.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${params.leaveType}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate}</td></tr>
        ${params.reviewerNote ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">반려 사유</td><td style="padding:10px 0;font-size:14px;color:#EF4444;">${params.reviewerNote}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}
