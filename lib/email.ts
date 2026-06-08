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

// 메일 HTML 템플릿에 들어가는 자유입력(이름·사유·검토메모 등)은 이스케이프해 HTML 인젝션을 막는다.
const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string))

// ── 템플릿 함수들 ──

export function passwordResetEmailHtml(params: { resetUrl: string; userName?: string }) {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#004EA2;padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">비밀번호 재설정</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">아래 버튼을 눌러 새 비밀번호를 설정하세요</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="font-size:15px;color:#1E293B;margin:0 0 20px;">${params.userName ? `${escHtml(params.userName)}님, ` : ''}비밀번호 재설정 요청이 접수되었습니다.</p>
      <div>
        <a href="${params.resetUrl}" style="display:inline-block;background:#004EA2;color:#fff;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:600;font-size:14px;">새 비밀번호 설정하기</a>
      </div>
      <p style="font-size:12px;color:#94A3B8;margin:24px 0 0;line-height:1.6;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣으세요:<br><span style="color:#64748B;word-break:break-all;">${params.resetUrl}</span></p>
      <p style="font-size:12px;color:#94A3B8;margin:16px 0 0;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}

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
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">신청자</td><td style="padding:10px 0;font-size:14px;font-weight:600;">${escHtml(params.employeeName)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.leaveType)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate} (${params.daysUsed}일)</td></tr>
        ${params.reason ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">사유</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.reason)}</td></tr>` : ''}
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
      <p style="font-size:15px;color:#1E293B;">${escHtml(params.employeeName)}님, 연차가 승인되었습니다.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.leaveType)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate} (${params.daysUsed}일)</td></tr>
        ${params.reviewerNote ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">메모</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.reviewerNote)}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}

export function leaveCancelEmailHtml(params: {
  employeeName: string
  leaveType: string
  startDate: string
  endDate: string
  daysUsed: number
  previousStatus: string
}) {
  const statusLabel = params.previousStatus === 'approved' ? '(이미 승인된 건)' : ''
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#F59E0B;padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">연차 신청 취소 알림</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">${escHtml(params.employeeName)}님이 연차 신청을 취소했습니다 ${statusLabel}</p>
    </div>
    <div style="padding:32px 40px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">신청자</td><td style="padding:10px 0;font-size:14px;font-weight:600;">${escHtml(params.employeeName)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.leaveType)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate} (${params.daysUsed}일)</td></tr>
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
      <p style="font-size:15px;color:#1E293B;">${escHtml(params.employeeName)}님, 연차 신청이 반려되었습니다.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;width:100px;">휴무 종류</td><td style="padding:10px 0;font-size:14px;">${escHtml(params.leaveType)}</td></tr>
        <tr><td style="padding:10px 0;color:#64748B;font-size:14px;">기간</td><td style="padding:10px 0;font-size:14px;">${params.startDate} ~ ${params.endDate}</td></tr>
        ${params.reviewerNote ? `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">반려 사유</td><td style="padding:10px 0;font-size:14px;color:#EF4444;">${escHtml(params.reviewerNote)}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:12px;color:#94A3B8;">연차 관리 시스템 자동 발송 메일입니다.</p>
    </div>
  </div>
</body>
</html>`
}
