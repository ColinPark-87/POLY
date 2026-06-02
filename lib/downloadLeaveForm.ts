export interface LeaveFormData {
  name: string
  position: string
  email?: string
  typeLabel: string
  start_date: string
  end_date: string
  days_used: number
  reason: string | null
  created_at: string
  signature_data_url: string | null
}

// HTML 이스케이프 — 사용자 입력(이름·직위·사유 등)이 마크업으로 해석되는 것 방지(XSS).
// 일반 한글/ASCII 텍스트는 동일하게 렌더되어 정상 사용자에겐 변화 없음.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function downloadLeaveForm(data: LeaveFormData) {
  const period =
    data.start_date === data.end_date
      ? data.start_date
      : `${data.start_date} ~ ${data.end_date}`

  // 서명 data URL 은 정상적인 base64 이미지 형식만 임베드 (속성 인젝션 차단)
  const sigOk = data.signature_data_url
    && /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=\s]+$/.test(data.signature_data_url)
  const sigHtml = sigOk
    ? `<img src="${data.signature_data_url}" alt="서명" style="max-height:60px;max-width:180px;" />`
    : '<span style="color:#999;">(서명 없음)</span>'

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>연차휴가신청서 - ${escapeHtml(data.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
    font-size: 13px;
    color: #111;
    padding: 40px;
    max-width: 740px;
    margin: 0 auto;
  }
  h1 {
    text-align: center;
    font-size: 22px;
    letter-spacing: 6px;
    margin-bottom: 32px;
    padding-bottom: 10px;
    border-bottom: 2px solid #111;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 28px;
  }
  td {
    border: 1px solid #555;
    padding: 9px 13px;
    vertical-align: middle;
    line-height: 1.5;
  }
  .lbl {
    background: #f2f2f2;
    font-weight: bold;
    width: 120px;
    text-align: center;
    white-space: nowrap;
  }
  .reason-cell {
    min-height: 48px;
    vertical-align: top;
    padding-top: 10px;
  }
  .sig-row {
    display: flex;
    justify-content: flex-end;
    gap: 32px;
    margin-top: 40px;
  }
  .sig-box {
    border: 1px solid #555;
    padding: 12px 20px;
    text-align: center;
    min-width: 160px;
  }
  .sig-box p.label { font-size: 11px; color: #555; margin-bottom: 8px; }
  .sig-box p.nm { font-size: 13px; font-weight: bold; margin-top: 8px; }
  .footer {
    margin-top: 48px;
    text-align: center;
    font-size: 12px;
    color: #888;
  }
  @media print {
    body { padding: 20px; }
    button { display: none; }
  }
</style>
</head>
<body>
<h1>연 차 휴 가 신 청 서</h1>

<table>
  <tr>
    <td class="lbl">성명</td>
    <td>${escapeHtml(data.name)}</td>
    <td class="lbl">직위</td>
    <td>${escapeHtml(data.position)}</td>
  </tr>
  ${data.email ? `<tr><td class="lbl">이메일</td><td colspan="3">${escapeHtml(data.email)}</td></tr>` : ''}
  <tr>
    <td class="lbl">휴가 종류</td>
    <td colspan="3">${escapeHtml(data.typeLabel)}</td>
  </tr>
  <tr>
    <td class="lbl">휴가 기간</td>
    <td colspan="3">${period}&nbsp;&nbsp;(총 ${data.days_used}일)</td>
  </tr>
  <tr>
    <td class="lbl">신청 사유</td>
    <td colspan="3" class="reason-cell">${data.reason ? escapeHtml(data.reason) : '-'}</td>
  </tr>
  <tr>
    <td class="lbl">신청일</td>
    <td colspan="3">${data.created_at.slice(0, 10)}</td>
  </tr>
</table>

<div class="sig-row">
  <div class="sig-box">
    <p class="label">신청인 서명</p>
    ${sigHtml}
    <p class="nm">${escapeHtml(data.name)}</p>
  </div>
</div>

<p class="footer">본 신청서는 전자 서명된 연차휴가신청서입니다.</p>

<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.')
    return
  }
  w.document.write(html)
  w.document.close()
}
