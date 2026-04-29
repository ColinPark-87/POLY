'use client'

import { useRef, useState } from 'react'

interface ImportResult {
  ok: boolean
  year: number
  success: number
  skipped: number
  errors: string[]
}

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('파일을 선택해주세요.'); return }
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'); return
    }

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
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-2">Excel Import</h1>
      <p className="text-sm text-[#64748B] mb-6">연차관리대장 Excel 파일을 업로드하면 직원과 연차 데이터가 자동으로 등록됩니다.</p>

      <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm mb-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-2">Excel 파일 선택</label>
            <div
              className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-8 text-center cursor-pointer hover:border-[#7C3AED] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-3xl mb-2">📁</p>
              <p className="text-sm font-medium text-[#1E293B]">{file ? file.name : '파일을 클릭하여 선택'}</p>
              <p className="text-xs text-[#94A3B8] mt-1">연차관리대장_XXXX.xlsx</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="bg-[#F8FAFC] rounded-xl p-4 text-xs text-[#64748B] space-y-1">
            <p className="font-semibold text-[#1E293B] mb-2">파싱 규칙</p>
            <p>• 시트명에서 연도 자동 감지 (예: "연차관리대장(26년)" → 2026)</p>
            <p>• 4행부터 데이터 행으로 인식</p>
            <p>• Col B: 성명 / Col C: 직책 / Col D: 회사입사일 / Col E: 캠퍼스입사일</p>
            <p>• Col G: 연차부여합계 / Col X: 이월 / Col AW+: 실제 사용 날짜</p>
          </div>

          {error && <p className="text-[#EF4444] text-sm">{error}</p>}

          <button type="submit" disabled={loading || !file}
            className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
            {loading ? '처리 중...' : '업로드 및 Import'}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm">
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
              <p className="text-xs font-semibold text-[#EF4444]">오류 내역:</p>
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
