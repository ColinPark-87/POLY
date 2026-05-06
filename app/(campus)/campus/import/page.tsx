'use client'

import { useRef, useState } from 'react'

interface ImportResult { ok: boolean; year: number; success: number; skipped: number; errors: string[] }

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('파일을 선택해주세요.'); return }
    if (!file.name.match(/\.xlsx?$/i)) { setError('Excel 파일(.xlsx, .xls)만 가능합니다.'); return }

    setLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/campus/import', { method: 'POST', body: formData })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setError(d.error ?? '업로드 실패'); return }
    setResult(d)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">연차관리대장 Import</h1>
      <p className="text-sm text-[#64748B] mb-6">Excel 파일을 업로드하면 직원 정보와 연차 데이터가 자동 등록/갱신됩니다.</p>

      <div className="bg-white rounded-2xl p-5 md:p-6 border border-[#E2E8F0] shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">Excel 파일 선택</label>
            <div
              className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-8 text-center cursor-pointer hover:border-[#004EA2] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm font-medium text-[#1E293B]">{file ? file.name : '파일을 클릭하여 선택'}</p>
              <p className="text-xs text-[#94A3B8] mt-1">연차관리대장_XXXX.xlsx</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <div className="bg-[#F7F8FA] rounded-xl p-4 text-xs text-[#64748B] space-y-1">
            <p className="font-semibold text-[#1E293B] mb-2">파일 형식 안내</p>
            <p>• 시트명에서 연도 자동 감지 — 예: "관리대장(26년)" → 2026년</p>
            <p>• B열: 사원명 &nbsp;|&nbsp; C열: 직책 &nbsp;|&nbsp; G열: 최종부여 &nbsp;|&nbsp; X열: 이월</p>
            <p>• AX열~: 실제 사용 날짜 (연차/반차/반반차/경조/공가/병가)</p>
            <p>• 기존 직원은 정보 갱신, 신규 직원은 계정 자동 생성</p>
          </div>

          {error && <p className="text-[#EF4444] text-sm">{error}</p>}

          <button type="submit" disabled={loading || !file}
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
    </div>
  )
}
