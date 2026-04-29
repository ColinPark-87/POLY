'use client'

import { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

export default function HqCalendarPage() {
  const [events, setEvents] = useState<object[]>([])

  async function loadEvents(start: string) {
    const year = start.slice(0, 4)
    const month = String(parseInt(start.slice(5, 7))).padStart(2, '0')
    const res = await fetch(`/api/hq/calendar?year=${year}&month=${month}`)
    const data = await res.json()

    const ev: object[] = []

    ;(data.leaves ?? []).forEach((r: {
      type: LeaveType
      start_date: string
      end_date: string
      users: { name: string } | null
      campuses: { name: string } | null
    }) => {
      ev.push({
        title: `[${r.campuses?.name ?? ''}] ${r.users?.name ?? ''} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        color: '#4F7EF7',
        textColor: '#fff',
      })
    })
    ;(data.holidays ?? []).forEach((h: { date: string; name: string }) => {
      ev.push({ title: h.name, start: h.date, color: '#FEE2E2', textColor: '#EF4444', display: 'background' })
    })

    setEvents(ev)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">통합 캘린더</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-3 md:p-6">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={events}
          datesSet={info => loadEvents(info.startStr)}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          height="auto"
          dayMaxEvents={3}
        />
      </div>
    </div>
  )
}
