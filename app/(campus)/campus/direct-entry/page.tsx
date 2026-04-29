'use client'

import { useEffect, useState } from 'react'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'

const leaveTypes: LeaveType[] = ['annual','half_am','half_pm','quarter','sick','event','other']

interface Employee { id: string; name: string; position: string }

export default function DirectEntryPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState({ user_id: '', type: 'annual' as LeaveType, start_date: '', end_date: '', reason: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/campus/employees')
      .then(r => r.json())
      .then(d => setEmployees((d.employees ?? []).filter((e: Employee & { is_active: boolean }) => e.is_active)))
  }, [])

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
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">연차 직접 입력</h1>
      <p className="text-sm text-[#64748B] mb-5">승인 절차 없이 연차를 직접 기록합니다.</p>

      <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">직원 선택</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED] bg-white">
              <option value="">-- 직원 선택 --</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.position})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">휴무 종류</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LeaveType }))}
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED] bg-white">
              {leaveTypes.map(t => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">시작일</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value }))} required
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">종료일</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">비고 (선택)</label>
            <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="사유 또는 메모"
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]" />
          </div>
          {error && <p className="text-[#EF4444] text-sm">{error}</p>}
          {success && <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">✅ 연차가 기록되었습니다.</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
            {loading ? '저장 중...' : '직접 입력 저장'}
          </button>
        </form>
      </div>
    </div>
  )
}
