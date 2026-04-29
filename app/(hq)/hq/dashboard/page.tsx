'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CampusSummary {
  id: string
  name: string
  code: string
  is_active: boolean
  pending: number
  onLeaveToday: number
}

interface Stats {
  totalCampuses: number
  activeCampuses: number
  totalEmployees: number
  pendingTotal: number
  campusSummaries: CampusSummary[]
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/hq/stats').then(r => r.json()).then(setStats)
  }, [])

  if (!stats) return <Spinner />

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">HQ 통합 대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {[
          { label: '전체 캠퍼스', value: `${stats.activeCampuses}/${stats.totalCampuses}`, sub: '활성/전체', color: 'text-[#1E293B]' },
          { label: '전체 직원', value: `${stats.totalEmployees}명`, sub: '활성 직원', color: 'text-[#1E293B]' },
          { label: '전체 승인 대기', value: `${stats.pendingTotal}건`, sub: '전체 캠퍼스', color: 'text-[#F59E0B]' },
          { label: '오늘 휴가', value: `${stats.campusSummaries.reduce((s, c) => s + c.onLeaveToday, 0)}명`, sub: '전체 캠퍼스', color: 'text-[#7C3AED]' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-[#E2E8F0]">
            <p className="text-xs text-[#64748B] mb-1">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* 캠퍼스별 카드 */}
      <div>
        <h2 className="font-semibold text-[#1E293B] mb-3">캠퍼스별 현황</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.campusSummaries.map(c => (
            <Link
              key={c.id}
              href={`/hq/campuses/${c.id}`}
              className={`bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm hover:shadow-md transition-all ${!c.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-[#1E293B]">{c.name}</p>
                  <p className="text-xs text-[#94A3B8]">{c.code}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.is_active ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>
                  {c.is_active ? '운영중' : '비활성'}
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-xs text-[#64748B]">승인 대기</p>
                  <p className={`font-bold ${c.pending > 0 ? 'text-[#F59E0B]' : 'text-[#94A3B8]'}`}>{c.pending}건</p>
                </div>
                <div>
                  <p className="text-xs text-[#64748B]">오늘 휴가</p>
                  <p className="font-bold text-[#7C3AED]">{c.onLeaveToday}명</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
