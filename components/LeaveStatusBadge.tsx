import type { LeaveStatus } from '@/lib/types'

const config: Record<LeaveStatus, { label: string; className: string }> = {
  pending:   { label: '대기중', className: 'bg-[#FEF3C7] text-[#D97706]' },
  approved:  { label: '승인',  className: 'bg-[#D1FAE5] text-[#059669]' },
  rejected:  { label: '반려',  className: 'bg-[#FEE2E2] text-[#DC2626]' },
  cancelled: { label: '취소',  className: 'bg-[#F1F5F9] text-[#64748B]' },
}

export default function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { label, className } = config[status]
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}
