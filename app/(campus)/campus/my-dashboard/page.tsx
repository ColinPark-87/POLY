'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEAVE_TYPE_LABELS } from '@/lib/types'
import type { LeaveType } from '@/lib/types'

interface Summary {
  year: number
  totalDays: number
  usedDays: number
  remainingDays: number
  recentApproved: { type: LeaveType; start_date: string; end_date: string; days_used: number }[]
  pendingRequests: { id: string; type: LeaveType; start_date: string; end_date: string; days_used: number }[]
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function MyDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/leave/summary').then(r => r.json()).then(setSummary)
  }, [])

  if (!summary) return <Spinner />

  const usedPercent = summary.totalDays > 0
    ? Math.round((summary.usedDays / summary.totalDays) * 100)
    : 0

  const noGrant = summary.totalDays === 0

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">나의 대시보드 (원장)</h1>
        <span className="text-xs text-[#94A3B8]">{summary.year}년</span>
      </div>

      {noGrant && (
        <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3 text-sm text-[#C2410C]">
          이 계정의 {summary.year}년 연차 부여 정보가 없습니다. 연차 잔여 관리에서 부여 일수를 설정해주세요.
        </div>
      )}

      {/* 연차 현황 카드 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: '총 연차', value: `${summary.totalDays}일`, color: 'text-[#1E293B]', bg: 'bg-[#F7F8FA]' },
          { label: '사용', value: `${summary.usedDays}일`, color: 'text-[#004EA2]', bg: 'bg-[#EAF2FB]' },
          { label: '잔여', value: `${summary.remainingDays}일`, color: summary.remainingDays < 0 ? 'text-[#EF4444]' : 'text-[#10B981]', bg: summary.remainingDays < 0 ? 'bg-[#FEF2F2]' : 'bg-[#F0FDF4]' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0] text-center`}>
            <p className="text-xs text-[#64748B] mb-1">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 사용률 바 */}
      {!noGrant && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#64748B]">{summary.year}년 연차 사용률</span>
            <span className="font-semibold text-[#1E293B]">{usedPercent}%</span>
          </div>
          <div className="h-3 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#004EA2] rounded-full transition-all duration-500"
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 연차 직접입력 바로가기 */}
      <Link
        href="/campus/direct-entry"
        className="flex items-center justify-center gap-2 w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3.5 rounded-2xl transition-colors"
      >
        <span>✏️</span>
        <span>연차 직접 입력하기</span>
      </Link>

      {/* 승인 대기 */}
      {summary.pendingRequests.length > 0 && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
          <h2 className="font-semibold text-[#1E293B] mb-3">승인 대기 중</h2>
          <div className="space-y-2">
            {summary.pendingRequests.map(r => (
              <div key={r.id} className="flex justify-between items-center py-2 border-b border-[#F1F5F9] last:border-0">
                <div>
                  <span className="text-sm font-medium">{LEAVE_TYPE_LABELS[r.type]}</span>
                  <p className="text-xs text-[#64748B]">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</p>
                </div>
                <span className="text-xs bg-[#FEF3C7] text-[#D97706] px-2.5 py-1 rounded-full font-medium shrink-0">대기중</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 승인 내역 */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
        <h2 className="font-semibold text-[#1E293B] mb-3">최근 연차 내역</h2>
        {summary.recentApproved.length === 0 ? (
          <p className="text-sm text-[#64748B] py-4 text-center">사용된 연차가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {summary.recentApproved.map((r, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-[#F1F5F9] last:border-0">
                <div>
                  <span className="text-sm font-medium">{LEAVE_TYPE_LABELS[r.type]}</span>
                  <p className="text-xs text-[#64748B]">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</p>
                </div>
                <span className="text-sm text-[#64748B] shrink-0">{r.type === 'quarter' ? 0.25 : r.days_used}일</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
