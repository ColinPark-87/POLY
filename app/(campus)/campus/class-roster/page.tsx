'use client'

import { useEffect, useState, useCallback } from 'react'

const DAYS = ['월', '화', '수', '목', '금'] as const
type Day = typeof DAYS[number]

const CLASS_COLORS = [
  '#FF6B35','#FF9800','#2196F3','#4CAF50','#9C27B0',
  '#E53935','#00897B','#1565C0','#F57C00','#607D8B',
]

const TEACHER_COLORS = [
  '#E53935','#FB8C00','#43A047','#1E88E5','#8E24AA',
  '#00897B','#6D4C41','#546E7A','#D81B60','#FF6F00',
]

// Session colors — exact match first (matches HTML SESS_C)
const SESS_COLORS: Record<string, string> = {
  '유치부': '#FF6B35',
  '유치부 방과후': '#FF9800',
  '초등부 매일반': '#2196F3',
  '초등부 월수금': '#4CAF50',
  '초등부 화목': '#9C27B0',
  '초등부': '#2196F3',
  '중등부': '#2E7D32',
  '고등부': '#6A1B9A',
}
function sessColor(name: string, fallback: string) {
  if (SESS_COLORS[name]) return SESS_COLORS[name]
  for (const key of Object.keys(SESS_COLORS)) {
    if (name.includes(key)) return SESS_COLORS[key]
  }
  return fallback
}

// Bus-specific colors (matches HTML BUS_C)
const BUS_COLOR_MAP: Record<string, { bg: string; bd: string; tx: string }> = {
  '1호차': { bg: '#FFF3E0', bd: '#FF9800', tx: '#E65100' },
  '2호차': { bg: '#E3F2FD', bd: '#2196F3', tx: '#0D47A1' },
  '3호차': { bg: '#F3E5F5', bd: '#9C27B0', tx: '#4A148C' },
  '5호차': { bg: '#E8F5E9', bd: '#4CAF50', tx: '#1B5E20' },
  '6호차': { bg: '#FFF8E1', bd: '#FFC107', tx: '#F57F17' },
  '7호차': { bg: '#FCE4EC', bd: '#E91E63', tx: '#880E4F' },
  '8호차': { bg: '#ECEFF1', bd: '#607D8B', tx: '#263238' },
}
function getBusStyle(name: string) {
  return BUS_COLOR_MAP[name] ?? { bg: '#f5f5f5', bd: '#999', tx: '#333' }
}

const BUS_COLORS = ['#F9A825','#E53935','#1565C0','#2E7D32','#6A1B9A','#D84315','#00838F','#37474F']

interface Student { id: string; name: string; english_name: string | null; grade: string | null; is_active: boolean }
interface Enrollment {
  id: string; class_id: string; student_id: string; sort_order: number
  arr_schedule: Record<string, string>; dep_schedule: Record<string, string>
  highlight_color: string | null; is_waitlist: boolean
  campus_students: Student
}
interface ClassItem {
  id: string; session_id: string; level: string; room: string | null
  teacher: string | null; kt_teacher: string | null; color: string; sort_order: number
}
interface Session { id: string; name: string; time_range: string | null; month: string; sort_order: number }
interface Bus { id: string; name: string; sort_order: number }
interface StudentOnBus { student_id: string; name: string; english_name: string | null; override?: boolean }
interface KTTeacher { name: string; color: string; classIds: string[] }
interface EnrollHistoryEntry { type: string; class_name: string; class_id?: string | null; created_at: string }

function levelPrefix(level: string): string {
  if (/^honors/i.test(level)) {
    // Honors2, Honors3처럼 바로 뒤에 숫자가 붙는 경우
    const hm = level.match(/^honors(\d+)/i)
    return hm ? `Honors${hm[1]}` : 'Honors'
  }
  // 알파벳 + 뒤따르는 숫자까지 (예: MAG3, ECP5, GT1)
  const m = level.match(/^([A-Za-z]+\d+)/)
  if (m) return m[1].toUpperCase()
  // 숫자 없는 경우 알파벳만
  const m2 = level.match(/^([A-Za-z]+)/)
  if (m2) return m2[1].toUpperCase()
  return level
}

function monthToPrefix(m: string): string {
  const match = m.match(/(\d+)년 (\d+)월/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}`
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" /></div>
}

function EnrollSearchModal({ candidates, onSelect }: { candidates: Student[]; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const results = q.trim()
    ? candidates.filter(s => s.name.includes(q.trim()) || (s.english_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
    : []
  return (
    <div>
      <div className="relative mb-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 검색..."
          className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" autoFocus />
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {q.trim() === '' ? (
          <p className="text-[#CBD5E1] text-sm text-center py-8">이름을 입력하세요</p>
        ) : results.length === 0 ? (
          <p className="text-[#94A3B8] text-sm text-center py-8">검색 결과 없음</p>
        ) : results.map(s => (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#EAF2FB] text-sm flex items-center gap-2 transition-colors">
            <span className="font-medium text-[#1E293B]">{s.name}</span>
            {s.english_name && <span className="text-[#94A3B8] text-xs">{s.english_name}</span>}
            {s.grade && <span className="ml-auto text-xs text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">{s.grade}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}
function getDayKey(d: Date): Day {
  const m: Record<number, Day> = { 1:'월', 2:'화', 3:'수', 4:'목', 5:'금' }
  return m[d.getDay()] ?? '월'
}

export default function ClassRosterPage() {
  const [pageTab, setPageTab] = useState<'management'|'homeroom'>('management')
  const [tab, setTab] = useState<'roster'|'students'|'enroll'|'log'>('roster')
  const [month, setMonth] = useState(currentMonth())
  const [addMonthLoading, setAddMonthLoading] = useState(false)
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string; position: string; role: string }[]>([])
  const [homeroomCategory, setHomeroomCategory] = useState<'all'|'원장'|'관리자'|'상담부'|'KT'|'FT'>('all')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Drag state
  const [dragEnrId, setDragEnrId] = useState<string | null>(null)
  const [dragOverClassId, setDragOverClassId] = useState<string | null>(null)

  // Modals
  const [addSessionModal, setAddSessionModal] = useState(false)
  const [addClassModal, setAddClassModal] = useState<string | null>(null)
  const [editClassModal, setEditClassModal] = useState<ClassItem | null>(null)
  const [enrollModal, setEnrollModal] = useState<string | null>(null)
  const [studentDetailModal, setStudentDetailModal] = useState<{ enrollment: Enrollment; student: Student } | null>(null)
  const [waitlistAddModal, setWaitlistAddModal] = useState<{ classId: string; classLevel: string } | null>(null)
  const [newStudentModal, setNewStudentModal] = useState<{ classId: string; classLevel: string } | null>(null)
  const [addStudentModal, setAddStudentModal] = useState(false)
  // Undo/redo
  const [undoStack, setUndoStack] = useState<{ student_id: string; class_id: string; arr_schedule: Record<string,string>; dep_schedule: Record<string,string>; label: string }[]>([])
  const [redoStack, setRedoStack] = useState<typeof undoStack>([])
  // 퇴소처리 확인 모달
  const [withdrawModal, setWithdrawModal] = useState<{ enrollmentId: string; studentName: string } | null>(null)
  const [withdrawDate, setWithdrawDate] = useState(new Date().toISOString().slice(0, 10))
  const [withdrawNote, setWithdrawNote] = useState('')
  // 담임반 관리
  const [ktColors, setKtColors] = useState<Record<string, string>>({})
  const [ktColorModal, setKtColorModal] = useState<{ name: string; color: string } | null>(null)
  const [ktReassignModal, setKtReassignModal] = useState<{ cls: ClassItem; sess: Session; count: number } | null>(null)
  const [ktReassignTarget, setKtReassignTarget] = useState('')
  const [enrollHistory, setEnrollHistory] = useState<EnrollHistoryEntry[]>([])
  const [homeroomSaving, setHomeroomSaving] = useState(false)
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set())

  // Forms
  const [sessForm, setSessForm] = useState({ name: '', time_range: '' })
  const [clsForm, setClsForm] = useState({ level: '', room: '', teacher: '', kt_teacher: '', color: CLASS_COLORS[0] })
  const [studentForm, setStudentForm] = useState({ name: '', english_name: '', grade: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // 백업
  const [backupModal, setBackupModal] = useState(false)
  const [backups, setBackups] = useState<{ id: string; label: string; created_at: string }[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupSaving, setBackupSaving] = useState(false)
  const [timeRestoring, setTimeRestoring] = useState(false)
  const [timeRestoreResult, setTimeRestoreResult] = useState<Record<string, { updated: number; skipped_no_student: number; skipped_no_time: number }> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [rosterRes, studentsRes] = await Promise.all([
      fetch(`/api/campus/class-roster?month=${encodeURIComponent(month)}`),
      fetch('/api/campus/students'),
    ])
    const roster = await rosterRes.json()
    const studs = await studentsRes.json()
    setSessions(roster.sessions ?? [])
    setClasses(roster.classes ?? [])
    setEnrollments(roster.enrollments ?? [])
    setBuses(roster.buses ?? [])
    setAllStudents(studs.students ?? [])
    if (roster.availableMonths?.length) {
      setAvailableMonths(roster.availableMonths)
      if (!roster.availableMonths.includes(month)) {
        setMonth(roster.availableMonths[0])
      }
    }
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [month])

  useEffect(() => {
    fetch('/api/campus/employees')
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('poly_kt_colors')
      if (saved) setKtColors(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (pageTab !== 'homeroom') return
    fetch('/api/campus/class-roster/history')
      .then(r => r.json())
      .then(d => setEnrollHistory(d.logs ?? []))
      .catch(() => {})
  }, [pageTab])

  async function handleDeleteMonth(m: string) {
    if (!confirm(`"${m}" 전체 데이터(세션/반/수강생)를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    setDeletingMonth(m)
    const res = await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_month', month: m }),
    })
    setDeletingMonth(null)
    if (res.ok) {
      const next = availableMonths.filter(x => x !== m)
      setAvailableMonths(next)
      if (month === m) setMonth(next[0] ?? currentMonth())
      load()
    }
  }

  async function handleAddNextMonth() {
    if (!availableMonths.length) return
    const sorted = [...availableMonths].sort((a, b) => {
      const parse = (m: string) => { const p = m.match(/\d+/g)!; return Number(p[0]) * 100 + Number(p[1]) }
      return parse(a) - parse(b)
    })
    const latest = sorted[sorted.length - 1]
    const match = latest.match(/(\d+)년 (\d+)월/)
    if (!match) return
    let y = Number(match[1]), mo = Number(match[2]) + 1
    if (mo > 12) { y++; mo = 1 }
    const toMonth = `${y}년 ${mo}월`
    if (availableMonths.includes(toMonth)) { setMonth(toMonth); return }
    if (!confirm(`"${toMonth}"을 "${latest}" 기준으로 복사해서 추가할까요?`)) return
    setAddMonthLoading(true)
    const res = await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'copy_month', from_month: latest, to_month: toMonth }),
    })
    setAddMonthLoading(false)
    if (res.ok) { setAvailableMonths(p => [...p, toMonth]); setMonth(toMonth); load() }
    else { const d = await res.json(); alert(d.error ?? '오류') }
  }

  const getEnrollments = (classId: string) => enrollments.filter(e => e.class_id === classId && !e.is_waitlist)
  const getWaitlist = (classId: string) => enrollments.filter(e => e.class_id === classId && e.is_waitlist)
  const uniqueStudents = new Set(enrollments.filter(e => !e.is_waitlist).map(e => e.student_id)).size

  // 헤더용: 세션별 합산 (대시보드와 동일)
  const _getSessCount = (filterFn: (name: string) => boolean) =>
    sessions.filter(s => filterFn(s.name)).reduce((sum, s) => {
      const sc = classes.filter(c => c.session_id === s.id)
      return sum + sc.reduce((n, c) => n + getEnrollments(c.id).length, 0)
    }, 0)
  const _유치부 = _getSessCount(n => n.includes('유치부') && !n.includes('방과후'))
  const _매일반 = _getSessCount(n => n.includes('매일반') && !n.includes('유치부'))
  const _삼일반 = _getSessCount(n => n.includes('월수금') || (n.includes('3일반') && !n.includes('유치부')))
  const _이일반 = _getSessCount(n => n.includes('화목') || (n.includes('2일반') && !n.includes('유치부')))
  const grandSessTotal = _유치부 + _매일반 + _삼일반 + _이일반

  const searchLower = search.toLowerCase()
  const matchEnrollments = (classId: string) => {
    const enrs = getEnrollments(classId)
    if (!searchLower) return enrs
    return enrs.filter(e =>
      e.campus_students.name.toLowerCase().includes(searchLower) ||
      (e.campus_students.english_name ?? '').toLowerCase().includes(searchLower)
    )
  }
  const classVisible = (classId: string) => !searchLower || matchEnrollments(classId).length > 0
  const unenrolledStudents = (classId: string) => {
    const enrolled = new Set(getEnrollments(classId).map(e => e.student_id))
    return allStudents.filter(s => !enrolled.has(s.id))
  }

  async function post(body: object) {
    setSaving(true); setFormError('')
    const res = await fetch('/api/campus/class-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(d.error ?? '오류 발생'); return null }
    return d
  }

  async function handleDrop(enrollmentId: string, toClassId: string) {
    const enr = enrollments.find(e => e.id === enrollmentId)
    if (!enr || enr.class_id === toClassId) return
    setDragEnrId(null); setDragOverClassId(null)
    await post({ action: 'move_student', enrollment_id: enrollmentId, to_class_id: toClassId })
    load()
  }

  async function handleReorderClasses(sessionId: string, orderedIds: string[]) {
    // Optimistic update
    setClasses(prev => {
      const others = prev.filter(c => c.session_id !== sessionId)
      const reordered = orderedIds.map((id, i) => {
        const cls = prev.find(c => c.id === id)!
        return { ...cls, sort_order: i }
      })
      return [...others, ...reordered]
    })
    const orders = orderedIds.map((id, i) => ({ id, sort_order: i }))
    await post({ action: 'reorder_classes', orders })
  }

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault()
    const r = await post({ action: 'add_session', name: sessForm.name, time_range: sessForm.time_range, month })
    if (!r) return
    setAddSessionModal(false); setSessForm({ name: '', time_range: '' }); load()
  }

  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault()
    if (!addClassModal) return
    const r = await post({ action: 'add_class', session_id: addClassModal, ...clsForm })
    if (!r) return
    setAddClassModal(null); setClsForm({ level: '', room: '', teacher: '', kt_teacher: '', color: CLASS_COLORS[0] }); load()
  }

  async function handleUpdateClass(e: React.FormEvent) {
    e.preventDefault()
    if (!editClassModal) return
    const r = await post({ action: 'update_class', class_id: editClassModal.id, ...clsForm })
    if (!r) return
    setEditClassModal(null); load()
  }

  async function handleDeleteClass() {
    if (!editClassModal) return
    if (!confirm(`"${editClassModal.level}" 반을 삭제하시겠습니까?`)) return
    const r = await post({ action: 'delete_class', class_id: editClassModal.id })
    if (!r) return
    setEditClassModal(null); load()
  }

  async function handleEnroll(studentId: string) {
    if (!enrollModal) return
    const r = await post({ action: 'enroll', class_id: enrollModal, student_id: studentId })
    if (!r) return
    setEnrollModal(null); load()
  }

  function handleUnenroll(enrollmentId: string) {
    const enr = enrollments.find(e => e.id === enrollmentId)
    const studentName = enr?.campus_students.name ?? '학생'
    setWithdrawDate(new Date().toISOString().slice(0, 10))
    setWithdrawNote('')
    setWithdrawModal({ enrollmentId, studentName })
  }

  async function handleStudentDetailSave(enrollmentId: string, arr: Record<string, string>, dep: Record<string, string>, toClassId: string, highlightColor: string, name: string, englishName: string) {
    const enr = enrollments.find(e => e.id === enrollmentId)
    if (!enr) return
    setSaving(true); setFormError('')
    const promises: Promise<Response>[] = []
    // 이름 변경
    if (name.trim() !== enr.campus_students.name || (englishName.trim() || null) !== enr.campus_students.english_name) {
      promises.push(fetch('/api/campus/students', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: enr.student_id, name: name.trim(), english_name: englishName.trim() || null }),
      }))
    }
    // 반 이동 또는 차량 업데이트
    if (toClassId !== enr.class_id) {
      promises.push(fetch('/api/campus/class-roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move_student', enrollment_id: enrollmentId, to_class_id: toClassId, arr_schedule: arr, dep_schedule: dep, highlight_color: highlightColor }),
      }))
    } else {
      promises.push(fetch('/api/campus/class-roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_bus_schedule', enrollment_id: enrollmentId, arr_schedule: arr, dep_schedule: dep, highlight_color: highlightColor }),
      }))
    }
    const results = await Promise.all(promises)
    setSaving(false)
    const failed = results.find(r => !r.ok)
    if (failed) {
      const d = await failed.json().catch(() => ({}))
      setFormError(d.error ?? '저장 실패')
      return
    }
    setStudentDetailModal(null); load()
  }

  function handleStudentDetailDelete() {
    if (!studentDetailModal) return
    const studentName = studentDetailModal.student.name
    setWithdrawDate(new Date().toISOString().slice(0, 10))
    setWithdrawNote('')
    setWithdrawModal({ enrollmentId: studentDetailModal.enrollment.id, studentName })
    setStudentDetailModal(null)
  }

  async function handleConfirmWithdraw() {
    if (!withdrawModal) return
    setSaving(true)
    const res = await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unenroll', enrollment_id: withdrawModal.enrollmentId, effective_date: withdrawDate, note: withdrawNote }),
    })
    const d = await res.json()
    setSaving(false)
    if (d.deleted) {
      setUndoStack(prev => [{ ...d.deleted, label: withdrawModal.studentName }, ...prev.slice(0, 9)])
      setRedoStack([])
    }
    setWithdrawModal(null)
    load()
  }

  async function openBackupModal() {
    setBackupModal(true)
    setBackupLoading(true)
    const res = await fetch('/api/campus/backup')
    const d = await res.json()
    setBackups(d.backups ?? [])
    setBackupLoading(false)
  }

  async function handleSaveBackup() {
    setBackupSaving(true)
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    const res = await fetch('/api/campus/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', label: now }),
    })
    const d = await res.json()
    if (d.ok) setBackups(prev => [d.backup, ...prev])
    setBackupSaving(false)
  }

  async function handleRestoreBackup(backupId: string, label: string) {
    if (!confirm(`"${label}" 시점으로 복원하시겠습니까?\n현재 데이터가 덮어써집니다.`)) return
    setSaving(true)
    const res = await fetch('/api/campus/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', backup_id: backupId }),
    })
    const d = await res.json()
    setSaving(false)
    if (d.ok) { setBackupModal(false); load() }
    else alert('복원 실패: ' + d.error)
  }

  async function handleRestoreTimes() {
    if (!confirm('Firebase busRoutes에서 픽업 시간을 복구합니다.\n기존 _time 데이터가 덮어써집니다. 계속하시겠습니까?')) return
    setTimeRestoring(true)
    setTimeRestoreResult(null)
    const res = await fetch('/api/campus/class-roster/restore-times', { method: 'POST' })
    const d = await res.json()
    setTimeRestoring(false)
    if (d.ok) setTimeRestoreResult(d.results)
    else alert('복구 실패: ' + (d.error ?? ''))
  }

  async function handleDeleteBackup(backupId: string) {
    if (!confirm('이 백업을 삭제하시겠습니까?')) return
    await fetch('/api/campus/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', backup_id: backupId }),
    })
    setBackups(prev => prev.filter(b => b.id !== backupId))
  }

  async function handleUndo() {
    if (!undoStack.length) return
    const [top, ...rest] = undoStack
    setSaving(true)
    const res = await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore_enrollment', student_id: top.student_id, class_id: top.class_id, arr_schedule: top.arr_schedule, dep_schedule: top.dep_schedule }),
    })
    const d = await res.json()
    setSaving(false)
    if (d.enrollment) {
      setUndoStack(rest)
      setRedoStack(prev => [top, ...prev.slice(0, 9)])
      load()
    }
  }

  async function handleRedo() {
    if (!redoStack.length) return
    const [top, ...rest] = redoStack
    setSaving(true)
    await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unenroll', enrollment_id: '', effective_date: withdrawDate, note: '재삭제' }),
    })
    // redo는 re-delete: 방금 복구한걸 다시 삭제. enrollment_id가 없어서 student_id+class_id로 찾아야 함
    const { data: enrs } = await fetch(`/api/campus/class-roster?student_id=${top.student_id}&class_id=${top.class_id}`).then(r => r.json()).catch(() => ({ data: null }))
    const enrId = enrs?.[0]?.id
    if (enrId) {
      await fetch('/api/campus/class-roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unenroll', enrollment_id: enrId, note: '다시 삭제' }),
      })
    }
    setSaving(false)
    setRedoStack(rest)
    setUndoStack(prev => [top, ...prev.slice(0, 9)])
    load()
  }

  async function handleWaitlistAdd(classId: string, name: string, englishName: string, arr: Record<string, string>, dep: Record<string, string>) {
    setSaving(true); setFormError('')
    const stuRes = await fetch('/api/campus/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, english_name: englishName }) })
    const stuData = await stuRes.json()
    if (!stuRes.ok) { setFormError(stuData.error ?? '학생 등록 오류'); setSaving(false); return }
    const enrRes = await fetch('/api/campus/class-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enroll', class_id: classId, student_id: stuData.student.id, arr_schedule: arr, dep_schedule: dep, is_waitlist: true }) })
    setSaving(false)
    if (enrRes.ok) { setWaitlistAddModal(null); load() }
  }

  async function handleNewStudentAdd(classId: string, name: string, englishName: string, arr: Record<string, string>, dep: Record<string, string>) {
    setSaving(true); setFormError('')
    const stuRes = await fetch('/api/campus/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, english_name: englishName }) })
    const stuData = await stuRes.json()
    if (!stuRes.ok) { setFormError(stuData.error ?? '학생 등록 오류'); setSaving(false); return }
    const enrRes = await fetch('/api/campus/class-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enroll', class_id: classId, student_id: stuData.student.id, arr_schedule: arr, dep_schedule: dep, is_waitlist: false }) })
    setSaving(false)
    if (enrRes.ok) { setNewStudentModal(null); load() }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    const res = await fetch('/api/campus/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(studentForm) })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(d.error ?? '오류'); return }
    setAddStudentModal(false); setStudentForm({ name: '', english_name: '', grade: '' }); load()
  }

  function openEditClass(cls: ClassItem) {
    setClsForm({ level: cls.level, room: cls.room ?? '', teacher: cls.teacher ?? '', kt_teacher: cls.kt_teacher ?? '', color: cls.color })
    setEditClassModal(cls)
  }

  function saveKtColor(name: string, color: string) {
    const updated = { ...ktColors, [name]: color }
    setKtColors(updated)
    localStorage.setItem('poly_kt_colors', JSON.stringify(updated))
  }

  function handleKtColorSave(e: React.FormEvent) {
    e.preventDefault()
    if (!ktColorModal) return
    saveKtColor(ktColorModal.name, ktColorModal.color)
    setKtColorModal(null)
  }

  async function handleKtReassign(e: React.FormEvent) {
    e.preventDefault()
    if (!ktReassignModal) return
    setHomeroomSaving(true)
    const { cls } = ktReassignModal
    const res = await fetch('/api/campus/class-roster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_class', class_id: cls.id, level: cls.level, room: cls.room, teacher: cls.teacher, kt_teacher: ktReassignTarget || null, color: cls.color }),
    })
    setHomeroomSaving(false)
    if (!res.ok) { const d = await res.json(); alert(d.error ?? '저장 실패'); return }
    setKtReassignModal(null)
    load()
  }

  return (
    <div className="max-w-full">
      {/* 페이지 헤더 + 최상위 탭 */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[#1E293B] mb-3">개설반 현황</h1>
        <div className="flex gap-0 border-b border-[#E2E8F0]">
          {([
            ['management',  '반편성 현황관리'],
            ['homeroom',    '담임반 관리'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setPageTab(key)}
              className={`px-5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                pageTab === key
                  ? 'border-[#1e3a5f] text-[#1e3a5f]'
                  : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
              }`}>{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 반편성 현황관리 탭 ── */}
      {pageTab === 'management' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <p className="text-xs text-[#64748B]">{sessions.length}개 세션 · {classes.length}개 반 · {grandSessTotal}명</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={handleUndo} disabled={!undoStack.length || saving} title={undoStack[0] ? `복구: ${undoStack[0].label}` : ''}
                className="text-sm bg-white border border-[#E2E8F0] text-[#64748B] px-3 py-2 rounded-lg hover:bg-[#F7F8FA] disabled:opacity-30 transition-colors">
                ↩ 뒤로
              </button>
              <button onClick={handleRedo} disabled={!redoStack.length || saving}
                className="text-sm bg-white border border-[#E2E8F0] text-[#64748B] px-3 py-2 rounded-lg hover:bg-[#F7F8FA] disabled:opacity-30 transition-colors">
                앞으로 ↪
              </button>
              <button onClick={() => setAddStudentModal(true)} className="text-sm bg-white border border-[#E2E8F0] text-[#1E293B] px-3 py-2 rounded-lg hover:bg-[#F7F8FA] transition-colors">+ 학생</button>
              <button onClick={openBackupModal} className="text-sm bg-white border border-[#E2E8F0] text-[#64748B] px-3 py-2 rounded-lg hover:bg-[#F7F8FA] transition-colors">💾 백업</button>
              <button onClick={() => setAddSessionModal(true)} className="text-sm bg-[#1e3a5f] text-white px-3 py-2 rounded-lg hover:bg-[#2c5f8a] transition-colors">+ 세션</button>
            </div>
          </div>

      {/* Month tab bar */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-0.5">
        {(availableMonths.length ? availableMonths : [month]).map(m => (
          <div key={m} className="relative flex-shrink-0 group">
            <button onClick={() => setMonth(m)}
              className={`pr-6 pl-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                month === m
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1E293B]'
              }`}>{m}
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteMonth(m) }}
              disabled={deletingMonth === m}
              title={`${m} 삭제`}
              className={`absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-opacity opacity-0 group-hover:opacity-100 ${
                month === m ? 'bg-white/30 text-white hover:bg-red-500' : 'bg-[#CBD5E1] text-white hover:bg-[#EF4444]'
              }`}>✕</button>
          </div>
        ))}
        <button onClick={handleAddNextMonth} disabled={addMonthLoading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap flex-shrink-0 border border-dashed border-[#94A3B8] text-[#64748B] hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors disabled:opacity-50">
          {addMonthLoading ? '...' : '+ 다음 월'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-3 overflow-x-auto">
        {([
          ['roster', '반편성'],
          ['students', '전체 학생'],
          ['enroll', '입퇴소'],
          ['log', '변경 기록'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}>{label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : tab === 'roster' ? (
        <RosterTab
          sessions={sessions} classes={classes} enrollments={enrollments} buses={buses}
          search={search} setSearch={setSearch} searchLower={searchLower}
          matchEnrollments={matchEnrollments} classVisible={classVisible} getEnrollments={getEnrollments} getWaitlist={getWaitlist}
          dragEnrId={dragEnrId} dragOverClassId={dragOverClassId}
          setDragEnrId={setDragEnrId} setDragOverClassId={setDragOverClassId} onDrop={handleDrop}
          onAddClass={setAddClassModal} onEditClass={openEditClass}
          onEnroll={setEnrollModal} onUnenroll={handleUnenroll}
          onStudentClick={(enr, stu) => setStudentDetailModal({ enrollment: enr, student: stu })}
          onWaitlistAdd={(classId, classLevel) => setWaitlistAddModal({ classId, classLevel })}
          onNewStudent={(classId, classLevel) => setNewStudentModal({ classId, classLevel })}
          onReorderClasses={handleReorderClasses}
        />
      ) : tab === 'students' ? (
        <StudentsTab allStudents={allStudents} enrollments={enrollments} classes={classes} sessions={sessions} onWithdrawSuccess={load} />
      ) : tab === 'enroll' ? (
        <EnrollTab />
      ) : (
        <LogTab />
      )}
        </div>
      )}

      {/* ── 담임반 관리 탭 ── */}
      {pageTab === 'homeroom' && (
        <div className="space-y-4">
          {/* 월 선택 */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {(availableMonths.length ? availableMonths : [month]).map(m => (
              <button key={m} onClick={() => setMonth(m)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                  month === m ? 'bg-[#1e3a5f] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}>{m}
              </button>
            ))}
          </div>

          {/* 카테고리 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            {(['all','원장','관리자','상담부','KT','FT'] as const).map(cat => (
              <button key={cat} onClick={() => setHomeroomCategory(cat)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  homeroomCategory === cat
                    ? 'bg-[#004EA2] text-white border-[#004EA2]'
                    : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F7F8FA]'
                }`}>{cat === 'all' ? '전체' : cat}
              </button>
            ))}
          </div>

          {loading ? <Spinner /> : (() => {
            // 방과후 세션 제외
            const nonBangwaSessions = new Set(
              sessions.filter(s => !s.name.includes('방과후')).map(s => s.id)
            )
            // 방과후 제외 반 목록
            const homeroomClasses = classes.filter(cls => nonBangwaSessions.has(cls.session_id))

            // 직원 카테고리 분류
            function empCategory(emp: { name: string; position: string; role: string }): '원장'|'관리자'|'상담부'|'KT'|'FT'|null {
              const p = emp.position ?? ''
              if (/원장/.test(p) || emp.role === 'campus_admin') return '원장'
              if (/관리자|부원장/.test(p)) return '관리자'
              if (/상담/.test(p)) return '상담부'
              if (/KT/i.test(p)) return 'KT'
              if (/FT/.test(p)) return 'FT'
              return null
            }

            // 표시 대상 직원 (원장/관리자/상담부/KT/FT + 활성 필터)
            const targetEmps = employees
              .filter(e => empCategory(e) !== null)
              .filter(e => homeroomCategory === 'all' || empCategory(e) === homeroomCategory)
              .sort((a, b) => {
                const order = ['원장','관리자','상담부','KT','FT']
                return order.indexOf(empCategory(a)!) - order.indexOf(empCategory(b)!)
                  || a.name.localeCompare(b.name, 'ko')
              })

            if (targetEmps.length === 0) {
              return <p className="text-sm text-[#94A3B8] py-8 text-center">해당 직원이 없습니다.</p>
            }

            // 카테고리별 색상
            const catColor: Record<string, string> = {
              '원장': '#0F172A', '관리자': '#004EA2', '상담부': '#16A34A', 'KT': '#7C3AED', 'FT': '#EA580C',
            }
            const catBg: Record<string, string> = {
              '원장': 'bg-[#F1F5F9] text-[#0F172A]',
              '관리자': 'bg-[#EAF2FB] text-[#004EA2]',
              '상담부': 'bg-[#F0FDF4] text-[#16A34A]',
              'KT': 'bg-[#F5F3FF] text-[#7C3AED]',
              'FT': 'bg-[#FFF7ED] text-[#EA580C]',
            }

            const displayGroups = [
              { label: '원장', cats: ['원장'] as const },
              { label: '관리자 · 상담부', cats: ['관리자', '상담부'] as const },
              { label: 'FT', cats: ['FT'] as const },
              { label: 'KT', cats: ['KT'] as const },
            ]

            return (
              <div className="space-y-6">
                {displayGroups.map(({ label, cats }) => {
                  const groupEmps = targetEmps.filter(e => (cats as readonly string[]).includes(empCategory(e)!))
                  if (groupEmps.length === 0) return null
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-[#64748B] whitespace-nowrap">{label}</span>
                        <div className="flex-1 h-px bg-[#E2E8F0]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {groupEmps.map(emp => {
                  const cat = empCategory(emp)!
                  // 클래스 매칭: KT/관리자/상담부 → kt_teacher, FT → teacher
                  const matched = homeroomClasses.filter(cls =>
                    cat === 'FT'
                      ? cls.teacher?.trim() === emp.name.trim()
                      : cls.kt_teacher?.trim() === emp.name.trim()
                  )
                  const totalStudents = matched.reduce((sum, cls) => {
                    return sum + enrollments.filter(e => e.class_id === cls.id && !e.is_waitlist).length
                  }, 0)

                  // 레벨 그룹
                  const levelGroups: Record<string, ClassItem[]> = {}
                  for (const cls of matched) {
                    const p = levelPrefix(cls.level)
                    if (!levelGroups[p]) levelGroups[p] = []
                    levelGroups[p].push(cls)
                  }

                  // 변화율 (현재 월 기준)
                  const monthPfx = monthToPrefix(month)
                  const classIds = new Set(matched.map(c => c.id))
                  const deltaIn = enrollHistory.filter(h =>
                    h.class_id && classIds.has(h.class_id) && h.type === 'enrolled' && h.created_at.startsWith(monthPfx)
                  ).length
                  const deltaOut = enrollHistory.filter(h =>
                    h.class_id && classIds.has(h.class_id) && h.type === 'withdrawn' && h.created_at.startsWith(monthPfx)
                  ).length

                  const isExpanded = expandedTeachers.has(emp.id)
                  function toggleExpand() {
                    setExpandedTeachers(prev => {
                      const next = new Set(prev)
                      if (next.has(emp.id)) next.delete(emp.id)
                      else next.add(emp.id)
                      return next
                    })
                  }

                  return (
                    <div key={emp.id} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                      {/* 헤더 */}
                      <div
                        onClick={toggleExpand}
                        className="px-4 py-3 cursor-pointer hover:bg-[#FAFBFC] transition-colors"
                        style={{ borderLeftWidth: 3, borderLeftColor: catColor[cat] }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[#1E293B] text-sm">{emp.name}</p>
                            {/* 레벨 태그 */}
                            {matched.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-1">
                                {Object.entries(levelGroups).sort(([a],[b]) => a.localeCompare(b)).map(([prefix, clsList]) => (
                                  <span key={prefix}
                                    className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569]">
                                    {prefix}{clsList.length > 1 && <span className="ml-0.5 text-[#94A3B8]">×{clsList.length}</span>}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catBg[cat]}`}>{cat}</span>
                            {matched.length > 0 && (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-[#1E293B]">{totalStudents}명</span>
                                {(deltaIn > 0 || deltaOut > 0) && (
                                  <span className="text-[9px] font-medium flex gap-0.5">
                                    {deltaIn > 0 && <span className="text-[#16A34A]">+{deltaIn}</span>}
                                    {deltaOut > 0 && <span className="text-[#DC2626]">-{deltaOut}</span>}
                                  </span>
                                )}
                              </div>
                            )}
                            <span className="text-[#CBD5E1] text-[10px] ml-0.5">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 담임반 목록 — 접힘/펼침 */}
                      {isExpanded && (
                        matched.length === 0 ? (
                          <div className="px-4 py-3 text-[11px] text-[#CBD5E1] border-t border-[#F1F5F9]">미배정</div>
                        ) : (
                          <div className="border-t border-[#F1F5F9]">
                            {matched
                              .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
                              .map(cls => {
                                const sess = sessions.find(s => s.id === cls.session_id)
                                const count = enrollments.filter(e => e.class_id === cls.id && !e.is_waitlist).length
                                return (
                                  <div key={cls.id}
                                    onClick={e => { e.stopPropagation(); setKtReassignModal({ cls, sess: sess!, count }); setKtReassignTarget(cls.kt_teacher?.trim() ?? '') }}
                                    className="flex items-center justify-between px-4 py-2 border-b border-[#F8FAFC] hover:bg-[#F7F8FA] cursor-pointer last:border-0">
                                    <div className="min-w-0">
                                      <p className="text-[12px] font-semibold text-[#1E293B] truncate">{cls.level}</p>
                                      <p className="text-[10px] text-[#94A3B8] truncate">{sess?.name}</p>
                                    </div>
                                    <span className="text-sm font-bold text-[#1E293B] shrink-0 ml-2">{count}명</span>
                                  </div>
                                )
                              })}
                          </div>
                        )
                      )}
                    </div>
                  )
                })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* KT 색상 편집 모달 */}
          {ktColorModal && (
            <Modal title={`${ktColorModal.name} — 색상 편집`} onClose={() => setKtColorModal(null)}>
              <form onSubmit={handleKtColorSave} className="space-y-3">
                <Field label="색상">
                  <div className="flex gap-2 flex-wrap mt-1">
                    {TEACHER_COLORS.map(c => (
                      <div key={c}
                        onClick={() => setKtColorModal(m => m ? { ...m, color: c } : m)}
                        className="w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-110"
                        style={{ background: c, border: ktColorModal.color === c ? '3px solid #333' : '2px solid transparent' }} />
                    ))}
                  </div>
                </Field>
                <ModalBtns onClose={() => setKtColorModal(null)} loading={false} label="저장" />
              </form>
            </Modal>
          )}

          {/* KT 담임 변경 모달 */}
          {ktReassignModal && (
            <Modal title={`한국인 담임 변경 — ${ktReassignModal.cls.level}`} onClose={() => setKtReassignModal(null)}>
              <form onSubmit={handleKtReassign} className="space-y-3">
                <p className="text-xs text-[#64748B]">{ktReassignModal.sess.name} · {ktReassignModal.count}명</p>
                <Field label="한국인 담임 선생님">
                  <select value={ktReassignTarget} onChange={e => setKtReassignTarget(e.target.value)} className={inputCls}>
                    <option value="">(미지정)</option>
                    {[...new Set(classes.map(c => c.kt_teacher?.trim()).filter((t): t is string => Boolean(t)))].sort((a,b) => a.localeCompare(b,'ko')).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <ModalBtns onClose={() => setKtReassignModal(null)} loading={homeroomSaving} label="변경" />
              </form>
            </Modal>
          )}
        </div>
      )}

      {/* ─── 백업 모달 ─── */}
      {backupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="font-bold text-[#1E293B]">데이터 백업</h2>
              <button onClick={() => setBackupModal(false)} className="text-[#94A3B8] hover:text-[#1E293B] text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <button onClick={handleSaveBackup} disabled={backupSaving}
                className="w-full bg-[#1e3a5f] text-white py-2.5 rounded-lg font-medium hover:bg-[#2c5f8a] disabled:opacity-50 transition-colors">
                {backupSaving ? '저장 중...' : '💾 지금 시점 백업 저장'}
              </button>
              <button onClick={handleRestoreTimes} disabled={timeRestoring}
                className="w-full border border-[#0EA5E9] text-[#0EA5E9] py-2.5 rounded-lg font-medium hover:bg-[#F0F9FF] disabled:opacity-50 transition-colors text-sm">
                {timeRestoring ? '복구 중...' : '⏱ Firebase 픽업시간 복구'}
              </button>
              {timeRestoreResult && (
                <div className="text-xs bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg p-3 space-y-1">
                  {Object.entries(timeRestoreResult).map(([m, r]) => (
                    <p key={m} className="text-[#166534]">
                      {m}: 업데이트 {r.updated}건 / 미매칭 {r.skipped_no_student} / 시간없음 {r.skipped_no_time}
                    </p>
                  ))}
                </div>
              )}
              <div className="border-t border-[#E2E8F0] pt-3">
                <p className="text-xs text-[#64748B] mb-2 font-medium">저장된 백업 목록</p>
                {backupLoading ? (
                  <p className="text-sm text-[#94A3B8] text-center py-4">불러오는 중...</p>
                ) : backups.length === 0 ? (
                  <p className="text-sm text-[#94A3B8] text-center py-4">저장된 백업이 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {backups.map(b => (
                      <div key={b.id} className="flex items-center gap-2 p-2.5 bg-[#F8FAFC] rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E293B] truncate">{b.label}</p>
                          <p className="text-xs text-[#94A3B8]">{new Date(b.created_at).toLocaleString('ko-KR')}</p>
                        </div>
                        <button onClick={() => handleRestoreBackup(b.id, b.label)}
                          className="text-xs bg-[#EFF6FF] text-[#2563EB] px-2 py-1 rounded hover:bg-[#DBEAFE] transition-colors whitespace-nowrap">
                          복원
                        </button>
                        <button onClick={() => handleDeleteBackup(b.id)}
                          className="text-xs text-[#EF4444] hover:text-[#DC2626] px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modals ─── */}
      {addSessionModal && (
        <Modal title="세션 추가" onClose={() => setAddSessionModal(false)}>
          <form onSubmit={handleAddSession} className="space-y-3">
            <Field label="세션 이름" required><input required value={sessForm.name} onChange={e => setSessForm(f => ({ ...f, name: e.target.value }))} placeholder="초등부 매일반" className={inputCls} /></Field>
            <Field label="수업 시간"><input value={sessForm.time_range} onChange={e => setSessForm(f => ({ ...f, time_range: e.target.value }))} placeholder="3:10~4:30" className={inputCls} /></Field>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <ModalBtns onClose={() => setAddSessionModal(false)} loading={saving} label="추가" />
          </form>
        </Modal>
      )}

      {addClassModal && (() => {
        const ft = employees.filter(e => e.position?.includes('FT'))
        const kt = employees.filter(e => /KT|관리자|상담|원장/.test(e.position ?? '') || e.role === 'campus_admin')
        return (
          <Modal title="반 추가" onClose={() => setAddClassModal(null)}>
            <ClassForm form={clsForm} setForm={setClsForm} onSubmit={handleAddClass} onClose={() => setAddClassModal(null)} saving={saving} error={formError} ftEmployees={ft} ktEmployees={kt} />
          </Modal>
        )
      })()}

      {editClassModal && (() => {
        const ft = employees.filter(e => e.position?.includes('FT'))
        const kt = employees.filter(e => /KT|관리자|상담|원장/.test(e.position ?? '') || e.role === 'campus_admin')
        return (
          <Modal title={`반 수정 — ${editClassModal.level}`} onClose={() => setEditClassModal(null)}>
            <ClassForm form={clsForm} setForm={setClsForm} onSubmit={handleUpdateClass} onClose={() => setEditClassModal(null)} saving={saving} error={formError} onDelete={handleDeleteClass} ftEmployees={ft} ktEmployees={kt} />
          </Modal>
        )
      })()}

      {enrollModal && (() => {
        const candidates = unenrolledStudents(enrollModal)
        return (
          <Modal title="수강생 추가" onClose={() => { setEnrollModal(null) }}>
            <EnrollSearchModal candidates={candidates} onSelect={handleEnroll} />
          </Modal>
        )
      })()}

      {studentDetailModal && (
        <StudentDetailModal
          enrollment={studentDetailModal.enrollment} student={studentDetailModal.student}
          classes={classes} sessions={sessions} buses={buses}
          enrollments={enrollments}
          onSave={handleStudentDetailSave} onDelete={handleStudentDetailDelete}
          onClose={() => setStudentDetailModal(null)} saving={saving}
        />
      )}

      {waitlistAddModal && (
        <WaitlistAddModal
          classId={waitlistAddModal.classId} classLevel={waitlistAddModal.classLevel}
          buses={buses}
          onAdd={handleWaitlistAdd} onClose={() => setWaitlistAddModal(null)} saving={saving}
          error={formError}
        />
      )}

      {newStudentModal && (
        <NewStudentModal
          classId={newStudentModal.classId} classLevel={newStudentModal.classLevel}
          buses={buses}
          onAdd={handleNewStudentAdd} onClose={() => { setNewStudentModal(null); setFormError('') }} saving={saving}
          error={formError}
        />
      )}

      {/* ── 퇴소처리 확인 모달 ── */}
      {withdrawModal && (
        <Modal title={`퇴소 처리 — ${withdrawModal.studentName}`} onClose={() => setWithdrawModal(null)}>
          <div className="space-y-4">
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3 text-sm text-[#DC2626]">
              이 반에서 제외되며 변경기록에 퇴소로 기록됩니다.
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">퇴소 일자</label>
              <input type="date" value={withdrawDate} onChange={e => setWithdrawDate(e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5">사유 (선택)</label>
              <input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)}
                placeholder="예: 이사, 개인사정..."
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWithdrawModal(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={handleConfirmWithdraw} disabled={saving}
                className="flex-1 bg-[#EF4444] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? '처리 중...' : '퇴소 처리'}
              </button>
            </div>
          </div>
        </Modal>
      )}


      {addStudentModal && (
        <Modal title="학생 등록" onClose={() => setAddStudentModal(false)}>
          <form onSubmit={handleAddStudent} className="space-y-3">
            <Field label="이름" required><input required value={studentForm.name} onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))} placeholder="김민준" className={inputCls} /></Field>
            <Field label="영어 이름"><input value={studentForm.english_name} onChange={e => setStudentForm(f => ({ ...f, english_name: e.target.value }))} placeholder="Minjun Kim" className={inputCls} /></Field>
            <Field label="학부">
              <select value={studentForm.grade} onChange={e => setStudentForm(f => ({ ...f, grade: e.target.value }))} className={inputCls}>
                <option value="">선택</option>
                <option value="초등부">초등부</option>
                <option value="유치부">유치부</option>
                <option value="중등부">중등부</option>
              </select>
            </Field>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <ModalBtns onClose={() => setAddStudentModal(false)} loading={saving} label="등록" />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── RosterTab ───────────────────────────────────────────────
function RosterTab({
  sessions, classes, enrollments, buses, search, setSearch, searchLower,
  matchEnrollments, classVisible, getEnrollments, getWaitlist,
  dragEnrId, dragOverClassId, setDragEnrId, setDragOverClassId, onDrop,
  onAddClass, onEditClass, onEnroll, onUnenroll, onStudentClick, onWaitlistAdd, onNewStudent,
  onReorderClasses,
}: {
  sessions: Session[]; classes: ClassItem[]; enrollments: Enrollment[]; buses: Bus[]
  search: string; setSearch: (s: string) => void; searchLower: string
  matchEnrollments: (id: string) => Enrollment[]; classVisible: (id: string) => boolean
  getEnrollments: (id: string) => Enrollment[]; getWaitlist: (id: string) => Enrollment[]
  dragEnrId: string | null; dragOverClassId: string | null
  setDragEnrId: (id: string | null) => void; setDragOverClassId: (id: string | null) => void
  onDrop: (enrollmentId: string, toClassId: string) => void
  onAddClass: (sessId: string) => void; onEditClass: (cls: ClassItem) => void
  onEnroll: (classId: string) => void; onUnenroll: (enrollId: string) => void
  onStudentClick: (enr: Enrollment, stu: Student) => void
  onWaitlistAdd: (classId: string, classLevel: string) => void
  onNewStudent: (classId: string, classLevel: string) => void
  onReorderClasses: (sessionId: string, orderedIds: string[]) => void
}) {
  const [dragClsId, setDragClsId] = useState<string | null>(null)
  const [dragOverClsId, setDragOverClsId] = useState<string | null>(null)
  // Grade stats
  const gradeMap: Record<string, number> = {}
  const seen = new Set<string>()
  for (const e of enrollments.filter(e => !e.is_waitlist)) {
    if (seen.has(e.student_id)) continue
    seen.add(e.student_id)
    const g = e.campus_students.grade ?? '기타'
    gradeMap[g] = (gradeMap[g] ?? 0) + 1
  }

  // 세션별 수강인원 (대시보드와 동일 방식)
  const getSessCount = (filterFn: (name: string) => boolean) =>
    sessions.filter(s => filterFn(s.name)).reduce((sum, s) => {
      const sc = classes.filter(c => c.session_id === s.id)
      return sum + sc.reduce((n, c) => n + getEnrollments(c.id).length, 0)
    }, 0)
  const 유치부SessTotal = getSessCount(n => n.includes('유치부') && !n.includes('방과후'))
  const 방과후SessTotal = getSessCount(n => n.includes('방과후'))
  const 매일반SessTotal = getSessCount(n => n.includes('매일반') && !n.includes('유치부'))
  const 삼일반SessTotal = getSessCount(n => n.includes('월수금') || (n.includes('3일반') && !n.includes('유치부')))
  const 이일반SessTotal = getSessCount(n => n.includes('화목') || (n.includes('2일반') && !n.includes('유치부')))
  const 초등부SessTotal = 매일반SessTotal + 삼일반SessTotal + 이일반SessTotal
  const grandSessTotal = 유치부SessTotal + 초등부SessTotal  // 방과후 제외

  if (sessions.length === 0) return (
    <div className="text-center py-16 text-[#94A3B8]">
      <p className="text-4xl mb-3">📚</p>
      <p className="font-medium">세션이 없습니다</p>
      <p className="text-sm mt-1">상단에서 세션을 추가해 주세요</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Stats + search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 총수강 (방과후 제외) */}
        <div className="bg-[#1e3a5f] text-white rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
          <span className="text-[9px] font-semibold opacity-60 uppercase">수강</span>
          <span className="text-xl font-black leading-tight">{grandSessTotal}</span>
        </div>
        {/* 유치부 */}
        {유치부SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#FF6B35' }}>유치부</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{유치부SessTotal}</span>
          </div>
        )}
        {/* 방과후 */}
        {방과후SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#FF9800' }}>방과후</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{방과후SessTotal}</span>
          </div>
        )}
        {/* 초등부 */}
        {초등부SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#2196F3' }}>초등부</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{초등부SessTotal}</span>
          </div>
        )}
        {매일반SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">매일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{매일반SessTotal}</span>
          </div>
        )}
        {삼일반SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">3일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{삼일반SessTotal}</span>
          </div>
        )}
        {이일반SessTotal > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">2일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{이일반SessTotal}</span>
          </div>
        )}
        <div className="flex-1 flex justify-end">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="학생 검색..."
            className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] w-40" />
        </div>
      </div>

      {/* Sessions */}
      {sessions.map(sess => {
        const color = sessColor(sess.name, sess.name.length > 0 ? CLASS_COLORS[sessions.indexOf(sess) % CLASS_COLORS.length] : '#666')
        const sessClasses = classes.filter(c => c.session_id === sess.id)
        const sessEnrollCount = sessClasses.reduce((n, c) => n + getEnrollments(c.id).length, 0)
        const visibleClasses = searchLower ? sessClasses.filter(c => classVisible(c.id)) : sessClasses
        if (searchLower && visibleClasses.length === 0) return null
        const cols = Math.min(sessClasses.length, 16)
        const cardWidth = cols > 0 ? `calc((100% - ${(cols - 1) * 6}px) / ${cols})` : '120px'

        return (
          <div key={sess.id}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: `2px solid ${color}` }}>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-extrabold" style={{ color }}>{sess.name}</span>
                {sess.time_range && (
                  <span className="text-[11px] text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">{sess.time_range}</span>
                )}
                <span className="text-[11px] text-[#94A3B8]">{sessClasses.length}반 · {sessEnrollCount}명</span>
              </div>
              <button onClick={() => onAddClass(sess.id)}
                className="text-[11px] border px-2 py-0.5 rounded-md hover:opacity-80 transition-colors whitespace-nowrap"
                style={{ color, borderColor: color, background: `${color}15` }}>
                + 반 추가
              </button>
            </div>

            {/* Class cards */}
            {sessClasses.length === 0 ? (
              <div className="border border-dashed border-[#E2E8F0] rounded-lg py-6 text-center text-[#CBD5E1] text-xs">
                반이 없습니다. 위 버튼으로 추가해 주세요.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
              <div className="flex flex-nowrap sm:flex-wrap gap-[6px]" style={{ minWidth: 'max-content' }}>
                {visibleClasses.map(cls => {
                  const enrs = matchEnrollments(cls.id)
                  const all = getEnrollments(cls.id)
                  const waitlist = getWaitlist(cls.id)
                  const isDragTarget = dragOverClassId === cls.id && dragEnrId !== null
                  return (
                    <div key={cls.id}
                      className={`flex-shrink-0 rounded-[9px] border-[1.5px] bg-white shadow-sm overflow-hidden transition-all ${
                        dragOverClsId === cls.id && dragClsId && dragClsId !== cls.id
                          ? 'ring-2 ring-[#1e3a5f] border-[#1e3a5f] opacity-80'
                          : dragClsId === cls.id ? 'opacity-40'
                          : isDragTarget ? 'ring-2 ring-blue-400 border-blue-400 bg-blue-50' : 'border-[#e0e0e0]'
                      }`}
                      style={{ width: cardWidth, minWidth: '150px' }}
                      onDragOver={e => {
                        if (dragClsId && dragClsId !== cls.id) { e.preventDefault(); setDragOverClsId(cls.id) }
                        else if (dragEnrId) { e.preventDefault(); setDragOverClassId(cls.id) }
                      }}
                      onDragLeave={() => { setDragOverClassId(null); setDragOverClsId(null) }}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragClsId && dragClsId !== cls.id) {
                          // Reorder classes in this session
                          const ids = sessClasses.map(c => c.id)
                          const fromIdx = ids.indexOf(dragClsId)
                          const toIdx = ids.indexOf(cls.id)
                          if (fromIdx !== -1 && toIdx !== -1) {
                            const newIds = [...ids]
                            newIds.splice(fromIdx, 1)
                            newIds.splice(toIdx, 0, dragClsId)
                            onReorderClasses(sess.id, newIds)
                          }
                          setDragClsId(null); setDragOverClsId(null)
                        } else if (dragEnrId) {
                          onDrop(dragEnrId, cls.id); setDragOverClassId(null)
                        }
                      }}
                    >
                      {/* Card header */}
                      <div className="px-1.5 py-1 text-white transition-all select-none"
                        style={{ background: color }}>
                        <div className="flex items-center gap-0.5">
                          {/* Drag handle */}
                          <span
                            className="text-white/50 hover:text-white/90 cursor-grab active:cursor-grabbing text-[11px] flex-shrink-0 pr-0.5"
                            draggable
                            onDragStart={e => { e.stopPropagation(); setDragClsId(cls.id); e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => { setDragClsId(null); setDragOverClsId(null) }}
                          >⠿</span>
                          <span className="font-extrabold text-[11px] leading-tight truncate flex-1 cursor-pointer hover:brightness-110" onClick={() => onEditClass(cls)}>{cls.level}</span>
                          <span className="text-[9px] font-bold bg-white/30 px-1 py-px rounded flex-shrink-0">{all.length}</span>
                        </div>
                        {(cls.room || cls.teacher) && (
                          <div className="mt-0.5 space-y-px cursor-pointer" onClick={() => onEditClass(cls)}>
                            {cls.room && <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate"><span className="opacity-60">교</span><span className="bg-white/15 px-0.5 rounded truncate">{cls.room}</span></div>}
                            {cls.teacher && <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate"><span className="opacity-60">강</span><span className="bg-white/15 px-0.5 rounded truncate">{cls.teacher}</span></div>}
                          </div>
                        )}
                      </div>

                      {/* Student rows */}
                      <div>
                        {enrs.map((enr, i) => {
                          const DAY_KEYS = new Set(['월','화','수','목','금'])
                          const busName = Object.entries(enr.arr_schedule).find(([k]) => DAY_KEYS.has(k))?.[1]
                            ?? Object.entries(enr.dep_schedule).find(([k]) => DAY_KEYS.has(k))?.[1]
                            ?? null
                          const isDragging = dragEnrId === enr.id
                          const hlBg = enr.highlight_color ? enr.highlight_color + '55' : (i % 2 === 0 ? '#fafafa' : '#ffffff')
                          const busStyle = busName ? getBusStyle(busName) : null
                          const hasEng = !!enr.campus_students.english_name
                          return (
                            <div key={enr.id}
                              draggable
                              onDragStart={e => { e.stopPropagation(); setDragEnrId(enr.id); e.dataTransfer.effectAllowed = 'move' }}
                              onDragEnd={() => { setDragEnrId(null); setDragOverClassId(null) }}
                              onClick={() => onStudentClick(enr, enr.campus_students)}
                              className={`flex items-center gap-0.5 px-1 border-b border-[#f0f0f0] cursor-pointer ${isDragging ? 'opacity-40' : ''} hover:brightness-95`}
                              style={{ backgroundColor: hlBg, minHeight: hasEng ? '26px' : '18px' }}
                            >
                              <span className="text-[8px] text-[#ccc] w-2.5 text-right flex-shrink-0 self-center">{i + 1}</span>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="text-[10px] font-semibold text-[#1a1a1a] truncate leading-tight">{enr.campus_students.name}</div>
                                {hasEng && <div className="text-[8px] text-[#aaa] truncate leading-tight">{enr.campus_students.english_name}</div>}
                              </div>
                              {busStyle && (
                                <span className="text-[8px] font-bold px-0.5 rounded border flex-shrink-0 truncate max-w-[26px] self-center"
                                  style={{ background: busStyle.bg, borderColor: busStyle.bd, color: busStyle.tx }}>
                                  {busName}
                                </span>
                              )}
                            </div>
                          )
                        })}
                        {enrs.length === 0 && !searchLower && (
                          <div className="h-[18px] flex items-center justify-center text-[#CBD5E1] text-[9px]">수강생 없음</div>
                        )}
                      </div>

                      {/* Add student buttons */}
                      <div className="flex border-t border-dashed border-[#ddd]">
                        <button onClick={() => onEnroll(cls.id)}
                          className="flex-1 text-[#bbb] text-[9px] h-[16px] hover:bg-[#F7F8FA] hover:text-[#1e3a5f] transition-colors border-r border-dashed border-[#ddd]">
                          + 기존
                        </button>
                        <button onClick={() => onNewStudent(cls.id, cls.level)}
                          className="flex-1 text-[#4CAF50] text-[9px] h-[16px] hover:bg-[#F0FDF4] font-semibold transition-colors">
                          + 신규
                        </button>
                      </div>

                      {/* Waitlist section */}
                      <div className="border-t-2 border-[#F9A825] bg-[#FFFDE7] px-1.5 py-0.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold text-[#F9A825]">대기 {waitlist.length}</p>
                          <button onClick={() => onWaitlistAdd(cls.id, cls.level)}
                            className="text-[8px] text-[#F9A825] hover:text-[#E65100] font-bold">+ 추가</button>
                        </div>
                        {waitlist.map(enr => (
                          <div key={enr.id}
                            onClick={() => onStudentClick(enr, enr.campus_students)}
                            className="text-[9px] text-[#92400E] truncate cursor-pointer hover:text-[#E65100]">
                            {enr.campus_students.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── TodayTab ────────────────────────────────────────────────
function TodayTab({ month, buses }: { month: string; buses: Bus[] }) {
  const today = new Date()
  const [direction, setDirection] = useState<'arr' | 'dep'>('dep')
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10))
  const [dayKey, setDayKey] = useState<Day>(getDayKey(today))
  const [busMap, setBusMap] = useState<Record<string, StudentOnBus[]>>({})
  const [allBuses, setAllBuses] = useState<Bus[]>(buses)
  const [loading, setLoading] = useState(true)
  const [overrideModal, setOverrideModal] = useState<{ student: StudentOnBus; bus: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadToday = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/campus/vehicles?date=${selectedDate}&direction=${direction}&month=${encodeURIComponent(month)}`)
    const d = await res.json()
    setBusMap(d.busMap ?? {})
    setAllBuses(d.buses ?? [])
    setDayKey(d.dayKey ?? getDayKey(new Date(selectedDate)))
    setLoading(false)
  }, [selectedDate, direction, month])

  useEffect(() => { loadToday() }, [selectedDate, direction, month])

  const mergedBusNames = [...new Set([...allBuses.map(b => b.name), ...Object.keys(busMap)])]
  const totalToday = Object.values(busMap).reduce((s, a) => s + a.length, 0)
  const isWeekend = [0, 6].includes(new Date(selectedDate).getDay())

  async function handleOverride(studentId: string, busName: string | null, isAbsent: boolean) {
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_override', student_id: studentId, date: selectedDate, direction, bus_name: busName, is_absent: isAbsent }),
    })
    setSaving(false)
    setOverrideModal(null)
    loadToday()
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-lg overflow-hidden border-2 border-[#e0e0e0]">
          <button onClick={() => setDirection('arr')} className={`px-4 py-1.5 text-sm font-bold transition-colors ${direction === 'arr' ? 'bg-[#2563eb] text-white' : 'bg-[#f5f5f5] text-[#888]'}`}>등원</button>
          <button onClick={() => setDirection('dep')} className={`px-4 py-1.5 text-sm font-bold transition-colors ${direction === 'dep' ? 'bg-[#dc2626] text-white' : 'bg-[#f5f5f5] text-[#888]'}`}>하원</button>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
        <span className="text-sm text-[#64748B]">{dayKey}요일 · 총 {totalToday}명</span>
      </div>

      {isWeekend && (
        <div className="bg-[#FFF7ED] border border-[#FDE68A] rounded-lg px-4 py-2.5 mb-3 text-sm text-[#92400E]">
          주말입니다. 수업이 없을 수 있습니다.
        </div>
      )}

      {loading ? <Spinner /> : mergedBusNames.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8] text-sm">등록된 차량이 없습니다.</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(mergedBusNames.length, 4)}, minmax(0, 1fr))` }}>
          {mergedBusNames.map((name, bi) => {
            const students = busMap[name] ?? []
            const color = BUS_COLORS[bi % BUS_COLORS.length]
            return (
              <div key={name} className="rounded-[9px] border-[1.5px] overflow-hidden bg-white shadow-sm" style={{ borderColor: color }}>
                <div className="px-3 py-2 flex items-center justify-between" style={{ background: color }}>
                  <span className="text-white font-extrabold text-[13px]">{name}</span>
                  <span className="text-white text-[11px] font-bold bg-white/25 px-1.5 py-0.5 rounded-md">{students.length}명</span>
                </div>
                <div className="px-2 py-0.5 text-[9px] text-[#94A3B8] border-b border-[#f0f0f0] bg-[#fafafa]">
                  {dayKey}요일 · {direction === 'arr' ? '등원' : '하원'}
                </div>
                <div>
                  {students.length === 0 ? (
                    <div className="text-center text-[#CBD5E1] text-[11px] py-4">탑승 학생 없음</div>
                  ) : students.map((stu, i) => (
                    <div key={stu.student_id}
                      className={`flex items-center gap-1.5 px-2 h-[22px] border-b border-[#f5f5f5] group cursor-pointer ${i % 2 === 0 ? 'bg-[#fafafa]' : 'bg-white'} hover:bg-[#f0f4ff]`}
                      onClick={() => setOverrideModal({ student: stu, bus: name })}>
                      <span className="text-[9px] text-[#bbb] w-3.5 text-right flex-shrink-0">{i + 1}</span>
                      <span className="text-[11px] font-semibold text-[#1a1a1a] flex-1 truncate">{stu.name}</span>
                      {stu.override && <span className="text-[8px] font-bold px-1 rounded" style={{ color, background: `${color}22` }}>변경</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Override modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[#1E293B]">당일 변경 — {overrideModal.student.name}</h3>
              <button onClick={() => setOverrideModal(null)} className="text-[#94A3B8] text-lg leading-none">✕</button>
            </div>
            <p className="text-xs text-[#64748B] mb-3">{selectedDate} {direction === 'arr' ? '등원' : '하원'}</p>
            <div className="space-y-1.5">
              {mergedBusNames.map(name => (
                <button key={name} onClick={() => handleOverride(overrideModal.student.student_id, name, false)} disabled={saving}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${overrideModal.bus === name ? 'border-[#1e3a5f] bg-[#EAF2FB] text-[#1e3a5f]' : 'border-[#E2E8F0] hover:bg-[#F7F8FA] text-[#1E293B]'}`}>
                  {name}
                </button>
              ))}
              <button onClick={() => handleOverride(overrideModal.student.student_id, null, true)} disabled={saving}
                className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium border border-[#FECACA] text-[#EF4444] hover:bg-[#FEF2F2] transition-colors">
                결석 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── StudentsTab ──────────────────────────────────────────────
function StudentsTab({ allStudents, enrollments, classes, sessions, onWithdrawSuccess }: {
  allStudents: Student[]; enrollments: Enrollment[]; classes: ClassItem[]; sessions: Session[]
  onWithdrawSuccess: () => void
}) {
  const [search, setSearch] = useState('')
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: string; name: string } | null>(null)
  const [withdrawDate, setWithdrawDate] = useState(new Date().toISOString().slice(0, 10))
  const [withdrawNote, setWithdrawNote] = useState('')
  const [saving, setSaving] = useState(false)

  const classMap = Object.fromEntries(classes.map(c => [c.id, c]))
  const sessMap = Object.fromEntries(sessions.map(s => [s.id, s]))
  const enrollMap: Record<string, { cls: ClassItem; sess: Session | undefined }[]> = {}
  for (const enr of enrollments) {
    if (!enrollMap[enr.student_id]) enrollMap[enr.student_id] = []
    const cls = classMap[enr.class_id]
    if (cls) enrollMap[enr.student_id].push({ cls, sess: sessMap[cls.session_id] })
  }
  const filtered = allStudents.filter(s => !search || s.name.includes(search) || (s.english_name ?? '').toLowerCase().includes(search.toLowerCase()))

  async function handleWithdraw() {
    if (!withdrawTarget) return
    setSaving(true)
    await fetch('/api/campus/class-roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'withdraw_student', student_id: withdrawTarget.id, effective_date: withdrawDate, note: withdrawNote }),
    })
    setSaving(false)
    setWithdrawTarget(null)
    setWithdrawNote('')
    onWithdrawSuccess()
  }

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="학생 이름 검색..."
        className="w-full max-w-sm border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-sm">
        <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_auto_auto] px-4 py-2.5 bg-[#F7F8FA] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B]">
          <span>이름</span><span>수강 반</span><span>학부</span><span>상태</span><span/>
        </div>
        <div className="divide-y divide-[#F1F5F9]">
          {filtered.map(s => {
            const myClasses = enrollMap[s.id] ?? []
            return (
              <div key={s.id} className="px-4 py-2.5 hover:bg-[#F7F8FA]">
                {/* 모바일 */}
                <div className="sm:hidden flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1E293B]">{s.name}</p>
                    {s.english_name && <p className="text-xs text-[#94A3B8]">{s.english_name}</p>}
                    {myClasses.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {myClasses.map(({ cls }) => (
                          <span key={cls.id} className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: cls.color }}>{cls.level}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#EF4444]'}`}>{s.is_active ? '재원' : '퇴원'}</span>
                  {s.is_active && (
                    <button onClick={() => { setWithdrawTarget({ id: s.id, name: s.name }); setWithdrawDate(new Date().toISOString().slice(0,10)); setWithdrawNote('') }}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FEF2F2] text-[#EF4444] text-xs font-bold flex items-center justify-center hover:bg-[#FECACA]">
                      ✕
                    </button>
                  )}
                </div>
                {/* 데스크탑 */}
                <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_auto_auto] items-center gap-2">
                  <div>
                    <p className="font-medium text-sm text-[#1E293B]">{s.name}</p>
                    {s.english_name && <p className="text-xs text-[#94A3B8]">{s.english_name}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {myClasses.map(({ cls }) => (
                      <span key={cls.id} className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: cls.color }}>{cls.level}</span>
                    ))}
                    {myClasses.length === 0 && <span className="text-xs text-[#CBD5E1]">미배정</span>}
                  </div>
                  <span className="text-xs text-[#64748B]">{s.grade ?? '-'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#EF4444]'}`}>{s.is_active ? '재원' : '퇴원'}</span>
                  {s.is_active ? (
                    <button onClick={() => { setWithdrawTarget({ id: s.id, name: s.name }); setWithdrawDate(new Date().toISOString().slice(0,10)); setWithdrawNote('') }}
                      className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#EF4444] text-xs font-bold flex items-center justify-center hover:bg-[#FECACA] transition-colors">
                      ✕
                    </button>
                  ) : <div/>}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-center text-[#94A3B8] text-sm py-12">학생 없음</p>}
        </div>
      </div>

      {/* 퇴소 확인 모달 */}
      {withdrawTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setWithdrawTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] text-base mb-1">퇴소 처리</h3>
            <p className="text-sm text-[#64748B] mb-4">
              <span className="font-semibold text-[#1E293B]">{withdrawTarget.name}</span> 학생을 퇴소 처리합니다.<br/>
              수강 중인 모든 반에서 제외되며 퇴소로 기록됩니다.
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">퇴소 일자</label>
                <input type="date" value={withdrawDate} onChange={e => setWithdrawDate(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444]"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5">사유 (선택)</label>
                <input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} placeholder="퇴소 사유..."
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444]"/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWithdrawTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#64748B] hover:bg-[#F7F8FA]">
                취소
              </button>
              <button onClick={handleWithdraw} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#EF4444] text-white text-sm font-bold hover:bg-[#DC2626] disabled:opacity-50">
                {saving ? '처리 중...' : '퇴소 처리'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EnrollTab ────────────────────────────────────────────────
interface HistoryEntry { id: string; student_name: string; type: string; class_name: string; effective_date: string; note: string | null; created_at: string }
function EnrollTab() {
  const [logs, setLogs] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all'|'enrolled'|'withdrawn'>('all')
  const [deletingId, setDeletingId] = useState<string|null>(null)

  function loadLogs() {
    fetch('/api/campus/class-roster/history').then(r => r.json()).then(d => {
      setLogs((d.logs ?? []).filter((l: HistoryEntry) => l.type === 'enrolled' || l.type === 'withdrawn'))
      setIsAdmin(d.isAdmin === true)
      setLoading(false)
    })
  }

  useEffect(() => { loadLogs() }, [])

  async function handleDelete(id: string) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return
    setDeletingId(id)
    await fetch(`/api/campus/class-roster/history?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)
    loadLogs()
  }

  const filtered = typeFilter === 'all' ? logs : logs.filter(l => l.type === typeFilter)
  const enrollCount = logs.filter(l => l.type === 'enrolled').length
  const withdrawCount = logs.filter(l => l.type === 'withdrawn').length

  if (loading) return <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="space-y-3">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setTypeFilter('all')}
          className={`rounded-2xl border p-4 text-left transition-colors ${typeFilter === 'all' ? 'border-[#1e3a5f] bg-[#EAF2FB]' : 'border-[#E2E8F0] bg-white hover:bg-[#F7F8FA]'}`}>
          <p className="text-[10px] font-bold text-[#64748B] mb-1">전체</p>
          <p className="text-2xl font-black text-[#1E293B]">{logs.length}</p>
          <p className="text-[10px] text-[#94A3B8]">입소 + 퇴소</p>
        </button>
        <button onClick={() => setTypeFilter('enrolled')}
          className={`rounded-2xl border p-4 text-left transition-colors ${typeFilter === 'enrolled' ? 'border-[#16A34A] bg-[#F0FDF4]' : 'border-[#E2E8F0] bg-white hover:bg-[#F7F8FA]'}`}>
          <p className="text-[10px] font-bold text-[#16A34A] mb-1">입소</p>
          <p className="text-2xl font-black text-[#16A34A]">{enrollCount}</p>
          <p className="text-[10px] text-[#94A3B8]">신규 등록</p>
        </button>
        <button onClick={() => setTypeFilter('withdrawn')}
          className={`rounded-2xl border p-4 text-left transition-colors ${typeFilter === 'withdrawn' ? 'border-[#DC2626] bg-[#FEF2F2]' : 'border-[#E2E8F0] bg-white hover:bg-[#F7F8FA]'}`}>
          <p className="text-[10px] font-bold text-[#DC2626] mb-1">퇴소</p>
          <p className="text-2xl font-black text-[#DC2626]">{withdrawCount}</p>
          <p className="text-[10px] text-[#94A3B8]">퇴소 처리</p>
        </button>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#94A3B8]">
          <p className="text-3xl mb-2">{typeFilter === 'enrolled' ? '🎉' : typeFilter === 'withdrawn' ? '👋' : '📋'}</p>
          <p className="text-sm">기록이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          {isAdmin && (
            <div className="px-4 py-2 bg-[#FFF8F0] border-b border-[#FDE68A] flex items-center gap-1.5">
              <span className="text-[10px] text-[#92400E] font-semibold">원장 모드 — 기록 삭제 가능</span>
            </div>
          )}
          <div className="divide-y divide-[#F1F5F9]">
            {filtered.map(log => {
              const isEnroll = log.type === 'enrolled'
              const color = isEnroll ? '#16A34A' : '#DC2626'
              const label = isEnroll ? '입소' : '퇴소'
              return (
                <div key={log.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#F7F8FA]">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: color + '22', color }}>
                    {label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#1E293B]">{log.student_name}</span>
                      <span className="text-xs text-[#64748B]">{log.class_name}</span>
                    </div>
                    {log.note && <p className="text-xs text-[#94A3B8] mt-0.5">{log.note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-[#475569]">{log.effective_date}</p>
                    <p className="text-[10px] text-[#94A3B8]">{new Date(log.created_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleDelete(log.id)} disabled={deletingId === log.id}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FEF2F2] text-[#EF4444] text-xs font-bold flex items-center justify-center hover:bg-[#FECACA] disabled:opacity-40 transition-colors">
                      {deletingId === log.id ? '…' : '✕'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── LogTab ────────────────────────────────────────────────────
function LogTab() {
  const [logs, setLogs] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/campus/class-roster/history').then(r => r.json()).then(d => { setLogs(d.logs ?? []); setLoading(false) })
  }, [])
  const typeLabel = (t: string) => t === 'enrolled' ? '입소' : t === 'withdrawn' ? '퇴소' : '이동'
  const typeColor = (t: string) => t === 'enrolled' ? '#16A34A' : t === 'withdrawn' ? '#DC2626' : '#2563EB'
  if (loading) return <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin"/></div>
  if (!logs.length) return <div className="text-center py-16 text-[#94A3B8]"><p className="text-3xl mb-2">📝</p><p className="text-sm">변경 기록이 없습니다</p></div>
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="divide-y divide-[#F1F5F9]">
        {logs.map(log => (
          <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[#F7F8FA]">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0"
              style={{ background: typeColor(log.type)+'22', color: typeColor(log.type) }}>
              {typeLabel(log.type)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#1E293B]">{log.student_name}</span>
                <span className="text-xs text-[#64748B]">{log.class_name}</span>
              </div>
              {log.note && <p className="text-xs text-[#94A3B8] mt-0.5">{log.note}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-medium text-[#475569]">{log.effective_date}</p>
              <p className="text-[10px] text-[#94A3B8]">{new Date(log.created_at).toLocaleDateString('ko-KR')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const HIGHLIGHT_COLORS = ['#FFCDD2','#FFE0B2','#FFF9C4','#C8E6C9','#BBDEFB','#E1BEE7','#F8BBD9','#B2EBF2','#D7CCC8','#F5F5F5']

// ─── StudentDetailModal ────────────────────────────────────────
function extractBusOnly(sched: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sched)) if (!k.endsWith('_loc')) out[k] = v
  return out
}
function extractLocOnly(sched: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sched)) if (k.endsWith('_loc')) out[k.slice(0, -4)] = v
  return out
}

function StudentDetailModal({ enrollment, student, classes, sessions, buses, enrollments, onSave, onDelete, onClose, saving }: {
  enrollment: Enrollment; student: Student; classes: ClassItem[]; sessions: Session[]; buses: Bus[]
  enrollments: Enrollment[]
  onSave: (enrollmentId: string, arr: Record<string, string>, dep: Record<string, string>, toClassId: string, highlightColor: string, name: string, englishName: string) => void
  onDelete: () => void; onClose: () => void; saving: boolean
}) {
  const [arr, setArr] = useState<Record<string, string>>(extractBusOnly(enrollment.arr_schedule ?? {}))
  const [dep, setDep] = useState<Record<string, string>>(extractBusOnly(enrollment.dep_schedule ?? {}))
  const [arrLoc, setArrLoc] = useState<Record<string, string>>(extractLocOnly(enrollment.arr_schedule ?? {}))
  const [depLoc, setDepLoc] = useState<Record<string, string>>(extractLocOnly(enrollment.dep_schedule ?? {}))
  const [editName, setEditName] = useState(student.name)
  const [editEnglishName, setEditEnglishName] = useState(student.english_name ?? '')
  const [highlightColor, setHighlightColor] = useState(enrollment.highlight_color ?? '')
  const currentClass = classes.find(c => c.id === enrollment.class_id)
  const currentSession = sessions.find(s => s.id === currentClass?.session_id)
  const [selectedSessionId, setSelectedSessionId] = useState(currentClass?.session_id ?? '')
  const [toClassId, setToClassId] = useState(enrollment.class_id)

  const sessionClasses = classes.filter(c => c.session_id === selectedSessionId)
  const getCount = (cid: string) => enrollments.filter(e => e.class_id === cid && !e.is_waitlist).length
  const color = currentSession ? sessColor(currentSession.name, '#666') : '#666'

  // 호차별 정류장+시간 집계 — (버스, 세션, 방향) 단위로 구분
  // 현재 학생 세션 기준 우선, 없으면 전체 fallback
  const busSessionArrStops: Record<string, Record<string, { loc: string; time?: string }[]>> = {}
  const busSessionDepStops: Record<string, Record<string, { loc: string; time?: string }[]>> = {}
  for (const enr of enrollments) {
    const sessId = classes.find(c => c.id === enr.class_id)?.session_id ?? ''
    for (const d of DAYS) {
      const aBus = enr.arr_schedule[d]; const aLoc = enr.arr_schedule[`${d}_loc`]
      const aTime = (enr.arr_schedule as Record<string,string>)[`${d}_time`] || (enr.arr_schedule as Record<string,string>)['_time'] || undefined
      if (aBus && aLoc) {
        if (!busSessionArrStops[aBus]) busSessionArrStops[aBus] = {}
        if (!busSessionArrStops[aBus][sessId]) busSessionArrStops[aBus][sessId] = []
        const ex = busSessionArrStops[aBus][sessId].find(x => x.loc === aLoc)
        if (!ex) busSessionArrStops[aBus][sessId].push({ loc: aLoc, time: aTime })
        else if (!ex.time && aTime) ex.time = aTime
      }
      const dBus = enr.dep_schedule[d]; const dLoc = enr.dep_schedule[`${d}_loc`]
      const dTime = (enr.dep_schedule as Record<string,string>)[`${d}_time`] || (enr.dep_schedule as Record<string,string>)['_time'] || undefined
      if (dBus && dLoc) {
        if (!busSessionDepStops[dBus]) busSessionDepStops[dBus] = {}
        if (!busSessionDepStops[dBus][sessId]) busSessionDepStops[dBus][sessId] = []
        const ex = busSessionDepStops[dBus][sessId].find(x => x.loc === dLoc)
        if (!ex) busSessionDepStops[dBus][sessId].push({ loc: dLoc, time: dTime })
        else if (!ex.time && dTime) ex.time = dTime
      }
    }
  }

  const curSessId = currentClass?.session_id ?? ''
  function getArrStops(busName: string): { loc: string; time?: string }[] {
    const same = busSessionArrStops[busName]?.[curSessId] ?? []
    if (same.length > 0) return same
    const all = Object.values(busSessionArrStops[busName] ?? {}).flat()
    return all.filter((s, i, a) => a.findIndex(x => x.loc === s.loc) === i)
  }
  function getDepStops(busName: string): { loc: string; time?: string }[] {
    const same = busSessionDepStops[busName]?.[curSessId] ?? []
    if (same.length > 0) return same
    const all = Object.values(busSessionDepStops[busName] ?? {}).flat()
    return all.filter((s, i, a) => a.findIndex(x => x.loc === s.loc) === i)
  }

  function handleSessionChange(sessId: string) {
    setSelectedSessionId(sessId)
    const first = classes.find(c => c.session_id === sessId)
    if (first) setToClassId(first.id)
  }

  return (
    <Modal title="" onClose={onClose} wide>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="text-xl font-bold text-[#1E293B] border-b border-transparent hover:border-[#E2E8F0] focus:border-[#1e3a5f] focus:outline-none bg-transparent w-auto"
            placeholder="이름"
          />
          {currentClass && (
            <span className="text-xs px-2 py-0.5 rounded-full text-white font-semibold" style={{ background: color }}>{currentClass.level}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            value={editEnglishName}
            onChange={e => setEditEnglishName(e.target.value)}
            className="text-sm text-[#64748B] border-b border-transparent hover:border-[#E2E8F0] focus:border-[#1e3a5f] focus:outline-none bg-transparent"
            placeholder="영어 이름"
          />
          {currentSession?.name && <span className="text-sm text-[#64748B]">| {currentSession.name}</span>}
        </div>
      </div>

      {/* Bus table */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1">
          <span>🚌</span> 요일별 차량 배정
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#94A3B8] text-center">
              <th className="text-left w-5 pb-1"></th>
              <th className="pb-1">등원호차</th>
              <th className="pb-1">등원장소</th>
              <th className="pb-1">하원호차</th>
              <th className="pb-1">하원장소</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day => (
              <tr key={day} className="border-t border-[#F1F5F9]">
                <td className="py-1 font-bold text-[#1E293B]">{day}</td>
                <td className="py-1 pr-1">
                  <select value={arr[day] ?? ''} onChange={e => setArr(p => ({ ...p, [day]: e.target.value }))}
                    className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white focus:outline-none">
                    <option value="">없음</option>
                    {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-1">
                  {(() => {
                    const opts = getArrStops(arr[day] ?? '')
                    const cur = arrLoc[day] ?? ''
                    const allOpts = cur && !opts.find(x => x.loc === cur) ? [{ loc: cur, time: undefined }, ...opts] : opts
                    return (
                      <select value={cur} onChange={e => setArrLoc(p => ({ ...p, [day]: e.target.value }))}
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white focus:outline-none">
                        <option value="">-</option>
                        {allOpts.map(s => <option key={s.loc} value={s.loc}>{s.loc}{s.time ? ` · ${s.time}` : ''}</option>)}
                      </select>
                    )
                  })()}
                </td>
                <td className="py-1 pr-1">
                  <select value={dep[day] ?? ''} onChange={e => setDep(p => ({ ...p, [day]: e.target.value }))}
                    className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white focus:outline-none">
                    <option value="">없음</option>
                    {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </td>
                <td className="py-1">
                  {(() => {
                    const opts = getDepStops(dep[day] ?? '')
                    const cur = depLoc[day] ?? ''
                    const allOpts = cur && !opts.find(x => x.loc === cur) ? [{ loc: cur, time: undefined }, ...opts] : opts
                    return (
                      <select value={cur} onChange={e => setDepLoc(p => ({ ...p, [day]: e.target.value }))}
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white focus:outline-none">
                        <option value="">-</option>
                        {allOpts.map(s => <option key={s.loc} value={s.loc}>{s.loc}{s.time ? ` · ${s.time}` : ''}</option>)}
                      </select>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Move section */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#1E293B] mb-2">반 이동</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-[#94A3B8] block mb-1">세션</label>
            <select value={selectedSessionId} onChange={e => handleSessionChange(e.target.value)}
              className="w-full text-xs border border-[#E2E8F0] rounded-lg px-2 py-2 bg-white focus:outline-none">
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#94A3B8] block mb-1">반</label>
            <select value={toClassId} onChange={e => setToClassId(e.target.value)}
              className="w-full text-xs border border-[#E2E8F0] rounded-lg px-2 py-2 bg-white focus:outline-none">
              {sessionClasses.map(c => <option key={c.id} value={c.id}>{c.level} ({getCount(c.id)}명)</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Color highlight */}
      <div className="flex gap-1 flex-wrap mb-4">
        {HIGHLIGHT_COLORS.map(c => (
          <button key={c} type="button" onClick={() => setHighlightColor(highlightColor === c ? '' : c)}
            className={`w-6 h-6 rounded-full border-2 transition-all ${highlightColor === c ? 'border-[#1e3a5f] scale-110' : 'border-transparent'}`}
            style={{ background: c }} />
        ))}
        <button type="button" onClick={() => setHighlightColor('')}
          className="w-6 h-6 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[10px] text-[#94A3B8] border-2 border-transparent hover:border-[#94A3B8]">✕</button>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button onClick={onDelete} className="border border-[#FECACA] text-[#EF4444] px-3 py-2 rounded-xl text-sm hover:bg-[#FEF2F2] transition-colors">삭제</button>
        <span className="text-[10px] text-[#94A3B8] flex-1">🐾 드래그로도 이동 가능</span>
        <button onClick={onClose} className="border border-[#E2E8F0] text-[#64748B] px-4 py-2 rounded-xl text-sm">취소</button>
        <button onClick={() => {
          const mergedArr = { ...arr }
          const mergedDep = { ...dep }
          for (const day of DAYS) {
            if (arrLoc[day]) mergedArr[`${day}_loc`] = arrLoc[day]
            if (depLoc[day]) mergedDep[`${day}_loc`] = depLoc[day]
          }
          onSave(enrollment.id, mergedArr, mergedDep, toClassId, highlightColor, editName, editEnglishName)
        }} disabled={saving}
          className="bg-[#1e3a5f] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </Modal>
  )
}

// ─── WaitlistAddModal ──────────────────────────────────────────
function WaitlistAddModal({ classId, classLevel, buses, onAdd, onClose, saving, error }: {
  classId: string; classLevel: string; buses: Bus[]
  onAdd: (classId: string, name: string, englishName: string, arr: Record<string, string>, dep: Record<string, string>) => void
  onClose: () => void; saving: boolean; error: string
}) {
  const [name, setName] = useState('')
  const [englishName, setEnglishName] = useState('')
  const [arr, setArr] = useState<Record<string, string>>({})
  const [dep, setDep] = useState<Record<string, string>>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(classId, name, englishName, arr, dep)
  }

  return (
    <Modal title="" onClose={onClose}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base font-bold text-[#1E293B]">+ 대기생 추가</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#F9A825] text-white font-semibold">{classLevel}</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="한글이름" required>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
          </Field>
          <Field label="영어이름">
            <input value={englishName} onChange={e => setEnglishName(e.target.value)} placeholder="Gildong Hong" className={inputCls} />
          </Field>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#1E293B] mb-2">🚌 차량 배정</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#94A3B8] text-center">
                <th className="text-left w-6 pb-1"></th>
                <th className="pb-1">등원호차</th>
                <th className="pb-1">하원호차</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => (
                <tr key={day} className="border-t border-[#F1F5F9]">
                  <td className="py-1 font-bold text-[#1E293B]">{day}</td>
                  <td className="py-1 pr-1">
                    <select value={arr[day] ?? ''} onChange={e => setArr(p => ({ ...p, [day]: e.target.value }))}
                      className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                      <option value="">없음</option>
                      {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1">
                    <select value={dep[day] ?? ''} onChange={e => setDep(p => ({ ...p, [day]: e.target.value }))}
                      className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                      <option value="">없음</option>
                      {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2 rounded-xl text-sm">취소</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#F9A825] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? '추가 중...' : '추가'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── NewStudentModal ───────────────────────────────────────────
function NewStudentModal({ classId, classLevel, buses, onAdd, onClose, saving, error }: {
  classId: string; classLevel: string; buses: Bus[]
  onAdd: (classId: string, name: string, englishName: string, arr: Record<string, string>, dep: Record<string, string>) => void
  onClose: () => void; saving: boolean; error: string
}) {
  const [name, setName] = useState('')
  const [englishName, setEnglishName] = useState('')
  const [arr, setArr] = useState<Record<string, string>>({})
  const [dep, setDep] = useState<Record<string, string>>({})
  const [arrLoc, setArrLoc] = useState<Record<string, string>>({})
  const [depLoc, setDepLoc] = useState<Record<string, string>>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const mergedArr: Record<string, string> = { ...arr }
    const mergedDep: Record<string, string> = { ...dep }
    for (const day of DAYS) {
      if (arrLoc[day]) mergedArr[`${day}_loc`] = arrLoc[day]
      if (depLoc[day]) mergedDep[`${day}_loc`] = depLoc[day]
    }
    onAdd(classId, name, englishName, mergedArr, mergedDep)
  }

  // Fill all days at once
  function fillAll(type: 'arr'|'dep', value: string) {
    const obj: Record<string, string> = {}
    DAYS.forEach(d => { if (value) obj[d] = value })
    if (type === 'arr') setArr(obj); else setDep(obj)
  }

  return (
    <Modal title="" onClose={onClose} wide>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base font-bold text-[#1E293B]">+ 신규 추가</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#4CAF50] text-white font-semibold">{classLevel}</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="한글이름" required>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
          </Field>
          <Field label="영어이름">
            <input value={englishName} onChange={e => setEnglishName(e.target.value)} placeholder="Gildong Hong" className={inputCls} />
          </Field>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#1E293B] mb-2">🚌 차량 배정</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="text-[#94A3B8] text-center bg-[#F8FAFC]">
                  <th className="text-left w-7 py-1.5 pl-1"></th>
                  <th className="py-1.5">등원호차</th>
                  <th className="py-1.5">등원장소</th>
                  <th className="py-1.5">하원호차</th>
                  <th className="py-1.5 pr-1">하원장소</th>
                </tr>
                {/* 전체 일괄 */}
                <tr className="border-b border-[#E2E8F0]">
                  <td className="py-1 pl-1 text-[10px] text-[#94A3B8] font-bold">전체</td>
                  <td className="py-1 pr-1">
                    <select onChange={e => fillAll('arr', e.target.value)}
                      className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                      <option value="">-</option>
                      {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-1"><input placeholder="장소" className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1" onChange={e => { const v = e.target.value; const obj: Record<string,string>={}; DAYS.forEach(d=>{if(v)obj[d]=v}); setArrLoc(obj) }} /></td>
                  <td className="py-1 pr-1">
                    <select onChange={e => fillAll('dep', e.target.value)}
                      className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                      <option value="">-</option>
                      {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-1"><input placeholder="장소" className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1" onChange={e => { const v = e.target.value; const obj: Record<string,string>={}; DAYS.forEach(d=>{if(v)obj[d]=v}); setDepLoc(obj) }} /></td>
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => (
                  <tr key={day} className="border-t border-[#F1F5F9]">
                    <td className="py-1 pl-1 font-bold text-[#1E293B]">{day}</td>
                    <td className="py-1 pr-1">
                      <select value={arr[day] ?? ''} onChange={e => setArr(p => ({ ...p, [day]: e.target.value }))}
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                        <option value="">없음</option>
                        {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <input value={arrLoc[day] ?? ''} onChange={e => setArrLoc(p => ({ ...p, [day]: e.target.value }))}
                        placeholder="장소"
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1" />
                    </td>
                    <td className="py-1 pr-1">
                      <select value={dep[day] ?? ''} onChange={e => setDep(p => ({ ...p, [day]: e.target.value }))}
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1 bg-white">
                        <option value="">없음</option>
                        {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <input value={depLoc[day] ?? ''} onChange={e => setDepLoc(p => ({ ...p, [day]: e.target.value }))}
                        placeholder="장소"
                        className="w-full text-xs border border-[#E2E8F0] rounded px-1 py-1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2 rounded-xl text-sm">취소</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#4CAF50] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? '추가 중...' : '추가'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── ClassForm ─────────────────────────────────────────────────
function ClassForm({ form, setForm, onSubmit, onClose, saving, error, onDelete, ftEmployees, ktEmployees }: {
  form: { level: string; room: string; teacher: string; kt_teacher: string; color: string }
  setForm: (f: typeof form | ((prev: typeof form) => typeof form)) => void
  onSubmit: (e: React.FormEvent) => void; onClose: () => void
  saving: boolean; error: string; onDelete?: () => void
  ftEmployees: { name: string }[]
  ktEmployees: { name: string }[]
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="반 이름" required>
        <input required value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="GT2, MAG1..." className={inputCls} />
      </Field>
      <Field label="교실이름">
        <input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="America, France..." className={inputCls} />
      </Field>
      <Field label="원어민 담임 (FT)">
        <select value={form.teacher} onChange={e => setForm(f => ({ ...f, teacher: e.target.value }))} className={inputCls}>
          <option value="">(미지정)</option>
          {ftEmployees.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
          {/* 현재 값이 목록에 없을 경우 표시 */}
          {form.teacher && !ftEmployees.some(e => e.name === form.teacher) && (
            <option value={form.teacher}>{form.teacher} (직접입력)</option>
          )}
        </select>
      </Field>
      <Field label="한국인 담임 (KT)">
        <select value={form.kt_teacher} onChange={e => setForm(f => ({ ...f, kt_teacher: e.target.value }))} className={inputCls}>
          <option value="">(미지정)</option>
          {ktEmployees.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
          {form.kt_teacher && !ktEmployees.some(e => e.name === form.kt_teacher) && (
            <option value={form.kt_teacher}>{form.kt_teacher} (직접입력)</option>
          )}
        </select>
      </Field>
      <Field label="반 색상">
        <div className="flex gap-2 flex-wrap">
          {CLASS_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
              className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-[#1e3a5f] scale-110' : 'hover:scale-110'}`}
              style={{ background: c }} />
          ))}
        </div>
      </Field>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <div className="flex gap-2 pt-1">
        {onDelete && <button type="button" onClick={onDelete} className="border border-[#FECACA] text-[#EF4444] px-3 py-2 rounded-xl text-sm hover:bg-[#FEF2F2] transition-colors">삭제</button>}
        <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2 rounded-xl text-sm">취소</button>
        <button type="submit" disabled={saving} className="flex-1 bg-[#1e3a5f] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
      </div>
    </form>
  )
}

// ─── Shared UI ─────────────────────────────────────────────────
const inputCls = 'w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] bg-white'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1E293B] mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

function ModalBtns({ onClose, loading, label }: { onClose: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2 rounded-xl text-sm">취소</button>
      <button type="submit" disabled={loading} className="flex-1 bg-[#1e3a5f] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{loading ? '처리 중...' : label}</button>
    </div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4">
      <div className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[#1E293B]">{title}</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
