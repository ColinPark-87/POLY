'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadLeaveForm, type LeaveFormData } from '@/lib/downloadLeaveForm'
import { NO_SHUTTLE_BUS } from '@/lib/campus-dashboard-buses'

// ── 공통 상수 ────────────────────────────────────────────
const DAYS = ['월', '화', '수', '목', '금'] as const
const GROUPS = ['유치부', '매일반', '3일반', '2일반'] as const
type Group = typeof GROUPS[number]

const BUS_COLORS = ['#F9A825','#E53935','#1565C0','#2E7D32','#6A1B9A','#D84315','#00838F','#37474F','#546E7A']
const DEPT_COLORS: Record<string, string> = {
  관리자:'#004EA2', 상담부:'#22C55E', FT:'#F97316', KT:'#8B5CF6',
  POLY안전선생님:'#06B6D4', 안전선생님:'#06B6D4',
  사서:'#F59E0B', 미화:'#EC4899', 원장:'#10B981', 기타:'#94A3B8',
}
const GROUP_COLORS: Record<string, string> = { '유치부':'#FF6B35', '매일반':'#2196F3', '3일반':'#4CAF50', '2일반':'#9C27B0' }
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual:'연차', half:'반차', quarter:'반반차', sick:'병가', official:'공가', special:'특별휴가',
}

// ── 통계분석 상수/유틸 ───────────────────────────────────
const GRADE_ORDER = ['5세','6세','7세','1학년','2학년','3학년','4학년','5학년','6학년']
const PRIVATE_SCHOOLS = new Set([
  // 서울/노원권
  '경희초등학교','광운초등학교','금성초등학교','동북초등학교','상명초등학교','영훈초등학교','청원초등학교','태강삼육초등학교','한신초등학교','화랑초등학교',
  // 고양/일산권
  '예일초등학교','경기글로벌스쿨',
])
const A_BG = '#F7F8FA'
const A_SURFACE = '#FFFFFF'
const A_SURFACE2 = '#F1F5F9'
const A_BORDER = '#E2E8F0'
const A_TEXT = '#1E293B'
const A_TEXT2 = '#64748B'
const A_TEXT3 = '#94A3B8'
const A_ACCENT = '#004EA2'
const A_GREEN = '#10B981'
const A_PURPLE = '#8B5CF6'
const A_CHART_GREEN = '#34D399'
const A_CHART_BLUE = '#3B82F6'
const A_R = 10, A_R2 = 14

interface DbStudent {
  id: string; name: string; english_name: string | null
  grade: string | null; school: string | null
  zip_code: string | null; address: string | null
  detail_address: string | null; apartment: string | null
  level: string; session: string
}
interface HistLog { type: string; effective_date: string }
interface TrendPoint { month: string; enrolled: number; withdrawn: number }
interface Processed { name: string; cls: string; level: string; school: string; grade: string; apt: string; dong: string; group: string; gradeNorm: string }

function normalizeGrade(raw: string | null | undefined): string {
  if (!raw) return '기타'
  const s = raw.trim()
  if (s === '5세') return '5세'
  if (s === '6세') return '6세'
  if (s === '7세') return '7세'
  if (s === '없음' || s.includes('유치')) return '유치부'
  if (s.includes('1학년') || s === '1') return '1학년'
  if (s.includes('2학년') || s === '2') return '2학년'
  if (s.includes('3학년') || s === '3') return '3학년'
  if (s.includes('4학년') || s === '4') return '4학년'
  if (s.includes('5학년') || s === '5') return '5학년'
  if (s.includes('6학년') || s === '6') return '6학년'
  if (s.includes('중등') || s.includes('중학')) return '중등부'
  if (s.includes('고등') || s.includes('고교')) return '고등부'
  return s || '기타'
}

function normalizeLevel(raw: string): string {
  if (!raw) return ''
  const t = raw.trim().toUpperCase()
  // ECP: M 접미사 보존 (ECP6M → ECP6M, ECP7M → ECP7M)
  const ecpM = t.match(/^(ECP\d+M?)/)
  if (ecpM) return ecpM[1]
  // Honors: 숫자 보존
  const honM = t.match(/^(HONORS\s*\d*)/)
  if (honM) return honM[1].replace(/\s+/g, '')
  // 나머지: 후행 알파벳 제거 (MGT1B → MGT1, GT2A → GT2)
  const m = t.match(/^([A-Z]+\d+)/)
  return m ? m[1] : raw.trim()
}

function levelSortKey(lv: string): number {
  const u = lv.toUpperCase()
  // ECP: 숫자 + M 여부 (ECP5=100, ECP6=110, ECP6M=111, ECP7=120, ECP7M=121)
  const ecpM = u.match(/^ECP(\d+)(M?)/)
  if (ecpM) return parseInt(ecpM[1]) * 10 + (ecpM[2] ? 1 : 0)
  // Honors: 맨 뒤 (HONORS2=9002, HONORS3=9003)
  const honM = u.match(/^HONORS(\d*)/)
  if (honM) return 9000 + (honM[1] ? parseInt(honM[1]) : 0)
  // GT→MGT→S→MAG→LX: 학년(숫자) × 100 + prefix 순서
  const ORDER: Record<string, number> = { GT: 0, MGT: 1, S: 2, MAG: 3, LX: 4 }
  const m = u.match(/^([A-Z]+)(\d+)/)
  if (m) {
    const pi = ORDER[m[1]] ?? 8
    return 100 + parseInt(m[2]) * 10 + pi
  }
  return 9999
}

function extractAptFromDetail(detail: string): string {
  const m = detail.match(/\([^,]+,\s*([^)]+)\)/)
  if (m) return m[1].trim().replace(/\s*\d+동.*/, '').trim() || '기타'
  return '기타'
}

function extractDongFromDetail(detail: string, addr: string): string {
  let m = detail.match(/\((\S+동)/)
  if (m) return m[1]
  m = addr.match(/(\S+동)/)
  if (m) return m[1]
  return '기타'
}

// ECP 레벨 → 유치부 나이 (ECP5=5세, ECP6/6M=6세, ECP7/7M/7I=7세). grade가 비어도 레벨로 유치부 판별.
function ecpAge(level: string | null | undefined): string | null {
  const m = (level || '').trim().toUpperCase().match(/^ECP(\d)/)
  if (!m) return null
  return m[1] === '5' ? '5세' : m[1] === '6' ? '6세' : m[1] === '7' ? '7세' : '유치부'
}

function ageGroup(grade: string, level?: string | null): string {
  if (ecpAge(level)) return '유치부'
  return ['5세','6세','7세','유치부'].includes(normalizeGrade(grade)) ? '유치부' : '초등부'
}

function processDb(students: DbStudent[]): Processed[] {
  return students.map(s => {
    const detail = s.detail_address || ''
    const addr = s.address || ''
    const apt = s.apartment || extractAptFromDetail(detail) || '기타'
    const dong = extractDongFromDetail(detail, addr)
    const gradeNorm = ecpAge(s.level) ?? normalizeGrade(s.grade)
    return {
      name: s.name, cls: s.session || '', level: s.level || '',
      school: s.school || '없음', grade: s.grade || '',
      apt: apt || '기타', dong, gradeNorm,
      group: ['5세','6세','7세','유치부'].includes(gradeNorm) ? '유치부' : '초등부',
    }
  })
}

function countBy(arr: Processed[], fn: (s: Processed) => string): [string, number][] {
  const m: Record<string, number> = {}
  arr.forEach(s => { const k = fn(s) || '기타'; m[k] = (m[k] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

// ── 공유 컴포넌트 ───────────────────────────────────────
function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin"/></div>
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
  const isNoShuttle = (name: string) => name === NO_SHUTTLE_BUS
  const busLabel = (name: string) => { if (isNoShuttle(name)) return '안탐'; const n = parseInt(name); return isNaN(n) ? name.slice(0,2) : `${n}호` }
  const busColor = (name: string) => { if (isNoShuttle(name)) return '#94A3B8'; const i = buses.findIndex(b => b.name === name); return BUS_COLORS[(i >= 0 ? i : 0) % BUS_COLORS.length] }
  // 차량안탐(미이용)은 정원 개념이 아니므로 초과/주의 경고 없이 회색으로만 표시
  const cellStyle = (n: number, name?: string): React.CSSProperties => (name && isNoShuttle(name))
    ? (n > 0 ? { color:'#64748B', fontWeight:700 } : { color:'#E2E8F0' })
    : n > BUS_MAX
    ? { color:'#EF4444', background:'#FEF2F2', fontWeight:900, borderRadius:3, padding:'1px 4px' }
    : n >= BUS_MAX - 2
      ? { color:'#D97706', background:'#FFFBEB', fontWeight:900, borderRadius:3, padding:'1px 4px' }
      : n > 0 ? { color:'#1E293B', fontWeight:700 } : { color:'#CBD5E1' }

  type GEntry = { group: Group; arrGrp: BusDayMap; depGrp: BusDayMap; groupBuses: Bus[]; activeDays: string[]; dayTag: string; hasOver: boolean; hasWarn: boolean }
  const groups: GEntry[] = GROUPS.flatMap<GEntry>(group => {
    const arrGrp = arrByGroup[group] ?? {}
    const depGrp = depByGroup[group] ?? {}
    const realBuses = sortedBuses.filter(b => DAYS.some(d => (arrGrp[b.name]?.[d]??0) > 0 || (depGrp[b.name]?.[d]??0) > 0))
    // 차량안탐(미이용) 합성 컬럼 — campus_buses에 없어도 표시 (맨 뒤)
    const hasNoShuttle = DAYS.some(d => (arrGrp[NO_SHUTTLE_BUS]?.[d]??0) > 0 || (depGrp[NO_SHUTTLE_BUS]?.[d]??0) > 0)
    const groupBuses = hasNoShuttle
      ? [...realBuses, { id: '__noshuttle__', name: NO_SHUTTLE_BUS, sort_order: 99999 }]
      : realBuses
    if (groupBuses.length === 0) return []
    const activeDays = DAYS.filter(d => groupBuses.some(b => (arrGrp[b.name]?.[d]??0) > 0 || (depGrp[b.name]?.[d]??0) > 0))
    const dayTag = activeDays.length === 5 ? '' : activeDays.join('')
    let hasOver = false, hasWarn = false
    for (const b of groupBuses) { if (b.name === NO_SHUTTLE_BUS) continue; for (const d of activeDays) {
      const v = (dir==='arr' ? arrGrp : depGrp)[b.name]?.[d] ?? 0
      if (v > BUS_MAX) hasOver = true; else if (v >= BUS_MAX-2) hasWarn = true
    } }
    return [{ group, arrGrp, depGrp, groupBuses, activeDays, dayTag, hasOver, hasWarn }]
  })

  if (groups.length === 0) return <p className="text-[11px] text-[#CBD5E1] text-center py-6">차량 데이터 없음</p>

  const colClass = groups.length <= 2 ? 'grid-cols-2' : groups.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className={`grid ${colClass} gap-2 flex-1 min-h-0`}>
        {groups.map(({ group, arrGrp, depGrp, groupBuses, activeDays, dayTag, hasOver, hasWarn }) => {
          const gColor = GROUP_COLORS[group]
          const grpMap = dir === 'arr' ? arrGrp : depGrp
          return (
            <div key={group} className="border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col">
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
                              <span style={cellStyle(n, b.name)}>{n > 0 ? n : '·'}</span>
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

function RankBars({ data, color, onClick }: { data: [string, number][]; color: string; onClick?: (label: string) => void }) {
  const max = Math.max(...data.map(([, v]) => v), 1)
  if (!data.length) return <p style={{ fontSize: 11, color: A_TEXT3, padding: '8px 0' }}>데이터 없음</p>
  // color를 기반으로 순위별 투명도 그라데이션
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  const [r, g, b] = hexToRgb(color)
  return (
    <div>
      {data.map(([label, val], idx) => {
        const opacity = 1 - (idx / (data.length + 2)) * 0.6
        const barColor = `rgba(${r},${g},${b},${opacity.toFixed(2)})`
        return (
          <div key={label} onClick={() => onClick?.(label)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, cursor: onClick ? 'pointer' : 'default', borderRadius: 4, padding: '1px 0' }}
            onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = '#F8FAFC' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}>
            <span style={{ fontSize: 10, color: A_TEXT2, width: 80, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <div style={{ flex: 1, height: 12, background: A_SURFACE2, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(val / max * 100)}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: 10, color: A_TEXT3, fontFamily: 'monospace', minWidth: 22, textAlign: 'right' }}>{val}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 대시보드 타입 ────────────────────────────────────────
interface DeptStat { dept:string; count:number; grantedDays:number; usedDays:number }
interface PendingReq { id:string; type:string; start_date:string; end_date:string; days_used:number; reason:string|null; created_at:string; signature_data_url:string|null; users:{name:string;position:string}|null }
interface HistoryReq { id:string; type:string; status:'approved'|'rejected'; start_date:string; end_date:string; days_used:number; reason:string|null; created_at:string; reviewer_note:string|null; signature_data_url:string|null; users:{name:string;position:string}|null }
interface Bus { id:string; name:string; sort_order:number }
type BusDayMap = Record<string, Record<string, number>>
interface ThisWeekLeave { id:string; user_id:string; type:string; start_date:string; end_date:string; days_used:number; users:{name:string;position:string}|null }

interface DashData {
  month: string
  roster: {
    uniqueStudents:number; totalClasses:number; sessionStats:{name:string; time_range:string|null; classCount:number; studentCount:number; group:string}[]
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

// ══════════════════════════════════════════════════════════
// 메인 페이지
// ══════════════════════════════════════════════════════════
export default function CampusDashboardPage() {
  // ── 탭 ──
  const [tab, setTab] = useState<'operation' | 'analytics' | 'report'>('analytics')

  // ── 운영 현황 state ──
  const [data, setData] = useState<DashData|null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [busDir, setBusDir] = useState<'arr'|'dep'>('arr')
  const [rejectingId, setRejectingId] = useState<string|null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processingId, setProcessingId] = useState<string|null>(null)

  // ── 통계분석 state ──
  const [dbStudents, setDbStudents] = useState<DbStudent[]>([])
  const [grandSessTotal, setGrandSessTotal] = useState<number | null>(null) // 수강건수 (개설반현황용)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [detailPopup, setDetailPopup] = useState<{ title: string; students: Processed[]; drillType?: string } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [showAllDongs, setShowAllDongs] = useState(false)
  const [showAllSchools, setShowAllSchools] = useState(false)
  const aptChartRef = useRef<HTMLCanvasElement>(null)
  const trendChartRef = useRef<HTMLCanvasElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartsRef = useRef<Record<string, any>>({})

  // 월별 입퇴소
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [totalEnrolled, setTotalEnrolled] = useState(0)
  const [totalWithdrawn, setTotalWithdrawn] = useState(0)
  const [trendLoading, setTrendLoading] = useState(true)
  const [dataMonth, setDataMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const dataMonthLabel = `${dataMonth.slice(0, 4)}년 ${Number(dataMonth.slice(5, 7))}월`

  // ── 운영 현황 fetch ──
  useEffect(() => {
    fetch(`/api/campus/dashboard?year=${year}`).then(r=>r.json()).then(setData)
  }, [year])

  // ── 통계분석 fetch ──
  useEffect(() => {
    fetch('/api/campus/analytics').then(r => r.json()).then(d => {
      setDbStudents(d.students ?? [])
      if (d.grandSessTotal != null) setGrandSessTotal(d.grandSessTotal)
      setAnalyticsLoading(false)
    })
  }, [])

  // ── 월별 입퇴소 fetch ──
  useEffect(() => {
    fetch('/api/campus/class-roster/history').then(r => r.json()).then(d => {
      const logs: HistLog[] = (d.logs ?? []).filter((l: HistLog) => l.type === 'enrolled' || l.type === 'withdrawn')
      setTotalEnrolled(logs.filter(l => l.type === 'enrolled').length)
      setTotalWithdrawn(logs.filter(l => l.type === 'withdrawn').length)
      const monthMap: Record<string, { enrolled: number; withdrawn: number }> = {}
      for (const log of logs) {
        const m = (log.effective_date ?? '').slice(0, 7)
        if (!m) continue
        if (!monthMap[m]) monthMap[m] = { enrolled: 0, withdrawn: 0 }
        if (log.type === 'enrolled') monthMap[m].enrolled++
        else monthMap[m].withdrawn++
      }
      const months = Object.keys(monthMap).sort()
      const latestMonth = months.length > 0 ? months[months.length - 1] : new Date().toISOString().slice(0, 7)
      setDataMonth(latestMonth)
      setTrendData(months.slice(-10).map(m => ({ month: m, ...monthMap[m] })))
      setTrendLoading(false)
    }).catch(() => setTrendLoading(false))
  }, [])

  // ── Chart.js 사전 로드 ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartModRef = useRef<any>(null)
  useEffect(() => {
    import('chart.js').then(mod => { chartModRef.current = mod })
  }, [])

  // ── Chart.js 렌더링 (아파트 + 입퇴소만) ──
  useEffect(() => {
    if (analyticsLoading || tab !== 'analytics') return
    const processed = processDb(dbStudents)

    function renderCharts() {
      const mod = chartModRef.current
      if (!mod || !aptChartRef.current) {
        return setTimeout(renderCharts, 50)
      }
      const { Chart, registerables } = mod
      Chart.register(...registerables)

      if (aptChartRef.current) {
        chartsRef.current['apt']?.destroy()
        const aptCnts = countBy(processed, s => s.apt).filter(([k]) => k !== '기타')
        const top15 = aptCnts.slice(0, 15).map(([k]) => k)
        // 아파트별 동 매핑
        const localAptDong: Record<string, string> = {}
        for (const s of processed) {
          if (s.apt && s.apt !== '기타' && s.dong && s.dong !== '기타') localAptDong[s.apt] = s.dong
        }
        const labels15 = top15.map(apt => {
          const d = localAptDong[apt]
          return d && d !== '기타' ? `${apt} (${d})` : apt
        })
        // 동별 색상 매핑
        const APT_DONG_COLORS: Record<string, string> = {}
        const DONG_PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316']
        const dongSet = [...new Set(top15.map(a => localAptDong[a] || '기타'))]
        dongSet.forEach((d, i) => { APT_DONG_COLORS[d] = DONG_PALETTE[i % DONG_PALETTE.length] })
        const barColorsYuchi = top15.map(apt => {
          const base = APT_DONG_COLORS[localAptDong[apt] || '기타'] || '#94A3B8'
          const h = base.replace('#','')
          const [cr,cg,cb] = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
          return `rgba(${cr},${cg},${cb},0.45)`
        })
        const barColorsChodeung = top15.map(apt => {
          const base = APT_DONG_COLORS[localAptDong[apt] || '기타'] || '#94A3B8'
          const h = base.replace('#','')
          const [cr,cg,cb] = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
          return `rgba(${cr},${cg},${cb},0.85)`
        })
        chartsRef.current['apt'] = new Chart(aptChartRef.current, {
          type: 'bar',
          data: {
            labels: labels15,
            datasets: [
              { label: '유치부', data: top15.map(apt => processed.filter(s => s.apt === apt && s.group === '유치부').length), backgroundColor: barColorsYuchi, borderRadius: 3 },
              { label: '초등부', data: top15.map(apt => processed.filter(s => s.apt === apt && s.group === '초등부').length), backgroundColor: barColorsChodeung, borderRadius: 3 }
            ]
          },
          options: {
            indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.x}명` } } },
            scales: {
              x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: A_TEXT3, font: { size: 9 } } },
              y: { stacked: true, grid: { display: false }, ticks: { color: A_TEXT2, font: { size: 9 } } }
            }
          }
        })
      }

      // 월별 입퇴소 — 심플 바 차트
      if (trendChartRef.current && trendData.length > 0) {
        chartsRef.current['trend']?.destroy()
        const labels = trendData.map(d => `${Number(d.month.slice(5, 7))}월`)
        const enrolledData = trendData.map(d => d.enrolled)
        const withdrawnData = trendData.map(d => -d.withdrawn)
        const netData = trendData.map(d => d.enrolled - d.withdrawn)

        chartsRef.current['trend'] = new Chart(trendChartRef.current, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { type: 'bar' as const, label: '입소', data: enrolledData, backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 4, barPercentage: 0.5, categoryPercentage: 0.7, order: 2 },
              { type: 'bar' as const, label: '퇴소', data: withdrawnData, backgroundColor: 'rgba(239,68,68,0.8)', borderRadius: 4, barPercentage: 0.5, categoryPercentage: 0.7, order: 2 },
              { type: 'line' as const, label: '순증감', data: netData, borderColor: '#3B82F6', pointBackgroundColor: '#3B82F6', pointRadius: 4, pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 2.5, tension: 0.3, order: 1, fill: false },
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index' as const, intersect: false },
            plugins: {
              legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 8, font: { size: 9 }, color: A_TEXT2 } },
              tooltip: {
                backgroundColor: 'rgba(30,41,59,0.95)', titleFont: { size: 10 }, bodyFont: { size: 10 }, padding: 8,
                callbacks: {
                  label: (c: any) => {
                    const idx = c.dataIndex
                    const d = trendData[idx]
                    if (c.datasetIndex === 0) return ` 입소: +${d.enrolled}명`
                    if (c.datasetIndex === 1) return ` 퇴소: -${d.withdrawn}명`
                    const net = d.enrolled - d.withdrawn
                    return ` 순증감: ${net >= 0 ? '+' : ''}${net}명`
                  }
                }
              }
            },
            scales: {
              y: {
                grid: { color: 'rgba(0,0,0,0.04)' },
                ticks: { color: A_TEXT3, font: { size: 9 }, callback: (v: any) => Math.abs(v) },
                afterDataLimits: (scale: any) => { const abs = Math.max(Math.abs(scale.min), Math.abs(scale.max)); scale.min = -abs; scale.max = abs }
              },
              x: { grid: { display: false }, ticks: { color: A_TEXT2, font: { size: 9 } } }
            }
          }
        })
      }
    }
    const timerId = renderCharts()

    return () => {
      if (timerId) clearTimeout(timerId)
      Object.values(chartsRef.current).forEach(c => { try { (c as any)?.destroy() } catch { /* ignore */ } })
      chartsRef.current = {}
    }
  }, [dbStudents, analyticsLoading, tab, trendData])

  // ── 핸들러 ──
  async function handleApproval(id: string, status: 'approved'|'rejected', note?: string) {
    setProcessingId(id)
    try {
      await fetch(`/api/campus/approvals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_note: note ?? null }),
      })
      const res = await fetch(`/api/campus/dashboard?year=${year}`)
      setData(await res.json())
    } finally { setProcessingId(null); setRejectingId(null); setRejectNote('') }
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
      ].map(v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g,'""')}"` }).join(',')
    })
    const csv = '\uFEFF' + [HEADERS.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `연차내역_${year}.csv`
    a.click()
  }

  if (!data) return <Spinner />

  const { buses, arrByGroup, depByGroup, leave, today, thisWeekLeave } = data


  // ── 이번 주 캘린더 ──
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

  // ── 통계분석 가공 ──
  const processed = processDb(dbStudents)
  // 고유 학생 수 기준 (수강건수가 아닌 student_id 기준 중복 제거)
  const total = processed.length
  const yuchi = processed.filter(s => s.group === '유치부').length
  const chodeung = processed.filter(s => s.group === '초등부').length
  const elemStudents = processed.filter(s => s.group === '초등부')
  const privateCount = elemStudents.filter(s => PRIVATE_SCHOOLS.has(s.school)).length
  const publicCount = elemStudents.length - privateCount
  const privateRate = elemStudents.length > 0 ? Math.round(privateCount / elemStudents.length * 100) : 0
  const dongDataAll = countBy(processed, s => s.dong).filter(([k]) => k !== '기타')
  const schoolDataAll = countBy(processed, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
  const dongData = showAllDongs ? dongDataAll : dongDataAll.slice(0, 10)
  const schoolData = showAllSchools ? schoolDataAll : schoolDataAll.slice(0, 10)
  const aptCounts = countBy(processed, s => s.apt).filter(([k]) => k !== '기타')
  const top10Apts = aptCounts.slice(0, 10).map(([k]) => k)
  const gradeMap: Record<string, number> = {}
  processed.forEach(s => { gradeMap[s.gradeNorm] = (gradeMap[s.gradeNorm] || 0) + 1 })
  const crossGrades = GRADE_ORDER.filter(g => gradeMap[g])
  const maxCrossCell = Math.max(1, ...top10Apts.flatMap(apt => crossGrades.map(g => processed.filter(s => s.apt === apt && s.gradeNorm === g).length)))
  const topDong = dongData[0]
  // 아파트 → 동 매핑 (최다 학생 기준)
  const aptDongMap: Record<string, string> = {}
  for (const s of processed) {
    if (s.apt && s.apt !== '기타' && s.dong && s.dong !== '기타') aptDongMap[s.apt] = s.dong
  }
  // 레벨 전체 데이터 (정렬: ECP5→ECP6→ECP6M→...→GT1→GT2→...→MGT1→...→S1→...→MAG1→...→Honors2→Honors3)
  const allLevels = countBy(processed, s => normalizeLevel(s.level)).filter(([k]) => k && k !== '기타').sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0]))

  const card = { background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: A_R, padding: '10px 12px' }
  return (
    <div className="flex flex-col gap-0 h-full">
      {/* ══════ 헤더 + 탭 ══════ */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-lg font-bold text-[#1E293B]">캠퍼스 대시보드</h1>
            <p className="text-[11px] text-[#94A3B8]">{data.month} 기준</p>
          </div>
          <div />
        </div>

        {/* 탭 버튼 */}
        <div className="flex gap-1 bg-[#F1F5F9] p-1 rounded-xl">
          {([
            { key: 'analytics' as const, label: '캠퍼스 현황', icon: '📊' },
            { key: 'report' as const, label: '캠퍼스 세부 분석', icon: '📈' },
            { key: 'operation' as const, label: '운영 현황', icon: '📋' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-white text-[#1E293B] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#64748B]'
              }`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.key === 'operation' && leave.pendingCount > 0 && (
                <span className="text-[8px] font-black text-white bg-[#EF4444] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">{leave.pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════ 탭1: 운영 현황 ══════ */}
      {tab === 'operation' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">

          {/* ── 연차 현황 ── */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F1F5F9]" style={{ borderLeftColor:'#004EA2', borderLeftWidth:3 }}>
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <span className="text-sm font-bold text-[#1E293B]">연차 현황</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#64748B]">직원 <b>{leave.totalEmployees}</b>명</span>
                {leave.pendingCount > 0 && (
                  <span className="text-[9px] font-bold text-white bg-[#D97706] px-1.5 py-0.5 rounded-full">승인대기 {leave.pendingCount}</span>
                )}
              </div>
            </div>
            <div className="p-4">
              {/* 이번 주 연차 */}
              <div className="mb-4 pb-4 border-b border-[#F1F5F9]">
                <p className="text-[11px] font-bold text-[#64748B] mb-2">📅 이번 주 연차</p>
                {Object.values(leaveByDay).every(a => a.length === 0) ? (
                  <p className="text-[11px] text-[#CBD5E1] text-center py-3 bg-[#F8FAFC] rounded-lg">이번 주 연차 없음</p>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5">
                    {weekDays.map(wd => {
                      const isToday = wd.date === today.date
                      const people = leaveByDay[wd.date] ?? []
                      return (
                        <div key={wd.date} className={`rounded-xl p-2 ${isToday ? 'bg-[#EFF6FF] border-2 border-[#BFDBFE]' : 'bg-[#F8FAFC] border border-[#E2E8F0]'}`}>
                          <div className={`text-[10px] font-bold text-center mb-1.5 ${isToday ? 'text-[#2563eb]' : 'text-[#94A3B8]'}`}>
                            {wd.label} <span className="font-normal text-[9px]">{wd.monthDay.slice(wd.monthDay.indexOf('/')+1)}일</span>
                          </div>
                          <div className="space-y-1 min-h-[18px]">
                            {people.map(p => (
                              <div key={p.name} className="text-[8px] font-semibold text-white rounded-md px-1 py-1 truncate text-center"
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

              {/* 대기 + 승인내역 달력 */}
              {(() => {
                const now = new Date()
                const curYear = now.getFullYear()
                const curMonthIdx = now.getMonth()
                const daysInMonth = new Date(curYear, curMonthIdx + 1, 0).getDate()
                const approvedHistory = leave.leaveHistory.filter(r => r.status === 'approved')
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
                const weekdays = Object.keys(calMap).sort()
                const weeks: string[][] = []
                let week: string[] = []
                for (const ds of weekdays) {
                  const dow = new Date(ds + 'T00:00:00').getDay()
                  if (dow === 1 && week.length > 0) { weeks.push(week); week = [] }
                  week.push(ds)
                }
                if (week.length > 0) weeks.push(week)

                return (
                  <div className="grid grid-cols-2 gap-5">
                    {/* 왼쪽: 승인 대기 */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-bold text-[#D97706]">승인 대기</span>
                        {leave.pendingCount > 0 && <span className="text-[8px] font-black text-white bg-[#D97706] px-1 py-0.5 rounded-full">{leave.pendingCount}</span>}
                      </div>
                      {leave.pendingRequests.length === 0 ? (
                        <p className="text-[11px] text-[#CBD5E1] text-center py-6 bg-[#F8FAFC] rounded-xl">대기 없음</p>
                      ) : (
                        <div className="space-y-1.5">
                          {leave.pendingRequests.map(r => {
                            const u = Array.isArray(r.users) ? (r.users as {name:string;position:string}[])[0] : r.users
                            const color = DEPT_COLORS[u?.position??''] ?? '#94A3B8'
                            const isProcessing = processingId === r.id
                            const isRejecting = rejectingId === r.id
                            const days = r.type === 'quarter' ? 0.25 : r.days_used
                            return (
                              <div key={r.id} className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl overflow-hidden">
                                <button
                                  onClick={() => downloadLeaveForm({
                                    name: u?.name ?? '-', position: u?.position ?? '',
                                    typeLabel: LEAVE_TYPE_LABELS[r.type] ?? r.type,
                                    start_date: r.start_date, end_date: r.end_date, days_used: days,
                                    reason: r.reason, created_at: r.created_at, signature_data_url: r.signature_data_url,
                                  } as LeaveFormData)}
                                  className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[#FEF9C3] transition-colors">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}}/>
                                  <span className="font-bold text-[12px] text-[#1E293B] flex-shrink-0">{u?.name??'-'}</span>
                                  <span className="text-[9px] text-[#D97706] font-bold bg-[#FEF3C7] px-1.5 py-0.5 rounded flex-shrink-0">{LEAVE_TYPE_LABELS[r.type]??r.type}</span>
                                  <span className="text-[9px] text-[#64748B] truncate">
                                    {r.start_date.slice(5)}{r.start_date!==r.end_date?`~${r.end_date.slice(5)}`:''} ({days}일)
                                  </span>
                                </button>
                                <div className="flex items-center gap-1.5 px-3 pb-2">
                                  <button disabled={isProcessing}
                                    onClick={() => handleApproval(r.id, 'approved')}
                                    className="flex-1 text-[10px] py-1 rounded-lg bg-[#10B981] text-white font-bold hover:bg-[#059669] disabled:opacity-50 transition-colors">
                                    {isProcessing && !isRejecting ? '...' : '승인'}
                                  </button>
                                  <button disabled={isProcessing}
                                    onClick={() => { setRejectingId(isRejecting ? null : r.id); setRejectNote('') }}
                                    className="flex-1 text-[10px] py-1 rounded-lg bg-[#EF4444] text-white font-bold hover:bg-[#DC2626] disabled:opacity-50 transition-colors">
                                    거부
                                  </button>
                                </div>
                                {isRejecting && (
                                  <div className="px-3 pb-2 flex items-center gap-1">
                                    <input type="text" value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                                      placeholder="반려 사유"
                                      className="flex-1 text-[10px] border border-[#FCA5A5] rounded-lg px-2 py-1 bg-white focus:outline-none"/>
                                    <button disabled={isProcessing}
                                      onClick={() => handleApproval(r.id, 'rejected', rejectNote)}
                                      className="text-[10px] px-2 py-1 rounded-lg bg-[#EF4444] text-white font-bold disabled:opacity-50 flex-shrink-0 transition-colors">
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
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-[#004EA2]">{curMonthIdx+1}월 승인내역</span>
                        {leave.leaveHistory.length > 0 && (
                          <button onClick={() => downloadHistory(leave.leaveHistory)}
                            className="text-[9px] font-semibold text-[#64748B] hover:text-[#004EA2] px-2 py-0.5 border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] transition-colors">
                            ⬇ CSV
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-px mb-1">
                        {['월','화','수','목','금'].map(d => (
                          <div key={d} className="text-center text-[8px] font-bold text-[#CBD5E1]">{d}</div>
                        ))}
                      </div>
                      {weeks.length === 0 ? (
                        <p className="text-[10px] text-[#CBD5E1] text-center py-4">내역 없음</p>
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
                                  if (!ds) return <div key={ci} style={{minHeight: isThisWeek ? 36 : 28}}/>
                                  const people = calMap[ds] ?? []
                                  const isToday = ds === today.date
                                  return (
                                    <div key={ds} className={`rounded p-0.5 ${isToday ? 'bg-[#DBEAFE] ring-1 ring-[#93C5FD]' : people.length > 0 && isThisWeek ? 'bg-[#EFF6FF]' : people.length > 0 ? 'bg-[#F8FAFC]' : ''}`}
                                      style={{minHeight: isThisWeek ? 36 : 28}}>
                                      <div className={`text-center leading-tight mb-0.5 ${isThisWeek ? 'text-[8px]' : 'text-[7px]'} font-bold ${isToday ? 'text-[#2563eb]' : isThisWeek ? 'text-[#64748B]' : 'text-[#CBD5E1]'}`}>
                                        {Number(ds.slice(8))}
                                      </div>
                                      <div className="space-y-px">
                                        {people.map(p => {
                                          const uu = Array.isArray(p.record.users) ? (p.record.users as {name:string;position:string}[])[0] : p.record.users
                                          const dayCount = p.record.type === 'quarter' ? 0.25 : p.record.days_used
                                          return (
                                            <button key={p.name}
                                              onClick={() => downloadLeaveForm({
                                                name: uu?.name ?? p.name, position: uu?.position ?? p.position,
                                                typeLabel: LEAVE_TYPE_LABELS[p.type] ?? p.type,
                                                start_date: p.record.start_date, end_date: p.record.end_date,
                                                days_used: dayCount, reason: p.record.reason,
                                                created_at: p.record.created_at, signature_data_url: p.record.signature_data_url,
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
            </div>
          </div>

          {/* ── 호차별 탑승 현황 ── */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F1F5F9] flex-shrink-0" style={{ borderLeftColor:'#2563eb', borderLeftWidth:3 }}>
              <div className="flex items-center gap-2">
                <span className="text-base">🚌</span>
                <span className="text-sm font-bold text-[#1E293B]">호차별 탑승 현황</span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['arr','dep'] as const).map(d => (
                  <button key={d} onClick={() => setBusDir(d)}
                    className={`text-[10px] font-bold px-3 py-1 rounded-full transition-colors ${busDir===d ? (d==='arr' ? 'bg-[#2563eb] text-white' : 'bg-[#dc2626] text-white') : 'text-[#94A3B8] hover:bg-[#F1F5F9]'}`}>
                    {d==='arr' ? '등원' : '하원'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <BusCapacityCards arrByGroup={arrByGroup} depByGroup={depByGroup} buses={buses} dir={busDir} />
            </div>
          </div>
        </div>
      )}

      {/* ══════ 탭2: 캠퍼스 현황 ══════ */}
      {tab === 'analytics' && (
        <div style={{ background: A_BG, fontFamily: "'Noto Sans KR', sans-serif", color: A_TEXT }}>

          {analyticsLoading ? <Spinner /> : (
            <>
              {/* KPI 카드 — 컴팩트 4칸 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
                {[
                  { label: '총 학생', val: `${total}`, unit: '명', color: A_ACCENT, bg: '#EAF2FB' },
                  { label: '초등부', val: `${chodeung}`, unit: '명', color: A_CHART_BLUE, bg: '#EFF6FF' },
                  { label: '유치부', val: `${yuchi}`, unit: '명', color: A_GREEN, bg: '#F0FDF4' },
                  { label: '사립초 비율', val: `${privateRate}`, unit: '%', color: '#F97316', bg: '#FFF7ED' },
                ].map(k => (
                  <div key={k.label}
                    onClick={() => {
                      if (k.label === '사립초 비율') { setListOpen(false); setDetailPopup({ title: '사립초 비율 분석', students: elemStudents, drillType: 'school-type' }) }
                    }}
                    style={{ background: k.bg, border: `1px solid ${A_BORDER}`, borderRadius: 8, padding: '4px 10px', borderLeft: `3px solid ${k.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: k.label === '사립초 비율' ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 10, color: k.color, fontWeight: 700 }}>{k.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: A_TEXT }}>{k.val}<span style={{ fontSize: 9, fontWeight: 500, color: A_TEXT2 }}>{k.unit}</span></span>
                  </div>
                ))}
              </div>

              {/* ROW 1: 학년별 + 동별 + 학교별 + 레벨별 (4열, 레벨 2단) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr', gap: 6, marginBottom: 8 }}>
                <div style={{ ...card, borderTop: '2px solid #3B82F6' }}>
                  <h3 style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: '#3B82F6' }}>학년별 학생수</h3>
                  <RankBars
                    data={GRADE_ORDER.filter(g => gradeMap[g]).map(g => [g, gradeMap[g]] as [string, number])}
                    color="#3B82F6"
                    onClick={label => { setListOpen(false); setDetailPopup({ title: `${label} 학생 분석`, students: processed.filter(s => s.gradeNorm === label), drillType: ['5세','6세','7세'].includes(label) ? 'grade-yuchi' : 'grade-elem' }) }}
                  />
                </div>
                <div style={{ ...card, borderTop: '2px solid #0891B2' }}>
                  <h3 onClick={() => setShowAllDongs(v => !v)}
                    style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: '#0891B2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    동별 거주 {showAllDongs ? '전체' : 'Top 10'} <span style={{ fontWeight: 500, color: A_TEXT3 }}>({dongDataAll.length}개동)</span>
                    <span style={{ fontSize: 8, color: A_TEXT3 }}>{showAllDongs ? '▲' : '▼'}</span>
                  </h3>
                  <div style={{ maxHeight: showAllDongs ? 400 : undefined, overflowY: showAllDongs ? 'auto' : undefined }}>
                    <RankBars data={dongData} color="#0891B2"
                      onClick={label => { setListOpen(false); setDetailPopup({ title: `${label} 학생 분석`, students: processed.filter(s => s.dong === label), drillType: 'dong' }) }}
                    />
                  </div>
                </div>
                <div style={{ ...card, borderTop: '2px solid #10B981' }}>
                  <h3 onClick={() => setShowAllSchools(v => !v)}
                    style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: '#10B981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    학교별 학생 {showAllSchools ? '전체' : 'Top 10'} <span style={{ fontWeight: 500, color: A_TEXT3 }}>({schoolDataAll.length}개교)</span>
                    <span style={{ fontSize: 8, color: A_TEXT3 }}>{showAllSchools ? '▲' : '▼'}</span>
                  </h3>
                  <div style={{ maxHeight: showAllSchools ? 400 : undefined, overflowY: showAllSchools ? 'auto' : undefined }}>
                    <RankBars data={schoolData} color="#10B981"
                      onClick={label => { setListOpen(false); setDetailPopup({ title: `${label} 학생 분석`, students: processed.filter(s => s.school === label), drillType: 'school' }) }}
                    />
                  </div>
                </div>
                <div style={{ ...card, borderTop: `2px solid ${A_PURPLE}` }}>
                  <h3 style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: A_PURPLE }}>레벨별 학생수 <span style={{ fontWeight: 500, color: A_TEXT3 }}>({allLevels.length})</span></h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <RankBars
                      data={allLevels.slice(0, Math.ceil(allLevels.length / 2))}
                      color={A_PURPLE}
                      onClick={label => { setListOpen(false); setDetailPopup({ title: `${label} 학생 분석`, students: processed.filter(s => normalizeLevel(s.level) === label), drillType: /^ECP/i.test(label) ? undefined : 'level' }) }}
                    />
                    <RankBars
                      data={allLevels.slice(Math.ceil(allLevels.length / 2))}
                      color={A_PURPLE}
                      onClick={label => { setListOpen(false); setDetailPopup({ title: `${label} 학생 분석`, students: processed.filter(s => normalizeLevel(s.level) === label), drillType: /^ECP/i.test(label) ? undefined : 'level' }) }}
                    />
                  </div>
                </div>
              </div>

              {/* ROW 2: 아파트별 + 크로스테이블 + 입퇴소 (3열) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 0.9fr', gap: 6 }}>
                <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontSize: 10, fontWeight: 700, color: A_TEXT2 }}>아파트별 학생수</h3>
                    <div style={{ display: 'flex', gap: 4, fontSize: 8, color: A_TEXT3 }}>
                      <span style={{ opacity: 0.45 }}>■</span><span>유치</span>
                      <span style={{ opacity: 0.85 }}>■</span><span>초등</span>
                    </div>
                  </div>
                  {(() => {
                    const DONG_PAL = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316']
                    const dongs = [...new Set(aptCounts.slice(0,15).map(([k]) => aptDongMap[k] || '기타'))]
                    return (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        {dongs.map((d, i) => (
                          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 8, color: A_TEXT3 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: DONG_PAL[i % DONG_PAL.length], display: 'inline-block' }} />
                            {d}
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                  <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 200 }}>
                    <canvas ref={aptChartRef} />
                  </div>
                </div>
                <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, color: A_TEXT2 }}>아파트 × 학년 크로스</h3>
                  <div style={{ overflowX: 'auto' }}>
                    {(() => {
                      // 동별로 아파트 그룹핑
                      const dongGroups: Record<string, string[]> = {}
                      for (const apt of top10Apts) {
                        const d = aptDongMap[apt] || '기타'
                        if (!dongGroups[d]) dongGroups[d] = []
                        dongGroups[d].push(apt)
                      }
                      const DONG_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316']
                      const dongNames = Object.keys(dongGroups)
                      const dongColorMap: Record<string, string> = {}
                      dongNames.forEach((d, i) => { dongColorMap[d] = DONG_COLORS[i % DONG_COLORS.length] })
                      return (
                        <>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            {dongNames.map(d => (
                              <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 8, color: A_TEXT3 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dongColorMap[d], display: 'inline-block' }} />
                                {d}
                              </span>
                            ))}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, minWidth: 280 }}>
                            <thead>
                              <tr>
                                <th style={{ background: A_SURFACE2, fontWeight: 600, color: A_TEXT2, padding: '5px 6px', textAlign: 'left', borderBottom: `1px solid ${A_BORDER}`, fontSize: 9 }}>아파트</th>
                                {crossGrades.map(g => <th key={g} style={{ background: A_SURFACE2, fontWeight: 600, color: A_TEXT2, padding: '5px 3px', textAlign: 'center', borderBottom: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 8 }}>{g.replace('학년','')}</th>)}
                                <th style={{ background: A_SURFACE2, fontWeight: 600, color: A_TEXT2, padding: '5px 4px', textAlign: 'center', borderBottom: `1px solid ${A_BORDER}`, fontSize: 8 }}>계</th>
                              </tr>
                            </thead>
                            <tbody>
                              {top10Apts.map(apt => {
                                const dong = aptDongMap[apt] || '기타'
                                const dColor = dongColorMap[dong] || A_TEXT3
                                const rowTotal = crossGrades.reduce((s, g) => s + processed.filter(r => r.apt === apt && r.gradeNorm === g).length, 0)
                                return (
                                  <tr key={apt} style={{ borderBottom: `1px solid ${A_BORDER}` }}>
                                    <td style={{ padding: '4px 6px', fontSize: 9 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
                                        <span style={{ color: A_TEXT2, fontWeight: 500 }}>{apt}</span>
                                      </div>
                                    </td>
                                    {crossGrades.map(g => {
                                      const v = processed.filter(s => s.apt === apt && s.gradeNorm === g).length
                                      const isY = ['5세','6세','7세'].includes(g)
                                      const alpha = v > 0 ? 0.15 + 0.4 * (v / maxCrossCell) : 0
                                      const bgColor = isY ? `rgba(52,211,153,${alpha})` : `rgba(59,130,246,${alpha})`
                                      return <td key={g} style={{ padding: '4px 3px', textAlign: 'center', color: v ? A_TEXT : A_TEXT3, fontWeight: v ? 600 : 400, background: bgColor, fontSize: 9 }}>{v || '·'}</td>
                                    })}
                                    <td style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 700, color: A_ACCENT, fontSize: 9 }}>{rowTotal}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </>
                      )
                    })()}
                  </div>
                </div>
                <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h3 style={{ fontSize: 10, fontWeight: 700, color: A_TEXT2 }}>월별 입퇴소</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9 }}>
                      <span style={{ color: '#059669', fontWeight: 700 }}>+{totalEnrolled}</span>
                      <span style={{ color: '#EF4444', fontWeight: 700 }}>-{totalWithdrawn}</span>
                      <span style={{ color: '#3B82F6', fontWeight: 700 }}>순{totalEnrolled - totalWithdrawn >= 0 ? '+' : ''}{totalEnrolled - totalWithdrawn}</span>
                    </div>
                  </div>
                  {trendLoading
                    ? <div style={{ textAlign: 'center', padding: 30, flex: 1 }}><div style={{ width: 20, height: 20, border: '3px solid #004EA2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} /></div>
                    : <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 200 }}><canvas ref={trendChartRef} /></div>
                  }
                </div>
              </div>
            </>
          )}

          {/* 학생 분석 팝업 */}
          {detailPopup && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setDetailPopup(null)}>
              <div style={{ background: '#fff', borderRadius: 16, width: detailPopup.drillType ? 720 : 560, maxWidth: '95vw', maxHeight: '85vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${A_BORDER}` }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: A_TEXT }}>{detailPopup.title} <span style={{ fontSize: 12, fontWeight: 500, color: A_TEXT2 }}>({detailPopup.students.length}명)</span></h3>
                  <button onClick={() => setDetailPopup(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#F1F5F9', cursor: 'pointer', fontSize: 14, color: A_TEXT2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 56px)' }}>

                  {/* ── 분석 차트 영역 ── */}
                  {detailPopup.drillType && (() => {
                    const ss = detailPopup.students
                    const dt = detailPopup.drillType
                    return (
                      <div style={{ padding: '12px 20px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                        {/* grade-yuchi: 동별 + 아파트별 + 동×아파트 크로스 */}
                        {dt === 'grade-yuchi' && (() => {
                          const dongCounts = countBy(ss, s => s.dong).filter(([k]) => k !== '기타')
                          const aptCnts = countBy(ss, s => s.apt).filter(([k]) => k !== '기타')
                          const dongs = dongCounts.map(([k]) => k)
                          return (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#0891B2', marginBottom: 8 }}>동별 분포</h4>
                                  <RankBars data={dongCounts} color="#0891B2" />
                                </div>
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#8B5CF6', marginBottom: 8 }}>아파트별 분포</h4>
                                  <RankBars data={aptCnts.slice(0, 10)} color="#8B5CF6" />
                                </div>
                              </div>
                              {dongs.length > 0 && (
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: A_TEXT2, marginBottom: 8 }}>동 × 아파트</h4>
                                  <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ background: A_SURFACE2, padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A_TEXT2, borderBottom: `1px solid ${A_BORDER}` }}>동</th>
                                          {aptCnts.slice(0, 8).map(([a]) => <th key={a} style={{ background: A_SURFACE2, padding: '6px 4px', textAlign: 'center', fontWeight: 600, color: A_TEXT2, borderBottom: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 9 }}>{a}</th>)}
                                          <th style={{ background: A_SURFACE2, padding: '6px 4px', textAlign: 'center', fontWeight: 700, color: A_ACCENT, borderBottom: `1px solid ${A_BORDER}` }}>계</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {dongs.map(dong => {
                                          const rowT = ss.filter(s => s.dong === dong).length
                                          return (
                                            <tr key={dong} style={{ borderBottom: `1px solid ${A_BORDER}` }}>
                                              <td style={{ padding: '5px 8px', fontWeight: 600, color: A_TEXT2, whiteSpace: 'nowrap' }}>{dong}</td>
                                              {aptCnts.slice(0, 8).map(([a]) => {
                                                const v = ss.filter(s => s.dong === dong && s.apt === a).length
                                                return <td key={a} style={{ padding: '5px 4px', textAlign: 'center', color: v ? A_TEXT : A_TEXT3, fontWeight: v ? 600 : 400, background: v ? `rgba(139,92,246,${(0.08 + 0.12 * v).toFixed(2)})` : 'transparent' }}>{v || '·'}</td>
                                              })}
                                              <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 700, color: A_ACCENT }}>{rowT}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        })()}

                        {/* grade-elem: 학교별 + 동별 + 아파트별 */}
                        {dt === 'grade-elem' && (() => {
                          const schoolCnts = countBy(ss, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
                          const dongCounts = countBy(ss, s => s.dong).filter(([k]) => k !== '기타')
                          const aptCnts = countBy(ss, s => s.apt).filter(([k]) => k !== '기타')
                          return (
                            <>
                              <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                <h4 style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>학교별 분포</h4>
                                <RankBars data={schoolCnts.slice(0, 8)} color="#10B981" />
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#0891B2', marginBottom: 8 }}>동별 분포</h4>
                                  <RankBars data={dongCounts} color="#0891B2" />
                                </div>
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#8B5CF6', marginBottom: 8 }}>아파트별 분포</h4>
                                  <RankBars data={aptCnts.slice(0, 10)} color="#8B5CF6" />
                                </div>
                              </div>
                            </>
                          )
                        })()}

                        {/* dong: 학교별 분포 */}
                        {dt === 'dong' && (() => {
                          const schoolCnts = countBy(ss, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
                          return (
                            <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>학교별 분포</h4>
                              <RankBars data={schoolCnts} color="#10B981" />
                            </div>
                          )
                        })()}

                        {/* level: 학교별 도넛 (ECP 제외) */}
                        {dt === 'level' && (() => {
                          const schoolCnts = countBy(ss, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
                          const total = schoolCnts.reduce((s, [, v]) => s + v, 0)
                          const SCH_PAL = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1','#84CC16','#D946EF']
                          const top5etc = (arr: [string,number][]): [string,number][] => {
                            const top = arr.slice(0, 7)
                            const rest = arr.slice(7).reduce((s,[,v]) => s + v, 0)
                            return rest > 0 ? [...top, ['기타', rest]] : top
                          }
                          const display = top5etc(schoolCnts)
                          let cum = 0
                          return (
                            <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
                              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 12 }}>학교별 분포</h4>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                <svg viewBox="0 0 100 100" width={180} height={180} style={{ flexShrink: 0 }}>
                                  {display.map(([label, val], i) => {
                                    const angle = (val / total) * 360
                                    const sd = cum; cum += angle
                                    const a1 = (sd - 90) * Math.PI / 180
                                    const a2 = (sd + angle - 90) * Math.PI / 180
                                    const la = angle > 180 ? 1 : 0
                                    const r = 42
                                    return <path key={i} d={`M50 50L${50+r*Math.cos(a1)} ${50+r*Math.sin(a1)}A${r} ${r} 0 ${la} 1 ${50+r*Math.cos(a2)} ${50+r*Math.sin(a2)}Z`} fill={SCH_PAL[i % SCH_PAL.length]} />
                                  })}
                                  <circle cx={50} cy={50} r={24} fill="white" />
                                  <text x={50} y={48} textAnchor="middle" fontSize={12} fontWeight={800} fill={A_TEXT}>{total}</text>
                                  <text x={50} y={57} textAnchor="middle" fontSize={5.5} fill={A_TEXT2}>명</text>
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                                  {display.map(([label, val], i) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: SCH_PAL[i % SCH_PAL.length], flexShrink: 0 }} />
                                      <span style={{ color: A_TEXT2, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                      <span style={{ color: A_TEXT, fontWeight: 700, minWidth: 20, textAlign: 'right' }}>{val}</span>
                                      <span style={{ color: A_TEXT3, fontSize: 9, minWidth: 30 }}>({Math.round(val / total * 100)}%)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* school: 학년별 + 계열별 + 레벨별 도넛 */}
                        {dt === 'school' && (() => {
                          const gradeCnts: [string, number][] = GRADE_ORDER.map(g => [g, ss.filter(s => s.gradeNorm === g).length] as [string, number]).filter(([, v]) => v > 0)
                          const levelCnts = countBy(ss, s => normalizeLevel(s.level)).filter(([k]) => k && k !== '기타').sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0]))
                          const lvTotal = levelCnts.reduce((s, [, v]) => s + v, 0)
                          const LV_PAL = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1','#84CC16','#D946EF']
                          // 계열별 그룹핑 (GT/MGT/S/MAG/LX)
                          const SERIES_ORDER = ['GT','MGT','S','MAG','LX']
                          const SERIES_PAL: Record<string,string> = { GT:'#3B82F6', MGT:'#10B981', S:'#F59E0B', MAG:'#EF4444', LX:'#8B5CF6' }
                          const seriesMap: Record<string,number> = {}
                          ss.forEach(s => {
                            const lv = normalizeLevel(s.level)
                            const pm = lv.match(/^([A-Z]+)/)
                            const prefix = pm ? pm[1] : '기타'
                            if (prefix !== '기타') seriesMap[prefix] = (seriesMap[prefix] || 0) + 1
                          })
                          const seriesCnts: [string,number][] = SERIES_ORDER.filter(k => seriesMap[k]).map(k => [k, seriesMap[k]])
                          const seriesTotal = seriesCnts.reduce((s,[,v]) => s + v, 0)
                          let cum1 = 0, cum2 = 0
                          // 도넛 렌더 헬퍼
                          const donut = (data: [string,number][], total: number, cumRef: { v: number }, pal: string[] | Record<string,string>, size: number) => (
                            <svg viewBox="0 0 100 100" width={size} height={size}>
                              {data.map(([label, val], i) => {
                                const angle = (val / total) * 360
                                const sd = cumRef.v; cumRef.v += angle
                                const a1 = (sd - 90) * Math.PI / 180
                                const a2 = (sd + angle - 90) * Math.PI / 180
                                const la = angle > 180 ? 1 : 0
                                const r = 42
                                const color = Array.isArray(pal) ? pal[i % pal.length] : (pal[label] || '#94A3B8')
                                return <path key={i} d={`M50 50L${50+r*Math.cos(a1)} ${50+r*Math.sin(a1)}A${r} ${r} 0 ${la} 1 ${50+r*Math.cos(a2)} ${50+r*Math.sin(a2)}Z`} fill={color} />
                              })}
                              <circle cx={50} cy={50} r={24} fill="white" />
                              <text x={50} y={48} textAnchor="middle" fontSize={12} fontWeight={800} fill={A_TEXT}>{total}</text>
                              <text x={50} y={57} textAnchor="middle" fontSize={5.5} fill={A_TEXT2}>명</text>
                            </svg>
                          )
                          return (
                            <>
                              <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
                                <h4 style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', marginBottom: 8 }}>학년별 분포</h4>
                                <RankBars data={gradeCnts} color="#3B82F6" />
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {/* 계열별 현황 */}
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#0891B2', marginBottom: 10 }}>계열별 현황</h4>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                    {donut(seriesCnts, seriesTotal, { v: cum1 }, SERIES_PAL, 160)}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                                      {seriesCnts.map(([label, val]) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#F8FAFC', borderRadius: 6, padding: '4px 8px' }}>
                                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: SERIES_PAL[label], flexShrink: 0 }} />
                                          <span style={{ fontWeight: 700, color: A_TEXT }}>{label}</span>
                                          <span style={{ fontWeight: 800, color: SERIES_PAL[label] }}>{val}</span>
                                          <span style={{ color: A_TEXT3, fontSize: 9 }}>({Math.round(val / seriesTotal * 100)}%)</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {/* 레벨별 분포 */}
                                <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
                                  <h4 style={{ fontSize: 11, fontWeight: 700, color: A_PURPLE, marginBottom: 10 }}>레벨별 분포</h4>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                    {donut(levelCnts, lvTotal, { v: cum2 }, LV_PAL, 160)}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                                      {levelCnts.map(([label, val], i) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: LV_PAL[i % LV_PAL.length], flexShrink: 0 }} />
                                          <span style={{ color: A_TEXT2, fontWeight: 600, minWidth: 42 }}>{label}</span>
                                          <span style={{ color: A_TEXT, fontWeight: 700, minWidth: 16, textAlign: 'right' }}>{val}</span>
                                          <span style={{ color: A_TEXT3, fontSize: 9 }}>({Math.round(val / lvTotal * 100)}%)</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )
                        })()}

                        {/* school-type: 사립초 비율 분석 */}
                        {dt === 'school-type' && (() => {
                          const pvt = ss.filter(s => PRIVATE_SCHOOLS.has(s.school))
                          const pub = ss.filter(s => !PRIVATE_SCHOOLS.has(s.school))
                          const pvtCnt = pvt.length, pubCnt = pub.length, tot = ss.length
                          const pvtSchools = countBy(pvt, s => s.school).filter(([k]) => k && k !== '없음')
                          const pubSchools = countBy(pub, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
                          // Top5 + 기타
                          const top5etc = (arr: [string,number][]): [string,number][] => {
                            const top = arr.slice(0, 5)
                            const rest = arr.slice(5).reduce((s,[,v]) => s + v, 0)
                            return rest > 0 ? [...top, ['기타', rest]] : top
                          }
                          const pvtDonut = top5etc(pvtSchools)
                          const pubDonut = top5etc(pubSchools)
                          const PAL = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#94A3B8']
                          // 도넛 헬퍼
                          const renderDonut = (data: [string,number][], total: number, pal: string[] | Record<string,string>, size: number) => {
                            let c = 0
                            return (
                              <svg viewBox="0 0 100 100" width={size} height={size}>
                                {data.map(([label, val], i) => {
                                  const angle = total > 0 ? (val / total) * 360 : 0
                                  const sd = c; c += angle
                                  const a1 = (sd - 90) * Math.PI / 180, a2 = (sd + angle - 90) * Math.PI / 180
                                  const la = angle > 180 ? 1 : 0, r = 42
                                  const color = Array.isArray(pal) ? pal[i % pal.length] : (pal[label] || '#94A3B8')
                                  return <path key={i} d={`M50 50L${50+r*Math.cos(a1)} ${50+r*Math.sin(a1)}A${r} ${r} 0 ${la} 1 ${50+r*Math.cos(a2)} ${50+r*Math.sin(a2)}Z`} fill={color} />
                                })}
                                <circle cx={50} cy={50} r={24} fill="white" />
                                <text x={50} y={48} textAnchor="middle" fontSize={11} fontWeight={800} fill={A_TEXT}>{total}</text>
                                <text x={50} y={57} textAnchor="middle" fontSize={5.5} fill={A_TEXT2}>명</text>
                              </svg>
                            )
                          }
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                              {/* 사립/국공립 비율 */}
                              <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 10px' }}>
                                <h4 style={{ fontSize: 10, fontWeight: 700, color: A_TEXT2, marginBottom: 10, textAlign: 'center' }}>사립초 / 국공립</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                  {renderDonut([['사립초', pvtCnt], ['국공립', pubCnt]], tot, { '사립초': '#F97316', '국공립': '#3B82F6' }, 140)}
                                  {[['사립초', pvtCnt, '#F97316'] as const, ['국공립', pubCnt, '#3B82F6'] as const].map(([label, val, color]) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                      <span style={{ fontWeight: 700, color }}>{label}</span>
                                      <span style={{ fontWeight: 800, color: A_TEXT }}>{val}</span>
                                      <span style={{ color: A_TEXT3, fontSize: 9 }}>({tot > 0 ? Math.round(val / tot * 100) : 0}%)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* 사립초별 비율 */}
                              <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 10px' }}>
                                <h4 style={{ fontSize: 10, fontWeight: 700, color: '#F97316', marginBottom: 10, textAlign: 'center' }}>사립초별 비율</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                  {renderDonut(pvtDonut, pvtCnt, ['#FB923C','#F97316','#EA580C','#C2410C','#9A3412','#D4D4D8'], 140)}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                                    {pvtDonut.map(([label, val], i) => (
                                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: ['#FB923C','#F97316','#EA580C','#C2410C','#9A3412','#D4D4D8'][i], flexShrink: 0 }} />
                                        <span style={{ color: A_TEXT2, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                        <span style={{ color: A_TEXT, fontWeight: 700 }}>{val}</span>
                                        <span style={{ color: A_TEXT3, fontSize: 9 }}>({pvtCnt > 0 ? Math.round(val / pvtCnt * 100) : 0}%)</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {/* 국공립별 비율 */}
                              <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, padding: '12px 10px' }}>
                                <h4 style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', marginBottom: 10, textAlign: 'center' }}>국공립별 비율</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                  {renderDonut(pubDonut, pubCnt, ['#60A5FA','#3B82F6','#2563EB','#1D4ED8','#1E40AF','#D4D4D8'], 140)}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                                    {pubDonut.map(([label, val], i) => (
                                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: ['#60A5FA','#3B82F6','#2563EB','#1D4ED8','#1E40AF','#D4D4D8'][i], flexShrink: 0 }} />
                                        <span style={{ color: A_TEXT2, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                        <span style={{ color: A_TEXT, fontWeight: 700 }}>{val}</span>
                                        <span style={{ color: A_TEXT3, fontSize: 9 }}>({pubCnt > 0 ? Math.round(val / pubCnt * 100) : 0}%)</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                      </div>
                    )
                  })()}

                  {/* ── 학생 명단 ── */}
                  <div style={{ padding: '8px 0' }}>
                    {detailPopup.drillType && (
                      <div onClick={() => setListOpen(v => !v)}
                        style={{ padding: '6px 20px', borderTop: `1px solid ${A_BORDER}`, marginTop: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: A_TEXT3, margin: 0 }}>학생 명단 <span style={{ fontSize: 10, fontWeight: 500 }}>({detailPopup.students.length}명)</span></h4>
                        <span style={{ fontSize: 10, color: A_TEXT3, transition: 'transform 0.2s', transform: listOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
                      </div>
                    )}
                    {(!detailPopup.drillType || listOpen) && (() => {
                      const dt = detailPopup.drillType
                      const cols = dt === 'grade-yuchi'
                        ? [{ h:'이름',w:'18%' },{ h:'레벨',w:'18%' },{ h:'아파트',w:'34%' },{ h:'동',w:'30%' }]
                        : dt === 'grade-elem'
                          ? [{ h:'이름',w:'14%' },{ h:'레벨',w:'14%' },{ h:'학교',w:'24%' },{ h:'아파트',w:'28%' },{ h:'동',w:'20%' }]
                          : dt === 'dong'
                            ? [{ h:'이름',w:'14%' },{ h:'학년',w:'12%' },{ h:'레벨',w:'14%' },{ h:'학교',w:'28%' },{ h:'아파트',w:'32%' }]
                            : dt === 'school'
                              ? [{ h:'이름',w:'15%' },{ h:'학년',w:'12%' },{ h:'레벨',w:'15%' },{ h:'아파트',w:'30%' },{ h:'동',w:'28%' }]
                              : dt === 'school-type'
                                ? [{ h:'이름',w:'14%' },{ h:'학년',w:'10%' },{ h:'레벨',w:'13%' },{ h:'학교',w:'30%' },{ h:'구분',w:'13%' },{ h:'아파트',w:'20%' }]
                                : [{ h:'이름',w:'15%' },{ h:'학년',w:'12%' },{ h:'레벨',w:'15%' },{ h:'학교',w:'28%' },{ h:'아파트',w:'30%' }]
                      const cellVal = (s: Processed, h: string) =>
                        h === '이름' ? s.name : h === '학년' ? s.gradeNorm : h === '레벨' ? normalizeLevel(s.level) : h === '학교' ? (s.school || '—') : h === '구분' ? (PRIVATE_SCHOOLS.has(s.school) ? '사립' : '국공립') : h === '아파트' ? (s.apt || '—') : (s.dong || '—')
                      const cellStyle = (h: string): React.CSSProperties =>
                        h === '이름' ? { fontWeight: 600, color: A_TEXT } : h === '레벨' ? { color: A_PURPLE, fontWeight: 600 } : h === '구분' ? { fontWeight: 600, fontSize: 10 } : { color: A_TEXT2 }
                      return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
                          <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
                          <thead>
                            <tr style={{ background: A_SURFACE2 }}>
                              {cols.map(c => <th key={c.h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: A_TEXT3, whiteSpace: 'nowrap' }}>{c.h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {detailPopup.students.map((s, i) => (
                              <tr key={`${s.name}-${i}`} style={{ borderBottom: `1px solid ${A_BORDER}` }}>
                                {cols.map(c => {
                                  const val = cellVal(s, c.h)
                                  const extra: React.CSSProperties = c.h === '구분' ? { color: val === '사립' ? '#F97316' : '#3B82F6' } : {}
                                  return <td key={c.h} style={{ padding: '7px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...cellStyle(c.h), ...extra }}>{val}</td>
                                })}
                              </tr>
                            ))}
                            {detailPopup.students.length === 0 && (
                              <tr><td colSpan={cols.length} style={{ padding: 32, textAlign: 'center', color: A_TEXT3 }}>해당 학생이 없습니다</td></tr>
                            )}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>

                </div>
              </div>
            </div>
          )}

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ══════ 탭3: 캠퍼스 세부 분석 ══════ */}
      {tab === 'report' && (
        <div style={{ background: A_BG, fontFamily: "'Noto Sans KR', sans-serif", color: A_TEXT }}>
          {analyticsLoading ? <Spinner /> : (
            <ReportView processed={processed} allLevels={
              countBy(processed, s => normalizeLevel(s.level)).filter(([k]) => k && k !== '기타').sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0]))
            } />
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── ReportView: 캠퍼스 세부 분석
// ══════════════════════════════════════════════════════════════
const RPT_PAL = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1','#84CC16','#D946EF']
const SERIES_ORDER_R = ['GT','MGT','S','MAG','LX']
const SERIES_PAL_R: Record<string,string> = { GT:'#3B82F6', MGT:'#10B981', S:'#F59E0B', MAG:'#EF4444', LX:'#8B5CF6', ECP:'#06B6D4', HONORS:'#EC4899' }

function Donut({ data, pal, size = 140 }: { data: [string,number][]; pal?: string[] | Record<string,string>; size?: number }) {
  const total = data.reduce((s,[,v]) => s + v, 0)
  if (total === 0) return <p style={{ fontSize: 11, color: A_TEXT3, padding: 12 }}>데이터 없음</p>
  let cum = 0
  const palette = pal ?? RPT_PAL
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {data.map(([label, val], i) => {
        const angle = (val / total) * 360
        const sd = cum; cum += angle
        const a1 = (sd - 90) * Math.PI / 180
        const a2 = (sd + angle - 90) * Math.PI / 180
        const la = angle > 180 ? 1 : 0
        const r = 42
        const color = Array.isArray(palette) ? palette[i % palette.length] : (palette[label] || '#94A3B8')
        return <path key={i} d={`M50 50L${50+r*Math.cos(a1)} ${50+r*Math.sin(a1)}A${r} ${r} 0 ${la} 1 ${50+r*Math.cos(a2)} ${50+r*Math.sin(a2)}Z`} fill={color} />
      })}
      <circle cx={50} cy={50} r={22} fill="white" />
      <text x={50} y={48} textAnchor="middle" fontSize={13} fontWeight={800} fill={A_TEXT}>{total}</text>
      <text x={50} y={57} textAnchor="middle" fontSize={5} fill={A_TEXT2}>명</text>
    </svg>
  )
}

function DonutLegend({ data, pal }: { data: [string,number][]; pal?: string[] }) {
  const total = data.reduce((s,[,v]) => s + v, 0)
  const palette = pal ?? RPT_PAL
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {data.map(([label, val], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: palette[i % palette.length], flexShrink: 0 }} />
          <span style={{ color: A_TEXT2, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={{ color: A_TEXT, fontWeight: 700, minWidth: 16, textAlign: 'right' }}>{val}</span>
          <span style={{ color: A_TEXT3, fontSize: 8, minWidth: 24 }}>({total > 0 ? Math.round(val/total*100) : 0}%)</span>
        </div>
      ))}
    </div>
  )
}

function HeatCell({ val, max }: { val: number; max: number }) {
  const opacity = val > 0 ? 0.15 + (val / max) * 0.7 : 0
  return (
    <td style={{ padding: '4px 6px', textAlign: 'center', fontSize: 10, fontWeight: val > 0 ? 700 : 400, color: val > 0 ? A_TEXT : '#D1D5DB',
      background: val > 0 ? `rgba(59,130,246,${opacity.toFixed(2)})` : undefined, borderBottom: `1px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}` }}>
      {val || '-'}
    </td>
  )
}

function SectionCard({ title, color, children, compact }: { title: string; color: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div style={{ background: A_SURFACE, border: `1px solid ${A_BORDER}`, borderRadius: 10, borderTop: `3px solid ${color}`, overflow: 'hidden' }}>
      <div style={{ padding: compact ? '6px 10px' : '8px 12px', borderBottom: `1px solid ${A_BORDER}` }}>
        <h3 style={{ fontSize: compact ? 10 : 11, fontWeight: 800, color }}>{title}</h3>
      </div>
      <div style={{ padding: compact ? '8px 10px' : '10px 12px' }}>{children}</div>
    </div>
  )
}

function ReportView({ processed, allLevels }: { processed: Processed[]; allLevels: [string,number][] }) {
  const total = processed.length
  const yuchiStudents = processed.filter(s => ['5세','6세','7세','유치부'].includes(s.gradeNorm))
  const elemStudents = processed.filter(s => s.group === '초등부')
  const pvtStudents = elemStudents.filter(s => PRIVATE_SCHOOLS.has(s.school))
  const pubStudents = elemStudents.filter(s => !PRIVATE_SCHOOLS.has(s.school))
  const dongAll = countBy(processed, s => s.dong).filter(([k]) => k !== '기타')
  const schoolAll = countBy(processed, s => s.school).filter(([k]) => k && k !== '없음' && k !== '미입력' && k !== '기타')
  const aptAll = countBy(processed, s => s.apt).filter(([k]) => k !== '기타')
  const gradeMap: Record<string,number> = {}
  processed.forEach(s => { gradeMap[s.gradeNorm] = (gradeMap[s.gradeNorm] || 0) + 1 })

  // 계열별 집계
  const seriesMap: Record<string,number> = {}
  processed.forEach(s => {
    const lv = normalizeLevel(s.level)
    const pm = lv.match(/^([A-Z]+)/)
    if (pm && pm[1] !== '기타') seriesMap[pm[1]] = (seriesMap[pm[1]] || 0) + 1
  })
  const seriesCnts: [string,number][] = [...SERIES_ORDER_R, 'ECP', 'HONORS'].filter(k => seriesMap[k]).map(k => [k, seriesMap[k]])

  // 학년 × 계열 매트릭스
  const ELEM_GRADES = GRADE_ORDER.filter(g => gradeMap[g])
  const gradeSeries: Record<string, Record<string, number>> = {}
  for (const g of ELEM_GRADES) gradeSeries[g] = {}
  processed.forEach(s => {
    if (!ELEM_GRADES.includes(s.gradeNorm)) return
    const lv = normalizeLevel(s.level)
    const pm = lv.match(/^([A-Z]+)/)
    const prefix = pm ? pm[1] : '기타'
    if (!gradeSeries[s.gradeNorm]) gradeSeries[s.gradeNorm] = {}
    gradeSeries[s.gradeNorm][prefix] = (gradeSeries[s.gradeNorm][prefix] || 0) + 1
  })
  const matrixCols = [...new Set(ELEM_GRADES.flatMap(g => Object.keys(gradeSeries[g] || {})))].filter(k => k !== '기타')
    .sort((a, b) => {
      const order = ['ECP','GT','MGT','S','MAG','LX','HONORS']
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
    })
  const matrixMax = Math.max(1, ...ELEM_GRADES.flatMap(g => matrixCols.map(c => gradeSeries[g]?.[c] || 0)))

  // 동 × 학교 크로스
  const topDongs = dongAll.slice(0, 12).map(([k]) => k)
  const topSchools = schoolAll.slice(0, 8).map(([k]) => k)
  const dongSchoolMax = Math.max(1, ...topDongs.flatMap(d => topSchools.map(sc => processed.filter(s => s.dong === d && s.school === sc).length)))

  const activeGrades = GRADE_ORDER.filter(g => gradeMap[g])

  // 레벨 × 학교 히트맵
  const topLevels = allLevels.filter(([k]) => !/^ECP/.test(k)).slice(0, 12)
  const lvSchoolMax = Math.max(1, ...topLevels.flatMap(([lv]) => topSchools.map(sc => processed.filter(s => normalizeLevel(s.level) === lv && s.school === sc).length)))

  // 사립 vs 국공립 계열 비교
  const pvtSeries: Record<string,number> = {}
  const pubSeries: Record<string,number> = {}
  pvtStudents.forEach(s => { const pm = normalizeLevel(s.level).match(/^([A-Z]+)/); if (pm) pvtSeries[pm[1]] = (pvtSeries[pm[1]] || 0) + 1 })
  pubStudents.forEach(s => { const pm = normalizeLevel(s.level).match(/^([A-Z]+)/); if (pm) pubSeries[pm[1]] = (pubSeries[pm[1]] || 0) + 1 })
  const pvtSeriesCnts: [string,number][] = SERIES_ORDER_R.filter(k => pvtSeries[k]).map(k => [k, pvtSeries[k]])
  const pubSeriesCnts: [string,number][] = SERIES_ORDER_R.filter(k => pubSeries[k]).map(k => [k, pubSeries[k]])

  // 아파트 × 학년
  const topApts = aptAll.slice(0, 10).map(([k]) => k)
  const aptGradeMax = Math.max(1, ...topApts.flatMap(apt => activeGrades.map(g => processed.filter(s => s.apt === apt && s.gradeNorm === g).length)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>

      {/* ── Row 1: KPI 카드 6개 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {[
          { label: '전체 학생', val: total, color: '#1E293B', bg: '#F8FAFC' },
          { label: '유치부', val: yuchiStudents.length, color: '#F97316', bg: '#FFF7ED' },
          { label: '초등부', val: elemStudents.length, color: '#3B82F6', bg: '#EFF6FF' },
          { label: '사립초', val: pvtStudents.length, color: '#EF4444', bg: '#FEF2F2' },
          { label: '거주 동', val: dongAll.length, color: '#0891B2', bg: '#ECFEFF' },
          { label: '소속 학교', val: schoolAll.length, color: '#10B981', bg: '#F0FDF4' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${A_BORDER}`, borderRadius: 8, padding: '6px 10px', borderLeft: `3px solid ${k.color}` }}>
            <p style={{ fontSize: 8, fontWeight: 700, color: k.color, marginBottom: 1 }}>{k.label}</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: A_TEXT }}>{k.val}<span style={{ fontSize: 8, color: A_TEXT2 }}>{k.label.includes('동') || k.label.includes('학교') ? '개' : '명'}</span></p>
          </div>
        ))}
      </div>

      {/* ── Row 2: 도넛 5개 병렬 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        <SectionCard title="유치부 / 초등부" color="#8B5CF6" compact>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Donut data={[['유치부', yuchiStudents.length], ['초등부', elemStudents.length]]} pal={['#F97316','#3B82F6']} size={80} />
            <DonutLegend data={[['유치부', yuchiStudents.length], ['초등부', elemStudents.length]]} pal={['#F97316','#3B82F6']} />
          </div>
        </SectionCard>
        <SectionCard title="사립초 / 국공립" color="#EF4444" compact>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Donut data={[['사립', pvtStudents.length], ['국공립', pubStudents.length]]} pal={['#EF4444','#3B82F6']} size={80} />
            <DonutLegend data={[['사립', pvtStudents.length], ['국공립', pubStudents.length]]} pal={['#EF4444','#3B82F6']} />
          </div>
        </SectionCard>
        <SectionCard title="계열별 분포" color="#0891B2" compact>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Donut data={seriesCnts} pal={seriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} size={80} />
            <DonutLegend data={seriesCnts} pal={seriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} />
          </div>
        </SectionCard>
        <SectionCard title={`사립초 계열 (${pvtStudents.length}명)`} color="#EF4444" compact>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Donut data={pvtSeriesCnts} pal={pvtSeriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} size={80} />
            <DonutLegend data={pvtSeriesCnts} pal={pvtSeriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} />
          </div>
        </SectionCard>
        <SectionCard title={`국공립 계열 (${pubStudents.length}명)`} color="#3B82F6" compact>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Donut data={pubSeriesCnts} pal={pubSeriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} size={80} />
            <DonutLegend data={pubSeriesCnts} pal={pubSeriesCnts.map(([k]) => SERIES_PAL_R[k] || '#94A3B8')} />
          </div>
        </SectionCard>
      </div>

      {/* ── Row 3: 매트릭스/히트맵 4개 — 2×2 그리드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {/* 학년 × 계열 매트릭스 */}
        <SectionCard title="학년 × 계열 매트릭스" color="#3B82F6" compact>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <thead>
                <tr>
                  <th style={{ background: A_SURFACE2, padding: '3px 6px', textAlign: 'left', fontWeight: 700, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}` }}>학년</th>
                  {matrixCols.map(c => <th key={c} style={{ background: A_SURFACE2, padding: '3px 5px', textAlign: 'center', fontWeight: 700, color: SERIES_PAL_R[c] || A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, fontSize: 8 }}>{c}</th>)}
                  <th style={{ background: '#EFF6FF', padding: '3px 5px', textAlign: 'center', fontWeight: 800, color: '#1D4ED8', borderBottom: `2px solid ${A_BORDER}`, fontSize: 8 }}>합계</th>
                </tr>
              </thead>
              <tbody>
                {ELEM_GRADES.map(g => {
                  const row = gradeSeries[g] || {}
                  const rowTotal = matrixCols.reduce((s, c) => s + (row[c] || 0), 0)
                  return (
                    <tr key={g}>
                      <td style={{ padding: '3px 6px', fontWeight: 700, color: A_TEXT, borderBottom: `1px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 9 }}>{g}</td>
                      {matrixCols.map(c => <HeatCell key={c} val={row[c] || 0} max={matrixMax} />)}
                      <td style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', borderBottom: `1px solid ${A_BORDER}`, fontSize: 9 }}>{rowTotal}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ padding: '3px 6px', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', borderRight: `1px solid ${A_BORDER}`, fontSize: 9 }}>합계</td>
                  {matrixCols.map(c => {
                    const colTotal = ELEM_GRADES.reduce((s, g) => s + (gradeSeries[g]?.[c] || 0), 0)
                    return <td key={c} style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', borderRight: `1px solid ${A_BORDER}`, fontSize: 9 }}>{colTotal}</td>
                  })}
                  <td style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 900, color: '#1D4ED8', background: '#DBEAFE', fontSize: 9 }}>{total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 동 × 학교 히트맵 */}
        <SectionCard title={`동 × 학교 히트맵 (${topDongs.length}개동 × ${topSchools.length}개교)`} color="#0891B2" compact>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
              <thead>
                <tr>
                  <th style={{ background: A_SURFACE2, padding: '3px 4px', textAlign: 'left', fontWeight: 700, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, position: 'sticky', left: 0, zIndex: 1 }}>동＼학교</th>
                  {topSchools.map(sc => <th key={sc} style={{ background: A_SURFACE2, padding: '3px 2px', textAlign: 'center', fontWeight: 600, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 7, maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.replace('초등학교','초')}</th>)}
                </tr>
              </thead>
              <tbody>
                {topDongs.map(d => (
                  <tr key={d}>
                    <td style={{ padding: '3px 4px', fontWeight: 600, color: A_TEXT, borderBottom: `1px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', background: A_SURFACE, position: 'sticky', left: 0, zIndex: 1, fontSize: 8 }}>{d}</td>
                    {topSchools.map(sc => {
                      const cnt = processed.filter(s => s.dong === d && s.school === sc).length
                      return <HeatCell key={sc} val={cnt} max={dongSchoolMax} />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 레벨 × 학교 히트맵 */}
        <SectionCard title={`레벨 × 학교 히트맵 (초등 ${topLevels.length}개)`} color={A_PURPLE} compact>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
              <thead>
                <tr>
                  <th style={{ background: A_SURFACE2, padding: '3px 4px', textAlign: 'left', fontWeight: 700, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, position: 'sticky', left: 0, zIndex: 1 }}>레벨＼학교</th>
                  {topSchools.map(sc => <th key={sc} style={{ background: A_SURFACE2, padding: '3px 2px', textAlign: 'center', fontWeight: 600, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 7, maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.replace('초등학교','초')}</th>)}
                </tr>
              </thead>
              <tbody>
                {topLevels.map(([lv]) => (
                  <tr key={lv}>
                    <td style={{ padding: '3px 4px', fontWeight: 600, color: A_PURPLE, borderBottom: `1px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', background: A_SURFACE, position: 'sticky', left: 0, zIndex: 1, fontSize: 8 }}>{lv}</td>
                    {topSchools.map(sc => {
                      const cnt = processed.filter(s => normalizeLevel(s.level) === lv && s.school === sc).length
                      return <HeatCell key={sc} val={cnt} max={lvSchoolMax} />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 아파트 × 학년 히트맵 */}
        <SectionCard title={`아파트 × 학년 분포 (상위 ${topApts.length}개)`} color="#F59E0B" compact>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
              <thead>
                <tr>
                  <th style={{ background: A_SURFACE2, padding: '3px 4px', textAlign: 'left', fontWeight: 700, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, position: 'sticky', left: 0, zIndex: 1 }}>아파트</th>
                  {activeGrades.map(g => <th key={g} style={{ background: A_SURFACE2, padding: '3px 2px', textAlign: 'center', fontWeight: 600, color: A_TEXT2, borderBottom: `2px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', fontSize: 8 }}>{g}</th>)}
                  <th style={{ background: '#FEF3C7', padding: '3px 4px', textAlign: 'center', fontWeight: 800, color: '#92400E', borderBottom: `2px solid ${A_BORDER}`, fontSize: 8 }}>합계</th>
                </tr>
              </thead>
              <tbody>
                {topApts.map(apt => {
                  const rowTotal = activeGrades.reduce((s, g) => s + processed.filter(si => si.apt === apt && si.gradeNorm === g).length, 0)
                  return (
                    <tr key={apt}>
                      <td style={{ padding: '3px 4px', fontWeight: 600, color: A_TEXT, borderBottom: `1px solid ${A_BORDER}`, borderRight: `1px solid ${A_BORDER}`, whiteSpace: 'nowrap', background: A_SURFACE, position: 'sticky', left: 0, zIndex: 1, fontSize: 8, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{apt}</td>
                      {activeGrades.map(g => {
                        const cnt = processed.filter(s => s.apt === apt && s.gradeNorm === g).length
                        return <HeatCell key={g} val={cnt} max={aptGradeMax} />
                      })}
                      <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 800, color: '#92400E', background: '#FEF3C7', borderBottom: `1px solid ${A_BORDER}`, fontSize: 8 }}>{rowTotal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

    </div>
  )
}
