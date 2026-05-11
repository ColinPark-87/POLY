'use client'

import { useEffect, useRef, useState } from 'react'

interface Campus { id: string; name: string }
interface ImportResult { ok: boolean; year: number; success: number; skipped: number; errors: string[] }
interface RosterResult { ok: boolean; sessions_created: number; classes_created: number; students_created: number; enrollments: number; buses: number; errors: string[]; stopCoords?: Record<string, { lat: number; lng: number }> }

export default function HqImportPage() {
  const [tab, setTab] = useState<'leave' | 'roster' | 'export'>('leave')
  const [campuses, setCampuses] = useState<Campus[]>([])

  // 연차 업로드
  const fileRef = useRef<HTMLInputElement>(null)
  const [campusId, setCampusId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  // 반편성 업로드
  const rosterFileRef = useRef<HTMLInputElement>(null)
  const [rosterCampusId, setRosterCampusId] = useState('')
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null)
  const [rosterError, setRosterError] = useState('')

  // 내보내기
  const [exportCampusId, setExportCampusId] = useState('')
  const [exportYear, setExportYear] = useState(new Date().getFullYear())
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    fetch('/api/hq/campuses').then(r => r.json()).then(d => {
      const list: Campus[] = d.campuses ?? []
      setCampuses(list)
      if (list.length) {
        setCampusId(list[0].id)
        setRosterCampusId(list[0].id)
        setExportCampusId(list[0].id)
      }
    })
  }, [])

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('파일을 선택해주세요.'); return }
    if (!campusId) { setError('캠퍼스를 선택해주세요.'); return }
    if (!file.name.match(/\.xlsx?$/i)) { setError('Excel 파일(.xlsx, .xls)만 가능합니다.'); return }
    setLoading(true); setError(''); setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('campus_id', campusId)
    const res = await fetch('/api/campus/import', { method: 'POST', body: formData })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setError(d.error ?? '업로드 실패'); return }
    setResult(d)
  }

  async function handleRosterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rosterFile) { setRosterError('파일을 선택해주세요.'); return }
    if (!rosterCampusId) { setRosterError('캠퍼스를 선택해주세요.'); return }
    if (!rosterFile.name.match(/\.xlsx?$/i)) { setRosterError('Excel 파일(.xlsx, .xls)만 가능합니다.'); return }
    setRosterLoading(true); setRosterError(''); setRosterResult(null)
    const formData = new FormData()
    formData.append('file', rosterFile)
    const res = await fetch(`/api/campus/class-roster/import?campus_id=${rosterCampusId}`, { method: 'POST', body: formData })
    const d = await res.json()
    setRosterLoading(false)
    if (!res.ok) { setRosterError(d.error ?? '업로드 실패'); return }
    setRosterResult(d)
  }

  async function handleExport() {
    if (!exportCampusId) { setExportError('캠퍼스를 선택해주세요.'); return }
    setExportLoading(true); setExportError('')
    const res = await fetch(`/api/hq/campuses/${exportCampusId}/export?year=${exportYear}`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setExportError(d.error ?? '내보내기 실패')
      setExportLoading(false)
      return
    }
    const blob = await res.blob()
    const campusName = campuses.find(c => c.id === exportCampusId)?.name ?? exportCampusId
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campusName}_${exportYear}년_연차관리대장.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
  }

  const tabClass = (t: string) =>
    `px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`

  return (
    <div className="max-w-2xl mx-auto">
      {/* 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-6">
        <button onClick={() => setTab('leave')} className={tabClass('leave')}>연차 업로드</button>
        <button onClick={() => setTab('roster')} className={tabClass('roster')}>반편성 업로드</button>
        <button onClick={() => setTab('export')} className={tabClass('export')}>내보내기</button>
      </div>

      {/* 연차 업로드 */}
      {tab === 'leave' && <>
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">연차관리대장 Import</h1>
        <p className="text-sm text-[#64748B] mb-6">Excel 파일을 업로드하면 직원 정보와 연차 데이터가 자동 등록/갱신됩니다.</p>

        <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#E2E8F0] shadow-sm">
          <form onSubmit={handleLeaveSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">캠퍼스 선택</label>
              <select value={campusId} onChange={e => setCampusId(e.target.value)} required
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                <option value="">캠퍼스 선택...</option>
                {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">Excel 파일 선택</label>
              <div className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-8 text-center cursor-pointer hover:border-[#004EA2] transition-colors"
                onClick={() => fileRef.current?.click()}>
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm font-medium text-[#1E293B]">{file ? file.name : '파일을 클릭하여 선택'}</p>
                <p className="text-xs text-[#94A3B8] mt-1">연차관리대장_XXXX.xlsx</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="bg-[#F7F8FA] rounded-xl p-4 text-xs text-[#64748B] space-y-1">
              <p className="font-semibold text-[#1E293B] mb-2">파일 형식 안내 (26년 연차관리대장 기준)</p>
              <p>• 시트명에서 연도 자동 감지 — 예: "관리대장(26년)" → 2026년</p>
              <p>• 8행부터 2행 1쌍으로 직원 데이터 인식 (날짜행 + 종류행)</p>
              <p>• B열: 사원명 &nbsp;|&nbsp; C열: 직책 &nbsp;|&nbsp; G열: 최종부여 &nbsp;|&nbsp; X열: 이월</p>
              <p>• AX열~: 실제 사용 날짜 (연차/반차/반반차/경조/공가/병가)</p>
              <p>• 기존 직원은 정보 갱신, 신규 직원은 계정 자동 생성</p>
            </div>
            {error && <p className="text-[#EF4444] text-sm">{error}</p>}
            <button type="submit" disabled={loading || !file || !campusId}
              className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
              {loading ? '처리 중...' : '업로드 및 Import'}
            </button>
          </form>
        </div>

        {result && (
          <div className="mt-4 bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm">
            <h2 className="font-semibold text-[#1E293B] mb-4">Import 결과 ({result.year}년)</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#D1FAE5] rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-[#059669]">{result.success}</p>
                <p className="text-xs text-[#047857]">성공</p>
              </div>
              <div className="bg-[#FEE2E2] rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-[#DC2626]">{result.skipped}</p>
                <p className="text-xs text-[#B91C1C]">건너뜀</p>
              </div>
              <div className="bg-[#F1F5F9] rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-[#475569]">{result.success + result.skipped}</p>
                <p className="text-xs text-[#64748B]">전체</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#EF4444] mb-1">오류 내역</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-[#EF4444] bg-[#FEF2F2] px-3 py-1.5 rounded-lg">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </>}

      {/* 반편성 업로드 */}
      {tab === 'roster' && <>
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">반편성 현황 업로드</h1>
        <p className="text-sm text-[#64748B] mb-6">반편성 Excel 파일을 업로드하면 세션·반·학생·차량 데이터가 자동 등록/갱신됩니다.</p>

        <div className="bg-[#EAF2FB] rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-[#004EA2]">엑셀 템플릿 다운로드</p>
            <p className="text-xs text-[#64748B] mt-0.5">①세션설정 ②반편성_차량 ③차량정보 ④정류장좌표 4개 시트</p>
          </div>
          <a href="/api/campus/class-roster/template" download
            className="text-sm bg-[#004EA2] text-white px-4 py-2 rounded-xl hover:bg-[#003d82] whitespace-nowrap">
            양식 다운로드
          </a>
        </div>

        <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#E2E8F0] shadow-sm">
          <form onSubmit={handleRosterSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">캠퍼스 선택</label>
              <select value={rosterCampusId} onChange={e => setRosterCampusId(e.target.value)} required
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                <option value="">캠퍼스 선택...</option>
                {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-2">Excel 파일 선택</label>
              <div className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-8 text-center cursor-pointer hover:border-[#004EA2] transition-colors"
                onClick={() => rosterFileRef.current?.click()}>
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm font-medium text-[#1E293B]">{rosterFile ? rosterFile.name : '파일을 클릭하여 선택'}</p>
                <p className="text-xs text-[#94A3B8] mt-1">반편성현황_XXXX.xlsx</p>
                <input ref={rosterFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setRosterFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="bg-[#F7F8FA] rounded-xl p-4 text-xs text-[#64748B] space-y-1">
              <p className="font-semibold text-[#1E293B] mb-2">시트 구성 안내</p>
              <p>• <strong>①세션설정</strong>: 세션명, 월, 시작시간, 종료시간, 순서</p>
              <p>• <strong>②반편성_차량</strong>: 세션명, 레벨, 선생님, 학생명, 영어명, 차량스케줄</p>
              <p>• <strong>③차량정보</strong> (선택): 차량명, 기사, 연락처, 안전요원 등</p>
              <p>• <strong>④정류장좌표</strong> (선택): 정류장명, 주소 입력 시 위도·경도 자동 변환</p>
            </div>
            {rosterError && <p className="text-[#EF4444] text-sm">{rosterError}</p>}
            {rosterResult && (
              <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">
                완료 — 세션 {rosterResult.sessions_created}개 · 반 {rosterResult.classes_created}개 · 학생 {rosterResult.students_created}명 · 수강배정 {rosterResult.enrollments}건{rosterResult.buses > 0 ? ` · 차량 ${rosterResult.buses}대` : ''}
                {rosterResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {rosterResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-[#EF4444] bg-[#FEF2F2] px-3 py-1 rounded-lg font-normal">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="submit" disabled={rosterLoading || !rosterFile || !rosterCampusId}
              className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
              {rosterLoading ? '처리 중...' : '업로드 및 Import'}
            </button>
          </form>
        </div>
      </>}

      {/* 내보내기 */}
      {tab === 'export' && <>
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">데이터 내보내기</h1>
        <p className="text-sm text-[#64748B] mb-6">캠퍼스별 연차관리대장을 Excel 파일로 다운로드합니다.</p>

        <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#E2E8F0] shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">캠퍼스 선택</label>
            <select value={exportCampusId} onChange={e => setExportCampusId(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
              <option value="">캠퍼스 선택...</option>
              {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">연도</label>
            <select value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
              className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>

          {exportError && <p className="text-[#EF4444] text-sm">{exportError}</p>}

          <button onClick={handleExport} disabled={exportLoading || !exportCampusId}
            className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
            {exportLoading ? '생성 중...' : '연차관리대장 다운로드'}
          </button>
        </div>

        <div className="mt-4 bg-[#F7F8FA] rounded-xl p-4 text-xs text-[#64748B] space-y-1">
          <p className="font-semibold text-[#1E293B] mb-2">내보내기 안내</p>
          <p>• 선택한 캠퍼스의 해당 연도 연차관리대장을 Excel 형식으로 다운로드합니다.</p>
          <p>• 직원별 월별 사용 현황 및 개별 연차 날짜/종류가 포함됩니다.</p>
          <p>• 여러 캠퍼스가 필요한 경우 캠퍼스를 변경하여 반복 다운로드하세요.</p>
        </div>
      </>}
    </div>
  )
}
