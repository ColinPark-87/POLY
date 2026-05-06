'use client'

import { useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

interface Campus { id: string; name: string }

export default function HqCalendarPage() {
  const [events, setEvents] = useState<object[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [selectedTab, setSelectedTab] = useState<string>('all')
  const currentRangeRef = useRef<{ year: string; month: string } | null>(null)
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)

  useEffect(() => {
    fetch('/api/hq/campuses').then(r => r.json()).then(d => setCampuses(d.campuses ?? []))
  }, [])

  function leaveColor(type: LeaveType) {
    if (type === 'half_am' || type === 'half_pm') return { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' }
    if (type === 'quarter') return { bg: '#EAF2FB', border: '#9BBFE8', text: '#003E83' }
    if (type === 'sick') return { bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C' }
    if (type === 'event') return { bg: '#F0FDF4', border: '#6EE7B7', text: '#047857' }
    return { bg: '#CFE0F4', border: '#93C5FD', text: '#002F65' }
  }

  function leaveTag(type: LeaveType) {
    if (type === 'half_am') return '[오전]'
    if (type === 'half_pm') return '[오후]'
    if (type === 'quarter') return '[반반]'
    if (type === 'sick') return '[병가]'
    if (type === 'event') return '[경조]'
    return ''
  }

  async function loadEvents(year: string, month: string, campusId: string) {
    const params = new URLSearchParams({ year, month })
    if (campusId !== 'all') params.set('campus_id', campusId)
    const res = await fetch(`/api/hq/calendar?${params}`)
    const data = await res.json()

    const ev: object[] = []

    ;(data.leaves ?? []).forEach((r: {
      type: LeaveType
      start_date: string
      end_date: string
      users: { name: string } | null
      campuses: { name: string } | null
    }) => {
      const c = leaveColor(r.type)
      const tag = leaveTag(r.type)
      const prefix = campusId === 'all' ? `[${r.campuses?.name ?? ''}] ` : ''
      ev.push({
        title: `${prefix}${r.users?.name ?? ''}${tag} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: c.bg,
        borderColor: c.border,
        textColor: c.text,
      })
    })
    ;(data.holidays ?? []).forEach((h: { date: string; name: string }) => {
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

  function handleDatesSet(info: { startStr: string; view: { currentStart: Date } }) {
    const d = info.view.currentStart
    const year = String(d.getFullYear())
    const month = String(d.getMonth() + 1).padStart(2, '0')
    currentRangeRef.current = { year, month }
    loadEvents(year, month, selectedTab)
  }

  function handleTabChange(campusId: string) {
    setSelectedTab(campusId)
    if (currentRangeRef.current) {
      loadEvents(currentRangeRef.current.year, currentRangeRef.current.month, campusId)
    }
  }

  const tabs = [{ id: 'all', name: '통합 캘린더' }, ...campuses.map(c => ({ id: c.id, name: c.name }))]

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4">캘린더</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              selectedTab === tab.id
                ? 'bg-[#0F172A] text-white'
                : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {[
          { color: '#CFE0F4', border: '#93C5FD', label: '연차' },
          { color: '#FFF7ED', border: '#FDBA74', label: '반차' },
          { color: '#EAF2FB', border: '#9BBFE8', label: '반반차' },
          { color: '#FEF2F2', border: '#FCA5A5', label: '병가' },
          { color: '#F0FDF4', border: '#6EE7B7', label: '경조사' },
          { color: '#FEE2E2', border: '#FCA5A5', label: '공휴일' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border inline-block" style={{ backgroundColor: l.color, borderColor: l.border }} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-3 md:p-6">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={events}
          datesSet={handleDatesSet}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          height="auto"
          dayMaxEvents={4}
          weekends={true}
          dayCellClassNames={(arg) => {
            const day = arg.date.getDay()
            if (day === 0) return ['fc-sunday']
            if (day === 6) return ['fc-saturday']
            return []
          }}
        />
      </div>

      <style>{`
        .fc-sunday .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
        .fc-saturday .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
        .fc-sunday { background-color: #FFF8F8 !important; }
        .fc-saturday { background-color: #F8F9FF !important; }
      `}</style>
    </div>
  )
}
