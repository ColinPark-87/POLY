'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

    if (!form.start_date || !form.end_date) {
      setError('날짜를 선택해주세요.')
      return
    }
    if (sigRef.current?.isEmpty()) {
      setError('서명을 입력해주세요.')
      return
    }

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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">연차 신청</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* 휴무 종류 */}
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">휴무 종류</label>
            <select
              value={form.type}
              onChange={e => update('type', e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7] bg-white"
            >
              {leaveTypes.map(t => (
                <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">시작일</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => update('start_date', e.target.value)}
                required
                className="w-full border border-[#E2E8F0] rounded-xl px-3 md:px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]"
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
                className="w-full border border-[#E2E8F0] rounded-xl px-3 md:px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]"
              />
            </div>
          </div>

          {/* 사유 */}
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">사유 <span className="text-[#94A3B8] font-normal">(선택)</span></label>
            <textarea
              value={form.reason}
              onChange={e => update('reason', e.target.value)}
              rows={3}
              placeholder="사유를 입력하세요"
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7] resize-none"
            />
          </div>

          {/* 전자서명 — 모바일에서 width를 부모에 맞게 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-[#1E293B]">전자서명 <span className="text-[#EF4444]">*</span></label>
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="text-xs text-[#64748B] underline hover:text-[#1E293B]"
              >
                지우기
              </button>
            </div>
            {/* Mobile: narrower canvas, Desktop: wider */}
            <div className="block md:hidden">
              <SignatureCanvas ref={sigRef} width={320} height={140} />
            </div>
            <div className="hidden md:block">
              <SignatureCanvas ref={sigRef} width={560} height={160} />
            </div>
          </div>

          {error && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-4 py-3 text-sm text-[#DC2626]">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-3 rounded-xl hover:bg-[#F8FAFC] transition-colors text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#4F7EF7] hover:bg-[#3B6AE8] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? '신청 중...' : '신청하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
