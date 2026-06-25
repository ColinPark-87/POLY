'use client'
import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import koLocale from '@fullcalendar/core/locales/ko'

interface AbsentEntry { name: string; sessionName: string; level: string; timeRange: string; startMin: number; pre: boolean }
interface DateStat { present: number; absent: number; late: number; absentList: AbsentEntry[]; lateList: AbsentEntry[] }
interface Analytics {
  ym: string
  availableMonths: string[]
  byDate: Record<string, DateStat>
  bySession: Record<string, { present: number; absent: number; late: number }>
  byWeekday: Record<string, { present: number; absent: number; late: number }>
}

// 톤다운 색상 (적대적이지 않게)
const ABSENT = '#E8927C'  // 부드러운 코랄
const PRESENT = '#7CB89A' // 부드러운 세이지

// 세션별 그룹 + 시간순 정렬
function groupBySession(list: AbsentEntry[]) {
  const map = new Map<string, { key: string; sessionName: string; level: string; timeRange: string; startMin: number; items: AbsentEntry[] }>()
  for (const a of list) {
    const key = `${a.startMin}-${a.sessionName}-${a.level}`
    if (!map.has(key)) map.set(key, { key, sessionName: a.sessionName, level: a.level, timeRange: a.timeRange, startMin: a.startMin, items: [] })
    map.get(key)!.items.push(a)
  }
  return [...map.values()].sort((a, b) => a.startMin - b.startMin)
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

  const months = [...new Set([ym, ...data.availableMonths])].sort().reverse()
  const sel = selectedDate ? data.byDate[selectedDate] : null
  const maxBar = Math.max(1, ...['월','화','수','목','금'].map(wd => data.byWeekday[wd]?.absent ?? 0))

  // FullCalendar 이벤트: 결석 있는 날만 표시
  const events = Object.entries(data.byDate).flatMap(([date, st]) => {
    const evs: object[] = []
    if (st.absent > 0) evs.push({ start: date, display: 'background', color: '#FCE9E4' })
    return evs
  })

  return (
    <div className="space-y-4">
      {/* 월 탭바 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {months.map(m => (
          <button key={m} onClick={() => { setYm(m); setSelectedDate(null) }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              ym === m ? 'bg-[#1e3a5f] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}>{m.replace('-', '년 ')}월</button>
        ))}
      </div>

      {/* 캘린더 (작게, 캠퍼스 캘린더 양식) */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-2 attendance-cal">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          initialDate={`${ym}-01`}
          key={ym}
          headerToolbar={{ left: '', center: 'title', right: '' }}
          height="auto"
          contentHeight="auto"
          aspectRatio={1.8}
          fixedWeekCount={false}
          showNonCurrentDates={false}
          events={events}
          dayCellContent={(arg) => {
            const dateStr = `${ym}-${String(arg.date.getDate()).padStart(2, '0')}`
            const st = data.byDate[dateStr]
            return (
              <div className="flex flex-col items-center leading-none">
                <span className="text-[11px]">{arg.date.getDate()}</span>
                {st && st.absent > 0 && <span className="text-[9px] font-bold" style={{ color: ABSENT }}>결{st.absent}</span>}
                {st && st.absent === 0 && <span className="text-[8px]" style={{ color: PRESENT }}>✓</span>}
              </div>
            )
          }}
          dateClick={(info: { dateStr: string }) => {
            if (data.byDate[info.dateStr]) setSelectedDate(info.dateStr)
          }}
        />
      </div>

      {/* 선택 날짜 상세 */}
      {sel && selectedDate && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#1E293B]">{selectedDate.replace(/-/g, '.')} 출결</h3>
            <button onClick={() => setSelectedDate(null)} className="text-[#94A3B8] text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-lg px-3 py-2" style={{ background: '#EEF6F1' }}>
              <p className="text-[10px]" style={{ color: PRESENT }}>출석</p>
              <p className="text-2xl font-extrabold" style={{ color: '#4A9E7A' }}>{sel.present}</p>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: '#FCEEEA' }}>
              <p className="text-[10px]" style={{ color: ABSENT }}>결석</p>
              <p className="text-2xl font-extrabold" style={{ color: '#C8674E' }}>{sel.absent}</p>
            </div>
          </div>
          {/* 결석 명단 — 세션별 그룹 + 시간순 + 5열 */}
          {sel.absentList.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-bold mb-1.5" style={{ color: '#C8674E' }}>결석 {sel.absent}명</p>
              {groupBySession(sel.absentList).map(g => (
                <div key={g.key} className="mb-2">
                  <p className="text-[11px] text-[#64748B] mb-0.5">
                    {g.timeRange && <span className="font-semibold">{g.timeRange}</span>} {g.sessionName} · {g.level}
                  </p>
                  <div className="grid grid-cols-5 gap-1">
                    {g.items.map((a, i) => (
                      <span key={i} className="text-xs px-1.5 py-1 rounded text-center truncate" style={{ background: '#FCEEEA', color: '#C8674E' }}>
                        {a.name}{a.pre ? '*' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-[#CBD5E1]">* = 사전결석</p>
            </div>
          )}
          {/* 지각 명단 — 세션별 그룹 + 5열 */}
          {sel.lateList.length > 0 && (
            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#B8902E' }}>지각 {sel.late}명 (출석 인정)</p>
              {groupBySession(sel.lateList).map(g => (
                <div key={g.key} className="mb-2">
                  <p className="text-[11px] text-[#64748B] mb-0.5">
                    {g.timeRange && <span className="font-semibold">{g.timeRange}</span>} {g.sessionName} · {g.level}
                  </p>
                  <div className="grid grid-cols-5 gap-1">
                    {g.items.map((a, i) => (
                      <span key={i} className="text-xs px-1.5 py-1 rounded text-center truncate" style={{ background: '#FBF3E0', color: '#B8902E' }}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {sel.absentList.length === 0 && sel.lateList.length === 0 && (
            <p className="text-sm" style={{ color: PRESENT }}>전원 출석</p>
          )}
        </div>
      )}

      {/* 요일별 결석 그래프 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="font-bold text-[#1E293B] text-sm mb-3">요일별 결석</h3>
        <div className="flex items-end gap-2 h-28">
          {['월','화','수','목','금'].map(wd => {
            const w = data.byWeekday[wd] ?? { present: 0, absent: 0, late: 0 }
            const h = (w.absent / maxBar) * 100
            return (
              <div key={wd} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[10px] text-[#64748B] mb-0.5">{w.absent}</span>
                <div className="w-full rounded-t" style={{ height: `${h}%`, minHeight: w.absent > 0 ? '4px' : '0', background: ABSENT }} />
                <span className="text-[10px] text-[#94A3B8] mt-1">{wd}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 세션별 표 — 간결 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="font-bold text-[#1E293B] text-sm mb-3">세션별 집계 (월 누적)</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(data.bySession).map(([name, s]) => {
            const total = s.present + s.absent
            const rate = total > 0 ? Math.round(s.present / total * 100) : 0
            return (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-[#1E293B] font-medium">{name}</span>
                <span style={{ color: '#C8674E' }}>결 {s.absent}</span>
                <span className="text-[#94A3B8] w-9 text-right">{rate}%</span>
              </div>
            )
          })}
          {Object.keys(data.bySession).length === 0 && <p className="text-xs text-[#CBD5E1]">데이터 없음</p>}
        </div>
      </div>

      <style jsx global>{`
        .attendance-cal .fc { font-size: 11px; }
        .attendance-cal .fc .fc-toolbar-title { font-size: 14px; font-weight: 700; color: #1E293B; }
        .attendance-cal .fc .fc-daygrid-day-frame { min-height: 38px; padding: 1px; }
        .attendance-cal .fc .fc-daygrid-day-top { justify-content: center; }
        .attendance-cal .fc .fc-col-header-cell-cushion { font-size: 10px; color: #94A3B8; padding: 2px; }
        .attendance-cal .fc .fc-daygrid-day-number { padding: 0; }
        .attendance-cal .fc-day-today { background: #EAF2FB !important; }
      `}</style>
    </div>
  )
}
