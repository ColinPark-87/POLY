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

interface AddEmpForm { campusId: string; campusName: string; name: string; position: string; annual_days: number }

interface Employee {
  id: string
  name: string
  email: string
  position: string
  role: string
  is_active: boolean
  campus_id: string
  campuses: { name: string } | null
}

const EMP_CATEGORIES = ['관리자', 'KT', 'FT', '상담부', 'POLY안전선생님', '기타'] as const
type EmpCategory = typeof EMP_CATEGORIES[number]

function getEmpCategory(emp: Employee): EmpCategory {
  const p = emp.position ?? ''
  if (emp.role === 'campus_admin' || /원장|부원장|관리자/.test(p)) return '관리자'
  if (/KT/i.test(p)) return 'KT'
  if (/FT/i.test(p)) return 'FT'
  if (/상담/.test(p)) return '상담부'
  if (/차량|안전|POLY/.test(p)) return 'POLY안전선생님'
  return '기타'
}

const EMP_CATEGORY_COLORS: Record<EmpCategory, string> = {
  '관리자': 'bg-[#EAF2FB] text-[#004EA2]',
  'KT': 'bg-[#EAF2FB] text-[#004EA2]',
  'FT': 'bg-[#FFF7ED] text-[#EA580C]',
  '상담부': 'bg-[#F0FDF4] text-[#16A34A]',
  'POLY안전선생님': 'bg-[#ECFEFF] text-[#0891B2]',
  '기타': 'bg-[#F1F5F9] text-[#64748B]',
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqCampusesPage() {
  const [pageTab, setPageTab] = useState<'campuses' | 'employees'>('campuses')

  // ── 캠퍼스 목록 ──────────────────────────────────────────────
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', principal_email: '', principal_name: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null)

  // ── 전체 직원 ─────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([])
  const [totalBuses, setTotalBuses] = useState(0)
  const [busesByCampus, setBusesByCampus] = useState<Record<string, number>>({})
  const [empLoading, setEmpLoading] = useState(false)
  const [empLoaded, setEmpLoaded] = useState(false)
  const [apiError, setApiError] = useState('')
  const [expandedCampus, setExpandedCampus] = useState<Set<string>>(new Set())
  const [addEmpForm, setAddEmpForm] = useState<AddEmpForm | null>(null)
  const [addEmpLoading, setAddEmpLoading] = useState(false)
  const [addEmpError, setAddEmpError] = useState('')

  function toggleCampusExpand(id: string) {
    setExpandedCampus(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openAddEmp(campusId: string, campusName: string) {
    setAddEmpForm({ campusId, campusName, name: '', position: '', annual_days: 15 })
    setAddEmpError('')
  }

  async function handleAddEmp(e: React.FormEvent) {
    e.preventDefault()
    if (!addEmpForm) return
    setAddEmpLoading(true)
    setAddEmpError('')
    const res = await fetch(`/api/hq/campuses/${addEmpForm.campusId}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addEmpForm.name, position: addEmpForm.position, annual_days: addEmpForm.annual_days }),
    })
    const data = await res.json()
    setAddEmpLoading(false)
    if (!res.ok) { setAddEmpError(data.error); return }
    setAddEmpForm(null)
    loadEmployees()
  }

  function loadEmployees() {
    setEmpLoading(true)
    setApiError('')
    fetch('/api/hq/employees').then(r => r.json()).then(d => {
      if (d.error) setApiError(d.error)
      setEmployees(d.employees ?? [])
      setTotalBuses(d.totalBuses ?? 0)
      setBusesByCampus(d.busesByCampus ?? {})
      setEmpLoading(false)
      setEmpLoaded(true)
    }).catch(err => {
      setApiError(String(err))
      setEmpLoading(false)
    })
  }

  useEffect(() => {
    if (pageTab === 'employees' && !empLoaded) loadEmployees()
  }, [pageTab, empLoaded])

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

  // 전체 직원 탭용 캠퍼스별 그룹핑
  const campusEmpMap = new Map<string, { id: string; name: string; emps: Employee[] }>()
  for (const emp of employees) {
    if (!emp.campus_id) continue
    if (!campusEmpMap.has(emp.campus_id)) {
      campusEmpMap.set(emp.campus_id, { id: emp.campus_id, name: emp.campuses?.name ?? '알 수 없음', emps: [] })
    }
    campusEmpMap.get(emp.campus_id)!.emps.push(emp)
  }
  const byCampusEmp = Array.from(campusEmpMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(({ id, name, emps }) => {
      const byCategory: Record<EmpCategory, Employee[]> = { '관리자': [], 'KT': [], 'FT': [], '상담부': [], 'POLY안전선생님': [], '기타': [] }
      emps.forEach(e => byCategory[getEmpCategory(e)].push(e))
      return { campus: { id, name }, byCategory, total: emps.length }
    })

  return (
    <div className="max-w-5xl mx-auto">
      {/* 페이지 헤더 + 탭 */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">캠퍼스 관리</h1>
        {pageTab === 'campuses' && (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            + 캠퍼스 추가
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-5">
        {([['campuses', '캠퍼스 목록'], ['employees', '전체 직원']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setPageTab(k)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pageTab === k ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 캠퍼스 목록 탭 ──────────────────────────────────────── */}
      {pageTab === 'campuses' && (
        <>
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
        </>
      )}

      {/* ── 전체 직원 탭 ─────────────────────────────────────────── */}
      {pageTab === 'employees' && (
        <>
          {/* 통합 요약 헤드 */}
          {!empLoading && empLoaded && (() => {
            const active = employees.filter(e => e.is_active && e.campus_id)
            const counts: Record<EmpCategory, number> = { '관리자': 0, 'KT': 0, 'FT': 0, '상담부': 0, 'POLY안전선생님': 0, '기타': 0 }
            active.forEach(e => { counts[getEmpCategory(e)]++ })
            const stats = [
              { label: '전체 직원', value: `${active.length}명`, color: 'bg-[#1E293B] text-white', border: '' },
              { label: '원장/관리자', value: `${counts['관리자']}명`, color: 'bg-[#EAF2FB] text-[#004EA2]', border: 'border border-[#BFDBFE]' },
              { label: 'KT', value: `${counts['KT']}명`, color: 'bg-[#EAF2FB] text-[#1D4ED8]', border: 'border border-[#BFDBFE]' },
              { label: 'FT', value: `${counts['FT']}명`, color: 'bg-[#FFF7ED] text-[#EA580C]', border: 'border border-[#FED7AA]' },
              { label: '상담부', value: `${counts['상담부']}명`, color: 'bg-[#F0FDF4] text-[#16A34A]', border: 'border border-[#BBF7D0]' },
              { label: 'POLY안전', value: `${counts['POLY안전선생님']}명`, color: 'bg-[#ECFEFF] text-[#0891B2]', border: 'border border-[#A5F3FC]' },
              { label: '기타', value: `${counts['기타']}명`, color: 'bg-[#F1F5F9] text-[#64748B]', border: 'border border-[#E2E8F0]' },
              { label: '차량', value: `${totalBuses}대`, color: 'bg-[#FFF7ED] text-[#D97706]', border: 'border border-[#FDE68A]' },
            ]
            return (
              <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
                {stats.map(s => (
                  <div key={s.label} className={`shrink-0 rounded-xl px-4 py-3 text-center min-w-[72px] ${s.color} ${s.border}`}>
                    <p className="text-[10px] font-semibold opacity-75 mb-0.5 whitespace-nowrap">{s.label}</p>
                    <p className="text-lg font-extrabold leading-none">{s.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#64748B]">{empLoading ? '불러오는 중...' : `캠퍼스 ${byCampusEmp.length}개 · 재직자 ${employees.filter(e=>e.is_active && e.campus_id).length}명`}</span>
          </div>
          {apiError && <p className="text-red-500 text-sm mb-4 p-3 bg-red-50 rounded-xl">API 오류: {apiError}</p>}
          {empLoading ? <Spinner /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {byCampusEmp.map(({ campus, byCategory, total }) => (
                <div key={campus.id} className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F7F8FA]">
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => toggleCampusExpand(campus.id)} className="flex items-center gap-2 flex-1 text-left">
                        <h2 className="font-bold text-[#1E293B]">{campus.name}</h2>
                        <svg className={`w-4 h-4 text-[#94A3B8] transition-transform ${expandedCampus.has(campus.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div className="flex items-center gap-2">
                        {(busesByCampus[campus.id] ?? 0) > 0 && (
                          <span className="text-xs text-[#D97706] bg-[#FFF7ED] border border-[#FDE68A] px-2.5 py-1 rounded-full">차량 {busesByCampus[campus.id]}대</span>
                        )}
                        <span className="text-xs text-[#64748B] bg-white border border-[#E2E8F0] px-2.5 py-1 rounded-full">총 {total}명</span>
                        <button onClick={() => openAddEmp(campus.id, campus.name)}
                          className="text-xs bg-[#0F172A] text-white px-2.5 py-1 rounded-lg hover:bg-[#1E293B] transition-colors">
                          + 직원 추가
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['관리자', 'KT', 'FT', '상담부', 'POLY안전선생님'] as const).map(cat => {
                        const cnt = byCategory[cat].length
                        if (cnt === 0) return null
                        return (
                          <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium ${EMP_CATEGORY_COLORS[cat]}`}>
                            {cat} {cnt}명
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  {expandedCampus.has(campus.id) && (
                    <div className="p-4 space-y-3">
                      {EMP_CATEGORIES.map(cat => {
                        const list = byCategory[cat]
                        if (list.length === 0) return null
                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EMP_CATEGORY_COLORS[cat]}`}>{cat}</span>
                              <span className="text-xs text-[#94A3B8]">{list.length}명</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {list.map(emp => (
                                <span key={emp.id}
                                  className={`text-xs px-2.5 py-1 rounded-lg border ${emp.is_active ? 'border-[#E2E8F0] text-[#1E293B] bg-white' : 'border-[#FCA5A5] text-[#94A3B8] bg-[#FEF2F2] line-through'}`}
                                  title={emp.position}>
                                  {emp.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
              {byCampusEmp.length === 0 && (
                <p className="text-[#64748B] text-sm col-span-2 text-center py-16">등록된 직원이 없습니다.</p>
              )}
            </div>
          )}

          {/* 직원 추가 모달 */}
          {addEmpForm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-[#1E293B] text-lg mb-1">직원 추가</h3>
                <p className="text-sm text-[#64748B] mb-4">{addEmpForm.campusName}</p>
                <form onSubmit={handleAddEmp} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">이름 <span className="text-red-500">*</span></label>
                    <input type="text" required value={addEmpForm.name}
                      onChange={e => setAddEmpForm(f => f ? { ...f, name: e.target.value } : f)}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                      placeholder="홍길동" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">직책 <span className="text-red-500">*</span></label>
                    <select required value={addEmpForm.position}
                      onChange={e => setAddEmpForm(f => f ? { ...f, position: e.target.value } : f)}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                      <option value="">선택하세요</option>
                      {['관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">기본 연차 (일)</label>
                    <input type="number" min={0} max={30} value={addEmpForm.annual_days}
                      onChange={e => setAddEmpForm(f => f ? { ...f, annual_days: Number(e.target.value) } : f)}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                  {addEmpError && <p className="text-red-500 text-xs">{addEmpError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setAddEmpForm(null)}
                      className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm font-medium">취소</button>
                    <button type="submit" disabled={addEmpLoading}
                      className="flex-1 bg-[#0F172A] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                      {addEmpLoading ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
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
