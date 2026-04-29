'use client'

import { useEffect, useState } from 'react'

interface OverviewRow {
  id: string
  name: string
  position: string
  is_active: boolean
  total: number
  used: number
  remaining: number
}

export default function OverviewPage() {
  const [rows, setRows] = useState<OverviewRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  async function load(y: number) {
    setLoading(true)
    const res = await fetch(`/api/campus/overview?year=${y}`)
    const d = await res.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load(year) }, [year])

  async function handleExcelDownload() {
    const { utils, writeFile } = await import('xlsx')
    const data = rows.map(r => ({
      '이름': r.name,
      '직책': r.position,
      '총 연차': r.total,
      '사용': r.used,
      '잔여': r.remaining,
      '상태': r.is_active ? '활성' : '비활성',
    }))
    const ws = utils.json_to_sheet(data)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, `${year}년 연차현황`)
    writeFile(wb, `연차현황_${year}.xlsx`)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">전체 연차 현황</h1>
        <div className="flex gap-3">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button onClick={handleExcelDownload}
            className="bg-[#059669] hover:bg-[#047857] text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            엑셀 다운로드
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {rows.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl p-4 border border-[#E2E8F0] ${!r.is_active ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="font-semibold text-sm">{r.name}</p>
                    <p className="text-xs text-[#64748B]">{r.position}</p>
                  </div>
                  <span className="text-lg font-bold text-[#7C3AED]">{r.remaining}일 남음</span>
                </div>
                <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div className="h-full bg-[#7C3AED] rounded-full" style={{ width: `${r.total > 0 ? Math.round((r.used/r.total)*100) : 0}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[#64748B] mt-1.5">
                  <span>총 {r.total}일</span>
                  <span>사용 {r.used}일 · 잔여 {r.remaining}일</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  {['이름','직책','총 연차','사용','잔여','사용률'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-[#F8FAFC] ${!r.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.position}</td>
                    <td className="px-4 py-3">{r.total}일</td>
                    <td className="px-4 py-3 text-[#4F7EF7]">{r.used}일</td>
                    <td className="px-4 py-3 font-semibold text-[#7C3AED]">{r.remaining}일</td>
                    <td className="px-4 py-3 w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                          <div className="h-full bg-[#7C3AED] rounded-full" style={{ width: `${r.total > 0 ? Math.round((r.used/r.total)*100) : 0}%` }} />
                        </div>
                        <span className="text-xs text-[#64748B] shrink-0">{r.total > 0 ? Math.round((r.used/r.total)*100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
