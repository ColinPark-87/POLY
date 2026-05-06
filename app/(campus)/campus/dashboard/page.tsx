'use client'

import { useEffect, useState } from 'react'
import { downloadLeaveForm, type LeaveFormData } from '@/lib/downloadLeaveForm'

const DAYS = ['월', '화', '수', '목', '금'] as const
const GROUPS = ['유치부', '매일반', '3일반', '2일반'] as const
type Group = typeof GROUPS[number]

const SESS_COLORS: Record<string, string> = {
  '유치부': '#FF6B35', '유치부 방과후': '#FF9800',
  '초등부 매일반': '#2196F3', '초등부 월수금': '#4CAF50', '초등부 화목': '#9C27B0',
}
function sessColor(name: string) {
  if (SESS_COLORS[name]) return SESS_COLORS[name]
  for (const k of Object.keys(SESS_COLORS)) if (name.includes(k)) return SESS_COLORS[k]
  return '#64748B'
}

const BUS_COLORS = ['#F9A825','#E53935','#1565C0','#2E7D32','#6A1B9A','#D84315','#00838F','#37474F','#546E7A']
const DEPT_COLORS: Record<string, string> = {
  관리자:'#004EA2', 상담부:'#22C55E', FT:'#F97316', KT:'#8B5CF6',
  POLY안전선생님:'#06B6D4', 안전선생님:'#06B6D4',
  사서:'#F59E0B', 미화:'#EC4899', 원장:'#10B981', 기타:'#94A3B8',
}
const DEPT_ORDER = ['원장','관리자','상담부','KT','FT','POLY안전선생님','안전선생님','사서','미화']
const GROUP_COLORS: Record<string, string> = { '유치부':'#FF6B35', '매일반':'#2196F3', '3일반':'#4CAF50', '2일반':'#9C27B0' }
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual:'연차', half:'반차', quarter:'반반차', sick:'병가', official:'공가', special:'특별휴가',
}

interface SessionStat { name:string; time_range:string|null; classCount:number; studentCount:number; group:string }
interface DeptStat { dept:string; count:number; grantedDays:number; usedDays:number }
interface PendingReq { id:string; type:string; start_date:string; end_date:string; days_used:number; reason:string|null; created_at:string; signature_data_url:string|null; users:{name:string;position:string}|null }
interface HistoryReq { id:string; type:string; status:'approved'|'rejected'; start_date:string; end_date:string; days_used:number; reason:string|null; created_at:string; reviewer_note:string|null; signature_data_url:string|null; users:{name:string;position:string}|null }
interface Bus { id:string; name:string; sort_order:number }
type BusDayMap = Record<string, Record<string, number>>

interface ThisWeekLeave { id:string; user_id:string; type:string; start_date:string; end_date:string; days_used:number; users:{name:string;position:string}|null }

interface DashData {
  month: string
  roster: {
    uniqueStudents:number; totalClasses:number; sessionStats:SessionStat[]
    monthlyEnroll:number[]; monthlyWithdraw:number[]
    groupMonthlyEnroll:Record<string,number[]>; groupMonthlyWithdraw:Record<string,number[]>
    curMonthIdx:number
  }
  buses: Bus[]
  arrByGroup: Record<string, BusDayMap>; depByGroup: Record<string, BusDayMap>
  arrTotal: BusDayMap; depTotal: BusDayMap
  leave: { totalEmployees:number; pendingCount:number; deptStats:DeptStat[]; pendingRequests:PendingReq[]; leaveHistory:HistoryReq[] }
  today: { day:string|null; date:string; arrByGroup:Record<string,Record<string,number>>; depByGroup:Record<string,Record<string,number>>; arrTotal:Record<string,number>; depTotal:Record<string,number>; overrideCount:number; absentCount:number; changeCount:number }
  thisWeekLeave: ThisWeekLeave[]
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin"/></div>
}

function QuadCard({ title, icon, meta, color, children }: {
  title:string; icon:string; meta:React.ReactNode; color:string; children:React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#F1F5F9] flex-shrink-0"
        style={{ borderLeftColor:color, borderLeftWidth:3 }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-bold text-[#1E293B]">{title}</span>
        </div>
        <div>{meta}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 min-h-0">{children}</div>
    </div>
  )
}

const BUS_MAX = 17

function BusCapacityCards({ arrByGroup, depByGroup, buses, dir = 'arr' }: {
  arrByGroup: Record<string, BusDayMap>; depByGroup: Record<string, BusDayMap>
  buses: Bus[]; dir?: 'arr'|'dep'
}) {
  const sortedBuses = [...buses].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return (parseInt(a.name) || 9999) - (parseInt(b.name) || 9999)
  })
  const busLabel = (name: string) => { const n = parseInt(name); return isNaN(n) ? name.slice(0,2) : `${n}호` }
  const busColor = (name: string) => { const i = buses.findIndex(b => b.name === name); return BUS_COLORS[(i >= 0 ? i : 0) % BUS_COLORS.length] }
  const cellStyle = (n: number): React.CSSProperties => n > BUS_MAX
    ? { color:'#EF4444', background:'#FEF2F2', fontWeight:900, borderRadius:3, padding:'1px 4px' }
    : n >= BUS_MAX - 2
      ? { color:'#D97706', background:'#FFFBEB', fontWeight:900, borderRadius:3, padding:'1px 4px' }
      : n > 0 ? { color:'#1E293B', fontWeight:700 } : { color:'#CBD5E1' }

  type GEntry = { group: Group; arrGrp: BusDayMap; depGrp: BusDayMap; groupBuses: Bus[]; activeDays: string[]; dayTag: string; hasOver: boolean; hasWarn: boolean }
  const groups: GEntry[] = GROUPS.flatMap<GEntry>(group => {
    const arrGrp = arrByGroup[group] ?? {}
    const depGrp = depByGroup[group] ?? {}
    const groupBuses = sortedBuses.filter(b => DAYS.some(d => (arrGrp[b.name]?.[d]??0) > 0 || (depGrp[b.name]?.[d]??0) > 0))
    if (groupBuses.length === 0) return []
    const activeDays = DAYS.filter(d => groupBuses.some(b => (arrGrp[b.name]?.[d]??0) > 0 || (depGrp[b.name]?.[d]??0) > 0))
    const dayTag = activeDays.length === 5 ? '' : activeDays.join('')
    let hasOver = false, hasWarn = false
    for (const b of groupBuses) for (const d of activeDays) {
      const v = (dir==='arr' ? arrGrp : depGrp)[b.name]?.[d] ?? 0
      if (v > BUS_MAX) hasOver = true; else if (v >= BUS_MAX-2) hasWarn = true
    }
    return [{ group, arrGrp, depGrp, groupBuses, activeDays, dayTag, hasOver, hasWarn }]
  })

  if (groups.length === 0) return <p className="text-[11px] text-[#CBD5E1] text-center py-6">차량 데이터 없음</p>

  // 그룹 수에 따라 열 수 결정
  const colClass = groups.length <= 2 ? 'grid-cols-2' : groups.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className={`grid ${colClass} gap-2 flex-1 min-h-0`}>
        {groups.map(({ group, arrGrp, depGrp, groupBuses, activeDays, dayTag, hasOver, hasWarn }) => {
          const gColor = GROUP_COLORS[group]
          const grpMap = dir === 'arr' ? arrGrp : depGrp
          return (
            <div key={group} className="border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
              {/* 그룹 헤더 */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b flex-shrink-0" style={{background: gColor+'12'}}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: gColor}}/>
                <span className="text-[11px] font-extrabold" style={{color: gColor}}>{group}</span>
                {dayTag && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{background: gColor+'20', color: gColor}}>
                    {dayTag}
                  </span>
                )}
                <span className="ml-auto text-[10px]">{hasOver ? '🚨' : hasWarn ? '⚠️' : '✅'}</span>
              </div>
              {/* 요일(행) × 호차(열) */}
              <div className="overflow-auto flex-1">
                <table style={{fontSize:11, borderCollapse:'collapse', width:'100%'}}>
                  <thead>
                    <tr className="border-b border-[#F1F5F9]">
                      <th className="text-[9px] text-[#94A3B8] font-bold px-2 py-1.5 text-center sticky left-0 bg-white border-r border-[#E2E8F0] w-8">요일</th>
                      {groupBuses.map(b => (
                        <th key={b.name} className="text-center px-1 py-1.5">
                          <span className="text-[10px] font-extrabold" style={{color: busColor(b.name)}}>{busLabel(b.name)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((day, di) => (
                      <tr key={day} className={`${di%2===0?'bg-white':'bg-[#FAFAFA]'} border-b border-[#F1F5F9] last:border-0`}>
                        <td className="text-center text-[10px] font-bold text-[#64748B] px-2 py-2 border-r border-[#E2E8F0] sticky left-0"
                          style={{background: di%2===0?'#fff':'#FAFAFA'}}>{day}</td>
                        {groupBuses.map(b => {
                          const n = grpMap[b.name]?.[day] ?? 0
                          return (
                            <td key={b.name} className="text-center py-2 px-1">
                              <span style={cellStyle(n)}>{n > 0 ? n : '·'}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 pt-0.5 flex-shrink-0">
        <span className="text-[8px] text-[#94A3B8]">🚨 {BUS_MAX+1}명↑ 초과</span>
        <span className="text-[8px] text-[#94A3B8]">⚠️ {BUS_MAX-2}~{BUS_MAX}명 주의</span>
        <span className="text-[8px] text-[#94A3B8]">✅ 여유</span>
      </div>
    </div>
  )
}

interface EnrollRecord { id:string; student_name:string; type:string; class_name:string; effective_date:string; note:string|null; created_at:string }

export default function CampusDashboardPage() {
  const [data, setData] = useState<DashData|null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [busDir, setBusDir] = useState<'arr'|'dep'>('arr')
  const [rejectingId, setRejectingId] = useState<string|null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processingId, setProcessingId] = useState<string|null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string|null>(null)
  const [enrollModal, setEnrollModal] = useState<{ group:string; logs:EnrollRecord[]; loading:boolean }|null>(null)

  useEffect(() => {
    fetch(`/api/campus/dashboard?year=${year}`).then(r=>r.json()).then(setData)
  }, [year])

  async function handleApproval(id: string, status: 'approved'|'rejected', note?: string) {
    setProcessingId(id)
    try {
      await fetch(`/api/campus/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_note: note ?? null }),
      })
      // refresh dashboard
      const res = await fetch(`/api/campus/dashboard?year=${year}`)
      setData(await res.json())
    } finally {
      setProcessingId(null)
      setRejectingId(null)
      setRejectNote('')
    }
  }

  async function openEnrollModal(group: string) {
    setEnrollModal({ group, logs: [], loading: true })
    const res = await fetch('/api/campus/class-roster/history')
    const d = await res.json()
    const all: EnrollRecord[] = d.logs ?? []
    const curMonthPrefix = new Date().toISOString().slice(0,7) // 'YYYY-MM'
    const filtered = all.filter(l => {
      if (l.type !== 'enrolled' && l.type !== 'withdrawn') return false
      if (!l.effective_date.startsWith(curMonthPrefix)) return false
      if (group === '전체') return true
      if (group === '유치부') return l.class_name.includes('유치부') && !l.class_name.includes('방과후')
      if (group === '방과후') return l.class_name.includes('방과후')
      if (group === '매일반') return l.class_name.includes('매일반')
      if (group === '3일반') return l.class_name.includes('월수금') || l.class_name.includes('3일반')
      if (group === '2일반') return l.class_name.includes('화목') || l.class_name.includes('2일반')
      return true
    })
    setEnrollModal({ group, logs: filtered, loading: false })
  }

  function downloadHistory(history: HistoryReq[]) {
    const HEADERS = ['이름','직책','구분','상태','시작일','종료일','일수','사유','처리일','반려사유']
    const rows = history.map(r => {
      const u = Array.isArray(r.users) ? (r.users as {name:string;position:string}[])[0] : r.users
      return [
        u?.name ?? '', u?.position ?? '',
        LEAVE_TYPE_LABELS[r.type] ?? r.type,
        r.status === 'approved' ? '승인' : '반려',
        r.start_date, r.end_date, r.days_used,
        r.reason ?? '', r.created_at.slice(0,10),
        r.reviewer_note ?? '',
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    })
    const csv = '\uFEFF' + [HEADERS.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `연차내역_${year}.csv`
    a.click()
  }

  if (!data) return <Spinner />

  const { roster, buses, arrByGroup, depByGroup, arrTotal, depTotal, leave, today, thisWeekLeave } = data
  const currentYear = new Date().getFullYear()

  const allBusNames = [...new Set([...buses.map(b=>b.name), ...Object.keys(arrTotal), ...Object.keys(depTotal)])]
  const busColor = (name: string) => BUS_COLORS[allBusNames.indexOf(name) % BUS_COLORS.length]

  const todayArrTotal = Object.values(today.arrTotal).reduce((a,b)=>a+b,0)
  const todayDepTotal = Object.values(today.depTotal).reduce((a,b)=>a+b,0)

  // 이번 주 캘린더 계산
  const weekDays = (() => {
    const ref = new Date(today.date + 'T00:00:00')
    const dow = ref.getDay()
    const offset = dow === 0 ? -6 : 1 - dow
    const dayLabels = ['월','화','수','목','금']
    return Array.from({length: 5}, (_, i) => {
      const d = new Date(ref); d.setDate(ref.getDate() + offset + i)
      const ds = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
      return { date: ds, label: dayLabels[i], monthDay: `${d.getMonth()+1}/${d.getDate()}` }
    })
  })()
  const weekStartStr = weekDays[0].date
  const weekEndStr = weekDays[4].date
  const leaveByDay: Record<string, {name:string;type:string;position:string}[]> = {}
  for (const wd of weekDays) leaveByDay[wd.date] = []
  for (const lv of thisWeekLeave) {
    const u = Array.isArray(lv.users) ? (lv.users as {name:string;position:string}[])[0] : lv.users
    if (!u) continue
    for (const wd of weekDays) {
      if (lv.start_date <= wd.date && wd.date <= lv.end_date) {
        if (!leaveByDay[wd.date].find(x => x.name === u.name))
          leaveByDay[wd.date].push({ name: u.name, type: lv.type, position: u.position })
      }
    }
  }

  // Q1: Compute roster breakdown
  const { monthlyEnroll, monthlyWithdraw, groupMonthlyEnroll, groupMonthlyWithdraw, curMonthIdx } = roster
  const stats = roster.sessionStats
  const 유치부Stats = stats.filter(s => s.name.includes('유치부') && !s.name.includes('방과후'))
  const 방과후Stats = stats.filter(s => s.name.includes('방과후'))
  const 매일반Stats = stats.filter(s => s.group === '매일반' && !s.name.includes('유치부') && !s.name.includes('방과후'))
  const 삼일반Stats = stats.filter(s => s.group === '3일반')
  const 이일반Stats = stats.filter(s => s.group === '2일반')

  const sum = (arr: SessionStat[]) => arr.reduce((s,x)=>s+x.studentCount,0)
  const cls = (arr: SessionStat[]) => arr.reduce((s,x)=>s+x.classCount,0)
  const 유치부Total = sum(유치부Stats); const 방과후Total = sum(방과후Stats)
  const 매일반Total = sum(매일반Stats); const 삼일반Total = sum(삼일반Stats); const 이일반Total = sum(이일반Stats)
  const 초등부Total = 매일반Total + 삼일반Total + 이일반Total
  // 총수강인원 = 방과후 제외 (유치부 + 초등부만)
  const grandTotal = 유치부Total + 초등부Total

  function getDelta(group: string) {
    const eg = groupMonthlyEnroll[group]
    const wg = groupMonthlyWithdraw[group]
    const e = eg ? (eg[curMonthIdx] ?? 0) : 0
    const w = wg ? (wg[curMonthIdx] ?? 0) : 0
    return { enrolled: e, withdrawn: w, net: e - w }
  }

  function RosterStatCard({ label, count, classes: clsCount, color, group, children }: { label:string; count:number; classes?:number; color:string; group?:string; children?:React.ReactNode }) {
    const delta = group ? getDelta(group) : null
    return (
      <div className="rounded-xl p-3" style={{background:color+'12', border:`1px solid ${color}35`}}>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}}/>
          <span className="text-[10px] font-bold truncate" style={{color}}>{label}</span>
          {clsCount !== undefined && <span className="ml-auto text-[9px] text-[#94A3B8] flex-shrink-0">{clsCount}반</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#1E293B]">{count}</span>
            <span className="text-[10px] text-[#94A3B8]">명</span>
          </div>
          {delta && (delta.enrolled > 0 || delta.withdrawn > 0) && (
            <button onClick={() => openEnrollModal(group!)}
              className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold hover:opacity-80 transition-opacity"
              style={{background: delta.net > 0 ? '#DCFCE7' : delta.net < 0 ? '#FEE2E2' : '#F1F5F9'}}>
              {delta.enrolled > 0 && <span style={{color:'#16A34A'}}>+{delta.enrolled}</span>}
              {delta.withdrawn > 0 && <span style={{color:'#DC2626'}}>-{delta.withdrawn}</span>}
            </button>
          )}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-[#1E293B]">캠퍼스 대시보드</h1>
          <p className="text-[11px] text-[#94A3B8]">{data.month} 기준</p>
        </div>
        <select value={year} onChange={e=>setYear(+e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none">
          {[currentYear-1, currentYear, currentYear+1].map(y=><option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {/* 상단 2열: 반편성 | 연차현황 */}
      <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="grid grid-cols-2 gap-3 min-h-0" style={{flex:'0 0 54%'}}>

        {/* ── Q1: 반편성 현황 ─────────────────────────────── */}
        <QuadCard title="개설반 현황" icon="📚" color="#1e3a5f"
          meta={
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-[#1e3a5f]">{grandTotal}</span>
              <span className="text-[10px] text-[#94A3B8]">명 · {roster.totalClasses}반</span>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            {/* 유치부 + 방과후 행 */}
            {(유치부Total > 0 || 방과후Total > 0) && (
              <div className={`grid gap-2 ${유치부Total > 0 && 방과후Total > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {유치부Total > 0 && (
                  <RosterStatCard label="유치부" count={유치부Total} classes={cls(유치부Stats)} color="#FF6B35" group="유치부" />
                )}
                {방과후Total > 0 && (
                  <RosterStatCard label="유치부 방과후" count={방과후Total} classes={cls(방과후Stats)} color="#FF9800" group="방과후" />
                )}
              </div>
            )}
            {/* 초등부 */}
            {초등부Total > 0 && (
              <RosterStatCard label="초등부" count={초등부Total} classes={cls([...매일반Stats,...삼일반Stats,...이일반Stats])} color="#2196F3">
                <div className="grid grid-cols-3 gap-1 pt-2 mt-1 border-t border-[#2196F325]">
                  {매일반Total > 0 && (
                    <button onClick={() => openEnrollModal('매일반')} className="text-center hover:bg-[#2196F310] rounded-lg py-1 transition-colors">
                      <div className="text-[8px] text-[#94A3B8] mb-0.5">매일반</div>
                      <div className="text-sm font-black text-[#2196F3]">{매일반Total}</div>
                      {(() => { const d = getDelta('매일반'); return (d.enrolled > 0 || d.withdrawn > 0) ? <div className="text-[7px] font-bold"><span className="text-[#16A34A]">+{d.enrolled}</span><span className="text-[#DC2626] ml-0.5">-{d.withdrawn}</span></div> : <div className="text-[8px] text-[#CBD5E1]">{cls(매일반Stats)}반</div> })()}
                    </button>
                  )}
                  {삼일반Total > 0 && (
                    <button onClick={() => openEnrollModal('3일반')} className="text-center hover:bg-[#4CAF5010] rounded-lg py-1 transition-colors">
                      <div className="text-[8px] text-[#94A3B8] mb-0.5">3일반</div>
                      <div className="text-sm font-black text-[#4CAF50]">{삼일반Total}</div>
                      {(() => { const d = getDelta('3일반'); return (d.enrolled > 0 || d.withdrawn > 0) ? <div className="text-[7px] font-bold"><span className="text-[#16A34A]">+{d.enrolled}</span><span className="text-[#DC2626] ml-0.5">-{d.withdrawn}</span></div> : <div className="text-[8px] text-[#CBD5E1]">{cls(삼일반Stats)}반</div> })()}
                    </button>
                  )}
                  {이일반Total > 0 && (
                    <button onClick={() => openEnrollModal('2일반')} className="text-center hover:bg-[#9C27B010] rounded-lg py-1 transition-colors">
                      <div className="text-[8px] text-[#94A3B8] mb-0.5">2일반</div>
                      <div className="text-sm font-black text-[#9C27B0]">{이일반Total}</div>
                      {(() => { const d = getDelta('2일반'); return (d.enrolled > 0 || d.withdrawn > 0) ? <div className="text-[7px] font-bold"><span className="text-[#16A34A]">+{d.enrolled}</span><span className="text-[#DC2626] ml-0.5">-{d.withdrawn}</span></div> : <div className="text-[8px] text-[#CBD5E1]">{cls(이일반Stats)}반</div> })()}
                    </button>
                  )}
                </div>
              </RosterStatCard>
            )}
            {/* 기타 세션 */}
            {stats.filter(s=>!s.name.includes('유치부')&&!s.name.includes('방과후')&&!s.name.includes('초등부')).map(s=>(
              <RosterStatCard key={s.name} label={s.name} count={s.studentCount} classes={s.classCount} color={sessColor(s.name)} />
            ))}

            {/* 월별 입퇴소 미니 차트 */}
            {(() => {
              const months = ['1','2','3','4','5','6','7','8','9','10','11','12']
              const maxVal = Math.max(...monthlyEnroll, ...monthlyWithdraw, 1)
              const hasData = monthlyEnroll.some(v=>v>0) || monthlyWithdraw.some(v=>v>0)
              if (!hasData) return null
              return (
                <div className="mt-1 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold text-[#64748B]">입퇴소 현황 ({new Date().getFullYear()})</span>
                    <button onClick={() => openEnrollModal('전체')} className="text-[8px] text-[#004EA2] hover:underline">전체보기</button>
                  </div>
                  <div className="flex items-end gap-px h-12">
                    {months.map((m, i) => {
                      const e = monthlyEnroll[i] ?? 0
                      const w = monthlyWithdraw[i] ?? 0
                      const isCur = i === curMonthIdx
                      return (
                        <button key={m} onClick={() => openEnrollModal('전체')}
                          className={`flex-1 flex flex-col items-center gap-px group ${isCur ? 'opacity-100' : 'opacity-60'}`}
                          title={`${m}월: 입소 ${e}, 퇴소 ${w}`}>
                          <div className="w-full flex items-end gap-px" style={{height:40}}>
                            <div className="flex-1 rounded-t-sm transition-all" style={{height: `${(e/maxVal)*100}%`, minHeight: e>0?2:0, background:'#16A34A'}}/>
                            <div className="flex-1 rounded-t-sm transition-all" style={{height: `${(w/maxVal)*100}%`, minHeight: w>0?2:0, background:'#DC2626'}}/>
                          </div>
                          <span className={`text-[6px] ${isCur ? 'font-black text-[#004EA2]' : 'text-[#CBD5E1]'}`}>{m}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-[#16A34A]"/><span className="text-[8px] text-[#64748B]">입소</span></div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-[#DC2626]"/><span className="text-[8px] text-[#64748B]">퇴소</span></div>
                  </div>
                </div>
              )
            })()}
          </div>
        </QuadCard>


        {/* ── Q3: 연차 현황 ────────────────────────────────── */}
        <QuadCard title="연차 현황" icon="📋" color="#004EA2"
          meta={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#64748B]">직원 <b>{leave.totalEmployees}</b>명</span>
              {leave.pendingCount > 0 && (
                <span className="text-[9px] font-bold text-white bg-[#D97706] px-1.5 py-0.5 rounded-full">승인대기 {leave.pendingCount}</span>
              )}
            </div>
          }
        >
          {/* ── 이번 주 연차 (최상단) ── */}
          <div className="mb-3 border-b border-[#F1F5F9] pb-3">
            <p className="text-[10px] font-bold text-[#64748B] mb-1.5">📅 이번 주 연차</p>
            {Object.values(leaveByDay).every(a => a.length === 0) ? (
              <p className="text-[11px] text-[#CBD5E1] text-center py-2 bg-[#F8FAFC] rounded-lg">이번 주 연차 없음</p>
            ) : (
              <div className="grid grid-cols-5 gap-1">
                {weekDays.map(wd => {
                  const isToday = wd.date === today.date
                  const people = leaveByDay[wd.date] ?? []
                  return (
                    <div key={wd.date} className={`rounded-lg p-1.5 ${isToday ? 'bg-[#EFF6FF] border border-[#BFDBFE]' : 'bg-[#F8FAFC]'}`}>
                      <div className={`text-[9px] font-bold text-center mb-1 leading-tight ${isToday ? 'text-[#2563eb]' : 'text-[#94A3B8]'}`}>
                        {wd.label}<br/><span className="font-normal">{wd.monthDay.slice(wd.monthDay.indexOf('/')+1)}일</span>
                      </div>
                      <div className="space-y-0.5 min-h-[14px]">
                        {people.map(p => (
                          <div key={p.name} className="text-[7px] font-semibold text-white rounded px-0.5 py-0.5 truncate leading-tight text-center"
                            style={{ background: DEPT_COLORS[p.position] ?? '#64748B' }}>
                            {p.name} <span className="opacity-80">{p.type === 'half' ? '반' : p.type === 'quarter' ? '반반' : p.type === 'annual' ? '연' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── 2분할: 대기 | 승인내역 달력 ── */}
          {(() => {
            const now = new Date()
            const curYear = now.getFullYear()
            const curMonthIdx = now.getMonth()
            const daysInMonth = new Date(curYear, curMonthIdx + 1, 0).getDate()
            const approvedHistory = leave.leaveHistory.filter(r => r.status === 'approved')

            // 이번 달 날짜별 승인 휴가인 사람 + record 집계
            const calMap: Record<string, {name:string; position:string; type:string; record: HistoryReq}[]> = {}
            for (let d = 1; d <= daysInMonth; d++) {
              const ds = `${curYear}-${String(curMonthIdx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const dow = new Date(curYear, curMonthIdx, d).getDay()
              if (dow === 0 || dow === 6) continue
              calMap[ds] = []
              for (const r of approvedHistory) {
                if (r.start_date <= ds && ds <= r.end_date) {
                  const u = Array.isArray(r.users) ? (r.users as {name:string;position:string}[])[0] : r.users
                  if (u && !calMap[ds].find(x => x.name === u.name))
                    calMap[ds].push({ name: u.name, position: u.position, type: r.type, record: r })
                }
              }
            }

            // 주 단위로 묶기 (월~금)
            const weekdays = Object.keys(calMap).sort()
            const weeks: string[][] = []
            let week: string[] = []
            for (const ds of weekdays) {
              const dow = new Date(ds + 'T00:00:00').getDay() // 1=월 5=금
              if (dow === 1 && week.length > 0) { weeks.push(week); week = [] }
              week.push(ds)
            }
            if (week.length > 0) weeks.push(week)

            return (
              <div className="grid grid-cols-2 gap-3 mb-3 border-b border-[#F1F5F9] pb-3">
                {/* 왼쪽: 대기 */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-[#D97706]">승인 대기</span>
                    {leave.pendingCount > 0 && <span className="text-[8px] font-black text-white bg-[#D97706] px-1 py-0.5 rounded-full">{leave.pendingCount}</span>}
                  </div>
                  {leave.pendingRequests.length === 0 ? (
                    <p className="text-[10px] text-[#CBD5E1] text-center py-4 bg-[#F8FAFC] rounded-lg">대기 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {leave.pendingRequests.map(r => {
                        const u = Array.isArray(r.users) ? (r.users as {name:string;position:string}[])[0] : r.users
                        const color = DEPT_COLORS[u?.position??''] ?? '#94A3B8'
                        const isProcessing = processingId === r.id
                        const isRejecting = rejectingId === r.id
                        const days = r.type === 'quarter' ? 0.25 : r.days_used
                        return (
                          <div key={r.id} className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg overflow-hidden">
                            {/* 클릭 → 신청서 팝업 */}
                            <button
                              onClick={() => downloadLeaveForm({
                                name: u?.name ?? '-',
                                position: u?.position ?? '',
                                typeLabel: LEAVE_TYPE_LABELS[r.type] ?? r.type,
                                start_date: r.start_date,
                                end_date: r.end_date,
                                days_used: days,
                                reason: r.reason,
                                created_at: r.created_at,
                                signature_data_url: r.signature_data_url,
                              } as LeaveFormData)}
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[#FEF9C3] transition-colors"
                            >
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:color}}/>
                              <span className="font-bold text-[11px] text-[#1E293B] whitespace-nowrap flex-shrink-0">{u?.name??'-'}</span>
                              <span className="text-[8px] text-[#D97706] font-bold bg-[#FEF3C7] px-1 py-0.5 rounded flex-shrink-0">{LEAVE_TYPE_LABELS[r.type]??r.type}</span>
                              <span className="text-[8px] text-[#64748B] truncate">
                                {r.start_date.slice(5)}{r.start_date!==r.end_date?`~${r.end_date.slice(5)}`:''} ({days}일)
                              </span>
                            </button>
                            {/* 승인/거부 버튼 */}
                            <div className="flex items-center gap-1 px-2 pb-1.5">
                              <button disabled={isProcessing}
                                onClick={() => handleApproval(r.id, 'approved')}
                                className="flex-1 text-[9px] py-0.5 rounded bg-[#10B981] text-white font-bold hover:bg-[#059669] disabled:opacity-50">
                                {isProcessing && !isRejecting ? '...' : '승인'}
                              </button>
                              <button disabled={isProcessing}
                                onClick={() => { setRejectingId(isRejecting ? null : r.id); setRejectNote('') }}
                                className="flex-1 text-[9px] py-0.5 rounded bg-[#EF4444] text-white font-bold hover:bg-[#DC2626] disabled:opacity-50">
                                거부
                              </button>
                            </div>
                            {isRejecting && (
                              <div className="px-2 pb-1.5 flex items-center gap-1">
                                <input type="text" value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                                  placeholder="반려 사유"
                                  className="flex-1 text-[9px] border border-[#FCA5A5] rounded px-1.5 py-0.5 bg-white focus:outline-none"/>
                                <button disabled={isProcessing}
                                  onClick={() => handleApproval(r.id, 'rejected', rejectNote)}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-[#EF4444] text-white font-bold disabled:opacity-50 flex-shrink-0">
                                  {isProcessing ? '...' : '확인'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 오른쪽: 승인내역 달력 */}
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-[#004EA2]">{curMonthIdx+1}월 승인내역</span>
                    {leave.leaveHistory.length > 0 && (
                      <button onClick={() => downloadHistory(leave.leaveHistory)}
                        className="text-[8px] font-semibold text-[#64748B] hover:text-[#004EA2] px-1.5 py-0.5 border border-[#E2E8F0] rounded hover:bg-[#F1F5F9] transition-colors">
                        ⬇ CSV
                      </button>
                    )}
                  </div>
                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-5 gap-px mb-0.5">
                    {['월','화','수','목','금'].map(d => (
                      <div key={d} className="text-center text-[7px] font-bold text-[#CBD5E1]">{d}</div>
                    ))}
                  </div>
                  {/* 주 행 */}
                  {weeks.length === 0 ? (
                    <p className="text-[9px] text-[#CBD5E1] text-center py-3">내역 없음</p>
                  ) : (
                    <div className="space-y-0.5">
                      {weeks.map((wk, wi) => {
                        const cells: (string|null)[] = Array(5).fill(null)
                        for (const ds of wk) {
                          const dow = new Date(ds + 'T00:00:00').getDay()
                          cells[dow - 1] = ds
                        }
                        const isThisWeek = wk.includes(today.date) || wk.some(ds => ds >= weekStartStr && ds <= weekEndStr)
                        return (
                          <div key={wi} className={`grid grid-cols-5 gap-px rounded-lg p-0.5 ${isThisWeek ? 'bg-[#EFF6FF] ring-1 ring-[#BFDBFE]' : ''}`}>
                            {cells.map((ds, ci) => {
                              if (!ds) return <div key={ci} style={{minHeight: isThisWeek ? 36 : 26}}/>
                              const people = calMap[ds] ?? []
                              const isToday = ds === today.date
                              return (
                                <div key={ds} className={`rounded p-0.5 ${isToday ? 'bg-[#DBEAFE] ring-1 ring-[#93C5FD]' : people.length > 0 && isThisWeek ? 'bg-[#EFF6FF]' : people.length > 0 ? 'bg-[#F8FAFC]' : ''}`}
                                  style={{minHeight: isThisWeek ? 36 : 26}}>
                                  <div className={`text-center leading-tight mb-0.5 ${isThisWeek ? 'text-[8px]' : 'text-[7px]'} font-bold ${isToday ? 'text-[#2563eb]' : isThisWeek ? 'text-[#64748B]' : 'text-[#CBD5E1]'}`}>
                                    {Number(ds.slice(8))}
                                  </div>
                                  <div className="space-y-px">
                                    {people.map(p => {
                                      const u = Array.isArray(p.record.users) ? (p.record.users as {name:string;position:string}[])[0] : p.record.users
                                      const days = p.record.type === 'quarter' ? 0.25 : p.record.days_used
                                      return (
                                        <button key={p.name}
                                          onClick={() => downloadLeaveForm({
                                            name: u?.name ?? p.name,
                                            position: u?.position ?? p.position,
                                            typeLabel: LEAVE_TYPE_LABELS[p.type] ?? p.type,
                                            start_date: p.record.start_date,
                                            end_date: p.record.end_date,
                                            days_used: days,
                                            reason: p.record.reason,
                                            created_at: p.record.created_at,
                                            signature_data_url: p.record.signature_data_url,
                                          } as LeaveFormData)}
                                          className={`w-full font-bold text-white rounded text-center leading-tight py-px hover:opacity-80 transition-opacity ${isThisWeek ? 'text-[7px] px-0.5' : 'text-[6px] px-px'}`}
                                          style={{background: DEPT_COLORS[p.position] ?? '#64748B'}}
                                          title={`${p.name} · ${LEAVE_TYPE_LABELS[p.type]??p.type}`}>
                                          {p.name.slice(0, isThisWeek ? 4 : 3)}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}


        </QuadCard>

      </div>

      {/* 하단 전체: 호차별 탑승 현황 */}
      <div className="flex-1 min-h-0">
        <QuadCard title="호차별 탑승 현황" icon="🚌" color="#2563eb"
          meta={
            <div className="flex items-center gap-1.5">
              {(['arr','dep'] as const).map(d => (
                <button key={d} onClick={() => setBusDir(d)}
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-colors ${busDir===d ? (d==='arr' ? 'bg-[#2563eb] text-white' : 'bg-[#dc2626] text-white') : 'text-[#94A3B8] hover:bg-[#F1F5F9]'}`}>
                  {d==='arr' ? '등원' : '하원'}
                </button>
              ))}
            </div>
          }
        >
          <BusCapacityCards arrByGroup={arrByGroup} depByGroup={depByGroup} buses={buses} dir={busDir} />
        </QuadCard>
      </div>
      </div>

      {/* 입퇴소 상세 모달 */}
      {enrollModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEnrollModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#F1F5F9]">
              <div>
                <h3 className="font-bold text-[#1E293B] text-sm">{enrollModal.group} 입퇴소 현황</h3>
                <p className="text-[10px] text-[#94A3B8]">이번 달 기록</p>
              </div>
              <button onClick={() => setEnrollModal(null)} className="text-[#94A3B8] text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {enrollModal.loading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin"/></div>
              ) : enrollModal.logs.length === 0 ? (
                <div className="text-center py-8 text-[#94A3B8] text-sm">이번 달 입퇴소 기록이 없습니다</div>
              ) : (
                <>
                  {enrollModal.logs.filter(l => l.type === 'enrolled').length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold text-[#16A34A] mb-1 px-1">입소 ({enrollModal.logs.filter(l=>l.type==='enrolled').length}명)</p>
                      {enrollModal.logs.filter(l => l.type === 'enrolled').map(l => (
                        <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#F0FDF4] rounded-lg">
                          <span className="text-[8px] font-bold text-white bg-[#16A34A] px-1.5 py-0.5 rounded-full flex-shrink-0">입소</span>
                          <span className="text-xs font-semibold text-[#1E293B]">{l.student_name}</span>
                          <span className="text-[9px] text-[#64748B] truncate">{l.class_name}</span>
                          <span className="text-[9px] text-[#94A3B8] ml-auto flex-shrink-0">{l.effective_date.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {enrollModal.logs.filter(l => l.type === 'withdrawn').length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold text-[#DC2626] mb-1 px-1 mt-2">퇴소 ({enrollModal.logs.filter(l=>l.type==='withdrawn').length}명)</p>
                      {enrollModal.logs.filter(l => l.type === 'withdrawn').map(l => (
                        <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#FEF2F2] rounded-lg">
                          <span className="text-[8px] font-bold text-white bg-[#DC2626] px-1.5 py-0.5 rounded-full flex-shrink-0">퇴소</span>
                          <span className="text-xs font-semibold text-[#1E293B]">{l.student_name}</span>
                          <span className="text-[9px] text-[#64748B] truncate">{l.class_name}</span>
                          <span className="text-[9px] text-[#94A3B8] ml-auto flex-shrink-0">{l.effective_date.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
