'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

export default function CampusCalendarPage() {
  const [events, setEvents] = useState<object[]>([])

  async function loadEvents(start: string) {
    const year = start.slice(0, 4)
    const month = String(parseInt(start.slice(5, 7))).padStart(2, '0')
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data = await res.json()

    const ev: object[] = []

    ;(data.myLeaves ?? []).forEach((r: { type: LeaveType; start_date: string; end_date: string; status: string; users?: { name: string } }) => {
      ev.push({ title: `${r.users?.name ?? ''} · ${LEAVE_TYPE_LABELS[r.type]}`, start: r.start_date, end: r.end_date, color: r.status === 'approved' ? '#7C3AED' : '#F59E0B', textColor: '#fff' })
    })
    ;(data.campusLeaves ?? []).forEach((r: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }) => {
      ev.push({ title: `${r.users?.name} · ${LEAVE_TYPE_LABELS[r.type]}`, start: r.start_date, end: r.end_date, color: '#F3F0FF', textColor: '#7C3AED' })
    })
    ;(data.holidays ?? []).forEach((h: { date: string; name: string }) => {
      ev.push({ title: h.name, start: h.date, color: '#FEE2E2', textColor: '#EF4444', display: 'background' })
    })

    setEvents(ev)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">캠퍼스 캘린더</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-3 md:p-6">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={events}
          datesSet={info => loadEvents(info.startStr)}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          height="auto"
          dayMaxEvents={4}
        />
      </div>
    </div>
  )
}
