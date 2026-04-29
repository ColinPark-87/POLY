'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface CampusDetail {
  campus: { id: string; name: string; code: string; is_active: boolean } | null
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
  employees: {
    id: string
    name: string
    position: string
    is_active: boolean
    campus_hired_at: string | null
  }[]
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqCampusDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CampusDetail | null>(null)

  useEffect(() => {
    if (id) fetch(`/api/hq/campuses/${id}/stats`).then(r => r.json()).then(setData)
  }, [id])

  if (!data) return <Spinner />

  const campus = data.campus

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      {/* HQ 보기 모드 배너 */}
      <div className="bg-[#0F172A] text-white rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-lg">HQ</span>
        <div>
          <p className="text-sm font-semibold">HQ 관리자 보기 모드</p>
          <p className="text-xs text-[#94A3B8]">{campus?.name} — 원장 화면과 동일한 데이터를 조회 중입니다</p>
        </div>
        <Link href="/hq/campuses" className="ml-auto text-xs text-[#94A3B8] hover:text-white">← 목록으로</Link>
      </div>

      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">{campus?.name}</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: '전체 직원', value: `${data.totalEmployees}명`, color: 'text-[#1E293B]' },
          { label: '승인 대기', value: `${data.pendingCount}건`, color: 'text-[#F59E0B]' },
          { label: '오늘 휴가', value: `${data.onLeaveTodayCount}명`, color: 'text-[#7C3AED]' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-[#E2E8F0] text-center">
            <p className="text-xs text-[#64748B] mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 오늘 휴가자 */}
      {data.onLeaveTodayNames.length > 0 && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
          <h2 className="font-semibold text-[#1E293B] mb-3">오늘 휴가 중</h2>
          <div className="flex flex-wrap gap-2">
            {data.onLeaveTodayNames.map(name => (
              <span key={name} className="bg-[#F3F0FF] text-[#7C3AED] text-sm px-3 py-1.5 rounded-full font-medium">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* 최근 신청 */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
        <h2 className="font-semibold text-[#1E293B] mb-4">최근 연차 신청</h2>
        {data.recentRequests.length === 0 ? (
          <p className="text-sm text-[#64748B] text-center py-4">신청 내역이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {data.recentRequests.map(r => (
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

      {/* 직원 목록 */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
        <h2 className="font-semibold text-[#1E293B] mb-4">직원 목록 ({data.employees.length}명)</h2>
        <div className="divide-y divide-[#F1F5F9]">
          {data.employees.map(emp => (
            <div key={emp.id} className={`flex justify-between items-center py-2.5 ${!emp.is_active ? 'opacity-50' : ''}`}>
              <div>
                <p className="text-sm font-medium">{emp.name} {!emp.is_active && <span className="text-xs text-[#EF4444]">(비활성)</span>}</p>
                <p className="text-xs text-[#64748B]">{emp.position}</p>
              </div>
              <p className="text-xs text-[#94A3B8]">{emp.campus_hired_at ?? '-'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
