'use client'

import { useEffect, useState } from 'react'

interface AddForm { campusId: string; campusName: string; name: string; position: string; annual_days: number }

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

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

const CATEGORIES = ['관리자', 'KT', 'FT', '상담부', 'POLY안전선생님', '기타'] as const
type Category = typeof CATEGORIES[number]

function getCategory(emp: Employee): Category {
  const p = emp.position ?? ''
  if (emp.role === 'campus_admin' || /원장|부원장|관리자/.test(p)) return '관리자'
  if (/KT/i.test(p)) return 'KT'
  if (/FT/i.test(p)) return 'FT'
  if (/상담/.test(p)) return '상담부'
  if (/차량|안전|POLY/.test(p)) return 'POLY안전선생님'
  return '기타'
}

const CATEGORY_COLORS: Record<Category, string> = {
  '관리자': 'bg-[#EAF2FB] text-[#004EA2]',
  'KT': 'bg-[#EAF2FB] text-[#004EA2]',
  'FT': 'bg-[#FFF7ED] text-[#EA580C]',
  '상담부': 'bg-[#F0FDF4] text-[#16A34A]',
  'POLY안전선생님': 'bg-[#ECFEFF] text-[#0891B2]',
  '기타': 'bg-[#F1F5F9] text-[#64748B]',
}

export default function HqEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [addForm, setAddForm] = useState<AddForm | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  function toggleCampus(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openAdd(campusId: string, campusName: string) {
    setAddForm({ campusId, campusName, name: '', position: '', annual_days: 15 })
    setAddError('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm) return
    setAddLoading(true)
    setAddError('')
    const res = await fetch(`/api/hq/campuses/${addForm.campusId}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addForm.name, position: addForm.position, annual_days: addForm.annual_days }),
    })
    const data = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(data.error); return }
    setAddForm(null)
    loadEmployees()
  }

  function loadEmployees() {
    setLoading(true)
    setApiError('')
    fetch('/api/hq/employees').then(r => r.json()).then(d => {
      if (d.error) setApiError(d.error)
      setEmployees(d.employees ?? [])
      setLoading(false)
    }).catch(err => {
      setApiError(String(err))
      setLoading(false)
    })
  }

  useEffect(() => { loadEmployees() }, [])

  // employees 데이터의 join된 캠퍼스 정보로 직접 그룹핑 (별도 campuses API 불필요)
  const campusMap = new Map<string, { id: string; name: string; emps: Employee[] }>()
  for (const emp of employees) {
    if (!emp.campus_id) continue
    if (!campusMap.has(emp.campus_id)) {
      campusMap.set(emp.campus_id, { id: emp.campus_id, name: emp.campuses?.name ?? '알 수 없음', emps: [] })
    }
    campusMap.get(emp.campus_id)!.emps.push(emp)
  }

  const byCampus = Array.from(campusMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(({ id, name, emps }) => {
      const campus = { id, name }
      const byCategory: Record<Category, Employee[]> = { '관리자': [], 'KT': [], 'FT': [], '상담부': [], 'POLY안전선생님': [], '기타': [] }
      emps.forEach(e => byCategory[getCategory(e)].push(e))
      return { campus, byCategory, total: emps.length }
    })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">전체 직원 조회</h1>
        {!loading && <span className="text-sm text-[#64748B]">총 {employees.length}명</span>}
      </div>

      {apiError && <p className="text-red-500 text-sm mb-4 p-3 bg-red-50 rounded-xl">API 오류: {apiError}</p>}

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {byCampus.map(({ campus, byCategory, total }) => (
            <div key={campus.id} className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F7F8FA]">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => toggleCampus(campus.id)} className="flex items-center gap-2 flex-1 text-left">
                    <h2 className="font-bold text-[#1E293B]">{campus.name}</h2>
                    <svg className={`w-4 h-4 text-[#94A3B8] transition-transform ${expanded.has(campus.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#64748B] bg-white border border-[#E2E8F0] px-2.5 py-1 rounded-full">총 {total}명</span>
                    <button
                      onClick={() => openAdd(campus.id, campus.name)}
                      className="text-xs bg-[#0F172A] text-white px-2.5 py-1 rounded-lg hover:bg-[#1E293B] transition-colors"
                    >+ 직원 추가</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['관리자', 'KT', 'FT', '상담부', 'POLY안전선생님'] as const).map(cat => {
                    const cnt = byCategory[cat].length
                    if (cnt === 0) return null
                    return (
                      <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat]}`}>
                        {cat} {cnt}명
                      </span>
                    )
                  })}
                </div>
              </div>
              {expanded.has(campus.id) && (
                <div className="p-4 space-y-3">
                  {CATEGORIES.map(cat => {
                    const list = byCategory[cat]
                    if (list.length === 0) return null
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}>{cat}</span>
                          <span className="text-xs text-[#94A3B8]">{list.length}명</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map(emp => (
                            <span
                              key={emp.id}
                              className={`text-xs px-2.5 py-1 rounded-lg border ${emp.is_active ? 'border-[#E2E8F0] text-[#1E293B] bg-white' : 'border-[#FCA5A5] text-[#94A3B8] bg-[#FEF2F2] line-through'}`}
                              title={emp.position}
                            >
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
          {byCampus.length === 0 && (
            <p className="text-[#64748B] text-sm col-span-2 text-center py-16">등록된 직원이 없습니다.</p>
          )}
        </div>
      )}

      {/* 직원 추가 모달 */}
      {addForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-[#1E293B] text-lg mb-1">직원 추가</h3>
            <p className="text-sm text-[#64748B] mb-4">{addForm.campusName}</p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이름 <span className="text-red-500">*</span></label>
                <input
                  type="text" required
                  value={addForm.name}
                  onChange={e => setAddForm(f => f ? { ...f, name: e.target.value } : f)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">직책 <span className="text-red-500">*</span></label>
                <select
                  required
                  value={addForm.position}
                  onChange={e => setAddForm(f => f ? { ...f, position: e.target.value } : f)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white"
                >
                  <option value="">선택하세요</option>
                  {['관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">기본 연차 (일)</label>
                <input
                  type="number" min={0} max={30}
                  value={addForm.annual_days}
                  onChange={e => setAddForm(f => f ? { ...f, annual_days: Number(e.target.value) } : f)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                />
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAddForm(null)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm font-medium"
                >취소</button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-[#0F172A] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                >{addLoading ? '추가 중...' : '추가'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
