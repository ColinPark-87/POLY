'use client'

import { useState, useEffect } from 'react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import InstallAppButton from '@/components/InstallAppButton'

interface Campus {
  id: string
  name: string
}

type LoginMode = 'name' | 'email' | 'computer'

const JUNGKYE_CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'

export default function LoginPage() {
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [smartRooms, setSmartRooms] = useState<{ num: number; display_name: string }[]>([])
  const [selected, setSelected] = useState('hq')
  const [mode, setMode] = useState<LoginMode>('email') // hq는 항상 email, 캠퍼스는 기본 name
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 계정 설정 모달
  const [setupModal, setSetupModal] = useState(false)
  const [setupCodeRequired, setSetupCodeRequired] = useState(false)
  const [setupForm, setSetupForm] = useState({ email: '', password: '', confirm: '', code: '' })
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState('')

  // 비밀번호 찾기 모달
  const [forgotModal, setForgotModal] = useState(false)
  const [forgotCampus, setForgotCampus] = useState('hq')
  const [forgotName, setForgotName] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotResult, setForgotResult] = useState<{ name?: string; maskedEmail?: string } | null>(null)

  useEffect(() => {
    fetch('/api/public/campuses')
      .then(r => r.json())
      .then(d => setCampuses(d.campuses ?? []))
    fetch('/api/public/smartboard-rooms')
      .then(r => r.json())
      .then(d => setSmartRooms(d.rooms ?? []))
      .catch(() => {})

    // 저장된 아이디 불러오기
    try {
      const saved = localStorage.getItem('poly-login-saved')
      if (saved) {
        const { selected: s, mode: m, identifier } = JSON.parse(saved)
        if (s) setSelected(s)
        if (m) setMode(m)
        if (identifier) setForm(f => m === 'name' ? { ...f, name: identifier } : { ...f, email: identifier })
        setRememberMe(true)
      }
    } catch {}
  }, [])

  // 소속 변경 시 모드 초기화 (저장된 아이디와 다른 소속으로 바꾸면 필드 리셋)
  function handleSelectChange(val: string) {
    setSelected(val)
    setMode(val === 'hq' ? 'email' : 'name')
    setForm({ name: '', email: '', password: '' })
    setError('')
  }

  async function handleComputerLogin(num: number) {
    setLoading(true)
    setError('')
    const email = `computer${num}@jungkye.poly`
    const supabase = createBrowserClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: '7659' })
    if (authErr) {
      setError(`컴퓨터${num} 로그인 실패: 계정이 없거나 비밀번호 오류`)
      setLoading(false)
      return
    }
    window.location.href = '/smartboard'
  }

  // 부팅 자동시작 파일(.vbs) 다운로드 — cmd창 없이 크롬 최소화 + 자동로그인 실행
  function downloadStartupFile(num: number) {
    const url = `${window.location.origin}/smartboard?computer=${num}`
    const vbs = [
      `' 폴리 출석 시스템 자동시작 - 컴퓨터${num}`,
      `' 사용법: 이 파일을 시작프로그램 폴더에 넣으세요 (Win+R -> shell:startup)`,
      `Set ws = CreateObject("WScript.Shell")`,
      `chromePath = ""`,
      `paths = Array( _`,
      `  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", _`,
      `  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", _`,
      `  ws.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\Google\\Chrome\\Application\\chrome.exe" )`,
      `Set fso = CreateObject("Scripting.FileSystemObject")`,
      `For Each p In paths`,
      `  If fso.FileExists(p) Then chromePath = p : Exit For`,
      `Next`,
      `If chromePath = "" Then chromePath = "chrome.exe"`,
      `' 2 = 최소화 상태로 실행 (창 안 보임)`,
      `ws.Run """" & chromePath & """ --app=""${url}"" --start-minimized", 2, False`,
    ].join('\r\n')

    const blob = new Blob([vbs], { type: 'text/vbscript' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `폴리출석_컴퓨터${num}.vbs`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // AHK 도우미 스크립트 생성
  function buildAhk(num: number) {
    const url = `${window.location.origin}/smartboard?computer=${num}`
    return [
      `; 폴리 출석 도우미 - 컴퓨터${num}`,
      `#NoTrayIcon`,
      `#SingleInstance, Force`,
      `SetTitleMatchMode, 2`,
      `chromePath := ""`,
      `for i, p in [A_ProgramFiles "\\Google\\Chrome\\Application\\chrome.exe"`,
      `  , "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"`,
      `  , A_AppData "\\..\\Local\\Google\\Chrome\\Application\\chrome.exe"]`,
      `  if FileExist(p)`,
      `  {`,
      `    chromePath := p`,
      `    break`,
      `  }`,
      `if (chromePath = "")`,
      `  chromePath := "chrome.exe"`,
      `prevState := "INIT"`,
      `Loop`,
      `{`,
      `  ; 출석앱 창이 없으면(닫혔거나 최초) 전체화면 앱으로 실행 후 최소화`,
      `  if (!WinExist("POLLY_ATTENDANCE_ACTIVE") and !WinExist("POLLY_ATTENDANCE_IDLE"))`,
      `  {`,
      `    Run, %chromePath% --app="${url}" --start-fullscreen`,
      `    Sleep, 6000`,
      `    if WinExist("POLLY_ATTENDANCE_IDLE")`,
      `      WinMinimize, POLLY_ATTENDANCE_IDLE`,
      `    prevState := "IDLE"`,
      `    continue`,
      `  }`,
      `  ; ACTIVE: 막 바뀐 순간에만 1회 복원·활성화 (F11 안 씀 → 깜빡임 없음)`,
      `  if WinExist("POLLY_ATTENDANCE_ACTIVE")`,
      `  {`,
      `    if (prevState != "ACTIVE")`,
      `    {`,
      `      WinRestore, POLLY_ATTENDANCE_ACTIVE`,
      `      WinActivate, POLLY_ATTENDANCE_ACTIVE`,
      `      prevState := "ACTIVE"`,
      `    }`,
      `  }`,
      `  ; IDLE: 막 바뀐 순간 1회 최소화 + 혹시 떠 있으면 계속 숨김`,
      `  else if WinExist("POLLY_ATTENDANCE_IDLE")`,
      `  {`,
      `    if (prevState != "IDLE")`,
      `    {`,
      `      WinMinimize, POLLY_ATTENDANCE_IDLE`,
      `      prevState := "IDLE"`,
      `    }`,
      `    else`,
      `    {`,
      `      WinGet, mmx, MinMax, POLLY_ATTENDANCE_IDLE`,
      `      if (mmx != -1)`,
      `        WinMinimize, POLLY_ATTENDANCE_IDLE`,
      `    }`,
      `  }`,
      `  Sleep, 1500`,
      `}`,
    ].join('\r\n')
  }

  // UTF-8 → base64 (한글 안전)
  function utf8ToBase64(s: string) {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    bytes.forEach(b => { bin += String.fromCharCode(b) })
    return btoa(bin)
  }

  // 원클릭 자동설치 .bat — AHK 설치 + 도우미 등록 + 실행 전부 자동
  function downloadAutoInstaller(num: number, roomName: string) {
    const ahkB64 = utf8ToBase64(buildAhk(num))
    const bat = [
      `@echo off`,
      `chcp 65001 >nul`,
      `title 폴리 출석 자동설치 - ${roomName || ('컴퓨터' + num)}`,
      `echo ============================================`,
      `echo   폴리 출석 시스템 자동 설치`,
      `echo   교실: ${roomName || ('컴퓨터' + num)} (컴퓨터${num})`,
      `echo ============================================`,
      `echo.`,
      `echo [1/3] AutoHotkey 설치 확인...`,
      `set "AHK_OK="`,
      `if exist "%ProgramFiles%\\AutoHotkey\\AutoHotkey.exe" set "AHK_OK=1"`,
      `if exist "%ProgramFiles%\\AutoHotkey\\v1.1.37.02\\AutoHotkeyU64.exe" set "AHK_OK=1"`,
      `if defined AHK_OK (`,
      `  echo     이미 설치됨`,
      `) else (`,
      `  echo     다운로드 중... 잠시 기다려주세요`,
      `  powershell -ExecutionPolicy Bypass -Command "try{Invoke-WebRequest -Uri 'https://www.autohotkey.com/download/ahk-install.exe' -OutFile \\"$env:TEMP\\ahk.exe\\"}catch{exit 1}"`,
      `  echo     설치 중...`,
      `  "%TEMP%\\ahk.exe" /S`,
      `  timeout /t 5 /nobreak >nul`,
      `)`,
      `echo [2/3] 도우미 파일 생성...`,
      `powershell -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllText([Environment]::GetFolderPath('Startup')+'\\폴리출석도우미.ahk', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${ahkB64}')))"`,
      `echo [3/3] 실행...`,
      `start "" "%AppData%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\폴리출석도우미.ahk"`,
      `echo.`,
      `echo  완료! 컴퓨터를 켤 때마다 자동 실행됩니다.`,
      `echo  수업 시간이 되면 출석판이 자동으로 화면에 뜹니다.`,
      `echo  이 창은 닫아도 됩니다.`,
      `echo.`,
      `pause`,
    ].join('\r\n')

    // UTF-8 BOM 추가 (cmd 한글 표시)
    const blob = new Blob(['﻿' + bat], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `폴리출석_원클릭설치_${roomName || ('컴퓨터' + num)}.bat`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // AHK 파일만 다운로드 (수동 설치용)
  function downloadAhkFile(num: number) {
    const blob = new Blob([buildAhk(num)], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `폴리출석도우미_컴퓨터${num}.ahk`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function saveOrClearId() {
    if (rememberMe) {
      const identifier = mode === 'name' ? form.name : form.email
      localStorage.setItem('poly-login-saved', JSON.stringify({ selected, mode, identifier }))
    } else {
      localStorage.removeItem('poly-login-saved')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    saveOrClearId()

    // HQ 또는 원장 이메일 로그인
    if (selected === 'hq' || mode === 'email') {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      })
      if (!res.ok) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }
      const emailData = await res.json()
      const { role } = emailData
      if (selected === 'hq' && role !== 'hq_admin') {
        setError('HQ 관리자 계정이 아닙니다.')
        setLoading(false)
        return
      }
      // 역할별 홈은 미들웨어가 결정 (단일 소스) — 루트로 보내면 알맞은 화면으로 라우팅됨
      window.location.href = '/'
      return
    }

    // 직원 이름 로그인
    const res = await fetch('/api/auth/name-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campus_id: selected, name: form.name, password: form.password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error)
      return
    }

    if (data.needs_setup) {
      setSetupCodeRequired(!!data.setup_code_required)
      setSetupModal(true)
      return
    }

    // 브라우저 Supabase 클라이언트로 직접 로그인 (쿠키 설정 보장)
    if (data.email) {
      const supabase = createBrowserClient()
      await supabase.auth.signInWithPassword({ email: data.email, password: form.password })
    }

    // 미들웨어가 역할별 홈으로 라우팅
    window.location.href = '/'
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setSetupError('')
    if (setupForm.password !== setupForm.confirm) {
      setSetupError('비밀번호가 일치하지 않습니다.')
      return
    }
    setSetupLoading(true)
    const res = await fetch('/api/auth/setup-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campus_id: selected,
        name: form.name,
        email: setupForm.email,
        password: setupForm.password,
        setup_code: setupForm.code,
      }),
    })
    const data = await res.json()
    setSetupLoading(false)
    if (!res.ok) {
      setSetupError(data.error)
      return
    }
    window.location.href = '/'
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    setForgotError('')
    const payload = forgotCampus === 'hq'
      ? { email: forgotEmail }
      : { campus_id: forgotCampus, name: forgotName }
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setForgotLoading(false)
    if (!res.ok) { setForgotError(data.error); return }
    setForgotResult({ name: data.name, maskedEmail: data.maskedEmail })
    setForgotSent(true)
  }

  const isCampus = selected !== 'hq'
  const isJungkye = selected === JUNGKYE_CAMPUS_ID

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#00152F] via-[#002149] to-[#003E83] px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#004EA2] rounded-2xl mb-3">
              <span className="text-white text-xl font-black tracking-tight">P</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0C1220]">캠퍼스 관리시스템</h1>
            <p className="text-[#6B7687] text-sm mt-1">소속을 선택하고 로그인하세요</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* 소속 선택 — 2열 버튼 그리드 */}
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1">소속</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => handleSelectChange('hq')}
                  className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors truncate ${
                    selected === 'hq' ? 'border-[#004EA2] bg-[#EAF2FB] text-[#002F65]' : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#94A3B8]'
                  }`}>🏢 본사</button>
                {campuses.map(c => (
                  <button key={c.id} type="button" onClick={() => handleSelectChange(c.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors truncate ${
                      selected === c.id ? 'border-[#004EA2] bg-[#EAF2FB] text-[#002F65]' : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#94A3B8]'
                    }`}>{c.name}</button>
                ))}
              </div>
            </div>

            {/* 캠퍼스: 직원 / 원장 / 컴퓨터 탭 */}
            {isCampus && (
              <div className={`grid gap-2 ${isJungkye ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {[
                  { key: 'name' as LoginMode, icon: '👤', label: '직원', sub: '이름으로 로그인' },
                  { key: 'email' as LoginMode, icon: '🏫', label: '원장', sub: '이메일로 로그인' },
                  ...(isJungkye ? [{ key: 'computer' as LoginMode, icon: '🖥️', label: '컴퓨터', sub: '교실 PC' }] : []),
                ].map(({ key, icon, label, sub }) => (
                  <button key={key} type="button"
                    onClick={() => { setMode(key); setError('') }}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-sm font-semibold ${
                      mode === key
                        ? 'border-[#004EA2] bg-[#EAF2FB] text-[#002F65]'
                        : 'border-[#E2E8F0] bg-white text-[#94A3B8] hover:border-[#94A3B8]'
                    }`}
                  >
                    <span className="text-xl">{icon}</span>
                    <span>{label}</span>
                    <span className="text-[10px] font-normal opacity-70">{sub}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 컴퓨터 로그인: 1~11 선택 */}
            {isCampus && mode === 'computer' && (
              <div>
                <p className="text-xs text-[#64748B] mb-2">교실명 = 바로 로그인 · ⚡ = 자동설치(원클릭)</p>
                <div className="grid grid-cols-3 gap-2">
                  {(smartRooms.length ? smartRooms : Array.from({ length: 11 }, (_, i) => ({ num: i + 1, display_name: '' }))).map(r => (
                    <div key={r.num} className="flex flex-col rounded-xl border-2 border-[#E2E8F0] overflow-hidden">
                      <button type="button"
                        onClick={() => handleComputerLogin(r.num)}
                        disabled={loading}
                        className="flex flex-col items-center py-2 hover:bg-[#EAF2FB] transition-all disabled:opacity-50"
                      >
                        <span className="text-sm font-bold text-[#1E293B]">{r.display_name || `컴퓨터${r.num}`}</span>
                        <span className="text-[9px] text-[#94A3B8]">컴퓨터{r.num}</span>
                      </button>
                      <button type="button"
                        onClick={() => downloadAutoInstaller(r.num, r.display_name)}
                        className="text-[9px] text-white bg-[#004EA2] hover:bg-[#003E83] py-1 border-t border-[#E2E8F0] font-bold"
                      >⚡ 자동설치</button>
                    </div>
                  ))}
                </div>
                {loading && <p className="text-xs text-[#004EA2] text-center mt-2">로그인 중...</p>}
                {error && <p className="text-[#EF4444] text-xs text-center mt-2">{error}</p>}
                <details className="mt-3 text-[11px] text-[#64748B]" open>
                  <summary className="cursor-pointer text-[#004EA2] font-medium">⚡ 자동설치 사용법 (교실당 1번)</summary>
                  <ol className="mt-1.5 space-y-1 list-decimal list-inside">
                    <li>그 교실 컴퓨터에서 이 화면 열기</li>
                    <li>해당 교실의 <b>⚡ 자동설치</b> 버튼 클릭 → 파일 받기</li>
                    <li>받은 파일 <b>더블클릭</b> (검은 창 뜸)</li>
                    <li>「Windows의 PC 보호」 경고 뜨면 → <b>추가 정보</b> → <b>실행</b></li>
                    <li>자동으로 설치·등록·실행됨. 검은 창 닫으면 끝</li>
                  </ol>
                  <p className="mt-1.5 text-[#94A3B8]">이후 컴퓨터 켤 때마다: 자동 로그인 → 평소 안 보임 → 수업시간엔 출석판 전체화면 자동 팝업 → 체크 완료하면 다시 숨김</p>
                  <p className="mt-1 text-[#94A3B8]">단순 버전(자동팝업 없이 최소화만):
                    <button type="button" onClick={() => downloadStartupFile(1)} className="text-[#004EA2] underline ml-1">.vbs 받기</button>
                  </p>
                </details>
              </div>
            )}

            {/* 이름 필드 (캠퍼스 직원) */}
            {isCampus && mode === 'name' && (
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이름</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="홍길동"
                  autoComplete="name"
                />
              </div>
            )}

            {/* 이메일 필드 (HQ 또는 원장) */}
            {(!isCampus || mode === 'email') && (
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
            )}

            {/* 비밀번호 + 아이디저장 + 오류 — 컴퓨터 모드 제외 */}
            {mode !== 'computer' && <>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">비밀번호</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#CBD5E1] text-[#004EA2] accent-[#004EA2]" />
                <span className="text-xs text-[#64748B]">아이디 저장</span>
              </label>
              {error && <p className="text-[#EF4444] text-sm text-center">{error}</p>}
            </>}

            {mode !== 'computer' && (
              <button type="submit" disabled={loading}
                className="w-full text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm bg-[#004EA2] hover:bg-[#003E83]">
                {loading ? '로그인 중...' : mode === 'email' ? '원장 로그인' : '로그인'}
              </button>
            )}
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setForgotModal(true); setForgotCampus(selected); setForgotName(mode === 'name' ? form.name : ''); setForgotEmail(mode === 'email' ? form.email : ''); setForgotError(''); setForgotSent(false); setForgotResult(null) }}
              className="text-xs text-[#64748B] hover:text-[#004EA2] underline"
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>

          {/* 앱 설치 — 브라우저 설치 아이콘을 못 찾아도 여기서 바로 설치/안내 */}
          <div className="mt-4 pt-4 border-t border-[#EEF2F7]">
            <InstallAppButton />
            <p className="text-[11px] text-[#94A3B8] text-center mt-2">설치하면 홈 화면/바탕화면에서 앱처럼 바로 열 수 있어요</p>
          </div>
        </div>
      </div>

      {/* 비밀번호 찾기 모달 */}
      {forgotModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-[#1E293B] text-lg mb-1">비밀번호 찾기</h3>
            {forgotSent ? (
              <>
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-[#1E293B] font-medium mb-1">
                    {forgotResult?.name ? <><span className="font-bold">{forgotResult.name}</span>님께 메일을 보냈습니다</> : '이메일을 전송했습니다'}
                  </p>
                  <p className="text-[#64748B] text-sm">
                    등록된 이메일 <span className="font-semibold text-[#1E293B]">{forgotResult?.maskedEmail ?? forgotEmail}</span> 로
                    비밀번호 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해주세요.
                  </p>
                </div>
                <button
                  onClick={() => setForgotModal(false)}
                  className="w-full mt-4 bg-[#0F172A] text-white font-semibold py-2.5 rounded-xl text-sm"
                >확인</button>
              </>
            ) : (
              <>
                <p className="text-sm text-[#64748B] mb-4">로그인할 때와 같은 방식으로 본인 계정을 찾아 재설정 링크를 보내드립니다.</p>
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">소속</label>
                    <select
                      value={forgotCampus}
                      onChange={e => { setForgotCampus(e.target.value); setForgotError('') }}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                    >
                      <option value="hq">본사 / 원장 (이메일 로그인)</option>
                      {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {forgotCampus === 'hq' ? (
                    <div>
                      <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일</label>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                        placeholder="name@example.com"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-[#1E293B] mb-1">이름</label>
                      <input
                        type="text"
                        required
                        value={forgotName}
                        onChange={e => setForgotName(e.target.value)}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                        placeholder="이름 (로그인 시 사용하는 이름)"
                      />
                      <p className="text-[11px] text-[#94A3B8] mt-1">등록된 이메일로 발송됩니다. 이메일이 없는 계정은 원장/관리자에게 초기화를 요청하세요.</p>
                    </div>
                  )}
                  {forgotError && <p className="text-red-500 text-xs">{forgotError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setForgotModal(false)}
                      className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm font-medium"
                    >취소</button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 bg-[#004EA2] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    >{forgotLoading ? '전송 중...' : '재설정 링크 전송'}</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* 계정 초기 설정 모달 */}
      {setupModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-[#1E293B] text-lg mb-1">계정 초기 설정</h3>
            <p className="text-sm text-[#64748B] mb-5">
              <span className="font-semibold text-[#1E293B]">{form.name}</span>님, 처음 로그인하셨습니다.<br />
              이메일과 비밀번호를 설정해주세요.
            </p>
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일</label>
                <input
                  type="email"
                  required
                  value={setupForm.email}
                  onChange={e => setSetupForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">비밀번호 설정</label>
                <input
                  type="password"
                  required
                  value={setupForm.password}
                  onChange={e => setSetupForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="6자 이상"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">비밀번호 확인</label>
                <input
                  type="password"
                  required
                  value={setupForm.confirm}
                  onChange={e => setSetupForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="비밀번호 재입력"
                />
              </div>
              {setupCodeRequired && (
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">설정 코드</label>
                  <input
                    type="text"
                    required
                    value={setupForm.code}
                    onChange={e => setSetupForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                    placeholder="관리자에게 받은 코드"
                  />
                </div>
              )}
              {setupError && <p className="text-[#EF4444] text-sm">{setupError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setSetupModal(false); setSetupError('') }}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-3 rounded-xl text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="flex-1 bg-[#004EA2] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
                >
                  {setupLoading ? '설정 중...' : '설정 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
