'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface SummaryEntry { name: string; annual: number; half: number; quarter: number; sick: number; total: number }
interface CalData {
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; status: string; is_mine: boolean; users: { name: string } }[]
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  holidays: { date: string; name: string }[]
  summary: SummaryEntry[]
}
interface Balance {
  totalDays: number
  usedDays: number
  remainingDays: number
}

function leaveColor(type: LeaveType) {
  if (type === 'annual')  return { bg: '#DBEAFE', border: '#3B82F6', text: '#1D4ED8' }
  if (type === 'half_am') return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' }
  if (type === 'half_pm') return { bg: '#FFE4E6', border: '#F43F5E', text: '#9F1239' }
  if (type === 'quarter') return { bg: '#EDE9FE', border: '#8B5CF6', text: '#5B21B6' }
  if (type === 'sick')    return { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' }
  return { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' }
}

const CALENDAR_STYLE = `
  .fc-col-header-cell-cushion { font-size: 0.8rem; font-weight: 600; }
  .fc-day-sun .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
  .fc-day-sat .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
  .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion { color: #DC2626; }
  .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion { color: #004EA2; }
`

export default function CalendarPage() {
  const [mainTab, setMainTab] = useState<'campus' | 'mine'>('campus')
  const [view, setView] = useState<'dayGridMonth' | 'listMonth'>('dayGridMonth')

  // 캠퍼스 캘린더
  const [campusEvents, setCampusEvents] = useState<object[]>([])
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [summaryMonth, setSummaryMonth] = useState('')

  // 내 캘린더
  const [myEvents, setMyEvents] = useState<object[]>([])
  const [balance, setBalance] = useState<Balance | null>(null)
  const [myHolidays, setMyHolidays] = useState<object[]>([])

  useEffect(() => {
    fetch('/api/leave/summary')
      .then(r => r.json())
      .then(d => setBalance({ totalDays: d.totalDays, usedDays: d.usedDays, remainingDays: d.remainingDays }))
  }, [])

  async function loadCampusEvents(year: string, month: string) {
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalData = await res.json()
    const ev: object[] = []

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
      })
    })

    ;(data.holidays ?? []).forEach(h => {
      ev.push({ title: h.name, start: h.date, backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', textColor: '#DC2626', display: 'background' })
    })

    setSummary(data.summary ?? [])
    setSummaryMonth(`${year}년 ${parseInt(month)}월`)
    setCampusEvents(ev)
  }

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

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4">캘린더</h1>

      {/* 메인 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4">
        <button onClick={() => setMainTab('campus')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${mainTab === 'campus' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          캠퍼스 캘린더
        </button>
        <button onClick={() => setMainTab('mine')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${mainTab === 'mine' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          내 캘린더
        </button>
      </div>

      {/* ── 캠퍼스 캘린더 탭 ── */}
      {mainTab === 'campus' && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex flex-wrap gap-4">
              {[
                { color: '#DBEAFE', border: '#3B82F6', label: '연차' },
                { color: '#FEF3C7', border: '#F59E0B', label: '오전반차' },
                { color: '#FFE4E6', border: '#F43F5E', label: '오후반차' },
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
            <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4">
              <style>{CALENDAR_STYLE}</style>
              <FullCalendar
                plugins={[dayGridPlugin, listPlugin]}
                initialView={view}
                key={`campus-${view}`}
                locale={koLocale}
                events={campusEvents}
                datesSet={info => {
                  const d = (info as { view: { currentStart: Date } }).view.currentStart
                  loadCampusEvents(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
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
                        {s.annual > 0 && <span className="text-[10px] bg-[#DBEAFE] text-[#1D4ED8] px-1.5 py-0.5 rounded font-medium">연차 {s.annual}</span>}
                        {s.half > 0 && <span className="text-[10px] bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded font-medium">반차 {s.half}</span>}
                        {s.quarter > 0 && <span className="text-[10px] bg-[#EDE9FE] text-[#5B21B6] px-1.5 py-0.5 rounded font-medium">반반차 {s.quarter}</span>}
                        {s.sick > 0 && <span className="text-[10px] bg-[#FEE2E2] text-[#991B1B] px-1.5 py-0.5 rounded font-medium">병가 {s.sick}</span>}
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

      {/* ── 내 캘린더 탭 ── */}
      {mainTab === 'mine' && (
        <>
          {/* 잔여 연차 카드 */}
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
                  <div
                    className="h-full bg-[#004EA2] rounded-full transition-all"
                    style={{ width: `${balance.totalDays > 0 ? Math.min(100, (balance.usedDays / balance.totalDays) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 범례 */}
          <div className="flex flex-wrap gap-3 text-xs mb-4">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#002F65] inline-block" />승인됨</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block" />승인 대기</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FEE2E2] inline-block" />공휴일</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4">
            <style>{CALENDAR_STYLE}</style>
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
    </div>
  )
}
