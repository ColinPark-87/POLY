'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Campus {
  id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqCampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', principal_email: '', principal_name: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Import file state for modal
  const fileRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/hq/campuses')
    const d = await res.json()
    setCampuses(d.campuses ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setError('')
    const res = await fetch('/api/hq/campuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error); setAddLoading(false); return }
    if (d.tempPassword) setTempPassword(d.tempPassword)

    // If file selected, upload import
    if (importFile && d.campusId) {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('campus_id', d.campusId)
      const ir = await fetch('/api/campus/import', { method: 'POST', body: formData })
      const id = await ir.json()
      if (ir.ok) setImportResult({ success: id.success, skipped: id.skipped })
    }

    setAddLoading(false)
    setShowAdd(false)
    setForm({ name: '', code: '', principal_email: '', principal_name: '' })
    setImportFile(null)
    load()
  }

  async function handleToggle(id: string, is_active: boolean) {
    const label = is_active ? '비활성화' : '복구'
    if (!confirm(`이 캠퍼스를 ${label}하시겠습니까?`)) return
    await fetch(`/api/hq/campuses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !is_active }),
    })
    load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`'${name}' 캠퍼스를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    const res = await fetch(`/api/hq/campuses/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error ?? '삭제 실패')
      return
    }
    load()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">캠퍼스 관리</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + 캠퍼스 추가
        </button>
      </div>

      {tempPassword && (
        <div className="mb-4 bg-[#D1FAE5] border border-[#6EE7B7] rounded-2xl p-4">
          <p className="font-semibold text-[#059669] mb-1">캠퍼스 추가 완료</p>
          <p className="text-sm text-[#065F46]">원장 임시 비밀번호: <code className="bg-white px-2 py-0.5 rounded font-mono font-bold">{tempPassword}</code></p>
          {importResult && <p className="text-sm text-[#065F46] mt-1">연차대장 Import: 성공 {importResult.success}명 / 건너뜀 {importResult.skipped}명</p>}
          <button onClick={() => { setTempPassword(null); setImportResult(null) }} className="text-xs text-[#047857] underline mt-2">닫기</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F8FA] border-b border-[#E2E8F0]">
              <tr>
                {['캠퍼스명', '코드', '상태', '액션'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {campuses.map(c => (
                <tr key={c.id} className={`hover:bg-[#F7F8FA] ${!c.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/hq/campuses/${c.id}`} className="text-[#004EA2] hover:underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-[#64748B] font-mono">{c.code}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.is_active ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>
                      {c.is_active ? '운영중' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/hq/campuses/${c.id}`} className="text-xs px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]">상세 보기</Link>
                      <button
                        onClick={() => handleToggle(c.id, c.is_active)}
                        className={`text-xs px-2.5 py-1 rounded-lg ${c.is_active ? 'border border-[#FCA5A5] text-[#DC2626]' : 'border border-[#6EE7B7] text-[#059669]'}`}
                      >
                        {c.is_active ? '비활성화' : '복구'}
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-5">캠퍼스 추가</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              {[
                { field: 'name', label: '캠퍼스명 *', type: 'text' },
                { field: 'code', label: '코드 * (예: GN)', type: 'text' },
                { field: 'principal_name', label: '원장 이름 (선택)', type: 'text' },
                { field: 'principal_email', label: '원장 이메일 (선택)', type: 'email' },
              ].map(({ field, label, type }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[field as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    required={label.includes('*')}
                    className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
                  />
                </div>
              ))}

              {/* Import section */}
              <div className="border-t border-[#E2E8F0] pt-4">
                <label className="block text-sm font-semibold text-[#1E293B] mb-2">캠퍼스 연차대장 업로드 <span className="text-[#94A3B8] font-normal">(선택사항)</span></label>
                <div
                  className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-4 text-center cursor-pointer hover:border-[#004EA2] transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <p className="text-sm text-[#64748B]">{importFile ? importFile.name : '연차관리대장 Excel 파일 클릭하여 선택'}</p>
                  <p className="text-xs text-[#94A3B8] mt-1">캠퍼스 생성 후 자동으로 Import됩니다</p>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
                </div>
                {importFile && (
                  <button type="button" onClick={() => { setImportFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-[#64748B] underline mt-1">파일 제거</button>
                )}
              </div>

              {error && <p className="text-[#EF4444] text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={addLoading} className="flex-1 bg-[#0F172A] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {addLoading ? '처리 중...' : importFile ? '추가 + Import' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
