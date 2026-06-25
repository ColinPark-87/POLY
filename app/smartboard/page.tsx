'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AttendanceOverlay } from '@/components/attendance/AttendanceOverlay'
import type { StudentForOverlay } from '@/hooks/useAttendanceTimer'

interface ActiveClass {
  class_id: string
  class_level: string
  session_name: string
  time_range: string
  students: StudentForOverlay[]
}

export default function SmartboardPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [notAuthorized, setNotAuthorized] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [campusId, setCampusId] = useState('')
  const [active, setActive] = useState<ActiveClass | null>(null)
  const [clock, setClock] = useState('')
  const dismissedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      let { data: { user } } = await supabase.auth.getUser()

      // ?computer=N 쿼리 → 자동 로그인 (부팅 자동시작용)
      if (!user || user.user_metadata?.role !== 'smartboard') {
        const params = new URLSearchParams(window.location.search)
        const num = params.get('computer')
        if (num && /^\d+$/.test(num)) {
          const { error } = await supabase.auth.signInWithPassword({
            email: `computer${num}@jungkye.poly`, password: '7659',
          })
          if (!error) {
            const r = await supabase.auth.getUser()
            user = r.data.user
          }
        }
      }

      if (!user || user.user_metadata?.role !== 'smartboard') {
        setNotAuthorized(true); setAuthChecked(true); return
      }
      setRoomName(user.user_metadata.display_name ?? '교실')
      setCampusId(user.user_metadata.campus_id ?? '')
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  // 현재 팝업 대상 폴링 (30초)
  const poll = useCallback(async () => {
    const res = await fetch('/api/smartboard/current')
    if (!res.ok) return
    const { active: a } = await res.json() as { active: ActiveClass | null }
    if (!a) { setActive(null); return }
    const today = new Date().toISOString().split('T')[0]
    const key = `${today}-${a.class_id}`
    if (dismissedRef.current.has(key)) return // 이번 세션에서 이미 완료/닫음
    setActive(a)
    try { window.focus() } catch {}
  }, [])

  useEffect(() => {
    if (!authChecked || notAuthorized) return
    poll()
    const id = setInterval(poll, 10_000)
    return () => clearInterval(id)
  }, [authChecked, notAuthorized, poll])

  // 시계
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClock(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  function handleComplete() {
    if (active) {
      const today = new Date().toISOString().split('T')[0]
      dismissedRef.current.add(`${today}-${active.class_id}`)
    }
    setActive(null)
    try { window.blur() } catch {}
  }

  if (!authChecked) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-xl">로딩 중...</div>
  }
  if (notAuthorized) return <SmartboardLogin />

  return (
    <div className="flex flex-col items-center justify-center min-h-screen select-none">
      <p className="text-[#004EA2] text-3xl font-extrabold mb-2">{roomName}</p>
      <p className="text-gray-300 text-6xl font-mono mb-4">{clock}</p>
      <p className="text-gray-400 text-lg">출석 대기 중...</p>
      {active && (
        <AttendanceOverlay
          classId={active.class_id}
          campusId={campusId}
          students={active.students}
          onComplete={handleComplete}
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
