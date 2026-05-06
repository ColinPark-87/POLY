'use client'

import { useEffect, useRef, useState } from 'react'

const AVATAR_COLORS = ['#004EA2', '#F59E0B', '#8B5CF6', '#10B981', '#F97316', '#EF4444', '#6366F1', '#06B6D4', '#EC4899', '#84CC16']
function getAvatarColor(name: string) {
  if (!name) return '#64748B'
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

const DEPT_OPTIONS = ['관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '원장', '기타']
const ROLE_OPTIONS = [
  { value: 'employee', label: '직원' },
  { value: 'campus_admin', label: '원장 (관리자)' },
]
const DEPT_ORDER = ['원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타']

interface Employee {
  id: string
  name: string
  email: string
  position: string
  role: string
  is_active: boolean
  campus_hired_at: string | null
  company_hired_at: string | null
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState({ name: '', position: '', role: 'employee', campus_hired_at: '', company_hired_at: '', email: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  // Add employee
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', position: 'FT', campus_hired_at: '', company_hired_at: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addResult, setAddResult] = useState<{ tempPassword: string; name: string } | null>(null)

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDept, setDragOverDept] = useState<string | null>(null)
  const dragCounter = useRef<Record<string, number>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/campus/employees')
    const d = await res.json()
    setEmployees(d.employees ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDeactivate(id: string) {
    if (!confirm('이 직원을 퇴사 처리하시겠습니까?')) return
    await fetch(`/api/campus/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    load()
  }

  function openEdit(emp: Employee) {
    setEditEmp(emp)
    setEditForm({ name: emp.name, position: emp.position, role: emp.role, campus_hired_at: emp.campus_hired_at ?? '', company_hired_at: emp.company_hired_at ?? '', email: emp.email ?? '' })
    setEditError('')
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editEmp) return
    setEditLoading(true)
    setEditError('')
    const res = await fetch(`/api/campus/employees/${editEmp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        position: editForm.position,
        role: editForm.role,
        campus_hired_at: editForm.campus_hired_at || null,
        company_hired_at: editForm.company_hired_at || null,
        email: editForm.email || undefined,
      }),
    })
    const d = await res.json()
    setEditLoading(false)
    if (!res.ok) { setEditError(d.error ?? '저장 실패'); return }
    setEditEmp(null)
    load()
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true); setAddError('')
    const res = await fetch('/api/campus/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const d = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(d.error ?? '등록 실패'); return }
    setAddResult({ tempPassword: d.tempPassword, name: addForm.name })
    setAddForm({ name: '', email: '', position: 'FT', campus_hired_at: '', company_hired_at: '' })
    load()
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, empId: string) {
    setDraggingId(empId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverDept(null)
    dragCounter.current = {}
  }

  function handleDragEnter(e: React.DragEvent, dept: string) {
    e.preventDefault()
    dragCounter.current[dept] = (dragCounter.current[dept] ?? 0) + 1
    setDragOverDept(dept)
  }

  function handleDragLeave(e: React.DragEvent, dept: string) {
    dragCounter.current[dept] = (dragCounter.current[dept] ?? 1) - 1
    if (dragCounter.current[dept] <= 0) {
      dragCounter.current[dept] = 0
      setDragOverDept(prev => prev === dept ? null : prev)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  async function handleDrop(targetDept: string) {
    setDragOverDept(null)
    dragCounter.current = {}
    if (!draggingId) return

    const emp = employees.find(e => e.id === draggingId)
    if (!emp) return

    const currentDept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (currentDept === targetDept) return

    // '원장' 그룹은 role 변경이 필요 — edit modal로 유도
    if (targetDept === '원장') {
      alert('원장 권한은 수정 모달에서 역할을 변경해주세요.')
      setDraggingId(null)
      return
    }

    // position을 targetDept로 변경
    const newPosition = targetDept
    // Optimistic update
    setEmployees(prev => prev.map(e => e.id === draggingId ? { ...e, position: newPosition } : e))

    await fetch(`/api/campus/employees/${draggingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: newPosition }),
    })
    setDraggingId(null)
    load()
  }

  // Group by dept
  const grouped: Record<string, Employee[]> = {}
  for (const emp of employees) {
    const dept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (!grouped[dept]) grouped[dept] = []
    grouped[dept].push(emp)
  }
  const deptKeys = DEPT_ORDER.filter(d => grouped[d]).concat(Object.keys(grouped).filter(d => !DEPT_ORDER.includes(d)))

  if (loading) return <Spinner />

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">직원 관리 (인사)</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">카드를 다른 부서로 드래그하면 부서가 변경됩니다</p>
        </div>
        <button onClick={() => { setAddModal(true); setAddError(''); setAddResult(null) }}
          className="bg-[#004EA2] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#003E83] transition-colors">
          + 직원 추가
        </button>
      </div>

      <div className="space-y-6">
        {deptKeys.map(dept => {
          const isDropTarget = dragOverDept === dept && draggingId !== null
          const draggingEmp = employees.find(e => e.id === draggingId)
          const draggingCurrentDept = draggingEmp ? (draggingEmp.role === 'campus_admin' ? '원장' : (draggingEmp.position || '기타')) : null
          const canDrop = draggingId !== null && draggingCurrentDept !== dept

          return (
            <div
              key={dept}
              onDragEnter={e => handleDragEnter(e, dept)}
              onDragLeave={e => handleDragLeave(e, dept)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(dept)}
              className={`rounded-2xl transition-all duration-150 ${
                isDropTarget && canDrop
                  ? 'ring-2 ring-[#004EA2] ring-offset-2 bg-[#EAF2FB]'
                  : 'bg-transparent'
              }`}
            >
              <h2 className="text-sm font-semibold text-[#64748B] border-l-4 border-[#004EA2] pl-3 mb-3 flex items-center gap-2">
                {dept}
                <span className="text-xs font-normal text-[#94A3B8]">{grouped[dept].length}명</span>
                {isDropTarget && canDrop && (
                  <span className="text-xs text-[#004EA2] font-semibold ml-1">여기에 놓기</span>
                )}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 min-h-[80px]">
                {grouped[dept].map(emp => (
                  <div
                    key={emp.id}
                    draggable
                    onDragStart={e => handleDragStart(e, emp.id)}
                    onDragEnd={handleDragEnd}
                    className={`bg-white rounded-2xl p-3 border shadow-sm transition-all select-none ${
                      draggingId === emp.id
                        ? 'opacity-40 scale-95 border-[#004EA2] shadow-none cursor-grabbing'
                        : 'border-[#E2E8F0] cursor-grab hover:shadow-md hover:border-[#94A3B8]'
                    } ${!emp.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Drag handle */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                          style={{ backgroundColor: getAvatarColor(emp.name) }}
                        >
                          {emp.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1E293B] truncate">{emp.name}</p>
                          {!emp.is_active && <span className="text-[10px] text-[#EF4444]">퇴사</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="text-[#CBD5E1] cursor-grab text-base leading-none select-none" title="드래그로 이동">⠿</span>
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); openEdit(emp) }}
                          className="text-xs text-[#64748B] hover:text-[#1E293B]"
                        >수정</button>
                      </div>
                    </div>
                    {emp.company_hired_at && (
                      <p className="text-[11px] text-[#CBD5E1] mb-0.5">최초 {emp.company_hired_at.slice(0, 10)}</p>
                    )}
                    <p className="text-[11px] text-[#94A3B8] mb-1">캠퍼스 {emp.campus_hired_at ?? '-'}</p>
                    {emp.email && !emp.email.includes('@campus.internal') && (
                      <p className="text-[11px] text-[#94A3B8] truncate">{emp.email}</p>
                    )}
                    <div className="mt-2">
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); handleDeactivate(emp.id) }}
                        className="text-[10px] bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] px-2 py-1 rounded-lg font-semibold w-full"
                      >
                        퇴사
                      </button>
                    </div>
                  </div>
                ))}
                {/* Drop zone placeholder */}
                {isDropTarget && canDrop && (
                  <div className="rounded-2xl border-2 border-dashed border-[#004EA2] bg-[#EAF2FB] min-h-[100px] flex items-center justify-center">
                    <span className="text-xs text-[#004EA2] font-medium">{dept}(으)로 이동</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add employee modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddModal(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[#1E293B]">직원 추가</h3>
              <button onClick={() => setAddModal(false)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            {addResult ? (
              <div className="space-y-4">
                <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl p-4">
                  <p className="font-semibold text-[#059669] mb-1">{addResult.name} 등록 완료</p>
                  <p className="text-sm text-[#047857]">임시 비밀번호를 직원에게 전달해주세요:</p>
                  <p className="font-mono text-lg font-bold text-[#1E293B] mt-2 bg-white rounded-lg px-3 py-2 border border-[#6EE7B7] tracking-widest">{addResult.tempPassword}</p>
                  <p className="text-xs text-[#64748B] mt-2">직원은 첫 로그인 후 비밀번호를 변경할 수 있습니다.</p>
                </div>
                <button onClick={() => { setAddResult(null); setAddModal(false) }}
                  className="w-full bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm">확인</button>
              </div>
            ) : (
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">이름 *</label>
                    <input required value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="홍길동" className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">부서/직급</label>
                    <select value={addForm.position} onChange={e => setAddForm(f => ({ ...f, position: e.target.value }))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]">
                      {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일 *</label>
                  <input required type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="hong@example.com" className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">캠퍼스 입사일</label>
                    <input type="date" value={addForm.campus_hired_at} onChange={e => setAddForm(f => ({ ...f, campus_hired_at: e.target.value }))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">최초 입사일</label>
                    <input type="date" value={addForm.company_hired_at} onChange={e => setAddForm(f => ({ ...f, company_hired_at: e.target.value }))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                </div>
                {addError && <p className="text-[#EF4444] text-sm">{addError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddModal(false)}
                    className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
                  <button type="submit" disabled={addLoading}
                    className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addLoading ? '등록 중...' : '등록'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditEmp(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[#1E293B]">직원 수정</h3>
              <button onClick={() => setEditEmp(null)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">이름</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">부서/직급</label>
                  <select value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                    {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">역할 (권한)</label>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">캠퍼스 입사일</label>
                  <input type="date" value={editForm.campus_hired_at} onChange={e => setEditForm(f => ({ ...f, campus_hired_at: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">최초 입사일(회사)</label>
                  <input type="date" value={editForm.company_hired_at} onChange={e => setEditForm(f => ({ ...f, company_hired_at: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일</label>
                <input type="email" value={editForm.email.includes('@campus.internal') ? '' : editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" placeholder="이메일 주소" />
              </div>
              {editError && <p className="text-[#EF4444] text-sm">{editError}</p>}
              <button type="submit" disabled={editLoading} className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {editLoading ? '저장 중...' : '저장'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
