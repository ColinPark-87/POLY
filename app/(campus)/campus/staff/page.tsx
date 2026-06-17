'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getPositionDefaults } from '@/lib/permissions'

const AVATAR_COLORS = ['#004EA2', '#F59E0B', '#8B5CF6', '#10B981', '#F97316', '#EF4444', '#6366F1', '#06B6D4', '#EC4899', '#84CC16']
function getAvatarColor(name: string) {
  if (!name) return '#64748B'
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// 고정 직급 — 삭제·이름 변경 불가 (FIXED: 핵심 직급, DEFAULT_CUSTOM: 기본 내장 직급)
const FIXED_POSITIONS = ['원장', '부원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님']
const DEFAULT_CUSTOM = ['사서', '미화', '기타']
// 기본 내장 직급 전체 — 이 목록에 없는 것만 삭제·이름 변경 가능
const PRESET_POSITIONS = new Set([...FIXED_POSITIONS, ...DEFAULT_CUSTOM])
const CUSTOM_KEY = 'staff-custom-positions'

const DEPT_COLORS: Record<string, string> = {
  '원장': '#0F172A', '부원장': '#1E3A5F', '관리자': '#004EA2', '상담부': '#16A34A',
  'FT': '#EA580C', 'KT': '#7C3AED', 'POLY안전선생님': '#0891B2',
  '사서': '#BE185D', '미화': '#065F46', '기타': '#64748B',
}
function getDeptColor(dept: string) { return DEPT_COLORS[dept] ?? '#64748B' }

const ROLE_OPTIONS = [
  { value: 'employee', label: '직원' },
  { value: 'campus_admin', label: '원장 (관리자)' },
]

interface Employee {
  id: string; name: string; email: string; position: string; role: string
  is_active: boolean; campus_hired_at: string | null; company_hired_at: string | null
  terminated_at: string | null
  perm_class_roster: boolean | null; perm_vehicles: boolean | null; perm_vehicles_restricted: boolean | null; perm_analytics: boolean | null; perm_enroll_edit: boolean | null
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>
}

export default function StaffPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [terminated, setTerminated] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [customPositions, setCustomPositions] = useState<string[]>(DEFAULT_CUSTOM)
  const [terminatedOpen, setTerminatedOpen] = useState(false)
  const [terminateModal, setTerminateModal] = useState<Employee | null>(null)
  const [terminateDate, setTerminateDate] = useState('')
  const [terminateSaving, setTerminateSaving] = useState(false)

  // 상세/수정 모달
  const [selected, setSelected] = useState<Employee | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'permissions' | 'terminate'>('info')
  const [editForm, setEditForm] = useState({ name: '', position: '', campus_hired_at: '', company_hired_at: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  // 비밀번호 리셋 (원장이 직원 임시 비밀번호 발급)
  const [resetResult, setResetResult] = useState<{ tempPassword: string; name: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  // 직원 추가 모달
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', position: 'FT', campus_hired_at: '', company_hired_at: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addResult, setAddResult] = useState<{ tempPassword: string; name: string } | null>(null)

  // 직급 추가 모달
  const [addPosModal, setAddPosModal] = useState(false)
  const [newPosName, setNewPosName] = useState('')
  const [addPosError, setAddPosError] = useState('')

  // 직급 수정 (커스텀만)
  const [editPosModal, setEditPosModal] = useState<string | null>(null)
  const [editPosName, setEditPosName] = useState('')
  const [editPosError, setEditPosError] = useState('')
  const [editPosSaving, setEditPosSaving] = useState(false)

  // + 버튼 드롭다운
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  // Drag
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDept, setDragOverDept] = useState<string | null>(null)
  const dragCounter = useRef<Record<string, number>>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_KEY)
      if (saved) setCustomPositions(JSON.parse(saved))
    } catch {}
    load()
  }, [])

  function saveCustomPositions(positions: string[]) {
    setCustomPositions(positions)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(positions))
  }

  async function load() {
    setLoading(true)
    const res = await fetch('/api/campus/employees?all=true')
    const d = await res.json()
    const all: Employee[] = d.employees ?? []
    setEmployees(all.filter(e => e.is_active))
    setTerminated(all.filter(e => !e.is_active).sort((a, b) =>
      (b.terminated_at ?? '').localeCompare(a.terminated_at ?? '')
    ))
    setLoading(false)
  }

  async function handleTerminate() {
    if (!terminateModal) return
    setTerminateSaving(true)
    await fetch(`/api/campus/employees/${terminateModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false, terminated_at: terminateDate || new Date().toISOString().slice(0, 10) }),
    })
    setTerminateSaving(false)
    setTerminateModal(null)
    setSelected(null)
    load()
  }

  async function handleRestore(emp: Employee) {
    await fetch(`/api/campus/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true, terminated_at: null }),
    })
    load()
  }

  async function handleResetPassword() {
    if (!selected) return
    if (!confirm(`${selected.name}님의 비밀번호를 임시 비밀번호로 리셋하시겠습니까?\n발급된 임시 비밀번호를 직원에게 전달해야 합니다.`)) return
    setResetting(true)
    const res = await fetch(`/api/campus/employees/${selected.id}/reset-password`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setResetting(false)
    if (!res.ok) { alert(d.error ?? '비밀번호 리셋 실패'); return }
    setResetResult({ tempPassword: d.tempPassword, name: selected.name })
  }

  function openDetail(emp: Employee) {
    setSelected(emp)
    setDetailTab('info')
    setResetResult(null)
    setEditForm({
      name: emp.name, position: emp.position || '기타',
      campus_hired_at: emp.campus_hired_at ?? '',
      company_hired_at: emp.company_hired_at ?? '',
      email: emp.email?.includes('@campus.internal') ? '' : (emp.email ?? ''),
    })
    setEditError('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true); setEditError('')
    const res = await fetch(`/api/campus/employees/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name, position: editForm.position,
        campus_hired_at: editForm.campus_hired_at || null,
        company_hired_at: editForm.company_hired_at || null,
        email: editForm.email || undefined,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setEditError(d.error ?? '저장 실패'); return }
    setSelected(null); load()
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

  function handleAddPosition() {
    const name = newPosName.trim()
    if (!name) { setAddPosError('직급 이름을 입력하세요'); return }
    const all = [...FIXED_POSITIONS, ...customPositions]
    if (all.includes(name)) { setAddPosError('이미 존재하는 직급입니다'); return }
    saveCustomPositions([...customPositions, name])
    setAddPosModal(false); setNewPosName(''); setAddPosError('')
  }

  async function handleRenamePosition(e: React.FormEvent) {
    e.preventDefault()
    if (!editPosModal) return
    const oldName = editPosModal
    const newName = editPosName.trim()
    if (!newName) { setEditPosError('직급 이름을 입력하세요'); return }
    const all = [...FIXED_POSITIONS, ...customPositions.filter(p => p !== oldName)]
    if (all.includes(newName)) { setEditPosError('이미 존재하는 직급입니다'); return }
    setEditPosSaving(true)
    // 해당 직급의 모든 직원 position 변경
    const targets = employees.filter(e => (e.role === 'campus_admin' ? '원장' : (e.position || '기타')) === oldName)
    await Promise.all(targets.map(emp => fetch(`/api/campus/employees/${emp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: newName }),
    })))
    const newCustom = customPositions.map(p => p === oldName ? newName : p)
    saveCustomPositions(newCustom)
    setEditPosSaving(false); setEditPosModal(null); setEditPosName(''); setEditPosError('')
    load()
  }

  async function handleDeletePosition(dept: string) {
    if (!confirm(`"${dept}" 직급을 삭제하고 해당 직원들을 "기타"로 이동하시겠습니까?`)) return
    const targets = employees.filter(e => (e.role === 'campus_admin' ? '원장' : (e.position || '기타')) === dept)
    await Promise.all(targets.map(emp => fetch(`/api/campus/employees/${emp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: '기타' }),
    })))
    saveCustomPositions(customPositions.filter(p => p !== dept))
    load()
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, empId: string) { setDraggingId(empId); e.dataTransfer.effectAllowed = 'move' }
  function handleDragEnd() { setDraggingId(null); setDragOverDept(null); dragCounter.current = {} }
  function handleDragEnter(e: React.DragEvent, dept: string) {
    e.preventDefault()
    dragCounter.current[dept] = (dragCounter.current[dept] ?? 0) + 1
    setDragOverDept(dept)
  }
  function handleDragLeave(e: React.DragEvent, dept: string) {
    dragCounter.current[dept] = (dragCounter.current[dept] ?? 1) - 1
    if (dragCounter.current[dept] <= 0) { dragCounter.current[dept] = 0; setDragOverDept(p => p === dept ? null : p) }
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  async function handleDrop(targetDept: string) {
    setDragOverDept(null); dragCounter.current = {}
    if (!draggingId) return
    const emp = employees.find(e => e.id === draggingId)
    if (!emp) return
    const currentDept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (currentDept === targetDept) return
    if (targetDept === '원장') { alert('원장 권한은 카드를 클릭해서 역할을 변경해주세요.'); setDraggingId(null); return }
    setEmployees(prev => prev.map(e => e.id === draggingId ? { ...e, position: targetDept } : e))
    await fetch(`/api/campus/employees/${draggingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: targetDept }),
    })
    setDraggingId(null); load()
  }

  // Group
  const allPositions = [...FIXED_POSITIONS, ...customPositions]
  const grouped: Record<string, Employee[]> = {}
  for (const emp of employees) {
    const dept = emp.role === 'campus_admin' ? '원장' : (emp.position || '기타')
    if (!grouped[dept]) grouped[dept] = []
    grouped[dept].push(emp)
  }
  const deptKeys = allPositions.filter(d => grouped[d])
    .concat(Object.keys(grouped).filter(d => !allPositions.includes(d)))

  if (loading) return <Spinner />

  return (
    <div className="max-w-6xl mx-auto" onClick={() => addMenuOpen && setAddMenuOpen(false)}>
      {/* 탭 — 최상단 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-5 flex-wrap">
        <button className="px-5 py-2.5 text-sm font-medium border-b-2 border-[#004EA2] text-[#004EA2]">
          캠퍼스 직원 현황
        </button>
      </div>

      {/* 헤더 + 요약 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">캠퍼스 직원 현황</h1>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">카드를 드래그해 직급 변경 · 클릭해 상세 정보 확인</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAddMenuOpen(o => !o)}
              className="w-9 h-9 bg-[#004EA2] text-white rounded-xl flex items-center justify-center hover:bg-[#003E83] transition-colors text-lg font-bold">
              +
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-20 w-36 overflow-hidden">
                <button onClick={() => { setAddMenuOpen(false); setAddModal(true); setAddError(''); setAddResult(null) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#1E293B] hover:bg-[#F7F8FA] border-b border-[#F1F5F9]">
                  직원 추가
                </button>
                <button onClick={() => { setAddMenuOpen(false); setAddPosModal(true); setNewPosName(''); setAddPosError('') }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#1E293B] hover:bg-[#F7F8FA]">
                  직급 추가
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 구성원 요약 카드 */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-[#EAF2FB] flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-[#004EA2]">{employees.length}</span>
              <span className="text-[10px] text-[#64748B]">전체</span>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8] mb-0.5">재직 구성원</p>
              <p className="text-sm text-[#64748B]">부서 <strong className="text-[#1E293B]">{deptKeys.length}개</strong></p>
            </div>
          </div>
          <div className="flex-1 flex flex-wrap gap-2">
            {deptKeys.map(dept => {
              const count = (grouped[dept] ?? []).length
              const color = getDeptColor(dept)
              return (
                <div key={dept} className="flex items-center gap-1.5 bg-[#F7F8FA] rounded-xl px-3 py-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-[#1E293B]">{dept}</span>
                  <span className="text-xs text-[#94A3B8]">{count}명</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 직급별 그룹 */}
      <div className="space-y-6">
        {deptKeys.map(dept => {
          const color = getDeptColor(dept)
          const isFixed = PRESET_POSITIONS.has(dept)
          const isDropTarget = dragOverDept === dept && draggingId !== null
          const draggingEmp = employees.find(e => e.id === draggingId)
          const draggingCurrentDept = draggingEmp ? (draggingEmp.role === 'campus_admin' ? '원장' : (draggingEmp.position || '기타')) : null
          const canDrop = draggingId !== null && draggingCurrentDept !== dept

          return (
            <div key={dept}
              onDragEnter={e => handleDragEnter(e, dept)}
              onDragLeave={e => handleDragLeave(e, dept)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(dept)}
              className={`rounded-2xl p-3 transition-all duration-150 ${isDropTarget && canDrop ? 'ring-2 ring-[#004EA2] ring-offset-2' : ''}`}
              style={isDropTarget && canDrop ? { backgroundColor: `${color}08` } : {}}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
                <h2 className="text-sm font-bold" style={{ color }}>{dept}</h2>
                <span className="text-xs text-[#94A3B8]">{(grouped[dept] ?? []).length}명</span>
                {isFixed && <span className="text-[9px] text-[#CBD5E1] ml-1">고정</span>}
                {!isFixed && (
                  <div className="flex items-center gap-1 ml-1">
                    <button onClick={() => { setEditPosModal(dept); setEditPosName(dept); setEditPosError('') }}
                      className="text-[10px] text-[#94A3B8] hover:text-[#1E293B] px-1.5 py-0.5 rounded hover:bg-[#F1F5F9] transition-colors">
                      이름 변경
                    </button>
                    <button onClick={() => handleDeletePosition(dept)}
                      className="text-[10px] text-[#94A3B8] hover:text-[#EF4444] px-1.5 py-0.5 rounded hover:bg-[#FEF2F2] transition-colors">
                      삭제
                    </button>
                  </div>
                )}
                {isDropTarget && canDrop && <span className="text-xs font-semibold ml-1" style={{ color }}>여기에 놓기</span>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 min-h-[72px]">
                {(grouped[dept] ?? []).map(emp => (
                  <div key={emp.id}
                    draggable onDragStart={e => handleDragStart(e, emp.id)} onDragEnd={handleDragEnd}
                    onClick={() => openDetail(emp)}
                    className={`bg-white rounded-2xl p-3 border shadow-sm transition-all select-none ${
                      draggingId === emp.id
                        ? 'opacity-40 scale-95 border-blue-300 shadow-none cursor-grabbing'
                        : 'border-[#E2E8F0] hover:shadow-md hover:border-[#94A3B8] cursor-grab'
                    }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                          style={{ backgroundColor: getAvatarColor(emp.name) }}>
                          {emp.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1E293B] truncate">{emp.name}</p>
                          <p className="text-[10px] text-[#94A3B8] truncate">{emp.position || dept}</p>
                        </div>
                      </div>
                      <span className="text-[#CBD5E1] text-base leading-none select-none shrink-0 ml-1">⠿</span>
                    </div>
                    {emp.campus_hired_at && (
                      <p className="text-[10px] text-[#94A3B8]">캠퍼스 {emp.campus_hired_at.slice(0, 7)}</p>
                    )}
                    {emp.email && !emp.email.includes('@campus.internal') && (
                      <p className="text-[10px] text-[#CBD5E1] truncate mt-0.5">{emp.email}</p>
                    )}
                  </div>
                ))}
                {isDropTarget && canDrop && (
                  <div className="rounded-2xl border-2 border-dashed min-h-[88px] flex items-center justify-center"
                    style={{ borderColor: color, backgroundColor: `${color}08` }}>
                    <span className="text-xs font-medium" style={{ color }}>{dept}(으)로 이동</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 퇴사자 목록 (접힘) */}
      {terminated.length > 0 && (
        <div className="mt-8 border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <button
            onClick={() => setTerminatedOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 bg-[#F7F8FA] hover:bg-[#F1F5F9] transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-[#94A3B8]" />
              <span className="text-sm font-bold text-[#64748B]">퇴사자 목록</span>
              <span className="text-xs text-[#94A3B8] bg-white border border-[#E2E8F0] px-2 py-0.5 rounded-full">{terminated.length}명</span>
            </div>
            <svg className={`w-4 h-4 text-[#94A3B8] transition-transform ${terminatedOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {terminatedOpen && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {terminated.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 opacity-50"
                      style={{ backgroundColor: getAvatarColor(emp.name) }}>
                      {emp.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#64748B] truncate">{emp.name}</p>
                      <p className="text-[10px] text-[#94A3B8] truncate">
                        {emp.position || '-'}
                        {emp.terminated_at && <span className="ml-1">· 퇴사 {emp.terminated_at.slice(0, 10)}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(emp)}
                      className="text-[10px] font-semibold text-[#004EA2] border border-[#004EA2] px-2 py-1 rounded-lg hover:bg-[#EAF2FB] transition-colors shrink-0">
                      복구
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 직원 상세/수정 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-5 border-b border-[#F1F5F9]">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                style={{ backgroundColor: getAvatarColor(selected.name) }}>
                {selected.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#1E293B] text-lg">{selected.name}</p>
                <p className="text-sm text-[#64748B]">{selected.position || '-'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#94A3B8] text-2xl leading-none shrink-0">×</button>
            </div>

            {/* 탭 헤더 */}
            <div className="flex border-b border-[#F1F5F9] px-5">
              {(['info', 'permissions', 'terminate'] as const).map((tab) => {
                const labels = { info: '기본 정보', permissions: '권한 설정', terminate: '퇴사 처리' }
                return (
                  <button key={tab} type="button"
                    onClick={() => setDetailTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      detailTab === tab
                        ? 'border-[#004EA2] text-[#004EA2]'
                        : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
                    }`}>
                    {labels[tab]}
                  </button>
                )
              })}
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {detailTab === 'info' && (
                <>
                  <div className="bg-[#F8FAFC] rounded-xl p-3 space-y-2 text-sm">
                    {selected.email && !selected.email.includes('@campus.internal') && (
                      <div className="flex gap-2"><span className="text-[10px] font-bold text-[#94A3B8] w-16 shrink-0 mt-0.5">이메일</span><span className="text-[#1E293B] break-all">{selected.email}</span></div>
                    )}
                    {selected.campus_hired_at && (
                      <div className="flex gap-2"><span className="text-[10px] font-bold text-[#94A3B8] w-16 shrink-0 mt-0.5">캠퍼스 입사</span><span className="text-[#1E293B]">{selected.campus_hired_at.slice(0, 10)}</span></div>
                    )}
                    {selected.company_hired_at && (
                      <div className="flex gap-2"><span className="text-[10px] font-bold text-[#94A3B8] w-16 shrink-0 mt-0.5">최초 입사</span><span className="text-[#1E293B]">{selected.company_hired_at.slice(0, 10)}</span></div>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">정보 수정</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#1E293B] mb-1">이름</label>
                      <input value={editForm.name} onChange={e => setEditForm(f=>({...f, name: e.target.value}))} required
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1E293B] mb-1">직급</label>
                      <select value={editForm.position} onChange={e => setEditForm(f=>({...f, position: e.target.value}))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]">
                        {allPositions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#1E293B] mb-1">캠퍼스 입사일</label>
                      <input type="date" value={editForm.campus_hired_at} onChange={e => setEditForm(f=>({...f, campus_hired_at: e.target.value}))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1E293B] mb-1">최초 입사일</label>
                      <input type="date" value={editForm.company_hired_at} onChange={e => setEditForm(f=>({...f, company_hired_at: e.target.value}))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1E293B] mb-1">이메일</label>
                    <input type="email" value={editForm.email} onChange={e => setEditForm(f=>({...f, email: e.target.value}))}
                      placeholder="이메일 주소"
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                  </div>
                  {editError && <p className="text-[#EF4444] text-sm">{editError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setSelected(null)}
                      className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>

                  {/* 비밀번호 리셋 (원장) */}
                  <div className="border-t border-[#F1F5F9] pt-3 mt-1">
                    <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">계정 · 비밀번호</p>
                    {resetResult ? (
                      <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl p-4">
                        <p className="font-semibold text-[#059669] mb-1">{resetResult.name} 비밀번호 리셋 완료</p>
                        <p className="text-sm text-[#047857]">아래 임시 비밀번호를 직원에게 전달해주세요:</p>
                        <p className="font-mono text-lg font-bold text-[#1E293B] mt-2 bg-white rounded-lg px-3 py-2 border border-[#6EE7B7] tracking-widest break-all">{resetResult.tempPassword}</p>
                      </div>
                    ) : (
                      <button type="button" onClick={handleResetPassword} disabled={resetting}
                        className="w-full border border-[#FCD34D] text-[#B45309] py-2.5 rounded-xl text-sm font-semibold hover:bg-[#FFFBEB] transition-colors disabled:opacity-50">
                        {resetting ? '리셋 중...' : '🔑 비밀번호 리셋'}
                      </button>
                    )}
                    <p className="text-[10px] text-[#94A3B8] mt-1.5">임시 비밀번호가 발급됩니다. 직원은 로그인 후 비밀번호를 변경할 수 있습니다.</p>
                  </div>
                </>
              )}

              {detailTab === 'permissions' && (
                <PermissionsTab
                  emp={selected}
                  onSave={async (perms) => {
                    setSaving(true)
                    await fetch(`/api/campus/employees/${selected.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(perms),
                    })
                    setSaving(false)
                    setSelected(null)
                    load()
                  }}
                  saving={saving}
                  allPositions={allPositions}
                />
              )}

              {detailTab === 'terminate' && (
                <div className="pt-1">
                  <button type="button"
                    onClick={() => { setTerminateModal(selected); setTerminateDate('') }}
                    className="w-full border border-[#FCA5A5] text-[#EF4444] py-2.5 rounded-xl text-sm font-semibold hover:bg-[#FEF2F2] transition-colors">
                    퇴사 처리
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 직원 추가 모달 */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setAddModal(false); setAddResult(null) }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[#1E293B]">직원 추가</h3>
              <button onClick={() => { setAddModal(false); setAddResult(null) }} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            {addResult ? (
              <div className="space-y-4">
                <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl p-4">
                  <p className="font-semibold text-[#059669] mb-1">{addResult.name} 등록 완료</p>
                  <p className="text-sm text-[#047857]">임시 비밀번호를 직원에게 전달해주세요:</p>
                  <p className="font-mono text-lg font-bold text-[#1E293B] mt-2 bg-white rounded-lg px-3 py-2 border border-[#6EE7B7] tracking-widest">{addResult.tempPassword}</p>
                </div>
                <button onClick={() => { setAddResult(null); setAddModal(false) }}
                  className="w-full bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm">확인</button>
              </div>
            ) : (
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">이름 *</label>
                    <input required value={addForm.name} onChange={e => setAddForm(f=>({...f, name: e.target.value}))}
                      placeholder="홍길동" className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">직급</label>
                    <select value={addForm.position} onChange={e => setAddForm(f=>({...f, position: e.target.value}))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]">
                      {allPositions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">이메일 *</label>
                  <input required type="email" value={addForm.email} onChange={e => setAddForm(f=>({...f, email: e.target.value}))}
                    placeholder="hong@example.com" className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">캠퍼스 입사일</label>
                    <input type="date" value={addForm.campus_hired_at} onChange={e => setAddForm(f=>({...f, campus_hired_at: e.target.value}))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">최초 입사일</label>
                    <input type="date" value={addForm.company_hired_at} onChange={e => setAddForm(f=>({...f, company_hired_at: e.target.value}))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
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

      {/* 퇴사 처리 모달 */}
      {terminateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setTerminateModal(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#1E293B]">퇴사 처리</h3>
              <button onClick={() => setTerminateModal(null)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            <div className="flex items-center gap-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-4 py-3 mb-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: getAvatarColor(terminateModal.name) }}>
                {terminateModal.name[0]}
              </div>
              <div>
                <p className="font-semibold text-[#1E293B] text-sm">{terminateModal.name}</p>
                <p className="text-[11px] text-[#64748B]">{terminateModal.position || '-'}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">퇴사일</label>
              <input type="date" value={terminateDate}
                onChange={e => setTerminateDate(e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444]" />
              <p className="text-[10px] text-[#94A3B8] mt-1">비워두면 오늘 날짜로 저장됩니다.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTerminateModal(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={handleTerminate} disabled={terminateSaving}
                className="flex-1 bg-[#EF4444] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {terminateSaving ? '처리 중...' : '퇴사 확정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직급 추가 모달 */}
      {addPosModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddPosModal(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#1E293B]">직급 추가</h3>
              <button onClick={() => setAddPosModal(false)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            <input autoFocus value={newPosName} onChange={e => setNewPosName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPosition()}
              placeholder="직급 이름 (예: 영양사)"
              className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-2"/>
            {addPosError && <p className="text-[#EF4444] text-xs mb-2">{addPosError}</p>}
            <p className="text-[10px] text-[#94A3B8] mb-4">추가된 직급은 이름 변경·삭제가 가능합니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setAddPosModal(false)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={handleAddPosition}
                className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm">추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 직급 이름 변경 모달 (커스텀만) */}
      {editPosModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditPosModal(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#1E293B]">"{editPosModal}" 이름 변경</h3>
              <button onClick={() => setEditPosModal(null)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleRenamePosition}>
              <input autoFocus value={editPosName} onChange={e => setEditPosName(e.target.value)} required
                placeholder="새 직급 이름"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-2"/>
              {editPosError && <p className="text-[#EF4444] text-xs mb-2">{editPosError}</p>}
              <p className="text-[10px] text-[#94A3B8] mb-4">해당 직급의 모든 직원 정보가 새 이름으로 변경됩니다.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditPosModal(null)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={editPosSaving}
                  className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {editPosSaving ? '변경 중...' : '변경'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PermissionsTab({ emp, onSave, saving, allPositions }: {
  emp: Employee
  onSave: (perms: { role: string; position: string; perm_class_roster: boolean | null; perm_vehicles: boolean | null; perm_vehicles_restricted: boolean | null; perm_analytics: boolean | null; perm_enroll_edit: boolean | null }) => Promise<void>
  saving: boolean
  allPositions: string[]
}) {
  const [role, setRole] = useState(emp.role)
  const [position, setPosition] = useState(emp.position || '기타')
  const defaults = getPositionDefaults(role, position)
  const [classRoster, setClassRoster] = useState<boolean | null>(emp.perm_class_roster)
  const [vehicles, setVehicles] = useState<boolean | null>(emp.perm_vehicles)
  const [vehiclesRestricted, setVehiclesRestricted] = useState<boolean | null>(emp.perm_vehicles_restricted)
  const [analytics, setAnalytics] = useState<boolean | null>(emp.perm_analytics)
  const [enrollEdit, setEnrollEdit] = useState<boolean | null>(emp.perm_enroll_edit)

  const effectiveClassRoster = classRoster ?? defaults.classRoster
  const effectiveVehicles = vehicles ?? defaults.vehicles
  const effectiveVehiclesRestricted = vehiclesRestricted ?? defaults.vehiclesRestricted
  const effectiveAnalytics = analytics ?? defaults.analytics
  const effectiveEnrollEdit = enrollEdit ?? defaults.enrollEdit

  function reset() {
    setClassRoster(null)
    setVehicles(null)
    setVehiclesRestricted(null)
    setAnalytics(null)
    setEnrollEdit(null)
  }

  return (
    <div className="space-y-4">
      {/* 역할 */}
      <div>
        <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">시스템 역할</p>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => setRole(opt.value)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                role === opt.value
                  ? 'bg-[#004EA2] text-white border-[#004EA2]'
                  : 'bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#004EA2] hover:text-[#004EA2]'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        {role === 'campus_admin' && (
          <p className="text-[10px] text-[#F59E0B] mt-1.5">원장으로 설정하면 모든 캠퍼스 기능에 접근할 수 있습니다.</p>
        )}
      </div>

      <div className="border-t border-[#F1F5F9] pt-3">
        <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">직급</p>
        <select value={position} onChange={e => setPosition(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]">
          {allPositions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <p className="text-[10px] text-[#94A3B8] mt-1">직급 변경 시 아래 기본값이 자동 반영됩니다.</p>
      </div>

      <div className="border-t border-[#F1F5F9] pt-3">
        <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">메뉴 접근 권한</p>

      {/* 개설반 현황 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">개설반 현황</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.classRoster ? 'ON' : 'OFF'}
            {classRoster !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClassRoster(prev => {
            const current = prev ?? defaults.classRoster
            return current === defaults.classRoster ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveClassRoster ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveClassRoster ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 차량 관리 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">차량 관리</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.vehicles ? 'ON' : 'OFF'}
            {vehicles !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVehicles(prev => {
            const current = prev ?? defaults.vehicles
            return current === defaults.vehicles ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveVehicles ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveVehicles ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 대시보드 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">캠퍼스 대시보드</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.analytics ? 'ON' : 'OFF'}
            {analytics !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAnalytics(prev => {
            const current = prev ?? defaults.analytics
            return current === defaults.analytics ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveAnalytics ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveAnalytics ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 입퇴소 관리 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">입퇴소 관리</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.enrollEdit ? 'ON' : 'OFF'}
            {enrollEdit !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnrollEdit(prev => {
            const current = prev ?? defaults.enrollEdit
            return current === defaults.enrollEdit ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveEnrollEdit ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveEnrollEdit ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 차량 제한 뷰 (차량 ON일 때만) */}
      {effectiveVehicles && (
        <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl ml-4 border-l-2 border-[#E2E8F0]">
          <div>
            <p className="text-sm font-medium text-[#1E293B]">제한 뷰</p>
            <p className="text-[10px] text-[#94A3B8]">ON: 오늘 등하원·변경기록·노선지도만 | OFF: 전체</p>
            <p className="text-[10px] text-[#94A3B8]">
              직급 기본값: {defaults.vehiclesRestricted ? 'ON' : 'OFF'}
              {vehiclesRestricted !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVehiclesRestricted(prev => {
              const current = prev ?? defaults.vehiclesRestricted
              return current === defaults.vehiclesRestricted ? !current : null
            })}
            className={`relative w-12 h-6 rounded-full transition-colors ${effectiveVehiclesRestricted ? 'bg-[#F59E0B]' : 'bg-[#004EA2]'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveVehiclesRestricted ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={reset}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm hover:bg-[#F7F8FA]">
          기본값으로 초기화
        </button>
        <button type="button" disabled={saving}
          onClick={() => onSave({ role, position, perm_class_roster: classRoster, perm_vehicles: vehicles, perm_vehicles_restricted: vehiclesRestricted, perm_analytics: analytics, perm_enroll_edit: enrollEdit })}
          className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
      </div>
    </div>
  )
}
