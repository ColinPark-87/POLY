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

export default function CalendarPage() {
  const [events, setEvents] = useState<object[]>([])

  async function loadEvents(start: string) {
    const year = start.slice(0, 4)
    const month = String(parseInt(start.slice(5, 7))).padStart(2, '0')
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalendarData = await res.json()

    const ev: object[] = []

    ;(data.myLeaves ?? []).forEach(r => {
      ev.push({
        title: `나 · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        color: r.status === 'approved' ? '#4F7EF7' : '#F59E0B',
        textColor: '#fff',
      })
    })

    ;(data.campusLeaves ?? []).forEach(r => {
      ev.push({
        title: `${r.users?.name} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        color: '#E0E7FF',
        textColor: '#4F7EF7',
      })
    })

    ;(data.holidays ?? []).forEach(h => {
      ev.push({
        title: h.name,
        start: h.date,
        color: '#FEE2E2',
        textColor: '#EF4444',
        display: 'background',
      })
    })

    setEvents(ev)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">캘린더</h1>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 md:gap-4 text-xs mb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#4F7EF7] inline-block"></span>
          내 연차(승인)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#F59E0B] inline-block"></span>
          내 연차(대기)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#E0E7FF] inline-block"></span>
          동료 연차
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FEE2E2] inline-block"></span>
          공휴일
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-3 md:p-6">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={events}
          datesSet={info => loadEvents(info.startStr)}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
        />
      </div>
    </div>
  )
}
