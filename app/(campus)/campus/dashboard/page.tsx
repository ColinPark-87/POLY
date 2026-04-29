'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface Stats {
  totalEmployees: number
  pendingCount: number
  onLeaveTodayCount: number
  onLeaveTodayNames: string[]
  recentRequests: {
    id: string
    type: LeaveType
    start_date: string
    end_date: string
    days_used: number
    status: string
    created_at: string
    users: { name: string } | null
  }[]
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" /></div>
}

export default function CampusDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/campus/stats').then(r => r.json()).then(setStats)
  }, [])

  if (!stats) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">캠퍼스 대시보드</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: '전체 직원', value: `${stats.totalEmployees}명`, color: 'text-[#1E293B]', href: '/campus/employees' },
          { label: '승인 대기', value: `${stats.pendingCount}건`, color: 'text-[#F59E0B]', href: '/campus/approvals' },
          { label: '오늘 휴가', value: `${stats.onLeaveTodayCount}명`, color: 'text-[#7C3AED]', href: '/campus/calendar' },
        ].map(card => (
          <Link key={card.label} href={card.href} className="bg-white rounded-2xl p-3 md:p-6 shadow-sm border border-[#E2E8F0] text-center md:text-left hover:shadow-md transition-shadow">
            <p className="text-xs text-[#64748B] mb-1">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold ${card.color}`}>{card.value}</p>
          </Link>
        ))}
      </div>

      {/* 오늘 휴가자 */}
      {stats.onLeaveTodayNames.length > 0 && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
          <h2 className="font-semibold text-[#1E293B] mb-3">오늘 휴가 중</h2>
          <div className="flex flex-wrap gap-2">
            {stats.onLeaveTodayNames.map(name => (
              <span key={name} className="bg-[#F3F0FF] text-[#7C3AED] text-sm px-3 py-1.5 rounded-full font-medium">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* 승인 대기 바로가기 */}
      {stats.pendingCount > 0 && (
        <Link href="/campus/approvals" className="flex items-center justify-between bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl p-4 hover:bg-[#FDE68A] transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="font-semibold text-[#92400E]">승인 대기 중인 신청이 있습니다</p>
              <p className="text-sm text-[#B45309]">{stats.pendingCount}건의 연차 신청을 검토해주세요</p>
            </div>
          </div>
          <span className="text-[#92400E] text-xl">→</span>
        </Link>
      )}

      {/* 최근 신청 내역 */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
        <h2 className="font-semibold text-[#1E293B] mb-4">최근 신청 내역</h2>
        {stats.recentRequests.length === 0 ? (
          <p className="text-sm text-[#64748B] text-center py-4">신청 내역이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {stats.recentRequests.map(r => (
              <div key={r.id} className="flex justify-between items-center py-2 border-b border-[#F1F5F9] last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.users?.name ?? '-'} · {LEAVE_TYPE_LABELS[r.type]}</p>
                  <p className="text-xs text-[#64748B]">{r.start_date} ~ {r.end_date} ({r.days_used}일)</p>
                </div>
                <LeaveStatusBadge status={r.status as 'pending' | 'approved' | 'rejected'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
