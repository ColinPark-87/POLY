'use client'

import { useEffect, useState } from 'react'
import { Spinner, RosterView, type RosterData } from '@/components/HqRosterView'

interface Campus { id: string; name: string; code: string; is_active: boolean }

export default function HqRosterOverviewPage() {
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [rosterData, setRosterData] = useState<RosterData | null>(null)
  const [campusLoading, setCampusLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)

  // 캠퍼스 목록 로드
  useEffect(() => {
    fetch('/api/hq/campuses')
      .then(r => r.json())
      .then(d => {
        const list: Campus[] = (d.campuses ?? []).filter((c: Campus) => c.is_active)
        setCampuses(list)
        if (list.length > 0) setSelectedId(list[0].id)
        setCampusLoading(false)
      })
  }, [])

  // 캠퍼스/월 변경 시 개설반 데이터 로드
  useEffect(() => {
    if (!selectedId) return
    setRosterLoading(true)
    setRosterData(null)
    const params = new URLSearchParams(month ? { month } : {})
    fetch(`/api/hq/campuses/${selectedId}/roster?${params}`)
      .then(r => r.json())
      .then(d => {
        setRosterData(d)
        if (!month && d.currentMonth) setMonth(d.currentMonth)
        setRosterLoading(false)
      })
  }, [selectedId, month])

  function selectCampus(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    setMonth('')
  }

  if (campusLoading) return <Spinner />

  if (campuses.length === 0) {
    return (
      <div className="text-center py-20 text-[#94A3B8]">
        <p className="text-2xl mb-2">🏫</p>
        <p className="text-sm">등록된 활성 캠퍼스가 없습니다.</p>
      </div>
    )
  }

  const selectedCampus = campuses.find(c => c.id === selectedId)

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* 모바일: 드롭다운 */}
      <div className="md:hidden">
        <label className="block text-xs font-semibold text-[#64748B] mb-1">캠퍼스 선택</label>
        <select
          value={selectedId}
          onChange={e => selectCampus(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
        >
          {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 데스크탑: 좌측 캠퍼스 패널 */}
      <aside className="hidden md:flex flex-col w-44 shrink-0 gap-0.5">
        <p className="text-[10px] font-bold text-[#CBD5E1] uppercase tracking-widest px-2 mb-1.5">캠퍼스</p>
        {campuses.map(c => (
          <button
            key={c.id}
            onClick={() => selectCampus(c.id)}
            className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors truncate ${
              c.id === selectedId
                ? 'bg-[#EAF2FB] text-[#002F65] font-semibold'
                : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </aside>

      {/* 우측: 개설반 현황 */}
      <div className="flex-1 min-w-0">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-[#1E293B]">
              {selectedCampus?.name ?? ''} 개설반 현황
            </h1>
            <p className="text-xs text-[#94A3B8] mt-0.5">읽기 전용 · HQ 전용</p>
          </div>
          {rosterData && rosterData.availableMonths.length > 0 && (
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              {rosterData.availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

        {rosterLoading ? <Spinner /> : rosterData ? <RosterView data={rosterData} /> : null}
      </div>
    </div>
  )
}
