'use client'

import { useEffect, useState } from 'react'

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

interface Campus { id: string; name: string }

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [campusFilter, setCampusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/hq/campuses').then(r => r.json()).then(d => setCampuses(d.campuses ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = campusFilter ? `/api/hq/employees?campus_id=${campusFilter}` : '/api/hq/employees'
    fetch(url).then(r => r.json()).then(d => {
      setEmployees(d.employees ?? [])
      setLoading(false)
    })
  }, [campusFilter])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">전체 직원 조회</h1>
        <select
          value={campusFilter}
          onChange={e => setCampusFilter(e.target.value)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
        >
          <option value="">전체 캠퍼스</option>
          {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="text-xs text-[#64748B]">총 {employees.length}명</p>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0]">
              <tr>
                {['이름', '직책', '캠퍼스', '이메일', '역할', '상태'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {employees.map(emp => (
                <tr key={emp.id} className={`hover:bg-[#F8FAFC] ${!emp.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium">{emp.name}</td>
                  <td className="px-4 py-3 text-[#64748B]">{emp.position}</td>
                  <td className="px-4 py-3 text-[#64748B]">{emp.campuses?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-[#64748B] text-xs">{emp.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${emp.role === 'campus_admin' ? 'bg-[#F3F0FF] text-[#7C3AED]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
                      {emp.role === 'campus_admin' ? '원장' : '직원'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${emp.is_active ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>
                      {emp.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
