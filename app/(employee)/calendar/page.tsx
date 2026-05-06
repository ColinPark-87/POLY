'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface CalendarData {
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }[]
  holidays: { date: string; name: string }[]
}

interface Balance {
  totalDays: number
  usedDays: number
  remainingDays: number
}

function leaveColor(type: LeaveType) {
  if (type === 'half_am' || type === 'half_pm') return { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' }
  if (type === 'quarter') return { bg: '#EAF2FB', border: '#9BBFE8', text: '#003E83' }
  return { bg: '#CFE0F4', border: '#93C5FD', text: '#002F65' }
}

function leaveTag(type: LeaveType) {
  if (type === 'half_am') return '[오전]'
  if (type === 'half_pm') return '[오후]'
  if (type === 'quarter') return '[반반]'
  return ''
}

// FullCalendar allDay end is exclusive — add 1 day
function exclusiveEnd(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function CalendarPage() {
  const [events, setEvents] = useState<object[]>([])
  const [balance, setBalance] = useState<Balance | null>(null)

  useEffect(() => {
    fetch('/api/leave/summary')
      .then(r => r.json())
      .then(d => setBalance({ totalDays: d.totalDays, usedDays: d.usedDays, remainingDays: d.remainingDays }))
  }, [])

  async function loadEvents(start: string) {
    const year = start.slice(0, 4)
    const month = String(parseInt(start.slice(5, 7))).padStart(2, '0')
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalendarData = await res.json()

    const ev: object[] = []

    ;(data.myLeaves ?? []).forEach(r => {
      const tag = leaveTag(r.type)
      const approved = r.status === 'approved'
      ev.push({
        title: `나${tag} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: exclusiveEnd(r.end_date),
        backgroundColor: approved ? '#002F65' : '#F59E0B',
        borderColor: approved ? '#002F65' : '#F59E0B',
        textColor: '#fff',
      })
    })

    ;(data.campusLeaves ?? []).forEach(r => {
      const c = leaveColor(r.type)
      const tag = leaveTag(r.type)
      ev.push({
        title: `${r.users?.name ?? ''}${tag} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: exclusiveEnd(r.end_date),
        backgroundColor: c.bg,
        borderColor: c.border,
        textColor: c.text,
      })
    })

    ;(data.holidays ?? []).forEach(h => {
      ev.push({
        title: h.name,
        start: h.date,
        end: exclusiveEnd(h.date),
        backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        textColor: '#DC2626',
        display: 'background',
      })
    })

    setEvents(ev)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">전사 캘린더</h1>

      {/* 잔여 연차 */}
      {balance && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl px-5 py-4 mb-4 flex items-center gap-6 flex-wrap shadow-sm">
          <span className="text-sm font-semibold text-[#1E293B]">내 연차 현황</span>
          <div className="flex items-center gap-5 text-sm">
            <span className="text-[#64748B]">총 <span className="font-bold text-[#1E293B]">{balance.totalDays}일</span></span>
            <span className="text-[#64748B]">사용 <span className="font-bold text-[#EF4444]">{balance.usedDays}일</span></span>
            <span className="text-[#64748B]">잔여 <span className={`font-bold ${balance.remainingDays < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>{balance.remainingDays}일</span></span>
          </div>
          {/* 진행 바 */}
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
      <div className="flex flex-wrap gap-3 md:gap-4 text-xs mb-4">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#002F65] inline-block" />내 연차(승인)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block" />내 연차(대기)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#CFE0F4] border border-[#93C5FD] inline-block" />동료 연차</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FFF7ED] border border-[#FDBA74] inline-block" />동료 반차</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#EAF2FB] border border-[#9BBFE8] inline-block" />동료 반반차</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FEE2E2] inline-block" />공휴일</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-3 md:p-6">
        <style>{`
          .fc-day-sun .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
          .fc-day-sat .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
          .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion { color: #DC2626; }
          .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion { color: #004EA2; }
        `}</style>
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={events}
          datesSet={info => loadEvents(info.startStr)}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          height="auto"
          dayMaxEvents={3}
          weekends={true}
        />
      </div>
    </div>
  )
}
