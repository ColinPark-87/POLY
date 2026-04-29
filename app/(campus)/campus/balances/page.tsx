'use client'

import { useEffect, useState } from 'react'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

interface BalanceRow {
  id: string
  name: string
  position: string
  is_active: boolean
  total: number
  monthly: number[]
  totalUsed: number
  remaining: number
}

export default function BalancesPage() {
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  async function load(y: number) {
    setLoading(true)
    const res = await fetch(`/api/campus/balances?year=${y}`)
    const d = await res.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load(year) }, [year])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">연차 잔여 관리 (월별)</h1>
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
        </div>
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
                <div className="flex gap-4 text-xs text-[#64748B] mb-3">
                  <span>총 <span className="font-semibold text-[#1E293B]">{r.total}</span>일</span>
                  <span>사용 <span className="font-semibold text-[#4F7EF7]">{r.totalUsed}</span>일</span>
                  <span>잔여 <span className="font-semibold text-[#7C3AED]">{r.remaining}</span>일</span>
                </div>
                {/* Mini 12-month grid: 2 rows of 6 */}
                <div className="space-y-1">
                  {[0, 6].map(offset => (
                    <div key={offset} className="grid grid-cols-6 gap-1">
                      {MONTHS.slice(offset, offset + 6).map((m, i) => {
                        const idx = offset + i
                        const val = r.monthly[idx]
                        return (
                          <div key={idx} className="flex flex-col items-center">
                            <span className="text-[10px] text-[#94A3B8]">{m}</span>
                            <span className={`text-xs font-semibold ${val > 0 ? 'text-[#7C3AED]' : 'text-[#CBD5E1]'}`}>
                              {val > 0 ? val : '-'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: scrollable table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '900px' }}>
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] sticky left-0 bg-[#F8FAFC]">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">직책</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">총연차</th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-2 py-3 text-center text-xs font-semibold text-[#64748B]">{m}</th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">합계</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">잔여</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-[#F8FAFC] ${!r.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium sticky left-0 bg-white">{r.name}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.position}</td>
                    <td className="px-4 py-3">{r.total}일</td>
                    {r.monthly.map((val, idx) => (
                      <td key={idx} className="px-2 py-3 text-center">
                        {val > 0
                          ? <span className="font-semibold text-[#7C3AED]">{val}</span>
                          : <span className="text-[#CBD5E1]">-</span>
                        }
                      </td>
                    ))}
                    <td className="px-4 py-3 text-[#4F7EF7] font-semibold">{r.totalUsed}일</td>
                    <td className="px-4 py-3 font-bold text-[#7C3AED]">{r.remaining}일</td>
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
