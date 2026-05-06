'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

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
        <div className="flex border border-[#E2E8F0] rounded-xl overflow-hidden">
          <button
            onClick={() => setView('dayGridMonth')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'dayGridMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}
          >월</button>
          <button
            onClick={() => setView('listMonth')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'listMonth' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}
          >목록</button>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-4 mb-4">
        {[
          { color: '#CFE0F4', border: '#93C5FD', label: '연차' },
          { color: '#FFF7ED', border: '#FDBA74', label: '반차' },
          { color: '#EAF2FB', border: '#9BBFE8', label: '반반차' },
          { color: '#10B981', border: '#059669', label: '내 일정 (승인)' },
          { color: '#F59E0B', border: '#D97706', label: '내 일정 (대기)' },
          { color: '#FEE2E2', border: '#FCA5A5', label: '공휴일' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-sm border flex-shrink-0"
              style={{ backgroundColor: l.color, borderColor: l.border }}
            />
            <span className="text-xs text-[#64748B]">{l.label}</span>
          </div>
        ))}
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
    </div>
  )
}
