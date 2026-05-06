'use client'

import { useState } from 'react'

export default function EmailSetupBanner({ needsSetup }: { needsSetup: boolean }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!needsSetup) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (form.password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }
    setLoading(true)
    const res = await fetch('/api/user/email', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, password: form.password }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    window.location.reload()
  }

  return (
    <>
      <div className="bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2.5 flex items-center gap-3 shrink-0">
        <span className="text-sm font-medium text-[#92400E]">⚠ 이메일 설정이 필요합니다</span>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs text-[#D97706] font-semibold underline hover:text-[#B45309]"
        >
          지금 설정하기 →
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] text-lg mb-1">이메일 설정</h3>
            <p className="text-sm text-[#64748B] mb-5">처음 로그인하셨습니다. 이메일과 새 비밀번호를 설정해주세요.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일 *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">새 비밀번호 *</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="6자 이상"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">비밀번호 확인 *</label>
                <input
                  type="password"
                  required
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="비밀번호 재입력"
                />
              </div>
              {error && <p className="text-[#EF4444] text-sm">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm hover:bg-[#F7F8FA]"
                >취소</button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
                >{loading ? '설정 중...' : '설정 완료'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
