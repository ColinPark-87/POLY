'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface Holiday { id: string; date: string; name: string; campus_id: string | null }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

interface CalData {
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }[]
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  holidays: { date: string; name: string }[]
}

function leaveColor(type: LeaveType) {
  if (type === 'annual')   return { bg: '#DBEAFE', border: '#3B82F6', text: '#1D4ED8' }  // 파랑 - 연차
  if (type === 'half_am')  return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' }  // 노랑 - 오전반차
  if (type === 'half_pm')  return { bg: '#FFE4E6', border: '#F43F5E', text: '#9F1239' }  // 분홍 - 오후반차
  if (type === 'quarter')  return { bg: '#EDE9FE', border: '#8B5CF6', text: '#5B21B6' }  // 보라 - 반반차
  if (type === 'sick')     return { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' }  // 빨강 - 병가
  return { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' }
}

export default function CampusCalendarPage() {
  const [events, setEvents] = useState<object[]>([])
  const [view, setView] = useState<'dayGridMonth' | 'listMonth'>('dayGridMonth')
  const [calTab, setCalTab] = useState<'calendar' | 'holidays'>('calendar')

  // 공휴일 설정 state
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holYear, setHolYear] = useState(new Date().getFullYear())
  const [holForm, setHolForm] = useState({ start_date: '', end_date: '', name: '' })
  const [holLoading, setHolLoading] = useState(false)
  const [showHolAdd, setShowHolAdd] = useState(false)
  const [holAddLoading, setHolAddLoading] = useState(false)
  const [holImportLoading, setHolImportLoading] = useState(false)
  const [holImportResult, setHolImportResult] = useState<{ inserted: number; skipped: number } | null>(null)

  async function loadHolidays() {
    setHolLoading(true)
    const res = await fetch('/api/campus/holidays')
    const d = await res.json()
    setHolidays(d.holidays ?? [])
    setHolLoading(false)
  }

  useEffect(() => { if (calTab === 'holidays') loadHolidays() }, [calTab])

  async function handleHolAdd(e: React.FormEvent) {
    e.preventDefault()
    setHolAddLoading(true)
    await fetch('/api/campus/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: holForm.start_date, end_date: holForm.end_date || holForm.start_date, name: holForm.name }),
    })
    setHolAddLoading(false)
    setHolForm({ start_date: '', end_date: '', name: '' })
    setShowHolAdd(false)
    loadHolidays()
  }

  async function handleHolImport() {
    setHolImportLoading(true); setHolImportResult(null)
    const res = await fetch('/api/campus/holidays/national', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: holYear }),
    })
    const d = await res.json()
    setHolImportLoading(false)
    if (res.ok) { setHolImportResult({ inserted: d.inserted, skipped: d.skipped }); loadHolidays() }
    else alert(d.error ?? '가져오기 실패')
  }

  async function handleHolDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch('/api/campus/holidays', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadHolidays()
  }

  const holRangeCount = (() => {
    if (!holForm.start_date) return 0
    const s = new Date(holForm.start_date + 'T00:00:00')
    const e = holForm.end_date ? new Date(holForm.end_date + 'T00:00:00') : s
    if (e < s) return 0
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  })()

  const filteredHolidays = holidays.filter(h => h.date.startsWith(String(holYear)))
  const currentYear = new Date().getFullYear()

  async function loadEvents(year: string, month: string) {
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalData = await res.json()

    const ev: object[] = []

    // 캠퍼스 일정 (동료 연차) — 타입별 색상
    ;(data.campusLeaves ?? []).forEach(r => {
      const c = leaveColor(r.type)
      ev.push({
        title: `${r.users?.name ?? ''} ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: c.bg,
        borderColor: c.border,
        textColor: c.text,
      })
    })

    // 내 일정 (원장 본인 연차)
    ;(data.myLeaves ?? []).forEach(r => {
      const isApproved = r.status === 'approved'
      ev.push({
        title: `[나] ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: isApproved ? '#10B981' : '#F59E0B',
        borderColor: isApproved ? '#059669' : '#D97706',
        textColor: '#fff',
      })
    })

    // 공휴일
    ;(data.holidays ?? []).forEach(h => {
      ev.push({
        title: h.name,
        start: h.date,
        backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        textColor: '#DC2626',
        display: 'background',
      })
    })

    setEvents(ev)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">캠퍼스 캘린더</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4">
        <button onClick={() => setCalTab('calendar')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${calTab === 'calendar' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          캘린더
        </button>
        <button onClick={() => setCalTab('holidays')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${calTab === 'holidays' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          공휴일 설정
        </button>
      </div>

      {/* 캘린더 탭 */}
      {calTab === 'calendar' && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex flex-wrap gap-4">
              {[
                { color: '#CFE0F4', border: '#93C5FD', label: '연차' },
                { color: '#FFF7ED', border: '#FDBA74', label: '반차' },
                { color: '#EAF2FB', border: '#9BBFE8', label: '반반차' },
                { color: '#10B981', border: '#059669', label: '내 일정 (승인)' },
                { color: '#F59E0B', border: '#D97706', label: '내 일정 (대기)' },
                { color: '#FEE2E2', border: '#FCA5A5', label: '공휴일' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-sm border flex-shrink-0" style={{ backgroundColor: l.color, borderColor: l.border }} />
                  <span className="text-xs text-[#64748B]">{l.label}</span>
                </div>
              ))}
            </div>
            <div className="flex border border-[#E2E8F0] rounded-xl overflow-hidden">
              <button onClick={() => setView('dayGridMonth')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'dayGridMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>월</button>
              <button onClick={() => setView('listMonth')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'listMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>목록</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4">
            <style>{`
              .fc-col-header-cell-cushion { font-size: 0.8rem; font-weight: 600; }
              .fc-day-sun .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
              .fc-day-sat .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
              .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion { color: #DC2626; }
              .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion { color: #004EA2; }
            `}</style>
            <FullCalendar
              plugins={[dayGridPlugin, listPlugin]}
              initialView={view}
              key={view}
              locale={koLocale}
              events={events}
              datesSet={info => {
                const d = (info as { view: { currentStart: Date } }).view.currentStart
                loadEvents(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              height="auto"
              dayMaxEvents={4}
              weekends={true}
            />
          </div>
        </>
      )}

      {/* 공휴일 설정 탭 */}
      {calTab === 'holidays' && (
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <select value={holYear} onChange={e => setHolYear(parseInt(e.target.value))}
                className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <button onClick={handleHolImport} disabled={holImportLoading}
                className="bg-[#F59E0B] hover:bg-[#D97706] text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50">
                {holImportLoading ? '가져오는 중...' : '공휴일 자동 가져오기'}
              </button>
              <button onClick={() => setShowHolAdd(true)}
                className="bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold px-4 py-2 rounded-xl text-sm">
                + 휴일 추가
              </button>
            </div>
          </div>

          {holImportResult && (
            <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm flex items-center gap-4 mb-4">
              <span className="text-[#059669] font-semibold">가져오기 완료</span>
              <span className="text-[#047857]">신규 {holImportResult.inserted}개 추가 · 중복 {holImportResult.skipped}개 건너뜀</span>
              <button onClick={() => setHolImportResult(null)} className="ml-auto text-[#047857] underline text-xs">닫기</button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F8FA] border-b border-[#E2E8F0]">
                <tr>
                  {['날짜', '요일', '휴일명', '삭제'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {holLoading ? (
                  <tr><td colSpan={4} className="text-center py-10 text-[#64748B]">불러오는 중...</td></tr>
                ) : filteredHolidays.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-[#64748B] text-sm">등록된 휴일이 없습니다.</td></tr>
                ) : (
                  filteredHolidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => {
                    const d = new Date(h.date + 'T00:00:00')
                    const dayIdx = d.getDay()
                    return (
                      <tr key={h.id} className="hover:bg-[#F7F8FA]">
                        <td className="px-5 py-3 font-medium">{h.date}</td>
                        <td className={`px-5 py-3 ${dayIdx === 0 ? 'text-[#EF4444]' : dayIdx === 6 ? 'text-[#004EA2]' : 'text-[#64748B]'}`}>{DAY_NAMES[dayIdx]}요일</td>
                        <td className="px-5 py-3">
                          {h.name}
                          {h.campus_id === null && <span className="ml-2 text-xs text-[#004EA2] bg-[#EAF2FB] px-1.5 py-0.5 rounded">전국</span>}
                        </td>
                        <td className="px-5 py-3">
                          {h.campus_id !== null ? (
                            <button onClick={() => handleHolDelete(h.id)} className="text-xs bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] px-2.5 py-1 rounded-lg font-semibold">삭제</button>
                          ) : (
                            <span className="text-xs text-[#CBD5E1]">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 휴일 추가 모달 */}
          {showHolAdd && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowHolAdd(false)}>
              <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-[#1E293B] mb-1">휴일 추가</h3>
                <p className="text-xs text-[#64748B] mb-4">기간을 입력하면 해당 기간의 모든 날짜가 등록됩니다.</p>
                <form onSubmit={handleHolAdd} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[#1E293B] mb-1">시작일 *</label>
                      <input type="date" value={holForm.start_date}
                        onChange={e => setHolForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))}
                        required className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1E293B] mb-1">종료일</label>
                      <input type="date" value={holForm.end_date} min={holForm.start_date}
                        onChange={e => setHolForm(f => ({ ...f, end_date: e.target.value }))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                    </div>
                  </div>
                  {holRangeCount > 0 && (
                    <p className="text-xs text-[#004EA2] bg-[#EAF2FB] px-3 py-2 rounded-lg">
                      {holRangeCount === 1 ? `${holForm.start_date} 1일 등록` : `${holForm.start_date} ~ ${holForm.end_date} (총 ${holRangeCount}일 등록)`}
                    </p>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">휴일명 *</label>
                    <input type="text" placeholder="예: 여름 휴가, 대체공휴일" value={holForm.name}
                      onChange={e => setHolForm(f => ({ ...f, name: e.target.value }))}
                      required className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowHolAdd(false)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                    <button type="submit" disabled={holAddLoading || holRangeCount === 0} className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {holAddLoading ? '추가 중...' : holRangeCount > 1 ? `${holRangeCount}일 추가` : '추가'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
