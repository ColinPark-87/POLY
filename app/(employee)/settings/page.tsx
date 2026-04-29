'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (form.new_password !== form.confirm) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }

    setSuccess(true)
    setForm({ current_password: '', new_password: '', confirm: '' })
  }

  const fields = [
    { field: 'current_password', label: '현재 비밀번호' },
    { field: 'new_password', label: '새 비밀번호 (6자 이상)' },
    { field: 'confirm', label: '새 비밀번호 확인' },
  ]

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">설정</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-4 md:p-8">
        <h2 className="font-semibold text-[#1E293B] mb-5">비밀번호 변경</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(({ field, label }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-[#1E293B] mb-1">{label}</label>
              <input
                type="password"
                value={form[field as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                required
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]"
              />
            </div>
          ))}

          {error && <p className="text-[#EF4444] text-sm">{error}</p>}
          {success && (
            <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">
              비밀번호가 변경되었습니다.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4F7EF7] hover:bg-[#3B6AE8] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? '변경 중...' : '변경하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
