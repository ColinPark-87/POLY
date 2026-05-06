'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

const leaveTypes: LeaveType[] = ['annual','half_am','half_pm','quarter','sick','event','other']

export default function ApplyPage() {
  const router = useRouter()
  const sigRef = useRef<SignatureCanvasHandle>(null)
  const [form, setForm] = useState({
    type: 'annual' as LeaveType,
    start_date: '',
    end_date: '',
    reason: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [calEvents, setCalEvents] = useState<object[]>([])

  async function loadCalendar(start: string) {
    const year = start.slice(0, 4)
    const month = String(parseInt(start.slice(5, 7))).padStart(2, '0')
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    const data = await res.json()
    const ev: object[] = []
    ;(data.myLeaves ?? []).forEach((r: { type: LeaveType; start_date: string; end_date: string; status: string }) => {
      ev.push({
        title: `나 · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date, end: r.end_date,
        color: r.status === 'approved' ? '#004EA2' : '#F59E0B',
        textColor: '#fff',
      })
    })
    ;(data.campusLeaves ?? []).forEach((r: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }) => {
      ev.push({
        title: `${r.users?.name} · ${LEAVE_TYPE_LABELS[r.type]}`,
        start: r.start_date, end: r.end_date,
        color: '#EAF2FB', textColor: '#004EA2',
      })
    })
    ;(data.holidays ?? []).forEach((h: { date: string; name: string }) => {
      ev.push({ title: `🎌 ${h.name}`, start: h.date, color: '#FEF2F2', textColor: '#DC2626', display: 'block' })
    })
    setCalEvents(ev)
  }

  function update(field: string, value: string) {
    setForm(f => {
      const next = { ...f, [field]: value }
      if (field === 'start_date' && !f.end_date) next.end_date = value
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.start_date || !form.end_date) { setError('날짜를 선택해주세요.'); return }
    if (sigRef.current?.isEmpty()) { setError('서명을 입력해주세요.'); return }
    const signature_data_url = sigRef.current?.getDataURL()
    setLoading(true)
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, signature_data_url }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    router.push('/history?submitted=1')
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">연차 신청</h1>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        {/* ── 캠퍼스 캘린더 ── */}
        <div className="w-full bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F7F8FA] flex items-center gap-3">
            <span className="font-semibold text-[#1E293B] text-sm">캠퍼스 연차 현황</span>
            <div className="flex gap-3 text-xs text-[#64748B]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#004EA2] inline-block" />내 연차(승인)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" />내 연차(대기)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#EAF2FB] border border-[#004EA2] inline-block" />동료</span>
            </div>
          </div>
          <div className="p-3 md:p-5">
            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              locale={koLocale}
              events={calEvents}
              datesSet={info => loadCalendar(info.startStr)}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              height="auto"
              dayMaxEvents={3}
              dayCellClassNames={(arg) => {
                const d = arg.date.getDay()
                if (d === 0) return ['fc-sunday']
                if (d === 6) return ['fc-saturday']
                return []
              }}
            />
          </div>
          <style>{`
            .fc-sunday .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
            .fc-saturday .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
          `}</style>
        </div>

        {/* ── 신청 폼 ── */}
        <div className="w-full lg:w-[420px] shrink-0 bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">휴무 종류</label>
              <select
                value={form.type}
                onChange={e => update('type', e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white"
              >
                {leaveTypes.map(t => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-2">시작일</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => update('start_date', e.target.value)}
                  required
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-2">종료일</label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={e => update('end_date', e.target.value)}
                  required
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">사유 <span className="text-[#94A3B8] font-normal">(선택)</span></label>
              <textarea
                value={form.reason}
                onChange={e => update('reason', e.target.value)}
                rows={3}
                placeholder="사유를 입력하세요"
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] resize-none"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-[#1E293B]">전자서명 <span className="text-[#EF4444]">*</span></label>
                <button type="button" onClick={() => sigRef.current?.clear()} className="text-xs text-[#64748B] underline hover:text-[#1E293B]">지우기</button>
              </div>
              <div className="block md:hidden">
                <SignatureCanvas ref={sigRef} width={320} height={140} />
              </div>
              <div className="hidden md:block">
                <SignatureCanvas ref={sigRef} width={360} height={140} />
              </div>
            </div>

            {error && (
              <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-4 py-3 text-sm text-[#DC2626]">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => router.back()} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-3 rounded-xl hover:bg-[#F7F8FA] transition-colors text-sm">취소</button>
              <button type="submit" disabled={loading} className="flex-1 bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
                {loading ? '신청 중...' : '신청하기'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
