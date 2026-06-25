'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer'
import { AttendanceOverlay } from '@/components/attendance/AttendanceOverlay'

export default function SmartboardPage() {
  const [classId, setClassId] = useState<string>('')
  const [campusId, setCampusId] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [notAuthorized, setNotAuthorized] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.user_metadata?.role !== 'smartboard') {
        setNotAuthorized(true)
        setAuthChecked(true)
        return
      }
      setClassId(user.user_metadata.class_id ?? '')
      setCampusId(user.user_metadata.campus_id ?? '')
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  const { showOverlay, students, dismissOverlay } = useAttendanceTimer(classId, campusId)

  if (!authChecked) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-xl">로딩 중...</div>
  }

  if (notAuthorized) {
    return <SmartboardLogin />
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400 text-xl select-none">대기 중...</p>
      {showOverlay && classId && (
        <AttendanceOverlay
          classId={classId}
          campusId={campusId}
          students={students}
          onComplete={dismissOverlay}
        />
      )}
    </div>
  )
}

function SmartboardLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('로그인 실패: ' + authError.message)
      setLoading(false)
      return
    }
    if (data.user?.user_metadata?.role !== 'smartboard') {
      await supabase.auth.signOut()
      setError('스마트보드 전용 계정이 아닙니다')
      setLoading(false)
      return
    }
    window.location.reload()
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center text-[#004EA2]">스마트보드 로그인</h1>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#004EA2] text-white text-xl font-bold py-4 rounded-xl disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
