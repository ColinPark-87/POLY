'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

const leaveTypes: LeaveType[] = ['annual', 'half_am', 'half_pm', 'quarter', 'sick', 'event', 'other']

interface Employee { id: string; name: string; position: string }

interface CalData {
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }[]
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  holidays: { date: string; name: string }[]
}

function leaveColor(type: LeaveType) {
  if (type === 'half_am' || type === 'half_pm') return { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' }
  if (type === 'quarter') return { bg: '#EAF2FB', border: '#9BBFE8', text: '#003E83' }
  return { bg: '#CFE0F4', border: '#93C5FD', text: '#002F65' }
}

function leaveTag(type: LeaveType) {
  if (type === 'half_am') return '[오전]'
  if (type === 'half_pm') return '[오후]'
  return ''
}

const DEPT_ORDER = ['원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타']

export default function DirectEntryPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState({ user_id: '', type: 'annual' as LeaveType, start_date: '', end_date: '', reason: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [calEvents, setCalEvents] = useState<object[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'position'>('name')

  useEffect(() => {
    fetch('/api/campus/employees')
      .then(r => r.json())
      .then(d => setEmployees((d.employees ?? []).filter((e: Employee & { is_active: boolean }) => e.is_active)))
  }, [])

  const filteredEmployees = employees
    .filter(e => !empSearch || e.name.includes(empSearch) || e.position.includes(empSearch))
    .sort((a, b) => {
      if (sortBy === 'position') {
        const ai = DEPT_ORDER.indexOf(a.position) >= 0 ? DEPT_ORDER.indexOf(a.position) : 99
        const bi = DEPT_ORDER.indexOf(b.position) >= 0 ? DEPT_ORDER.indexOf(b.position) : 99
        if (ai !== bi) return ai - bi
      }
      return a.name.localeCompare(b.name, 'ko')
    })

  async function loadCalEvents(year: string, month: string) {
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data: CalData = await res.json()

    const ev: object[] = []
    ;(data.campusLeaves ?? []).forEach(r => {
      const c = leaveColor(r.type)
      const tag = leaveTag(r.type)
      ev.push({
        title: `${r.users?.name ?? ''}${tag} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: c.bg,
        borderColor: c.border,
        textColor: c.text,
      })
    })
    ;(data.myLeaves ?? []).forEach(r => {
      const tag = leaveTag(r.type)
      ev.push({
        title: `[나]${tag} ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date,
        end: r.end_date,
        backgroundColor: '#10B981',
        borderColor: '#059669',
        textColor: '#fff',
      })
    })
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
    setCalEvents(ev)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (!form.user_id) { setError('직원을 선택해주세요.'); return }
    if (!form.start_date) { setError('날짜를 입력해주세요.'); return }

    setLoading(true)
    const res = await fetch('/api/campus/direct-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, end_date: form.end_date || form.start_date }),
    })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setError(d.error); return }
    setSuccess(true)
    setForm(f => ({ ...f, user_id: '', start_date: '', end_date: '', reason: '' }))
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">연차 직접 입력</h1>
      <p className="text-sm text-[#64748B] mb-5">승인 절차 없이 연차를 직접 기록합니다.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 캠퍼스 캘린더 */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1E293B]">캠퍼스 캘린더</h2>
            <div className="flex gap-3 text-xs text-[#64748B]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#CFE0F4] border border-[#93C5FD] inline-block" />
                동료 연차
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" />
                내 일정
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#FEE2E2] border border-[#FCA5A5] inline-block" />
                공휴일
              </span>
            </div>
          </div>
          <div className="p-3">
            <style>{`
              .direct-cal .fc-toolbar-title { font-size: 0.9rem; font-weight: 600; }
              .direct-cal .fc-col-header-cell-cushion { font-size: 0.72rem; }
              .direct-cal .fc-daygrid-day-number { font-size: 0.72rem; }
              .direct-cal .fc-event-title { font-size: 0.65rem; }
              .direct-cal .fc-day-sun .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
              .direct-cal .fc-day-sat .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
              .direct-cal .fc-col-header-cell.fc-day-sun { color: #DC2626; }
              .direct-cal .fc-col-header-cell.fc-day-sat { color: #004EA2; }
            `}</style>
            <div className="direct-cal">
              <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                locale={koLocale}
                events={calEvents}
                datesSet={info => {
                  const d = (info as { view: { currentStart: Date } }).view.currentStart
                  loadCalEvents(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
                }}
                headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
                height="auto"
                dayMaxEvents={2}
                weekends={true}
              />
            </div>
          </div>
        </div>

        {/* 입력 폼 */}
        <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#1E293B]">직원 선택</label>
                <div className="flex border border-[#E2E8F0] rounded-lg overflow-hidden text-xs">
                  <button type="button"
                    onClick={() => setSortBy('name')}
                    className={`px-2.5 py-1 font-medium transition-colors ${sortBy === 'name' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                    가나다순
                  </button>
                  <button type="button"
                    onClick={() => setSortBy('position')}
                    className={`px-2.5 py-1 font-medium transition-colors ${sortBy === 'position' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                    직급별
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                placeholder="이름 또는 직급 검색..."
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-2"
              />
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                size={6}
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                <option value="">-- 직원 선택 --</option>
                {filteredEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>[{emp.position}] {emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">휴무 종류</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LeaveType }))}
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                {leaveTypes.map(t => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-2">시작일</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value }))}
                  required
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-2">종료일</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">비고 (선택)</label>
              <input type="text" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="사유 또는 메모"
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
            </div>
            {error && <p className="text-[#EF4444] text-sm">{error}</p>}
            {success && (
              <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">
                ✅ 연차가 기록되었습니다.
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
              {loading ? '저장 중...' : '직접 입력 저장'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
