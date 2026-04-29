'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }

    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <h1 className="text-xl font-bold text-[#1E293B] mb-2">비밀번호 설정</h1>
        <p className="text-[#64748B] text-sm mb-6">첫 로그인입니다. 새 비밀번호를 설정해주세요.</p>

        <form onSubmit={handleSetup} className="space-y-4">
          <input
            type="password"
            placeholder="새 비밀번호 (6자 이상)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]"
          />
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F7EF7]"
          />
          {error && <p className="text-[#EF4444] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4F7EF7] hover:bg-[#3B6AE8] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? '설정 중...' : '비밀번호 설정 완료'}
          </button>
        </form>
      </div>
    </div>
  )
}
