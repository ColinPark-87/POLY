'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const CATS = ['원장', '관리자', 'KT', 'FT', '상담부', '기타'] as const
type Cat = typeof CATS[number]

const CAT_COLORS: Record<Cat, { bar: string }> = {
  '원장':  { bar: '#0F172A' },
  '관리자': { bar: '#004EA2' },
  'KT':   { bar: '#004EA2' },
  'FT':   { bar: '#EA580C' },
  '상담부': { bar: '#16A34A' },
  '기타':  { bar: '#64748B' },
}

function getCat(position: string, role: string): Cat {
  if (role === 'campus_admin' || (/원장/.test(position) && !/부원장/.test(position))) return '원장'
  if (/부원장|관리자/.test(position)) return '관리자'
  if (/KT/i.test(position)) return 'KT'
  if (/FT/i.test(position)) return 'FT'
  if (/상담/.test(position)) return '상담부'
  return '기타'
}

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

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual:'연차', half_am:'오전반차', half_pm:'오후반차', quarter:'반반차',
  sick:'병가', official:'공가', special:'특별휴가',
}

interface DetailRecord { id:string; type:string; start_date:string; end_date:string; days_used:number; reason:string|null }
interface MonthDetail { userId:string; userName:string; month:number; records:DetailRecord[]; loading:boolean }

interface BalanceRow {
  id: string; name: string; position: string; role: string; is_active: boolean
  campus_hired_at: string | null; company_hired_at: string | null
  baseDays: number; carriedOver: number; extraDays: number
  total: number; monthly: number[]; annualDays: number; halfDays: number; quarterDays: number
  totalUsed: number; remaining: number
}

function fmt(v: number) { return v === 0 ? '-' : String(v) }
function fmtDays(v: number) { return parseFloat(v.toFixed(2)) }

const DEPT_ORDER = ['원장', '관리자', '상담부', 'FT', 'KT', 'POLY안전선생님', '사서', '미화', '기타']

export default function BalancesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [hideMonthly, setHideMonthly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editRow, setEditRow] = useState<BalanceRow | null>(null)
  const [editForm, setEditForm] = useState({ total_days: 0, carried_over: 0, extra_days: 0 })
  const [editLoading, setEditLoading] = useState(false)
  const [monthDetail, setMonthDetail] = useState<MonthDetail|null>(null)

  async function load(y: number) {
    setLoading(true)
    const res = await fetch(`/api/campus/balances?year=${y}`)
    const d = await res.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load(year) }, [year])

  function toggleDept(dept: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(dept) ? next.delete(dept) : next.add(dept)
      return next
    })
  }

  function collapseAll() { setCollapsed(new Set(deptKeys)) }
  function expandAll() { setCollapsed(new Set()) }

  function openEdit(row: BalanceRow) {
    setEditRow(row)
    setEditForm({ total_days: row.baseDays, carried_over: row.carriedOver, extra_days: row.extraDays })
  }

  async function openMonthDetail(row: BalanceRow, monthIdx: number) {
    setMonthDetail({ userId: row.id, userName: row.name, month: monthIdx + 1, records: [], loading: true })
    const res = await fetch(`/api/campus/balances?detail=1&user_id=${row.id}&month=${monthIdx + 1}&year=${year}`)
    const d = await res.json()
    setMonthDetail(prev => prev ? { ...prev, records: d.records ?? [], loading: false } : null)
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

  const groupedTable: Record<string, BalanceRow[]> = {}
  for (const row of filtered) {
    const dept = row.role === 'campus_admin' ? '원장' : (row.position || '기타')
    if (!groupedTable[dept]) groupedTable[dept] = []
    groupedTable[dept].push(row)
  }
  const deptKeys = DEPT_ORDER.filter(d => groupedTable[d]).concat(Object.keys(groupedTable).filter(d => !DEPT_ORDER.includes(d)))

  const totalGranted = parseFloat(filtered.reduce((s, r) => s + r.total, 0).toFixed(2))
  const totalUsed = parseFloat(filtered.reduce((s, r) => s + r.totalUsed, 0).toFixed(2))
  const totalRemaining = parseFloat(filtered.reduce((s, r) => s + r.remaining, 0).toFixed(2))
  const overused = filtered.filter(r => r.remaining < 0).length
  const totalPct = totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 100) : 0

  const colCount = hideMonthly ? 12 : 24

  return (
    <div className="max-w-full">
      {/* 탭 — 최상단 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-5 flex-wrap">
        <button onClick={() => router.push('/campus/overview')}
          className="px-5 py-2.5 text-sm font-medium border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]">
          연차 현황
        </button>
        <button className="px-5 py-2.5 text-sm font-medium border-b-2 border-[#004EA2] text-[#004EA2]">
          잔여 관리
        </button>
        <button onClick={() => router.push('/campus/overview?tab=approvals')}
          className="px-5 py-2.5 text-sm font-medium border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]">
          연차 신청 관리
        </button>
        <button onClick={() => router.push('/campus/overview?tab=direct')}
          className="px-5 py-2.5 text-sm font-medium border-b-2 border-transparent text-[#64748B] hover:text-[#1E293B]">
          연차 직접입력
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">연차 잔여 관리</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <input type="text" placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)}
            className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none w-28" />
          <button onClick={() => setHideMonthly(v => !v)}
            className={`text-sm px-3 py-2 rounded-xl border transition-colors ${hideMonthly ? 'bg-[#1E293B] text-white border-[#1E293B]' : 'border-[#E2E8F0] text-[#64748B]'}`}>
            월별 {hideMonthly ? '표시' : '숨기기'}
          </button>
          <div className="flex border border-[#E2E8F0] rounded-xl overflow-hidden">
            <button onClick={expandAll} className="px-3 py-2 text-xs text-[#64748B] hover:bg-[#F7F8FA]">전체 펼치기</button>
            <button onClick={collapseAll} className="px-3 py-2 text-xs text-[#64748B] hover:bg-[#F7F8FA] border-l border-[#E2E8F0]">전체 접기</button>
          </div>
          <button onClick={() => window.open(`/api/campus/balances/export?year=${year}`, '_blank')}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white text-sm font-semibold px-3 py-2 rounded-xl">
            엑셀 다운로드
          </button>
        </div>
      </div>

      {!loading && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
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
            <div className="hidden lg:block shrink-0 space-y-1.5 min-w-[200px]">
              {deptKeys.map(dept => {
                const c = groupedTable[dept]
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
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {deptKeys.map(dept => {
            const deptRows = groupedTable[dept] ?? []
            const isCollapsed = collapsed.has(dept)
            const deptUsed = deptRows.reduce((s, r) => s + r.totalUsed, 0)
            const deptTotal = deptRows.reduce((s, r) => s + r.total, 0)
            const deptRemaining = deptRows.reduce((s, r) => s + r.remaining, 0)
            const overCount = deptRows.filter(r => r.remaining < 0).length

            return (
              <div key={dept} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                {/* 부서 헤더 — 클릭으로 접기/펼치기 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F7F8FA] transition-colors"
                  onClick={() => toggleDept(dept)}
                >
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 text-[#94A3B8] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-sm font-bold text-[#1E293B]">{dept}</span>
                    <span className="text-xs text-[#94A3B8] bg-[#F1F5F9] px-2 py-0.5 rounded-full">{deptRows.length}명</span>
                    {overCount > 0 && (
                      <span className="text-[10px] text-[#EF4444] bg-[#FEF2F2] px-2 py-0.5 rounded-full font-semibold">초과 {overCount}명</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#64748B]">
                    <span>부여 <strong className="text-[#1E293B]">{fmtDays(deptTotal)}</strong></span>
                    <span>사용 <strong className="text-[#004EA2]">{fmtDays(deptUsed)}</strong></span>
                    <span>잔여 <strong className={deptRemaining < 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}>{fmtDays(deptRemaining)}</strong></span>
                  </div>
                </button>

                {/* 부서 내용 */}
                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-[#F1F5F9]">
                    <table className="w-full text-sm" style={{ minWidth: hideMonthly ? '700px' : '1300px' }}>
                      <thead className="bg-[#F7F8FA]">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-[#64748B] sticky left-0 bg-[#F7F8FA] z-10 w-24">이름</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-[#64748B] w-24">입사일</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#64748B] w-14">부여</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#64748B] w-10">이월</th>
                          {!hideMonthly && MONTHS.map(m => (
                            <th key={m} className="px-1 py-2 text-center text-[10px] font-semibold text-[#94A3B8] w-7">{m}</th>
                          ))}
                          <th className="px-2 py-2 text-center text-xs font-semibold text-[#004EA2] w-9">연차</th>
                          <th className="px-2 py-2 text-center text-xs font-semibold text-[#F97316] w-9">반차</th>
                          <th className="px-2 py-2 text-center text-xs font-semibold text-[#8B5CF6] w-9">반반</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#64748B] w-14">사용</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#22C55E] w-14">잔여</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#64748B] w-9">수정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptRows.map(r => (
                          <tr key={r.id} className={`hover:bg-[#F7F8FA] border-t border-[#F1F5F9] ${!r.is_active ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-2 font-medium sticky left-0 bg-white z-10 truncate max-w-[96px]">{r.name}</td>
                            <td className="px-3 py-2 text-xs text-[#94A3B8]">{(r.campus_hired_at ?? r.company_hired_at)?.slice(0,10) ?? '-'}</td>
                            <td className="px-3 py-2 text-center font-semibold text-[#1E293B]">{r.baseDays}</td>
                            <td className="px-3 py-2 text-center text-xs">
                              {r.carriedOver === 0 ? <span className="text-[#E2E8F0]">-</span> : (
                                <span className={r.carriedOver > 0 ? 'text-[#004EA2]' : 'text-[#EF4444]'}>
                                  {r.carriedOver > 0 ? '+' : ''}{r.carriedOver}
                                </span>
                              )}
                            </td>
                            {!hideMonthly && r.monthly.map((val, idx) => (
                              <td key={idx} className="px-1 py-2 text-center text-[10px]">
                                {val > 0 ? (
                                  <button
                                    onClick={() => openMonthDetail(r, idx)}
                                    className="text-[#004EA2] font-semibold hover:underline hover:text-[#0033AA] cursor-pointer px-0.5 rounded hover:bg-[#EFF6FF] transition-colors">
                                    {val}
                                  </button>
                                ) : <span className="text-[#E2E8F0]">·</span>}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center text-xs text-[#004EA2] font-semibold">{fmt(r.annualDays)}</td>
                            <td className="px-2 py-2 text-center text-xs text-[#F97316] font-semibold">{fmt(r.halfDays)}</td>
                            <td className="px-2 py-2 text-center text-xs text-[#8B5CF6] font-semibold">{fmt(r.quarterDays)}</td>
                            <td className="px-3 py-2 text-center text-xs font-semibold text-[#64748B]">{fmtDays(r.totalUsed)}</td>
                            <td className={`px-3 py-2 text-center font-bold text-sm ${r.remaining < 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>{fmtDays(r.remaining)}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => openEdit(r)} className="text-xs text-[#004EA2] hover:underline">수정</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 월별 상세 모달 */}
      {monthDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMonthDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1F5F9]">
              <div>
                <h3 className="font-bold text-[#1E293B]">{monthDetail.userName}</h3>
                <p className="text-xs text-[#64748B]">{year}년 {monthDetail.month}월 연차 내역</p>
              </div>
              <button onClick={() => setMonthDetail(null)} className="text-[#94A3B8] text-xl hover:text-[#64748B]">✕</button>
            </div>
            {/* 내용 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {monthDetail.loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-3 border-[#004EA2] border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : monthDetail.records.length === 0 ? (
                <p className="text-center text-[#94A3B8] text-sm py-8">내역 없음</p>
              ) : (
                <div className="space-y-2">
                  {monthDetail.records.map(rec => {
                    const typeLabel = LEAVE_TYPE_LABELS[rec.type] ?? rec.type
                    const dateRange = rec.start_date === rec.end_date
                      ? rec.start_date.slice(5).replace('-', '/')
                      : `${rec.start_date.slice(5).replace('-', '/')} ~ ${rec.end_date.slice(5).replace('-', '/')}`
                    const typeColor =
                      rec.type === 'annual' ? '#004EA2' :
                      rec.type.startsWith('half') ? '#F97316' :
                      rec.type === 'quarter' ? '#8B5CF6' :
                      '#64748B'
                    return (
                      <div key={rec.id} className="flex items-start gap-3 bg-[#F8FAFC] rounded-xl px-4 py-3 border border-[#F1F5F9]">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-bold text-[#1E293B]">{dateRange}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ color: typeColor, background: typeColor + '18' }}>
                              {typeLabel}
                            </span>
                          </div>
                          {rec.reason && (
                            <p className="text-[11px] text-[#64748B] truncate">사유: {rec.reason}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-black" style={{ color: typeColor }}>{rec.days_used}</span>
                          <span className="text-[10px] text-[#94A3B8] ml-0.5">일</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* 합계 */}
            {!monthDetail.loading && monthDetail.records.length > 0 && (
              <div className="px-5 py-3 border-t border-[#F1F5F9] flex items-center justify-between">
                <span className="text-xs text-[#64748B]">총 {monthDetail.records.length}건</span>
                <span className="text-sm font-black text-[#004EA2]">
                  {parseFloat(monthDetail.records.reduce((s, r) => s + r.days_used, 0).toFixed(2))}일 사용
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit grant modal */}
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
