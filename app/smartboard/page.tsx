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
  test?: boolean
}

export default function SmartboardPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [notAuthorized, setNotAuthorized] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [campusId, setCampusId] = useState('')
  const [active, setActive] = useState<ActiveClass | null>(null)
  const [clock, setClock] = useState('')
  const dismissedRef = useRef<Set<string>>(new Set())
  // 교실 변경 모달
  const [changeOpen, setChangeOpen] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeOk, setCodeOk] = useState(false)
  const [changeErr, setChangeErr] = useState('')
  const [changeCode, setChangeCode] = useState('7659')
  const [roomList, setRoomList] = useState<{ num: number; display_name: string }[]>([])
  const [autoErr, setAutoErr] = useState('')
  // URL ?computer=N 에서 즉시(동기) 추출 — 첫 렌더부터 제목에 번호가 박히게 (AHK 감지 안정)
  const [computerNum] = useState(() => {
    if (typeof window === 'undefined') return ''
    const n = new URLSearchParams(window.location.search).get('computer')
    return n && /^\d+$/.test(n) ? n : ''
  })

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      let { data: { user } } = await supabase.auth.getUser()
      const params = new URLSearchParams(window.location.search)
      const num = params.get('computer')

      // ?computer=N 쿼리 → 자동 로그인 (부팅 자동시작용)
      // 이미 smartboard 계정이어도, 쿼리 번호와 다른 계정이면 교체
      const wantEmail = num && /^\d+$/.test(num) ? `computer${num}@jungkye.poly` : null
      const currentEmail = user?.email ?? null
      const needLogin = wantEmail && (
        !user || user.user_metadata?.role !== 'smartboard' || currentEmail !== wantEmail
      )

      if (needLogin) {
        // 기존 세션 정리 후 재로그인 (안정성)
        if (user && currentEmail !== wantEmail) { await supabase.auth.signOut() }
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: wantEmail!, password: '7659',
        })
        if (error) {
          setAutoErr(`자동로그인 실패 (${wantEmail}): ${error.message}`)
        } else if (signInData.user) {
          user = signInData.user
        }
      }

      if (!user || user.user_metadata?.role !== 'smartboard') {
        if (user && user.user_metadata?.role !== 'smartboard') {
          setAutoErr(prev => prev || `로그인됨(${user!.email})이나 스마트보드 계정 아님`)
        }
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
    const json = await res.json() as { active: ActiveClass | null; changeCode?: string }
    if (json.changeCode) setChangeCode(json.changeCode)
    const a = json.active
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

  // 창 제목 — AutoHotkey 도우미가 이 제목으로 창 띄움/숨김 감지 (컴퓨터별 고유 prefix)
  useEffect(() => {
    const pfx = computerNum ? `POLLY_ATTENDANCE_${computerNum}_` : 'POLLY_ATTENDANCE_'
    document.title = active ? `${pfx}ACTIVE` : `${pfx}IDLE`
  }, [active, computerNum])

  function handleComplete() {
    if (active) {
      const today = new Date().toISOString().split('T')[0]
      dismissedRef.current.add(`${today}-${active.class_id}`)
      // 테스트 팝업은 서버에서도 해제 (안 하면 계속 다시 뜸 — stuck 방지)
      if (active.test) {
        fetch('/api/smartboard/test-off', { method: 'POST' }).catch(() => {})
      }
    }
    setActive(null)
    try { window.blur() } catch {}
  }

  async function changeToComputer(num: number) {
    const supabase = createClient()
    await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithPassword({ email: `computer${num}@jungkye.poly`, password: '7659' })
    if (error) { setChangeErr(`컴퓨터${num} 로그인 실패`); return }
    window.location.href = '/smartboard'
  }

  if (!authChecked) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-xl">로딩 중...</div>
  }
  if (notAuthorized) return <SmartboardLogin autoErr={autoErr} />

  return (
    <div className="flex flex-col items-center justify-center min-h-screen select-none">
      <p className="text-[#004EA2] text-3xl font-extrabold mb-2">{roomName}</p>
      <p className="text-gray-300 text-6xl font-mono mb-4">{clock}</p>
      <p className="text-gray-400 text-lg">출석 대기 중...</p>

      {/* 우하단 교실 변경 — 코드 입력 필요 */}
      <button onClick={async () => {
          setChangeOpen(true); setCodeInput(''); setCodeOk(false); setChangeErr('')
          const r = await fetch('/api/smartboard/classrooms')
          if (r.ok) { const d = await r.json(); setRoomList(d.rooms ?? []) }
        }}
        className="fixed bottom-3 right-3 text-xs text-gray-300 hover:text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
        교실 변경 ({roomName})
      </button>

      {/* 교실 변경 모달 */}
      {changeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]" onClick={() => setChangeOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1E293B]">교실 변경</h3>
              <button onClick={() => setChangeOpen(false)} className="text-gray-400">✕</button>
            </div>

            {!codeOk ? (
              <form onSubmit={e => { e.preventDefault(); if (codeInput === changeCode) { setCodeOk(true); setChangeErr('') } else setChangeErr('코드가 틀렸습니다') }}>
                <label className="text-sm text-gray-600 block mb-1">변경 코드 입력</label>
                <input type="password" value={codeInput} autoFocus
                  onChange={e => setCodeInput(e.target.value)}
                  placeholder="코드"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                {changeErr && <p className="text-red-600 text-sm mt-2">{changeErr}</p>}
                <button type="submit" className="w-full mt-3 bg-[#004EA2] text-white font-bold py-3 rounded-xl">확인</button>
              </form>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">변경할 교실을 선택하세요</p>
                <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                  {(roomList.length ? roomList : Array.from({ length: 11 }, (_, i) => ({ num: i + 1, display_name: '' }))).map(r => (
                    <button key={r.num} onClick={() => changeToComputer(r.num)}
                      className="flex flex-col items-center py-2.5 rounded-xl border-2 border-gray-200 hover:border-[#004EA2] hover:bg-[#EAF2FB]">
                      <span className="text-base font-bold text-[#1E293B]">{r.display_name || `컴퓨터${r.num}`}</span>
                      <span className="text-[9px] text-gray-400">컴퓨터{r.num}</span>
                    </button>
                  ))}
                </div>
                {changeErr && <p className="text-red-600 text-sm mt-2">{changeErr}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {active && (
        <AttendanceOverlay
          classId={active.class_id}
          campusId={campusId}
          students={active.students}
          onComplete={handleComplete}
          isTest={active.test}
        />
      )}
    </div>
  )
}

function SmartboardLogin({ autoErr }: { autoErr?: string }) {
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
        {autoErr && <p className="text-orange-600 text-xs text-center bg-orange-50 rounded-lg p-2">{autoErr}</p>}
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
