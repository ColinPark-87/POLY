'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import koLocale from '@fullcalendar/core/locales/ko'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'
import { downloadLeaveForm } from '@/lib/downloadLeaveForm'

const CATS = ['원장', '관리자', 'KT', 'FT', '상담부', '기타'] as const
type Cat = typeof CATS[number]

const CAT_COLORS: Record<Cat, { bar: string; ring: string; badge: string; text: string }> = {
  '원장':  { bar: '#0F172A', ring: 'ring-[#0F172A]', badge: 'bg-[#F1F5F9] text-[#0F172A]',   text: 'text-[#0F172A]' },
  '관리자': { bar: '#004EA2', ring: 'ring-[#004EA2]', badge: 'bg-[#EAF2FB] text-[#004EA2]',   text: 'text-[#004EA2]' },
  'KT':   { bar: '#004EA2', ring: 'ring-[#004EA2]', badge: 'bg-[#EAF2FB] text-[#004EA2]',   text: 'text-[#004EA2]' },
  'FT':   { bar: '#EA580C', ring: 'ring-[#EA580C]', badge: 'bg-[#FFF7ED] text-[#EA580C]',   text: 'text-[#EA580C]' },
  '상담부': { bar: '#16A34A', ring: 'ring-[#16A34A]', badge: 'bg-[#F0FDF4] text-[#16A34A]',   text: 'text-[#16A34A]' },
  '기타':  { bar: '#64748B', ring: 'ring-[#64748B]', badge: 'bg-[#F1F5F9] text-[#64748B]',   text: 'text-[#64748B]' },
}

function fmtDays(v: number) { return parseFloat(v.toFixed(2)) }

function getCat(position: string, role: string): Cat {
  if (role === 'campus_admin' || (/원장/.test(position) && !/부원장/.test(position))) return '원장'
  if (/부원장|관리자/.test(position)) return '관리자'
  if (/KT/i.test(position)) return 'KT'
  if (/FT/i.test(position)) return 'FT'
  if (/상담/.test(position)) return '상담부'
  return '기타'
}

interface BalanceRow {
  id: string; name: string; position: string; role: string; is_active: boolean
  campus_hired_at: string | null; baseDays: number; carriedOver: number; extraDays: number
  total: number; monthly: number[]; annualDays: number; halfDays: number; quarterDays: number
  totalUsed: number; remaining: number
}

// Circular progress ring (SVG)
function Ring({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.min(pct / 100, 1) * circ
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

const leaveTypes: LeaveType[] = ['annual', 'half_am', 'half_pm', 'quarter', 'sick', 'event', 'other']
const DIRECT_DEPT_ORDER = ['원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타']

interface ApprovalRequest {
  id: string; type: LeaveType; start_date: string; end_date: string
  days_used: number; reason: string | null; signature_data_url: string | null
  created_at: string
  users: { id: string; name: string; email: string; position: string } | null
}

interface DirectEmployee { id: string; name: string; position: string }
interface DirectCalData {
  campusLeaves: { type: LeaveType; start_date: string; end_date: string; users: { name: string } }[]
  myLeaves: { type: LeaveType; start_date: string; end_date: string; status: string }[]
  holidays: { date: string; name: string }[]
}
function leaveColor(type: LeaveType) {
  if (type === 'half_am' || type === 'half_pm') return { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' }
  if (type === 'quarter') return { bg: '#EAF2FB', border: '#9BBFE8', text: '#003E83' }
  return { bg: '#CFE0F4', border: '#93C5FD', text: '#002F65' }
}
function leaveTag(type: LeaveType) {
  if (type === 'half_am') return '[오전]'
  if (type === 'half_pm') return '[오후]'
  return ''
}

export default function OverviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const initTab = searchParams.get('tab') as 'overview'|'approvals'|'direct' | null
  const [tab, setTab] = useState<'overview'|'approvals'|'direct'>(initTab ?? 'overview')
  const [editRow, setEditRow] = useState<BalanceRow | null>(null)
  const [editForm, setEditForm] = useState({ total_days: 0, carried_over: 0, extra_days: 0 })
  const [editLoading, setEditLoading] = useState(false)

  // 연차 신청 관리 state
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [approvalsTab, setApprovalsTab] = useState<'pending'|'approved'>('pending')
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [selectedSig, setSelectedSig] = useState<string | null>(null)

  // 연차 직접입력 state
  const [directEmployees, setDirectEmployees] = useState<DirectEmployee[]>([])
  const [directForm, setDirectForm] = useState({ user_id: '', type: 'annual' as LeaveType, start_date: '', end_date: '', reason: '' })
  const [directLoading, setDirectLoading] = useState(false)
  const [directSuccess, setDirectSuccess] = useState(false)
  const [directError, setDirectError] = useState('')
  const [calEvents, setCalEvents] = useState<object[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name'|'position'>('name')

  async function load(y: number) {
    setLoading(true)
    const res = await fetch(`/api/campus/balances?year=${y}`)
    const d = await res.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load(year) }, [year])

  async function loadApprovals(status: 'pending'|'approved') {
    setApprovalsLoading(true)
    const res = await fetch(`/api/campus/approvals?status=${status}`)
    const d = await res.json()
    setApprovals(d.requests ?? [])
    setApprovalsLoading(false)
  }

  useEffect(() => { if (tab === 'approvals') loadApprovals(approvalsTab) }, [tab, approvalsTab])

  async function handleApprovalAction(id: string, status: 'approved'|'rejected'|'cancelled') {
    const labels: Record<string, string> = { approved: '승인', rejected: '반려', cancelled: '취소' }
    if (!confirm(`이 신청을 ${labels[status]}하시겠습니까?`)) return
    setActionLoading(id)
    const res = await fetch(`/api/campus/approvals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewer_note: noteMap[id] ?? null }),
    })
    setActionLoading(null)
    if (res.ok) loadApprovals(approvalsTab)
    else { const d = await res.json(); alert(d.error) }
  }

  useEffect(() => {
    fetch('/api/campus/employees')
      .then(r => r.json())
      .then(d => setDirectEmployees((d.employees ?? []).filter((e: DirectEmployee & { is_active: boolean }) => e.is_active)))
  }, [])

  const filteredEmployees = directEmployees
    .filter(e => !empSearch || e.name.includes(empSearch) || e.position.includes(empSearch))
    .sort((a, b) => {
      if (sortBy === 'position') {
        const ai = DIRECT_DEPT_ORDER.indexOf(a.position) >= 0 ? DIRECT_DEPT_ORDER.indexOf(a.position) : 99
        const bi = DIRECT_DEPT_ORDER.indexOf(b.position) >= 0 ? DIRECT_DEPT_ORDER.indexOf(b.position) : 99
        if (ai !== bi) return ai - bi
      }
      return a.name.localeCompare(b.name, 'ko')
    })

  async function loadCalEvents(yr: string, month: string) {
    const res = await fetch(`/api/calendar?year=${yr}&month=${month}`)
    const data: DirectCalData = await res.json()
    const ev: object[] = []
    ;(data.campusLeaves ?? []).forEach(r => {
      const c = leaveColor(r.type)
      const tag = leaveTag(r.type)
      ev.push({ title: `${r.users?.name ?? ''}${tag} · ${LEAVE_TYPE_LABELS[r.type]}`, start: r.start_date, end: r.end_date, backgroundColor: c.bg, borderColor: c.border, textColor: c.text })
    })
    ;(data.myLeaves ?? []).forEach(r => {
      const tag = leaveTag(r.type)
      ev.push({ title: `[나]${tag} ${LEAVE_TYPE_LABELS[r.type]}`, start: r.start_date, end: r.end_date, backgroundColor: '#10B981', borderColor: '#059669', textColor: '#fff' })
    })
    ;(data.holidays ?? []).forEach(h => {
      ev.push({ title: h.name, start: h.date, backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', textColor: '#DC2626', display: 'background' })
    })
    setCalEvents(ev)
  }

  async function handleDirectSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDirectError('')
    setDirectSuccess(false)
    if (!directForm.user_id) { setDirectError('직원을 선택해주세요.'); return }
    if (!directForm.start_date) { setDirectError('날짜를 입력해주세요.'); return }
    setDirectLoading(true)
    const res = await fetch('/api/campus/direct-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...directForm, end_date: directForm.end_date || directForm.start_date }),
    })
    const d = await res.json()
    setDirectLoading(false)
    if (!res.ok) { setDirectError(d.error); return }
    setDirectSuccess(true)
    setDirectForm(f => ({ ...f, user_id: '', start_date: '', end_date: '', reason: '' }))
    load(year)
  }

  function openEdit(row: BalanceRow) {
    setEditRow(row)
    setEditForm({ total_days: row.baseDays, carried_over: row.carriedOver, extra_days: row.extraDays })
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    setEditLoading(true)
    await fetch('/api/campus/leave-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: editRow.id, year, ...editForm }),
    })
    setEditLoading(false)
    setEditRow(null)
    load(year)
  }

  const filtered = rows.filter(r => !search || r.name.includes(search))
  const currentYear = new Date().getFullYear()

  const DEPT_ORDER = ['원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타']

  const grouped: Record<string, BalanceRow[]> = {}
  for (const r of filtered) {
    const dept = r.role === 'campus_admin' ? '원장' : (r.position || '기타')
    if (!grouped[dept]) grouped[dept] = []
    grouped[dept].push(r)
  }
  const deptKeys = DEPT_ORDER.filter(d => grouped[d]).concat(Object.keys(grouped).filter(d => !DEPT_ORDER.includes(d)))

  const totalGranted = fmtDays(filtered.reduce((s, r) => s + r.total, 0))
  const totalUsed = fmtDays(filtered.reduce((s, r) => s + r.totalUsed, 0))
  const totalRemaining = fmtDays(filtered.reduce((s, r) => s + r.remaining, 0))
  const overused = filtered.filter(r => r.remaining < 0).length
  const totalPct = totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 100) : 0

  return (
    <div className="max-w-full">
      {/* 탭 — 최상단 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-5 flex-wrap">
        <button onClick={() => setTab('overview')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'overview' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          연차 현황
        </button>
        <button onClick={() => router.push('/campus/balances')}
          className="px-5 py-2.5 text-sm font-medium border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]">
          잔여 관리
        </button>
        <button onClick={() => setTab('approvals')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'approvals' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          연차 신청 관리
          {approvalsTab === 'pending' && approvals.length > 0 && tab === 'approvals' && (
            <span className="bg-[#EF4444] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{approvals.length}</span>
          )}
        </button>
        <button onClick={() => setTab('direct')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'direct' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
          연차 직접입력
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">통합 연차관리</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none w-28" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 전체 요약 — 한눈에 */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-5">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* 전체 원형 게이지 */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="relative">
                  <Ring pct={totalPct} color="#004EA2" size={80} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-[#1E293B]">{totalPct}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8] mb-1">{year}년 전체 사용률</p>
                  <p className="text-sm text-[#64748B]">총 <strong className="text-[#1E293B]">{filtered.length}명</strong></p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '총 부여', value: totalGranted, unit: '일', color: 'text-[#1E293B]', bg: 'bg-[#F7F8FA]' },
                  { label: '총 사용', value: totalUsed,   unit: '일', color: 'text-[#004EA2]', bg: 'bg-[#EAF2FB]' },
                  { label: '총 잔여', value: totalRemaining, unit: '일', color: totalRemaining < 0 ? 'text-[#EF4444]' : 'text-[#10B981]', bg: totalRemaining < 0 ? 'bg-[#FEF2F2]' : 'bg-[#F0FDF4]' },
                  { label: '초과 사용', value: overused, unit: '명', color: overused > 0 ? 'text-[#EF4444]' : 'text-[#94A3B8]', bg: overused > 0 ? 'bg-[#FEF2F2]' : 'bg-[#F7F8FA]' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
                    <p className="text-[10px] text-[#64748B] mb-0.5">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}<span className="text-xs font-normal ml-0.5">{s.unit}</span></p>
                  </div>
                ))}
              </div>

              {/* 부서별 미니 바 */}
              <div className="hidden lg:block shrink-0 space-y-1.5 min-w-[200px]">
                {deptKeys.map(dept => {
                  const c = grouped[dept]
                  const used = c.reduce((s, r) => s + r.totalUsed, 0)
                  const total = c.reduce((s, r) => s + r.total, 0)
                  const pct = total > 0 ? Math.round((used / total) * 100) : 0
                  const color = CAT_COLORS[getCat(dept === '원장' ? '원장' : dept, dept === '원장' ? 'campus_admin' : 'employee')].bar
                  return (
                    <div key={dept} className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-[#64748B] w-16 text-right shrink-0 truncate">{dept}</span>
                      <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[10px] text-[#94A3B8] w-7 shrink-0">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 연차 현황 탭 */}
          {tab === 'overview' && <>
          {/* 부서별 카드 그리드 */}
          {deptKeys.map(dept => {
            const catRows = grouped[dept]
            if (!catRows || catRows.length === 0) return null
            const colors = CAT_COLORS[getCat(dept === '원장' ? '원장' : dept, dept === '원장' ? 'campus_admin' : 'employee')]
            const catUsed = fmtDays(catRows.reduce((s, r) => s + r.totalUsed, 0))
            const catTotal = fmtDays(catRows.reduce((s, r) => s + r.total, 0))

            return (
              <div key={dept} className="mb-5">
                {/* 부서 헤더 */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colors.badge}`}>{dept}</span>
                  <span className="text-xs text-[#94A3B8]">{catRows.length}명</span>
                  <div className="flex-1 h-px bg-[#E2E8F0]" />
                  <span className="text-xs text-[#94A3B8]">사용 {catUsed} / 부여 {catTotal}일</span>
                </div>

                {/* 직원 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {catRows.map(row => {
                    const pct = row.total > 0 ? Math.min((row.totalUsed / row.total) * 100, 100) : 0
                    const isOver = row.remaining < 0
                    return (
                      <button
                        key={row.id}
                        onClick={() => openEdit(row)}
                        className={`relative text-left rounded-xl border p-3 transition-all hover:shadow-md active:scale-95 ${
                          isOver
                            ? 'border-[#FCA5A5] bg-[#FEF2F2]'
                            : `border-[#E2E8F0] bg-white hover:border-[#94A3B8]`
                        } ${!row.is_active ? 'opacity-40' : ''}`}
                      >
                        {isOver && (
                          <span className="absolute top-1.5 right-1.5 text-[8px] font-bold text-[#EF4444] bg-[#FEE2E2] px-1.5 py-0.5 rounded-full">초과</span>
                        )}

                        {/* 이름 + 원형 게이지 */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="relative shrink-0">
                            <Ring pct={pct} color={isOver ? '#EF4444' : colors.bar} size={36} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[9px] font-bold" style={{ color: isOver ? '#EF4444' : colors.bar }}>
                                {Math.round(pct)}%
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1E293B] truncate leading-tight">{row.name}</p>
                            <p className="text-[10px] text-[#94A3B8] truncate">{row.position || '-'}</p>
                          </div>
                        </div>

                        {/* 부여/사용/잔여 */}
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="bg-[#F7F8FA] rounded-lg py-1">
                            <p className="text-[8px] text-[#94A3B8]">부여</p>
                            <p className="text-xs font-bold text-[#1E293B]">{row.total}</p>
                          </div>
                          <div className="bg-[#F7F8FA] rounded-lg py-1">
                            <p className="text-[8px] text-[#94A3B8]">사용</p>
                            <p className="text-xs font-bold" style={{ color: colors.bar }}>{fmtDays(row.totalUsed)}</p>
                          </div>
                          <div className={`rounded-lg py-1 ${isOver ? 'bg-[#FEE2E2]' : 'bg-[#F7F8FA]'}`}>
                            <p className="text-[8px] text-[#94A3B8]">잔여</p>
                            <p className={`text-xs font-bold ${isOver ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>{fmtDays(row.remaining)}</p>
                          </div>
                        </div>

                        {/* 입사일 */}
                        {row.campus_hired_at && (
                          <p className="text-[9px] text-[#CBD5E1] mt-1.5 text-center">{row.campus_hired_at.slice(0,10)}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <p className="text-sm text-[#64748B] text-center py-10">데이터가 없습니다.</p>
          )}
          </>}

          {/* 연차 신청 관리 탭 */}
          {tab === 'approvals' && (
            <div className="max-w-4xl">
              <div className="flex gap-2 mb-5">
                <button onClick={() => setApprovalsTab('pending')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${approvalsTab === 'pending' ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                  대기중 {approvalsTab === 'pending' && approvals.length > 0 ? `(${approvals.length})` : ''}
                </button>
                <button onClick={() => setApprovalsTab('approved')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${approvalsTab === 'approved' ? 'bg-[#059669] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                  승인완료 {approvalsTab === 'approved' && approvals.length > 0 ? `(${approvals.length})` : ''}
                </button>
              </div>
              {approvalsLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>
              ) : approvals.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-[#E2E8F0]">
                  <p className="text-3xl mb-3">{approvalsTab === 'pending' ? '✅' : '📋'}</p>
                  <p className="text-[#64748B]">{approvalsTab === 'pending' ? '대기 중인 신청이 없습니다.' : '승인된 신청이 없습니다.'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {approvals.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                      <div className="flex justify-between items-start p-4 md:p-5 border-b border-[#F1F5F9]">
                        <div>
                          <p className="font-semibold text-[#1E293B]">{r.users?.name ?? '-'}</p>
                          <p className="text-xs text-[#64748B]">{r.users?.position} · {r.users?.email}</p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${approvalsTab === 'pending' ? 'bg-[#FEF3C7] text-[#D97706]' : 'bg-[#D1FAE5] text-[#059669]'}`}>
                          {approvalsTab === 'pending' ? '대기중' : '승인완료'}
                        </span>
                      </div>
                      <div className="p-4 md:p-5 space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-xs text-[#64748B]">종류</p><p className="font-medium">{LEAVE_TYPE_LABELS[r.type]}</p></div>
                          <div><p className="text-xs text-[#64748B]">기간</p><p className="font-medium">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</p></div>
                          <div><p className="text-xs text-[#64748B]">일수</p><p className="font-medium">{r.type === 'quarter' ? 0.25 : r.days_used}일</p></div>
                          <div><p className="text-xs text-[#64748B]">신청일</p><p className="font-medium">{r.created_at.slice(0, 10)}</p></div>
                        </div>
                        {r.reason && <p className="text-sm text-[#64748B]">사유: {r.reason}</p>}
                        <div className="flex items-center gap-3">
                          {r.signature_data_url && (
                            <button onClick={() => setSelectedSig(r.signature_data_url!)} className="text-xs text-[#004EA2] underline">서명 보기</button>
                          )}
                          <button
                            onClick={() => downloadLeaveForm({ name: r.users?.name ?? '-', position: r.users?.position ?? '-', email: r.users?.email, typeLabel: LEAVE_TYPE_LABELS[r.type], start_date: r.start_date, end_date: r.end_date, days_used: r.type === 'quarter' ? 0.25 : r.days_used, reason: r.reason, created_at: r.created_at, signature_data_url: r.signature_data_url })}
                            className="text-xs bg-[#EAF2FB] text-[#004EA2] hover:bg-[#CFE0F4] px-2.5 py-1 rounded-lg font-semibold">
                            신청서 출력
                          </button>
                        </div>
                      </div>
                      <div className="p-4 md:p-5 bg-[#F7F8FA] border-t border-[#F1F5F9] space-y-3">
                        {approvalsTab === 'pending' && (
                          <input type="text" placeholder="메모 (선택) — 반려 시 사유 입력"
                            value={noteMap[r.id] ?? ''}
                            onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                            className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white" />
                        )}
                        {actionLoading === r.id ? (
                          <p className="text-sm text-[#64748B] text-center py-2">처리 중...</p>
                        ) : approvalsTab === 'pending' ? (
                          <div className="flex gap-3">
                            <button onClick={() => handleApprovalAction(r.id, 'rejected')}
                              className="flex-1 border border-[#FCA5A5] text-[#DC2626] font-semibold py-2.5 rounded-xl hover:bg-[#FEF2F2] transition-colors text-sm">반려</button>
                            <button onClick={() => handleApprovalAction(r.id, 'approved')}
                              className="flex-1 bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">승인</button>
                          </div>
                        ) : (
                          <button onClick={() => handleApprovalAction(r.id, 'cancelled')}
                            className="w-full border border-[#FCA5A5] text-[#DC2626] font-semibold py-2.5 rounded-xl hover:bg-[#FEF2F2] transition-colors text-sm">승인 취소</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 연차 직접입력 탭 */}
          {tab === 'direct' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 캠퍼스 캘린더 */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#1E293B]">캠퍼스 캘린더</h2>
                  <div className="flex gap-3 text-xs text-[#64748B]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#CFE0F4] border border-[#93C5FD] inline-block" />동료 연차</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" />내 일정</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#FEE2E2] border border-[#FCA5A5] inline-block" />공휴일</span>
                  </div>
                </div>
                <div className="p-3">
                  <style>{`
                    .direct-cal .fc-toolbar-title { font-size: 0.9rem; font-weight: 600; }
                    .direct-cal .fc-col-header-cell-cushion { font-size: 0.72rem; }
                    .direct-cal .fc-daygrid-day-number { font-size: 0.72rem; }
                    .direct-cal .fc-event-title { font-size: 0.65rem; }
                    .direct-cal .fc-day-sun .fc-daygrid-day-number { color: #DC2626; font-weight: 600; }
                    .direct-cal .fc-day-sat .fc-daygrid-day-number { color: #004EA2; font-weight: 600; }
                    .direct-cal .fc-col-header-cell.fc-day-sun { color: #DC2626; }
                    .direct-cal .fc-col-header-cell.fc-day-sat { color: #004EA2; }
                  `}</style>
                  <div className="direct-cal">
                    <FullCalendar
                      plugins={[dayGridPlugin]}
                      initialView="dayGridMonth"
                      locale={koLocale}
                      events={calEvents}
                      datesSet={info => {
                        const d = (info as { view: { currentStart: Date } }).view.currentStart
                        loadCalEvents(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
                      }}
                      headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
                      height="auto"
                      dayMaxEvents={2}
                      weekends={true}
                    />
                  </div>
                </div>
              </div>

              {/* 입력 폼 */}
              <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm">
                <form onSubmit={handleDirectSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-[#1E293B]">직원 선택</label>
                      <div className="flex border border-[#E2E8F0] rounded-lg overflow-hidden text-xs">
                        <button type="button" onClick={() => setSortBy('name')}
                          className={`px-2.5 py-1 font-medium transition-colors ${sortBy === 'name' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                          가나다순
                        </button>
                        <button type="button" onClick={() => setSortBy('position')}
                          className={`px-2.5 py-1 font-medium transition-colors ${sortBy === 'position' ? 'bg-[#1E293B] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'}`}>
                          직급별
                        </button>
                      </div>
                    </div>
                    <input type="text" value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                      placeholder="이름 또는 직급 검색..."
                      className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-2" />
                    <select value={directForm.user_id} onChange={e => setDirectForm(f => ({ ...f, user_id: e.target.value }))}
                      size={6}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                      <option value="">-- 직원 선택 --</option>
                      {filteredEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>[{emp.position}] {emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-2">휴무 종류</label>
                    <select value={directForm.type} onChange={e => setDirectForm(f => ({ ...f, type: e.target.value as LeaveType }))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white">
                      {leaveTypes.map(t => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-[#1E293B] mb-2">시작일</label>
                      <input type="date" value={directForm.start_date}
                        onChange={e => setDirectForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value }))}
                        required
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#1E293B] mb-2">종료일</label>
                      <input type="date" value={directForm.end_date} min={directForm.start_date}
                        onChange={e => setDirectForm(f => ({ ...f, end_date: e.target.value }))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-2">비고 (선택)</label>
                    <input type="text" value={directForm.reason}
                      onChange={e => setDirectForm(f => ({ ...f, reason: e.target.value }))}
                      placeholder="사유 또는 메모"
                      className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
                  </div>
                  {directError && <p className="text-[#EF4444] text-sm">{directError}</p>}
                  {directSuccess && (
                    <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">
                      ✅ 연차가 기록되었습니다.
                    </div>
                  )}
                  <button type="submit" disabled={directLoading}
                    className="w-full bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                    {directLoading ? '저장 중...' : '직접 입력 저장'}
                  </button>
                </form>
              </div>
            </div>
          )}

        </>
      )}

      {/* 서명 모달 */}
      {selectedSig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSig(null)}>
          <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">전자서명</h3>
              <button onClick={() => setSelectedSig(null)} className="text-2xl text-[#64748B] leading-none">×</button>
            </div>
            <img src={selectedSig} alt="서명" className="border border-[#E2E8F0] rounded-xl w-full" />
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditRow(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-1">{editRow.name} 연차 수정</h3>
            <p className="text-xs text-[#64748B] mb-4">{year}년 연차 부여 정보를 수정합니다.</p>
            <form onSubmit={handleEditSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">기본 부여 일수</label>
                <input type="number" step="0.25" min="0" value={editForm.total_days}
                  onChange={e => setEditForm(f => ({ ...f, total_days: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이월 일수</label>
                <input type="number" step="0.25" value={editForm.carried_over}
                  onChange={e => setEditForm(f => ({ ...f, carried_over: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">추가/차감 일수</label>
                <input type="number" step="0.25" value={editForm.extra_days}
                  onChange={e => setEditForm(f => ({ ...f, extra_days: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              </div>
              <p className="text-xs text-[#64748B]">총 부여 = {editForm.total_days + editForm.carried_over + editForm.extra_days}일</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditRow(null)}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={editLoading}
                  className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {editLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
