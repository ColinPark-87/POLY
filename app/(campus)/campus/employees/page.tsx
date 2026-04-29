'use client'

import { useEffect, useState } from 'react'

interface Employee {
  id: string
  name: string
  email: string
  position: string
  role: string
  is_active: boolean
  company_hired_at: string | null
  campus_hired_at: string | null
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" /></div>
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', position: '', company_hired_at: '', campus_hired_at: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/campus/employees')
    const d = await res.json()
    setEmployees(d.employees ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setError('')
    const res = await fetch('/api/campus/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setAddLoading(false)
    if (!res.ok) { setError(d.error); return }
    setTempPassword(d.tempPassword)
    setShowAdd(false)
    setForm({ email: '', name: '', position: '', company_hired_at: '', campus_hired_at: '' })
    load()
  }

  async function handleDeactivate(id: string, is_active: boolean) {
    const label = is_active ? '비활성화' : '복구'
    if (!confirm(`이 직원을 ${label}하시겠습니까?`)) return
    await fetch(`/api/campus/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !is_active }),
    })
    load()
  }

  async function handleResetPassword(id: string, name: string) {
    if (!confirm(`${name}님의 비밀번호를 초기화하시겠습니까?`)) return
    const res = await fetch(`/api/campus/employees/${id}/reset-password`, { method: 'POST' })
    const d = await res.json()
    if (res.ok) setTempPassword(d.tempPassword)
    else alert(d.error)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">직원 관리</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + 직원 추가
        </button>
      </div>

      {/* 임시 비밀번호 알림 */}
      {tempPassword && (
        <div className="mb-4 bg-[#D1FAE5] border border-[#6EE7B7] rounded-2xl p-4">
          <p className="font-semibold text-[#059669] mb-1">처리 완료</p>
          <p className="text-sm text-[#065F46]">임시 비밀번호: <code className="bg-white px-2 py-0.5 rounded font-mono font-bold">{tempPassword}</code></p>
          <p className="text-xs text-[#047857] mt-1">직원에게 전달해주세요. 첫 로그인 시 변경됩니다.</p>
          <button onClick={() => setTempPassword(null)} className="text-xs text-[#047857] underline mt-2">닫기</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {employees.map(emp => (
              <div key={emp.id} className={`bg-white rounded-2xl p-4 border border-[#E2E8F0] ${!emp.is_active ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-sm">{emp.name} {!emp.is_active && <span className="text-xs text-[#EF4444]">(비활성)</span>}</p>
                    <p className="text-xs text-[#64748B]">{emp.position} · {emp.email}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-3">
                  <button onClick={() => handleResetPassword(emp.id, emp.name)} className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]">비밀번호 초기화</button>
                  <button onClick={() => handleDeactivate(emp.id, emp.is_active)} className={`text-xs px-3 py-1.5 rounded-lg ${emp.is_active ? 'border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]' : 'border border-[#6EE7B7] text-[#059669] hover:bg-[#D1FAE5]'}`}>
                    {emp.is_active ? '비활성화' : '복구'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  {['이름','직책','이메일','입사일','상태','액션'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {employees.map(emp => (
                  <tr key={emp.id} className={`hover:bg-[#F8FAFC] ${!emp.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium">{emp.name}</td>
                    <td className="px-4 py-3 text-[#64748B]">{emp.position}</td>
                    <td className="px-4 py-3 text-[#64748B]">{emp.email}</td>
                    <td className="px-4 py-3 text-[#64748B]">{emp.campus_hired_at ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${emp.is_active ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>
                        {emp.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleResetPassword(emp.id, emp.name)} className="text-xs px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]">PW초기화</button>
                        <button onClick={() => handleDeactivate(emp.id, emp.is_active)} className={`text-xs px-2.5 py-1 rounded-lg ${emp.is_active ? 'border border-[#FCA5A5] text-[#DC2626]' : 'border border-[#6EE7B7] text-[#059669]'}`}>
                          {emp.is_active ? '비활성화' : '복구'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 직원 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-5">직원 추가</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              {[
                { field: 'email', label: '이메일 *', type: 'email' },
                { field: 'name', label: '이름 *', type: 'text' },
                { field: 'position', label: '직책', type: 'text' },
                { field: 'company_hired_at', label: '회사 입사일', type: 'date' },
                { field: 'campus_hired_at', label: '캠퍼스 입사일', type: 'date' },
              ].map(({ field, label, type }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[field as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    required={label.includes('*')}
                    className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  />
                </div>
              ))}
              {error && <p className="text-[#EF4444] text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={addLoading} className="flex-1 bg-[#7C3AED] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {addLoading ? '추가 중...' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
