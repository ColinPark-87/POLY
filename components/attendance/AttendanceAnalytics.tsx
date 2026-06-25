'use client'
import { useEffect, useState, useCallback } from 'react'

interface DateStat { present: number; absent: number; late: number; absentNames: string[]; lateNames: string[] }
interface Analytics {
  ym: string
  availableMonths: string[]
  byDate: Record<string, DateStat>
  bySession: Record<string, { present: number; absent: number; late: number }>
  byWeekday: Record<string, { present: number; absent: number; late: number }>
}

export function AttendanceAnalytics() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const [ym, setYm] = useState(`${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    const res = await fetch(`/api/campus/attendance/analytics?ym=${m}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load(ym) }, [ym, load])

  if (loading || !data) return <div className="p-8 text-gray-400">로딩 중...</div>

  const [y, mo] = ym.split('-').map(Number)
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const months = [...new Set([ym, ...data.availableMonths])].sort().reverse()
  const sel = selectedDate ? data.byDate[selectedDate] : null
  const maxBar = Math.max(1, ...['월','화','수','목','금'].map(wd => {
    const w = data.byWeekday[wd]; return w ? w.absent + w.late : 0
  }))

  return (
    <div className="space-y-5">
      {/* 월 탭바 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {months.map(m => (
          <button key={m} onClick={() => { setYm(m); setSelectedDate(null) }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              ym === m ? 'bg-[#1e3a5f] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}>{m.replace('-', '년 ')}월</button>
        ))}
      </div>

      {/* 캘린더 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[#94A3B8]'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const dateStr = `${ym}-${String(day).padStart(2, '0')}`
            const st = data.byDate[dateStr]
            const hasData = !!st
            const issues = st ? st.absent + st.late : 0
            return (
              <button key={i}
                onClick={() => hasData && setSelectedDate(dateStr)}
                disabled={!hasData}
                className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-colors ${
                  selectedDate === dateStr ? 'border-[#004EA2] bg-[#EAF2FB]'
                    : hasData ? 'border-[#E2E8F0] hover:border-[#004EA2] bg-white' : 'border-transparent bg-[#FAFBFC]'
                }`}>
                <span className={`text-xs ${hasData ? 'font-bold text-[#1E293B]' : 'text-[#CBD5E1]'}`}>{day}</span>
                {hasData && (
                  <span className={`text-[8px] mt-0.5 ${issues > 0 ? 'text-red-500 font-bold' : 'text-green-600'}`}>
                    {issues > 0 ? `결${st.absent} 지${st.late}` : '✓'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택 날짜 상세 */}
      {sel && selectedDate && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#1E293B]">{selectedDate.replace(/-/g, '.')} 출결</h3>
            <button onClick={() => setSelectedDate(null)} className="text-[#94A3B8] text-sm">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg bg-[#F0FDF4] px-3 py-2">
              <p className="text-[10px] text-[#16A34A]">출석</p>
              <p className="text-xl font-extrabold text-[#16A34A]">{sel.present}</p>
            </div>
            <div className="rounded-lg bg-[#FEF2F2] px-3 py-2">
              <p className="text-[10px] text-[#DC2626]">결석</p>
              <p className="text-xl font-extrabold text-[#DC2626]">{sel.absent}</p>
            </div>
            <div className="rounded-lg bg-[#FFFBEB] px-3 py-2">
              <p className="text-[10px] text-[#D97706]">지각</p>
              <p className="text-xl font-extrabold text-[#D97706]">{sel.late}</p>
            </div>
          </div>
          {sel.absentNames.length > 0 && (
            <p className="text-sm text-[#1E293B] mb-1"><span className="text-[#DC2626] font-bold">결석</span> {sel.absentNames.join(', ')}</p>
          )}
          {sel.lateNames.length > 0 && (
            <p className="text-sm text-[#1E293B]"><span className="text-[#D97706] font-bold">지각</span> {sel.lateNames.join(', ')}</p>
          )}
          {sel.absentNames.length === 0 && sel.lateNames.length === 0 && (
            <p className="text-sm text-[#16A34A]">전원 출석</p>
          )}
        </div>
      )}

      {/* 요일별 그래프 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="font-bold text-[#1E293B] text-sm mb-3">요일별 결석·지각</h3>
        <div className="flex items-end gap-2 h-32">
          {['월','화','수','목','금'].map(wd => {
            const w = data.byWeekday[wd] ?? { present: 0, absent: 0, late: 0 }
            const total = w.absent + w.late
            const h = (total / maxBar) * 100
            return (
              <div key={wd} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[10px] text-[#64748B] mb-0.5">{total}</span>
                <div className="w-full rounded-t overflow-hidden flex flex-col justify-end" style={{ height: `${h}%`, minHeight: total > 0 ? '4px' : '0' }}>
                  <div className="bg-[#D97706] w-full" style={{ height: total > 0 ? `${(w.late / total) * 100}%` : '0' }} />
                  <div className="bg-[#DC2626] w-full" style={{ height: total > 0 ? `${(w.absent / total) * 100}%` : '0' }} />
                </div>
                <span className="text-[10px] text-[#94A3B8] mt-1">{wd}</span>
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-[#94A3B8]">
          <span><span className="inline-block w-2 h-2 bg-[#DC2626] rounded-sm mr-1" />결석</span>
          <span><span className="inline-block w-2 h-2 bg-[#D97706] rounded-sm mr-1" />지각</span>
        </div>
      </div>

      {/* 세션별 표 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="font-bold text-[#1E293B] text-sm mb-3">세션별 집계 (월 누적)</h3>
        <div className="space-y-1">
          {Object.entries(data.bySession).map(([name, s]) => {
            const total = s.present + s.absent + s.late
            return (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-[#1E293B] font-medium">{name}</span>
                <span className="text-[#16A34A]">출 {s.present}</span>
                <span className="text-[#DC2626]">결 {s.absent}</span>
                <span className="text-[#D97706]">지 {s.late}</span>
                <span className="ml-auto text-[#94A3B8]">{total > 0 ? Math.round(s.present / total * 100) : 0}% 출석</span>
              </div>
            )
          })}
          {Object.keys(data.bySession).length === 0 && <p className="text-xs text-[#CBD5E1]">데이터 없음</p>}
        </div>
      </div>
    </div>
  )
}
