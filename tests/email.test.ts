import { describe, it, expect } from 'vitest'
import {
  leaveRequestEmailHtml,
  leaveApprovedEmailHtml,
  leaveRejectedEmailHtml,
} from '@/lib/email'

describe('email templates', () => {
  it('leaveRequestEmailHtml includes employee name and reason', () => {
    const html = leaveRequestEmailHtml({
      employeeName: '홍길동',
      leaveType: '연차',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      daysUsed: 3,
      reason: '여행',
      approvalUrl: 'https://example.com/approvals',
    })
    expect(html).toContain('홍길동')
    expect(html).toContain('여행')
    expect(html).toContain('연차 신청 알림')
    expect(html).toContain('https://example.com/approvals')
  })

  it('leaveRequestEmailHtml omits reason row when null', () => {
    const html = leaveRequestEmailHtml({
      employeeName: '홍길동',
      leaveType: '연차',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      daysUsed: 1,
      reason: null,
      approvalUrl: 'https://example.com/approvals',
    })
    expect(html).not.toContain('사유')
  })

  it('leaveApprovedEmailHtml includes approval message', () => {
    const html = leaveApprovedEmailHtml({
      employeeName: '김철수',
      leaveType: '반차(오전)',
      startDate: '2026-05-02',
      endDate: '2026-05-02',
      daysUsed: 0.5,
      reviewerNote: '수고하세요',
    })
    expect(html).toContain('김철수')
    expect(html).toContain('승인')
    expect(html).toContain('수고하세요')
  })

  it('leaveRejectedEmailHtml includes rejection message', () => {
    const html = leaveRejectedEmailHtml({
      employeeName: '이영희',
      leaveType: '연차',
      startDate: '2026-05-05',
      endDate: '2026-05-07',
      reviewerNote: '업무 공백 불가',
    })
    expect(html).toContain('이영희')
    expect(html).toContain('반려')
    expect(html).toContain('업무 공백 불가')
  })
})
