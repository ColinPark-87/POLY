'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface Holiday { id: string; date: string; name: string; campus_id: string | null }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

interface SummaryEntry { name: string; annual: number; half: number; quarter: number; sick: number; total: number }
interface CalData {
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; status: string; is_mine: boolean; users: { name: string } }[]
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  holidays: { date: string; name: string }[]
  summary: SummaryEntry[]
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
  const [calTab, setCalTab] = useState<'calendar' | 'mine' | 'holidays'>('calendar')
  const [balance, setBalance] = useState<{ totalDays: number; usedDays: number; remainingDays: number } | null>(null)
  const [myEvents, setMyEvents] = useState<object[]>([])
  const [myHolidays, setMyHolidays] = useState<object[]>([])
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [summaryMonth, setSummaryMonth] = useState('')  // "2026년 5월"

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

  useEffect(() => {
    fetch('/api/leave/summary')
      .then(r => r.json())
      .then(d => setBalance({ totalDays: d.totalDays, usedDays: d.usedDays, remainingDays: d.remainingDays }))
  }, [])

  async function loadMyEvents(year: string, month: string) {
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalData = await res.json()
    const ev: object[] = []
    ;(data.campusLeaves ?? []).filter(r => r.is_mine).forEach(r => {
      const approved = r.status === 'approved'
      ev.push({
        title: `${LEAVE_TYPE_LABELS[r.type]}${approved ? '' : ' (대기)'}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: approved ? '#002F65' : '#F59E0B',
        borderColor: approved ? '#002F65' : '#F59E0B',
        textColor: '#fff',
      })
    })
    const hols: object[] = []
    ;(data.holidays ?? []).forEach(h => {
      hols.push({ title: h.name, start: h.date, backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', textColor: '#DC2626', display: 'background' })
    })
    setMyEvents(ev)
    setMyHolidays(hols)
  }

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

    // 전 직원 연차 — 타입별 색상, 대기는 반투명
    ;(data.campusLeaves ?? []).forEach(r => {
      const c = leaveColor(r.type)
      const isPending = r.status === 'pending'
      const label = r.is_mine
        ? `${r.users?.name ?? ''}(나) ${LEAVE_TYPE_LABELS[r.type]}${isPending ? ' ·대기' : ''}`
        : `${r.users?.name ?? ''} ${LEAVE_TYPE_LABELS[r.type]}${isPending ? ' ·대기' : ''}`
      ev.push({
        title: label,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: isPending ? c.bg + 'AA' : c.bg,
        borderColor: isPending ? c.border + '88' : c.border,
        textColor: c.text,
        borderWidth: isPending ? 2 : 1,
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

    setSummary(data.summary ?? [])
    setSummaryMonth(`${year}년 ${parseInt(month)}월`)
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
        <button onClick={() => setCalTab('mine')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${calTab === 'mine' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          내 캘린더
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
                { color: '#DBEAFE', border: '#3B82F6', label: '연차' },
                { color: '#FEF3C7', border: '#F59E0B', label: '반차' },
                { color: '#EDE9FE', border: '#8B5CF6', label: '반반차' },
                { color: '#FEE2E2', border: '#FCA5A5', label: '공휴일' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-sm border flex-shrink-0" style={{ backgroundColor: l.color, borderColor: l.border }} />
                  <span className="text-xs text-[#64748B]">{l.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8] border border-dashed border-[#94A3B8] px-1.5 py-0.5 rounded">·대기</span>
                <span className="text-xs text-[#64748B]">승인 대기</span>
              </div>
            </div>
            <div className="flex border border-[#E2E8F0] rounded-xl overflow-hidden">
              <button onClick={() => setView('dayGridMonth')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'dayGridMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>월</button>
              <button onClick={() => setView('listMonth')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'listMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>목록</button>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            {/* 캘린더 */}
            <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4">
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

            {/* 월간 연차 소진 요약 */}
            <div className="w-56 shrink-0 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="bg-[#004EA2] px-4 py-3">
                <p className="text-xs font-bold text-white/70 mb-0.5">월간 연차 현황</p>
                <p className="text-sm font-bold text-white">{summaryMonth || '—'}</p>
              </div>
              {summary.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[#94A3B8]">이번 달 연차 없음</div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {summary.map(s => (
                    <div key={s.name} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-[#1E293B]">{s.name}</span>
                        <span className="text-sm font-bold text-[#004EA2]">{s.total}일</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.annual > 0 && (
                          <span className="text-[10px] bg-[#DBEAFE] text-[#1D4ED8] px-1.5 py-0.5 rounded font-medium">
                            연차 {s.annual}
                          </span>
                        )}
                        {s.half > 0 && (
                          <span className="text-[10px] bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded font-medium">
                            반차 {s.half}
                          </span>
                        )}
                        {s.quarter > 0 && (
                          <span className="text-[10px] bg-[#EDE9FE] text-[#5B21B6] px-1.5 py-0.5 rounded font-medium">
                            반반차 {s.quarter}
                          </span>
                        )}
                        {s.sick > 0 && (
                          <span className="text-[10px] bg-[#FEE2E2] text-[#991B1B] px-1.5 py-0.5 rounded font-medium">
                            병가 {s.sick}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2.5 bg-[#F7F8FA] flex items-center justify-between">
                    <span className="text-xs text-[#64748B] font-medium">총 소진</span>
                    <span className="text-sm font-bold text-[#1E293B]">{summary.reduce((a, s) => a + s.total, 0)}일</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 내 캘린더 탭 */}
      {calTab === 'mine' && (
        <>
          {balance && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl px-5 py-4 mb-4 flex items-center gap-6 flex-wrap shadow-sm">
              <span className="text-sm font-semibold text-[#1E293B]">내 연차 현황</span>
              <div className="flex items-center gap-5 text-sm">
                <span className="text-[#64748B]">총 <span className="font-bold text-[#1E293B]">{balance.totalDays}일</span></span>
                <span className="text-[#64748B]">사용 <span className="font-bold text-[#EF4444]">{balance.usedDays}일</span></span>
                <span className="text-[#64748B]">잔여 <span className={`font-bold ${balance.remainingDays < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>{balance.remainingDays}일</span></span>
              </div>
              <div className="flex-1 min-w-32">
                <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div className="h-full bg-[#004EA2] rounded-full transition-all"
                    style={{ width: `${balance.totalDays > 0 ? Math.min(100, (balance.usedDays / balance.totalDays) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs mb-4">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#002F65] inline-block" />승인됨</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block" />승인 대기</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FEE2E2] inline-block" />공휴일</span>
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
              initialView="dayGridMonth"
              key="mine"
              locale={koLocale}
              events={[...myEvents, ...myHolidays]}
              datesSet={info => {
                const d = (info as { view: { currentStart: Date } }).view.currentStart
                loadMyEvents(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              height="auto"
              dayMaxEvents={3}
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
