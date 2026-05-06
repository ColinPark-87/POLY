'use client'

import { useEffect, useState } from 'react'

interface Holiday { id: string; date: string; name: string; campus_id: string | null }

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ start_date: '', end_date: '', name: '' })
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/campus/holidays')
    const d = await res.json()
    setHolidays(d.holidays ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    const res = await fetch('/api/campus/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
        name: form.name,
      }),
    })
    setAddLoading(false)
    if (res.ok) {
      setForm({ start_date: '', end_date: '', name: '' })
      setShowAdd(false)
      load()
    }
  }

  async function handleImportNational() {
    setImportLoading(true)
    setImportResult(null)
    const res = await fetch('/api/campus/holidays/national', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    })
    const d = await res.json()
    setImportLoading(false)
    if (res.ok) { setImportResult({ inserted: d.inserted, skipped: d.skipped }); load() }
    else alert(d.error ?? '가져오기 실패')
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch('/api/campus/holidays', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  // 기간 입력 시 날짜 수 미리보기
  const rangeCount = (() => {
    if (!form.start_date) return 0
    const s = new Date(form.start_date + 'T00:00:00')
    const e = form.end_date ? new Date(form.end_date + 'T00:00:00') : s
    if (e < s) return 0
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  })()

  const filtered = holidays.filter(h => h.date.startsWith(String(year)))
  const currentYear = new Date().getFullYear()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">휴일 관리</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button
            onClick={handleImportNational}
            disabled={importLoading}
            className="bg-[#F59E0B] hover:bg-[#D97706] text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
          >
            {importLoading ? '가져오는 중...' : '공휴일 자동 가져오기'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold px-4 py-2 rounded-xl text-sm"
          >
            + 휴일 추가
          </button>
        </div>
      </div>

      {importResult && (
        <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm flex items-center gap-4 mb-4">
          <span className="text-[#059669] font-semibold">가져오기 완료</span>
          <span className="text-[#047857]">신규 {importResult.inserted}개 추가 · 중복 {importResult.skipped}개 건너뜀</span>
          <button onClick={() => setImportResult(null)} className="ml-auto text-[#047857] underline text-xs">닫기</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F7F8FA] border-b border-[#E2E8F0]">
            <tr>
              {['날짜', '요일', '휴일명', '삭제'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-10 text-[#64748B]">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10 text-[#64748B] text-sm">등록된 휴일이 없습니다.</td></tr>
            ) : (
              filtered.sort((a, b) => a.date.localeCompare(b.date)).map(h => {
                const d = new Date(h.date + 'T00:00:00')
                const dayIdx = d.getDay()
                return (
                  <tr key={h.id} className="hover:bg-[#F7F8FA]">
                    <td className="px-5 py-3 font-medium">{h.date}</td>
                    <td className={`px-5 py-3 ${dayIdx === 0 ? 'text-[#EF4444]' : dayIdx === 6 ? 'text-[#004EA2]' : 'text-[#64748B]'}`}>
                      {DAY_NAMES[dayIdx]}요일
                    </td>
                    <td className="px-5 py-3">
                      {h.name}
                      {h.campus_id === null && <span className="ml-2 text-xs text-[#004EA2] bg-[#EAF2FB] px-1.5 py-0.5 rounded">전국</span>}
                    </td>
                    <td className="px-5 py-3">
                      {h.campus_id !== null ? (
                        <button onClick={() => handleDelete(h.id)} className="text-xs bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] px-2.5 py-1 rounded-lg font-semibold">삭제</button>
                      ) : (
                        <span className="text-xs text-[#CBD5E1]">-</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-1">휴일 추가</h3>
            <p className="text-xs text-[#64748B] mb-4">기간을 입력하면 해당 기간의 모든 날짜가 등록됩니다.</p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">시작일 *</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))}
                    required
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">종료일</label>
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  />
                </div>
              </div>

              {/* 날짜 수 미리보기 */}
              {rangeCount > 0 && (
                <p className="text-xs text-[#004EA2] bg-[#EAF2FB] px-3 py-2 rounded-lg">
                  {rangeCount === 1
                    ? `${form.start_date} 1일 등록`
                    : `${form.start_date} ~ ${form.end_date} (총 ${rangeCount}일 등록)`}
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">휴일명 *</label>
                <input
                  type="text"
                  placeholder="예: 여름 휴가, 대체공휴일"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={addLoading || rangeCount === 0} className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {addLoading ? '추가 중...' : rangeCount > 1 ? `${rangeCount}일 추가` : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
