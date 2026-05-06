'use client'

import { useEffect, useState } from 'react'

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

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function OverviewPage() {
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'overview'|'balances'>('overview')
  const [editRow, setEditRow] = useState<BalanceRow | null>(null)
  const [editForm, setEditForm] = useState({ total_days: 0, carried_over: 0, extra_days: 0 })
  const [editLoading, setEditLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  async function load(y: number) {
    setLoading(true)
    const res = await fetch(`/api/campus/balances?year=${y}`)
    const d = await res.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load(year) }, [year])

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">전체 연차 현황</h1>
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

          {/* 탭 */}
          <div className="flex gap-0 border-b border-[#E2E8F0] mb-4">
            <button onClick={() => setTab('overview')}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'overview' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
              연차 현황
            </button>
            <button onClick={() => setTab('balances')}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'balances' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
              잔여 관리
            </button>
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

          {/* 잔여 관리 탭 */}
          {tab === 'balances' && (
            <div className="space-y-2">
              {filtered.map(row => {
                const isOver = row.remaining < 0
                const isExpanded = expandedRow === row.id
                const colors = CAT_COLORS[getCat(row.position, row.role)]
                return (
                  <div key={row.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${isOver ? 'border-[#FCA5A5]' : 'border-[#E2E8F0]'}`}>
                    {/* 행 헤더 */}
                    <button
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F8FA] text-left">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: colors.bar }}>
                        {row.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1E293B]">{row.name}</span>
                          <span className="text-[10px] text-[#94A3B8]">{row.position}</span>
                          {isOver && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#EF4444]">초과</span>}
                        </div>
                        {/* 미니 프로그레스바 */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(row.total > 0 ? (row.totalUsed / row.total) * 100 : 0, 100)}%`, backgroundColor: isOver ? '#EF4444' : colors.bar }} />
                          </div>
                          <span className="text-[10px] text-[#94A3B8] flex-shrink-0">{row.total}일 중 {fmtDays(row.totalUsed)}일 사용</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-[9px] text-[#94A3B8]">잔여</p>
                          <p className={`text-base font-bold ${isOver ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>{fmtDays(row.remaining)}일</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); openEdit(row) }}
                          className="text-xs text-[#004EA2] hover:bg-blue-50 px-2 py-1 rounded-lg border border-[#E2E8F0]">
                          수정
                        </button>
                        <span className="text-[#94A3B8] text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 월별 펼치기 */}
                    {isExpanded && (
                      <div className="border-t border-[#F1F5F9] px-4 py-3">
                        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                          {MONTHS.map((m, i) => {
                            const used = row.monthly[i] ?? 0
                            return (
                              <div key={m} className={`rounded-lg p-1.5 text-center ${used > 0 ? 'bg-[#EAF2FB]' : 'bg-[#F7F8FA]'}`}>
                                <p className="text-[9px] text-[#94A3B8]">{m}</p>
                                <p className={`text-xs font-bold ${used > 0 ? 'text-[#004EA2]' : 'text-[#CBD5E1]'}`}>{used > 0 ? used : '-'}</p>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-4 mt-2 text-[10px] text-[#64748B]">
                          <span>연차 {fmtDays(row.annualDays)}일</span>
                          <span>반차 {fmtDays(row.halfDays)}일</span>
                          <span>반반차 {fmtDays(row.quarterDays)}일</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-sm text-[#64748B] text-center py-10">데이터가 없습니다.</p>}
            </div>
          )}
        </>
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
