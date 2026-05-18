'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Script from 'next/script'
import { buildStopSearchResults, type StopSearchRow } from '@/lib/utils/stop-search'

const COORDS_KEY = 'shuttle-stop-coords'
const SCHOOL_STOP = { name: '중계폴리어학원', lat: 37.6556, lng: 127.0686 }

const BUS_COLORS = ['#FF9800','#2196F3','#9C27B0','#4CAF50','#FFC107','#E91E63','#607D8B','#795548','#00BCD4','#FF5722']
const BUS_COLOR_MAP: Record<string, string> = {
  '1호차': '#FF9800', '2호차': '#2196F3', '3호차': '#9C27B0',
  '5호차': '#4CAF50', '6호차': '#FFC107', '7호차': '#E91E63',
  '8호차': '#607D8B', '마미버스': '#E91E63',
}
function getBusColor(name: string, idx: number) {
  return BUS_COLOR_MAP[name] ?? BUS_COLORS[idx % BUS_COLORS.length]
}
function parseTimeMin(t: string | null | undefined): number {
  if (!t) return 9999
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}
function normalizeTime(t: string | null): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}
function getRunLabel(sessName: string, dir: 'arr' | 'dep'): string {
  if (sessName.includes('방과후')) return dir === 'dep' ? '매일반' : '유치부'
  if (sessName.includes('유치부')) return '유치부'
  if (sessName.includes('매일반')) return '매일반'
  if (sessName.includes('월수금') || sessName.includes('3일반')) return '3일반'
  if (sessName.includes('화목') || sessName.includes('2일반')) return '2일반'
  return sessName
}
function getSessionColor(label: string): string {
  const m: Record<string, string> = { '유치부': '#FF6B35', '매일반': '#2196F3', '3일반': '#4CAF50', '2일반': '#9C27B0' }
  return m[label] ?? '#64748B'
}
function getSessPriority(sessName: string, dir: 'arr' | 'dep'): number {
  if (sessName.includes('방과후')) return dir === 'dep' ? 2 : 1
  if (sessName.includes('유치부')) return 1
  if (sessName.includes('매일반')) return 2
  if (sessName.includes('월수금') || sessName.includes('3일반')) return 3
  if (sessName.includes('화목') || sessName.includes('2일반')) return 4
  return 9
}

const DAYS_ALL = ['월', '화', '수', '목', '금'] as const
const DAY_DOT_COLOR = ['#2196F3', '#9C27B0', '#4CAF50', '#FF9800', '#E91E63']
function DayDots({ days }: { days: string[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {DAYS_ALL.map((d, di) => (
        <span key={d} className="w-3 h-3 rounded-full text-[6px] font-bold flex items-center justify-center"
          style={days.includes(d) ? { background: DAY_DOT_COLOR[di], color: '#fff' } : { background: '#F1F5F9', color: '#CBD5E1' }}>
          {d}
        </span>
      ))}
    </div>
  )
}

interface Bus { id: string; name: string; sort_order: number; driver?: string; driver_phone?: string; safety?: string; safety_phone?: string; kt_name?: string; kt_phone?: string }
interface StudentEntry {
  student_id: string; name: string; class_id?: string
  location: string | null; pickup_time: string | null; days: string[]
  override?: boolean
}
interface TimeGroup {
  session_name: string; time_range: string
  busMap: Record<string, StudentEntry[]>
  busLocations: Record<string, string[]>
}
interface RouteStop { name: string; time: string | null; count: number; studentNames: string[] }
interface KakaoResult { name: string; address: string; lat: number; lng: number }
interface ChangeRequest {
  id: string; student_name: string; direction: 'arr' | 'dep'
  from_bus: string | null; to_bus: string; days: string[]
  location: string | null; pickup_time: string | null; note: string | null
  status: 'pending' | 'approved' | 'rejected'; created_at: string
}

type PanelView = 'route' | 'coords'

export default function RouteMapView({ campusId, campusName }: { campusId?: string; campusName?: string }) {
  const cqs = campusId ? `&campus_id=${campusId}` : ''
  // campusId가 없으면 중계(hardcoded), 있으면 해당 캠퍼스 이름 사용 (없으면 null)
  const effectiveSchoolName = campusId ? (campusName ?? null) : SCHOOL_STOP.name
  // localStorage 키를 캠퍼스별로 분리 (캠퍼스 간 좌표 오염 방지)
  const coordsKey = campusId ? `${COORDS_KEY}-${campusId}` : COORDS_KEY
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
  const candidateMarkerRef = useRef<any>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [dir, setDir] = useState<'arr' | 'dep'>('dep')
  const [groups, setGroups] = useState<TimeGroup[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [mapReady, setMapReady] = useState(false)
  const [coordsSaving, setCoordsSaving] = useState(false)

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedBuses, setSelectedBuses] = useState<string[]>([])
  const [panelView, setPanelView] = useState<PanelView>('route')

  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [stopQuery, setStopQuery] = useState<Record<string, string>>({})
  const [stopResults, setStopResults] = useState<Record<string, KakaoResult[]>>({})
  const [stopSearching, setStopSearching] = useState<Record<string, boolean>>({})
  const [candidateStop, setCandidateStop] = useState<string | null>(null)
  const [candidateCoord, setCandidateCoord] = useState<{ lat: number; lng: number } | null>(null)

  const [manualCoord, setManualCoord] = useState<Record<string, { lat: string; lng: string }>>({})
  const [searchOpen, setSearchOpen] = useState<Record<string, boolean>>({})
  const [stopAddress, setStopAddress] = useState<Record<string, string>>({})
  const [stopRename, setStopRename] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<Record<string, boolean>>({})
  const [stopSelectedResult, setStopSelectedResult] = useState<Record<string, KakaoResult>>({})

  const [tmapRoutes, setTmapRoutes] = useState<Record<string, [number, number][]>>({})
  const [tmapSummaries, setTmapSummaries] = useState<Record<string, { time: number; distance: number }>>({})
  const [tmapBothDirRoutes, setTmapBothDirRoutes] = useState<{ arr: Record<string, [number,number][]>; dep: Record<string, [number,number][]> }>({ arr: {}, dep: {} })
  const [tmapLoading, setTmapLoading] = useState(false)
  const [tmapDebug, setTmapDebug] = useState<string>('')

  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadGeocoding, setUploadGeocoding] = useState(false)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(true)
  const [bothDir, setBothDir] = useState(false)
  const [editingBus, setEditingBus] = useState<Bus | null>(null)
  const [editBusForm, setEditBusForm] = useState({ name:'', driver:'', driver_phone:'', safety:'', safety_phone:'', kt_name:'', kt_phone:'' })
  const [busSettingsOpen, setBusSettingsOpen] = useState(false)
  const [addBusName, setAddBusName] = useState('')
  const [busFormSaving, setBusFormSaving] = useState(false)
  const [kakaoSdkReady, setKakaoSdkReady] = useState(false)
  const [stopSearchQuery, setStopSearchQuery] = useState('')
  const highlightMarkerRef = useRef<any>(null)

  // 등하원 통합 정류장 데이터 (좌표 설정용)
  const [bothDirGroups, setBothDirGroups] = useState<{ group: TimeGroup; dir: 'arr' | 'dep' }[]>([])

  // 좌측 차량관리 패널
  const [leftExpanded, setLeftExpanded] = useState(true)
  const [leftDir, setLeftDir] = useState<'arr' | 'dep'>('dep')
  const [leftSession, setLeftSession] = useState('')
  const [leftBus, setLeftBus] = useState('')
  // 좌측 패널 편집 모달
  const [leftEditModal, setLeftEditModal] = useState<{ student: StudentEntry; busName: string; dir: 'arr' | 'dep'; sessionName: string } | null>(null)
  const [leftEditBus, setLeftEditBus] = useState('')
  const [leftEditLoc, setLeftEditLoc] = useState('')
  const [leftEditTime, setLeftEditTime] = useState('')
  const [leftEditDays, setLeftEditDays] = useState<string[]>([])
  const [leftEditSaving, setLeftEditSaving] = useState(false)
  // 좌측 패널 탑승자 추가 모달
  const [leftAddModal, setLeftAddModal] = useState<{ bus: string; sessionName: string; dir: 'arr' | 'dep' } | null>(null)
  const [leftAllStudents, setLeftAllStudents] = useState<{id: string; name: string; english_name: string | null}[]>([])
  const [leftRiderSearch, setLeftRiderSearch] = useState('')
  const [leftRiderResults, setLeftRiderResults] = useState<{id: string; name: string; english_name: string | null}[]>([])
  const [leftRiderSelected, setLeftRiderSelected] = useState<{id: string; name: string} | null>(null)
  const [leftRiderTime, setLeftRiderTime] = useState('')
  const [leftRiderTimeMode, setLeftRiderTimeMode] = useState<'select' | 'new'>('select')
  const [leftRiderLocation, setLeftRiderLocation] = useState('')
  const [leftRiderLocMode, setLeftRiderLocMode] = useState<'select' | 'new'>('select')
  const [leftRiderDays, setLeftRiderDays] = useState<string[]>([])
  const [leftRiderSaving, setLeftRiderSaving] = useState(false)

  // 사이드바 페이지 (1=노선지도, 2=오늘등하원, 3=변경승인)
  const [sidebarPage, setSidebarPage] = useState<1 | 2 | 3>(1)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  // Page 2
  const [p2Dir, setP2Dir] = useState<'arr' | 'dep'>('dep')
  const [p2SelectedBus, setP2SelectedBus] = useState<string | null>(null)
  const [p2SessionFilter, setP2SessionFilter] = useState('')
  const [p2DayFilter, setP2DayFilter] = useState<string[]>([])
  const [p2RouteSummary, setP2RouteSummary] = useState<{ time: number; distance: number } | null>(null)
  // Page 3
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [p3Loading, setP3Loading] = useState(false)
  const [p3ActionLoading, setP3ActionLoading] = useState<string | null>(null)

  useEffect(() => {
    const now = Date.now(), TTL = 300000, cx = campusId ?? ''
    function vcGet(direction: string) {
      try {
        const c = sessionStorage.getItem(`vc-${direction}-${cx}`)
        if (c) { const p = JSON.parse(c); if (now - p.t < TTL) return Promise.resolve(p.d) }
      } catch {}
      return fetch(`/api/campus/vehicles?direction=${direction}&master=true${cqs}`)
        .then(r => r.ok ? r.json() : { timeGroups: [] })
        .then(d => { try { sessionStorage.setItem(`vc-${direction}-${cx}`, JSON.stringify({ d, t: now })) } catch {}; return d })
    }
    Promise.all([vcGet('arr'), vcGet('dep')]).then(([a, d]) => {
      setBothDirGroups([
        ...(a.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'arr' as const })),
        ...(d.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'dep' as const })),
      ])
    })
  }, [])

  // 주소 로드 (localStorage)
  const addressKey = `${coordsKey}-address`
  useEffect(() => {
    try {
      const s = localStorage.getItem(addressKey)
      if (s) setStopAddress(JSON.parse(s))
    } catch {}
  }, [addressKey])

  // DB에서 좌표 로드 (localStorage는 캐시 역할)
  useEffect(() => {
    // 중계 캠퍼스: DB에 학원 좌표 없으면 하드코딩 기본값 사용 (DB 값이 있으면 DB 우선)
    const schoolFallback = campusId ? {} : { [SCHOOL_STOP.name]: { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng } }
    // 먼저 localStorage로 빠르게 표시
    try {
      const s = localStorage.getItem(coordsKey)
      if (s) setCoords({ ...schoolFallback, ...JSON.parse(s) })
      else setCoords(schoolFallback)
    } catch { setCoords(schoolFallback) }
    // DB에서 최신 데이터 가져와 덮어쓰기 (DB 값이 있으면 하드코딩보다 우선)
    fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.coords) return
        const merged = { ...schoolFallback, ...d.coords }
        setCoords(merged)
        localStorage.setItem(coordsKey, JSON.stringify(merged))
      })
      .catch(() => {})
  }, [])

  const updateCoords = useCallback(async (c: Record<string, { lat: number; lng: number }>) => {
    setCoords(c)
    localStorage.setItem(coordsKey, JSON.stringify(c))
    setCoordsSaving(true)
    try {
      await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coords: c }),
      })
    } catch {}
    setCoordsSaving(false)
  }, [campusId])

  // p2DayFilter 오늘 요일 기본 설정
  useEffect(() => {
    const dayMap: Record<number, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' }
    const todayDay = dayMap[new Date().getDay()]
    if (todayDay) setP2DayFilter([todayDay])
  }, [])


  // Page 3: 변경요청 fetch
  useEffect(() => {
    if (sidebarPage !== 3) return
    setP3Loading(true)
    fetch(`/api/campus/vehicles?requests=true${cqs}`)
      .then(r => r.ok ? r.json() : {} as any)
      .then((d: any) => { setChangeRequests(d.requests ?? []); setP3Loading(false) })
      .catch(() => setP3Loading(false))
  }, [sidebarPage, cqs])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const cx = campusId ?? '', now = Date.now(), TTL = 300000, cKey = `vc-${dir}-${cx}`
      try {
        const cached = sessionStorage.getItem(cKey)
        if (cached) { const { d, t } = JSON.parse(cached); if (now - t < TTL) { setGroups(d.timeGroups ?? []); setBuses(d.buses ?? []); return } }
      } catch {}
      const res = await fetch(`/api/campus/vehicles?direction=${dir}&master=true${cqs}`)
      if (res.ok) {
        const d = await res.json()
        setGroups(d.timeGroups ?? []); setBuses(d.buses ?? [])
        try { sessionStorage.setItem(cKey, JSON.stringify({ d, t: Date.now() })) } catch {}
      }
    } finally { setLoading(false) }
  }, [dir])
  useEffect(() => { loadData() }, [loadData])

  // 세션 옵션 (현재 dir 기준)
  const sessionOptions = useMemo(() => {
    const labelMap = new Map<string, number>()
    for (const g of groups) {
      const label = getRunLabel(g.session_name, dir)
      const pri = getSessPriority(g.session_name, dir)
      if (!labelMap.has(label) || labelMap.get(label)! > pri) labelMap.set(label, pri)
    }
    return [...labelMap.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => ({ label, color: getSessionColor(label) }))
  }, [groups, dir])

  // 세션×방향 조합 옵션 (bothDirGroups 기반 — 빠른 선택용)
  const sessionDirOptions = useMemo(() => {
    const map = new Map<string, { arr: boolean; dep: boolean; priority: number }>()
    for (const { group, dir: d } of bothDirGroups) {
      const label = getRunLabel(group.session_name, d)
      const pri = getSessPriority(group.session_name, d)
      if (!map.has(label)) map.set(label, { arr: false, dep: false, priority: pri })
      const e = map.get(label)!
      if (d === 'arr') e.arr = true; else e.dep = true
      if (pri < e.priority) e.priority = pri
    }
    return [...map.entries()].sort((a, b) => a[1].priority - b[1].priority)
      .map(([label, info]) => ({ label, color: getSessionColor(label), arr: info.arr, dep: info.dep }))
  }, [bothDirGroups])

  // 선택된 세션이 더 이상 존재하지 않을 때만 초기화 (자동 첫 선택 없음)
  useEffect(() => {
    setSelectedSession(prev => prev && !sessionOptions.find(s => s.label === prev) ? null : prev)
  }, [sessionOptions])

  // Page 2: 마스터 스케줄에서 방향별 그룹 파생 (bothDirGroups 재사용, 추가 fetch 없음)
  const p2MasterGroups = useMemo(() => ({
    arr: bothDirGroups.filter(g => g.dir === 'arr').map(g => g.group),
    dep: bothDirGroups.filter(g => g.dir === 'dep').map(g => g.group),
  }), [bothDirGroups])

  // Page 2: 마스터 버스맵 (flat — 세션 필터 미사용 시 fallback)
  const p2MasterBusMap = useMemo(() => {
    const arr: Record<string, StudentEntry[]> = {}
    const dep: Record<string, StudentEntry[]> = {}
    for (const g of p2MasterGroups.arr) for (const [bus, sts] of Object.entries(g.busMap)) {
      if (!arr[bus]) arr[bus] = []; arr[bus].push(...(sts as StudentEntry[]))
    }
    for (const g of p2MasterGroups.dep) for (const [bus, sts] of Object.entries(g.busMap)) {
      if (!dep[bus]) dep[bus] = []; dep[bus].push(...(sts as StudentEntry[]))
    }
    return { arr, dep }
  }, [p2MasterGroups])

  // Page 2 헬퍼: 세션 필터가 활성이면 해당 세션 그룹의 busMap에서, 아니면 flat busMap에서 반환
  function getP2BusStudents(busName: string, d: 'arr' | 'dep', sessionFilter: string): StudentEntry[] {
    const grps = p2MasterGroups[d]
    if (sessionFilter !== '' && grps.length > 0) {
      return grps
        .filter(g => getRunLabel(g.session_name, d) === sessionFilter)
        .flatMap(g => (g.busMap[busName] ?? []) as StudentEntry[])
    }
    return (p2MasterBusMap[d][busName] ?? []) as StudentEntry[]
  }

  // Page 2: 세션/요일 필터 적용된 버스 목록
  const filteredP2Buses = useMemo(() => {
    return buses.filter(b => {
      if (b.name.includes('결석') || b.name === '마미버스') return false
      const students = getP2BusStudents(b.name, p2Dir, p2SessionFilter)
      if (students.length === 0) return false
      if (p2DayFilter.length > 0) {
        return students.some(s => s.days.some(d => p2DayFilter.includes(d)))
      }
      return true
    })
  }, [buses, p2MasterBusMap, p2Dir, p2SessionFilter, p2DayFilter, p2MasterGroups])

  // Page 2: 선택된 버스의 세션+요일 필터된 학생 목록
  const p2VisibleStudents = useMemo(() => {
    if (!p2SelectedBus) return []
    const students = getP2BusStudents(p2SelectedBus, p2Dir, p2SessionFilter)
    const filtered = p2DayFilter.length > 0 ? students.filter(s => s.days.some(d => p2DayFilter.includes(d))) : students
    return [...filtered].sort((a, b) => parseTimeMin(a.pickup_time) - parseTimeMin(b.pickup_time))
  }, [p2SelectedBus, p2MasterBusMap, p2Dir, p2DayFilter, p2SessionFilter, p2MasterGroups])

  // 필터 변경 시 선택된 버스가 결과에 없으면 리셋 (filteredP2Buses 선언 이후에 위치)
  useEffect(() => {
    if (p2SelectedBus && !filteredP2Buses.some(b => b.name === p2SelectedBus)) {
      setP2SelectedBus(null)
    }
  }, [filteredP2Buses])

  // 선택 세션의 버스 목록
  const sessionBuses = useMemo(() => {
    if (!selectedSession) return []
    const names = new Set<string>()
    for (const g of groups) {
      if (getRunLabel(g.session_name, dir) !== selectedSession) continue
      for (const [busName, students] of Object.entries(g.busMap))
        if (students.length > 0) names.add(busName)
    }
    return buses.filter(b => names.has(b.name))
  }, [groups, dir, selectedSession, buses])

  // 세션 바뀌면 현재 선택된 호차 중 유효하지 않은 것만 제거 (자동 전체선택 없음)
  useEffect(() => {
    const validNames = new Set(sessionBuses.map(b => b.name))
    setSelectedBuses(prev => prev.filter(n => validNames.has(n)))
  }, [sessionBuses])

  function toggleBus(name: string) {
    setSelectedBuses(prev => {
      if (prev.includes(name)) return prev.filter(b => b !== name)
      // bothDir 모드: 1대 제한
      if (bothDir) return [name]
      return [...prev, name]
    })
  }

  // 버스별 정류장 (시간순) — 등원 마지막/하원 첫번째에 학원 고정
  const routeStopsByBus = useMemo((): Record<string, RouteStop[]> => {
    if (!selectedSession) return {}
    const result: Record<string, RouteStop[]> = {}
    const schoolStop: RouteStop = { name: effectiveSchoolName ?? SCHOOL_STOP.name, time: null, count: 0, studentNames: [] }
    for (const busName of selectedBuses) {
      const locMap = new Map<string, { time: string | null; count: number; names: string[] }>()
      for (const g of groups) {
        if (getRunLabel(g.session_name, dir) !== selectedSession) continue
        for (const s of (g.busMap[busName] ?? [])) {
          if (!s.location) continue
          const loc = s.location.trim()
          if (!locMap.has(loc)) locMap.set(loc, { time: null, count: 0, names: [] })
          const e = locMap.get(loc)!
          e.count++
          if (!e.names.includes(s.name)) e.names.push(s.name)
          if (s.pickup_time && (!e.time || parseTimeMin(s.pickup_time) < parseTimeMin(e.time))) e.time = s.pickup_time
        }
      }
      const sorted = [...locMap.entries()]
        .map(([name, info]) => ({ name, time: info.time, count: info.count, studentNames: info.names }))
        .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
      // 등원: 학원이 마지막(도착지) / 하원: 학원이 첫번째(출발지)
      result[busName] = dir === 'arr' ? [...sorted, schoolStop] : [schoolStop, ...sorted]
    }
    return result
  }, [groups, dir, selectedSession, selectedBuses])

  // 등하원 동시보기용 — 양쪽 방향 정류장 추출
  const bothDirStopsByBus = useMemo((): Record<'arr'|'dep', Record<string, RouteStop[]>> => {
    if (!selectedSession || !bothDir) return { arr: {}, dep: {} }
    const schoolStop: RouteStop = { name: effectiveSchoolName ?? SCHOOL_STOP.name, time: null, count: 0, studentNames: [] }
    const compute = (targetDir: 'arr'|'dep') => {
      const result: Record<string, RouteStop[]> = {}
      for (const busName of selectedBuses.slice(0, 1)) {
        const locMap = new Map<string, { time: string|null; count: number; names: string[] }>()
        for (const { group, dir: d } of bothDirGroups) {
          if (d !== targetDir) continue
          if (getRunLabel(group.session_name, d) !== selectedSession) continue
          for (const s of (group.busMap[busName] ?? [])) {
            if (!s.location) continue
            const loc = s.location.trim()
            if (!locMap.has(loc)) locMap.set(loc, { time: null, count: 0, names: [] })
            const e = locMap.get(loc)!
            e.count++
            if (!e.names.includes(s.name)) e.names.push(s.name)
            if (s.pickup_time && (!e.time || parseTimeMin(s.pickup_time) < parseTimeMin(e.time))) e.time = s.pickup_time
          }
        }
        const sorted = [...locMap.entries()]
          .map(([name, info]) => ({ name, time: info.time, count: info.count, studentNames: info.names }))
          .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
        result[busName] = targetDir === 'arr' ? [...sorted, schoolStop] : [schoolStop, ...sorted]
      }
      return result
    }
    return { arr: compute('arr'), dep: compute('dep') }
  }, [bothDirGroups, selectedSession, selectedBuses, bothDir, effectiveSchoolName])

  // 전체 정류장 — 등하원 양쪽 데이터 통합 (좌표 설정용)
  const allStops = useMemo(() => {
    const m = new Map<string, { busNames: string[]; directions: string[] }>()
    for (const { group, dir: d } of bothDirGroups) {
      const dirLabel = d === 'arr' ? '등원' : '하원'
      for (const [busName, students] of Object.entries(group.busMap))
        for (const s of students) {
          if (!s.location) continue
          const loc = s.location.trim()
          if (!m.has(loc)) m.set(loc, { busNames: [], directions: [] })
          const e = m.get(loc)!
          if (!e.busNames.includes(busName)) e.busNames.push(busName)
          if (!e.directions.includes(dirLabel)) e.directions.push(dirLabel)
        }
    }
    return [...m.entries()].map(([name, info]) => ({ name, busNames: info.busNames, directions: info.directions }))
  }, [bothDirGroups])

  const stopSearchResults = useMemo<StopSearchRow[]>(
    () => buildStopSearchResults(bothDirGroups, stopSearchQuery),
    [bothDirGroups, stopSearchQuery]
  )

  const setStopsCount = allStops.filter(s => coords[s.name]).length

  // 버스별 인원 집계 (세션 기준)
  const busStudentCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of groups) {
      if (!selectedSession || getRunLabel(g.session_name, dir) !== selectedSession) continue
      for (const [busName, students] of Object.entries(g.busMap))
        counts[busName] = (counts[busName] ?? 0) + students.length
    }
    return counts
  }, [groups, dir, selectedSession])

  const allSelected = sessionBuses.length > 0 && sessionBuses.every(b => selectedBuses.includes(b.name))

  // SDK가 이미 로드된 상태로 컴포넌트가 마운트되면 (페이지 재방문 등) onLoad가 재발화하지 않으므로 직접 체크
  useEffect(() => {
    if ((window as any).kakao?.maps) setKakaoSdkReady(true)
  }, [])

  // 카카오맵 초기화 — SDK 로드 완료 후
  useEffect(() => {
    if (!kakaoSdkReady || !mapContainerRef.current || mapRef.current) return
    const kakao = (window as any).kakao
    if (!kakao?.maps) return

    const doInit = () => {
      if (!mapContainerRef.current || mapRef.current) return
      const map = new kakao.maps.Map(mapContainerRef.current, {
        center: new kakao.maps.LatLng(37.6556, 127.0686),
        level: 5,
      })
      mapRef.current = map
      setMapReady(true)
    }

    // Map 생성자가 이미 존재하면 라이브러리 완전 로드 상태 → load() 없이 직접 초기화
    // 첫 방문 시에는 kakao.maps.load()를 통해 라이브러리 초기화
    if (typeof kakao.maps.Map === 'function') {
      doInit()
    } else if (typeof kakao.maps.load === 'function') {
      kakao.maps.load(doInit)
    }

    return () => { mapRef.current = null; setMapReady(false) }
  }, [kakaoSdkReady])

  // 지도 클릭
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    const map = mapRef.current
    const h = (mouseEvent: any) => {
      if (!candidateStop) return
      const latlng = mouseEvent.latLng
      const lat = latlng.getLat()
      const lng = latlng.getLng()
      setCandidateCoord({ lat, lng })
      setManualCoord(prev => ({ ...prev, [candidateStop]: { lat: lat.toFixed(6), lng: lng.toFixed(6) } }))
    }
    kakao.maps.event.addListener(map, 'click', h)
    return () => kakao.maps.event.removeListener(map, 'click', h)
  }, [mapReady, candidateStop])

  useEffect(() => {
    if (mapContainerRef.current) {
      mapContainerRef.current.style.cursor = candidateStop ? 'crosshair' : ''
    }
  }, [candidateStop])

  // 후보 마커 (드래그 가능)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    const map = mapRef.current
    if (candidateMarkerRef.current) { candidateMarkerRef.current.setMap(null); candidateMarkerRef.current = null }
    if (!candidateCoord || !candidateStop) return
    const marker = new kakao.maps.Marker({
      map,
      position: new kakao.maps.LatLng(candidateCoord.lat, candidateCoord.lng),
      draggable: true,
      zIndex: 10,
    })
    kakao.maps.event.addListener(marker, 'dragend', () => {
      const pos = marker.getPosition()
      const lat = pos.getLat()
      const lng = pos.getLng()
      setCandidateCoord({ lat, lng })
      setManualCoord(prev => ({ ...prev, [candidateStop!]: { lat: lat.toFixed(6), lng: lng.toFixed(6) } }))
    })
    candidateMarkerRef.current = marker
  }, [mapReady, candidateCoord, candidateStop])

  // TMAP 좌표열에서 도착지와 가장 가까운 지점 이후를 잘라냄
  // 도착지를 지나쳐서 되돌아오는 선을 제거
  function trimRouteToDestination(pts: [number, number][], dest: [number, number]): [number, number][] {
    if (pts.length < 2) return pts
    let minDist = Infinity, minIdx = pts.length - 1
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - dest[0], pts[i][1] - dest[1])
      if (d < minDist) { minDist = d; minIdx = i }
    }
    return pts.slice(0, minIdx + 1)
  }

  // 티맵 경로 fetch — 브라우저에서 직접 호출 (한국 IP 필요)
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_TMAP_APP_KEY
    if (!selectedBuses.length) return
    if (!appKey) { setTmapDebug('❌ appKey 없음'); return }

    const newRoutes: Record<string, [number, number][]> = {}
    const newSummaries: Record<string, { time: number; distance: number }> = {}
    let pending = 0
    setTmapDebug('⏳ 티맵 경로 요청 중...')

    for (const busName of selectedBuses) {
      const stops = (routeStopsByBus[busName] ?? []).filter(s => coords[s.name])
      if (stops.length < 2) continue
      pending++

      const start = stops[0]
      const end = stops[stops.length - 1]
      const waypoints = stops.slice(1, -1)

      const body: Record<string, string> = {
        startX: String(coords[start.name].lng),
        startY: String(coords[start.name].lat),
        startName: start.name,
        endX: String(coords[end.name].lng),
        endY: String(coords[end.name].lat),
        endName: end.name,
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0',
      }
      if (waypoints.length > 0) {
        body.passList = waypoints.slice(0, 5).map(w => `${coords[w.name].lng},${coords[w.name].lat}`).join('_')
      }

      fetch(`https://apis.openapi.sk.com/tmap/routes?version=1&format=json&appKey=${encodeURIComponent(appKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      }).then(async r => {
        const text = await r.text()
        if (!r.ok) { setTmapDebug(`❌ HTTP ${r.status}: ${text.slice(0, 100)}`); return }
        let data: any
        try { data = JSON.parse(text) } catch { setTmapDebug(`❌ JSON 파싱 실패: ${text.slice(0, 100)}`); return }
        const pts: [number, number][] = []
        for (const f of data.features ?? []) {
          if (f.geometry?.type === 'Point' && f.properties?.totalTime != null) {
            newSummaries[busName] = { time: f.properties.totalTime, distance: f.properties.totalDistance ?? 0 }
          }
          if (f.geometry?.type === 'LineString') {
            for (const c of f.geometry.coordinates ?? []) pts.push([c[1], c[0]])
          }
        }
        if (pts.length > 1) {
          const destCoord: [number, number] = [coords[end.name].lat, coords[end.name].lng]
          const trimmed = trimRouteToDestination(pts, destCoord)
          newRoutes[busName] = trimmed
          setTmapDebug(`✅ ${busName}: ${pts.length}개 → ${trimmed.length}개 좌표`)
        } else setTmapDebug(`⚠️ features: ${data.features?.length ?? 0}개, 좌표 없음`)
      }).catch(e => { setTmapDebug(`❌ fetch 오류: ${String(e).slice(0, 100)}`) }).finally(() => {
        pending--
        if (pending === 0) {
          setTmapRoutes(prev => ({ ...prev, ...newRoutes }))
          setTmapSummaries(prev => ({ ...prev, ...newSummaries }))
        }
      })
    }
    if (pending === 0) { setTmapRoutes({}); setTmapSummaries({}); setTmapDebug('⚠️ 좌표 설정된 정류장 2개 미만') }
  }, [selectedBuses, routeStopsByBus, coords])

  // 등하원 동시보기 전용 TMAP 경로 fetch (방향별 색상으로 실제 도로 경로 표시)
  const BOTH_DIR_COLOR = { arr: '#1565C0', dep: '#C62828' } as const
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_TMAP_APP_KEY
    if (!bothDir || !selectedBuses.length || !appKey) { setTmapBothDirRoutes({ arr: {}, dep: {} }); return }
    const busName = selectedBuses[0]
    const newRoutes: { arr: Record<string, [number,number][]>; dep: Record<string, [number,number][]> } = { arr: {}, dep: {} }
    let pending = 0
    for (const targetDir of ['arr', 'dep'] as const) {
      const stops = (bothDirStopsByBus[targetDir][busName] ?? []).filter(s => coords[s.name])
      if (stops.length < 2) continue
      pending++
      const start = stops[0], end = stops[stops.length - 1]
      const waypoints = stops.slice(1, -1)
      const body: Record<string, string> = {
        startX: String(coords[start.name].lng), startY: String(coords[start.name].lat), startName: start.name,
        endX: String(coords[end.name].lng), endY: String(coords[end.name].lat), endName: end.name,
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0',
      }
      if (waypoints.length > 0) body.passList = waypoints.slice(0, 5).map(w => `${coords[w.name].lng},${coords[w.name].lat}`).join('_')
      fetch(`https://apis.openapi.sk.com/tmap/routes?version=1&format=json&appKey=${encodeURIComponent(appKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      }).then(async r => {
        if (!r.ok) return
        let data: any; try { data = await r.json() } catch { return }
        const pts: [number, number][] = []
        for (const f of data.features ?? [])
          if (f.geometry?.type === 'LineString')
            for (const c of f.geometry.coordinates ?? []) pts.push([c[1], c[0]])
        if (pts.length > 1) {
          const dest: [number, number] = [coords[end.name].lat, coords[end.name].lng]
          newRoutes[targetDir][busName] = trimRouteToDestination(pts, dest)
        }
      }).catch(() => {}).finally(() => {
        pending--
        if (pending === 0) setTmapBothDirRoutes({ ...newRoutes })
      })
    }
    if (pending === 0) setTmapBothDirRoutes({ arr: {}, dep: {} })
  }, [bothDir, selectedBuses, bothDirStopsByBus, coords])

  // 노선 렌더 (선택된 모든 버스, 버스별 색상) — Page 2 버스 선택 시 스킵
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    if (sidebarPage === 2 && !!p2SelectedBus) return // Page 2가 별도 렌더
    const kakao = (window as any).kakao
    const map = mapRef.current
    markersRef.current.forEach(m => m.setMap(null)); markersRef.current = []
    polylinesRef.current.forEach(p => p.setMap(null)); polylinesRef.current = []

    const allLatLngs: any[] = []

    // bothDir 모드: 등원(파랑/solid) + 하원(빨강/dashed) 동시 렌더
    if (bothDir && selectedBuses.length > 0) {
      const busName = selectedBuses[0]
      for (const targetDir of ['arr', 'dep'] as const) {
        const dirColor = BOTH_DIR_COLOR[targetDir]
        const stops = bothDirStopsByBus[targetDir][busName] ?? []
        if (stops.length === 0) continue
        const pts = stops.filter(s => coords[s.name]).map(s => new kakao.maps.LatLng(coords[s.name].lat, coords[s.name].lng))
        pts.forEach((p: any) => allLatLngs.push(p))
        // TMAP 경로 우선, 없으면 직선 폴백
        const tmapPts = tmapBothDirRoutes[targetDir]?.[busName]
          ? tmapBothDirRoutes[targetDir][busName].map(([lat, lng]) => new kakao.maps.LatLng(lat, lng))
          : null
        const routePts = tmapPts ?? pts
        if (routePts.length > 1) {
          polylinesRef.current.push(new kakao.maps.Polyline({
            map, path: routePts, strokeWeight: 9, strokeColor: '#FFFFFF', strokeOpacity: 0.4, strokeStyle: 'solid', zIndex: 1,
          }))
          polylinesRef.current.push(new kakao.maps.Polyline({
            map, path: routePts,
            strokeWeight: 6, strokeColor: dirColor, strokeOpacity: targetDir === 'arr' ? 1 : 0.85,
            strokeStyle: targetDir === 'arr' ? 'solid' : 'dashed', zIndex: 2,
          }))
        }
        let num = 0
        for (const stop of stops) {
          const c = coords[stop.name]; if (!c) continue
          const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
          num++
          const ttId = `tt-${targetDir}-${num}`
          const timeStr = stop.time ? normalizeTime(stop.time) : ''
          const dirLabel = targetDir === 'arr' ? '등원' : '하원'
          const overlayHtml = isSchool
            ? `<div style="display:flex;flex-direction:column;align-items:center;cursor:default"><div style="background:#004EA2;color:#fff;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:900;white-space:nowrap">${(effectiveSchoolName ?? '학원').slice(0, 7)}</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #004EA2;margin-top:-1px"></div></div>`
            : `<div style="position:relative;display:flex;flex-direction:column;align-items:center"><div style="background:${dirColor};border:2.5px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer" onmouseover="document.getElementById('${ttId}').style.display='block'" onmouseout="document.getElementById('${ttId}').style.display='none'">${num}</div><div id="${ttId}" style="display:none;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:8px;padding:6px 8px;min-width:120px;z-index:999;font-size:10px"><p style="font-weight:700;margin:0 0 3px 0;color:${dirColor}">${dirLabel} · ${stop.name}</p><p style="margin:0;opacity:.8">${timeStr ? `🚌 ${timeStr}` : '시간 미설정'} · ${stop.count}명</p></div></div>`
          markersRef.current.push(new kakao.maps.CustomOverlay({
            map, position: new kakao.maps.LatLng(c.lat, c.lng), content: overlayHtml,
            yAnchor: isSchool ? 1 : 0.5, zIndex: isSchool ? 20 : 0,
          }))
        }
      }
      if (allLatLngs.length > 0) {
        const bounds = new kakao.maps.LatLngBounds()
        allLatLngs.forEach((ll: any) => bounds.extend(ll))
        map.setBounds(bounds, 60, 40, 60, 320)
      }
      return
    }

    for (const busName of selectedBuses) {
      const stops = routeStopsByBus[busName] ?? []
      if (stops.length === 0) continue
      const busIdx = buses.findIndex(b => b.name === busName)
      const color = getBusColor(busName, busIdx)
      const pts = stops.filter(s => coords[s.name]).map(s => new kakao.maps.LatLng(coords[s.name].lat, coords[s.name].lng))
      pts.forEach((p: any) => allLatLngs.push(p))

      const routeLatLngs = tmapRoutes[busName]
        ? tmapRoutes[busName].map(([lat, lng]) => new kakao.maps.LatLng(lat, lng))
        : pts

      if (routeLatLngs.length > 1) {
        // 반투명 흰 그림자 (얇게 깔아서 배경 분리)
        const shadow = new kakao.maps.Polyline({
          map, path: routeLatLngs,
          strokeWeight: 9, strokeColor: '#FFFFFF', strokeOpacity: 0.5, strokeStyle: 'solid', zIndex: 1,
        })
        polylinesRef.current.push(shadow)
        // 메인 선 — 두껍고 선명하게
        const polyline = new kakao.maps.Polyline({
          map, path: routeLatLngs,
          strokeWeight: 6, strokeColor: color, strokeOpacity: 1, strokeStyle: 'solid', zIndex: 2,
        })
        polylinesRef.current.push(polyline)
      }

      let num = 0
      for (const stop of stops) {
        const c = coords[stop.name]; if (!c) continue
        const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
        num++
        const timeStr = stop.time ? normalizeTime(stop.time) : ''
        const studentStr = stop.studentNames.slice(0, 4).join(', ') + (stop.studentNames.length > 4 ? ` 외 ${stop.studentNames.length - 4}명` : '')
        const ttId = `tt-${busIdx}-${num}`

        const overlayHtml = isSchool
          ? `<div style="display:flex;flex-direction:column;align-items:center;cursor:default">
              <div style="background:#004EA2;color:#fff;border-radius:20px;padding:5px 12px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 12px rgba(0,78,162,.45)">
                ${(effectiveSchoolName ?? '학원').slice(0, 7)}
              </div>
              <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #004EA2;margin-top:-1px"></div>
            </div>`
          : `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="background:${color};border:2.5px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s"
                onmouseover="document.getElementById('${ttId}').style.display='block';this.style.transform='scale(1.2)'"
                onmouseout="document.getElementById('${ttId}').style.display='none';this.style.transform='scale(1)'"
              >${num}</div>
              <div id="${ttId}" style="display:none;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:10px;padding:8px 10px;min-width:150px;max-width:200px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none">
                <p style="font-size:12px;font-weight:700;margin:0 0 5px 0;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.12)">${stop.name}</p>
                <p style="font-size:10px;margin:0 0 3px 0;opacity:.8">${timeStr ? `🚌 ${timeStr}` : '시간 미설정'} · 👥 ${stop.count}명</p>
                ${studentStr ? `<p style="font-size:10px;margin:0;font-weight:600;color:${color}">${studentStr}</p>` : ''}
                <div style="position:absolute;bottom:-5px;left:50%;margin-left:-5px;width:10px;height:10px;background:#1E293B;transform:rotate(45deg)"></div>
              </div>
            </div>`

        const overlay = new kakao.maps.CustomOverlay({
          map, position: new kakao.maps.LatLng(c.lat, c.lng),
          content: overlayHtml,
          yAnchor: isSchool ? 1 : 0.5, zIndex: isSchool ? 20 : 0,
        })
        markersRef.current.push(overlay)
      }
    }

    if (allLatLngs.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      allLatLngs.forEach((ll: any) => bounds.extend(ll))
      // 좌측 카드 너비만큼 padding을 줘서 노선이 카드에 가려지지 않도록
      const n = selectedBuses.length
      const cardW = n === 0 ? 0 : (n === 2 || n === 4) ? 530 : n === 1 ? 300 : 648
      map.setBounds(bounds, 60, 40, 60, cardW + 20)
    }
  }, [mapReady, routeStopsByBus, coords, selectedBuses, buses, tmapRoutes, tmapBothDirRoutes, bothDir, bothDirStopsByBus, sidebarPage, p2SelectedBus])

  // Page 2: 선택된 버스의 오늘 노선 렌더
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    if (sidebarPage !== 2 || !p2SelectedBus) {
      // page 2가 아니거나 버스 미선택 → page1 effect가 처리하므로 여기선 무조건 리턴
      return
    }
    const kakao = (window as any).kakao
    const map = mapRef.current
    markersRef.current.forEach(m => m.setMap(null)); markersRef.current = []
    polylinesRef.current.forEach(p => p.setMap(null)); polylinesRef.current = []

    const busIdx = buses.findIndex(b => b.name === p2SelectedBus)
    const busColor = getBusColor(p2SelectedBus, busIdx)

    // 학생 위치별 그룹 (시간순)
    const seen = new Set<string>()
    const stopEntries: { name: string; time: string | null; count: number; studentNames: string[] }[] = []
    for (const s of p2VisibleStudents) {
      if (!s.location) continue
      if (seen.has(s.location)) {
        const e = stopEntries.find(e => e.name === s.location)!
        e.count++
        if (!e.studentNames.includes(s.name)) e.studentNames.push(s.name)
      } else {
        seen.add(s.location)
        stopEntries.push({ name: s.location, time: s.pickup_time, count: 1, studentNames: [s.name] })
      }
    }

    // 학원 정류장
    const schoolName = effectiveSchoolName ?? ''
    const schoolCoord = coords[schoolName] ?? (schoolName ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })

    // 경로 순서: 등원=학원→정류장 역순 | 하원=정류장→학원
    const orderedStops = p2Dir === 'arr'
      ? [...stopEntries].reverse()
      : stopEntries

    const withCoords = orderedStops.filter(s => coords[s.name])

    const allPts: any[] = []

    // 폴리라인 포인트 구성
    const linePts: any[] = []
    if (schoolCoord && p2Dir === 'arr') linePts.push(new kakao.maps.LatLng(schoolCoord.lat, schoolCoord.lng))
    withCoords.forEach(s => {
      const c = coords[s.name]
      linePts.push(new kakao.maps.LatLng(c.lat, c.lng))
      allPts.push(new kakao.maps.LatLng(c.lat, c.lng))
    })
    if (schoolCoord && p2Dir === 'dep') linePts.push(new kakao.maps.LatLng(schoolCoord.lat, schoolCoord.lng))
    if (schoolCoord) allPts.push(new kakao.maps.LatLng(schoolCoord.lat, schoolCoord.lng))

    if (linePts.length > 1) {
      polylinesRef.current.push(new kakao.maps.Polyline({
        map, path: linePts, strokeWeight: 9, strokeColor: '#fff', strokeOpacity: 0.4, strokeStyle: 'solid', zIndex: 1,
      }))
      polylinesRef.current.push(new kakao.maps.Polyline({
        map, path: linePts, strokeWeight: 6, strokeColor: busColor,
        strokeOpacity: 0.9, strokeStyle: p2Dir === 'dep' ? 'dashed' : 'solid', zIndex: 2,
      }))
    }

    // 정류장 오버레이
    withCoords.forEach((s, i) => {
      const c = coords[s.name]
      const ttId = `p2tt-${i}`
      const timeStr = s.time ? normalizeTime(s.time) : ''
      const names = s.studentNames ?? []
      const studentStr = names.slice(0, 4).join(', ') + (names.length > 4 ? ` 외 ${names.length - 4}명` : '')
      const label = `<div style="position:relative;display:flex;flex-direction:column;align-items:center"><div style="background:${busColor};border:2.5px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s" onmouseover="document.getElementById('${ttId}').style.display='block';this.style.transform='scale(1.2)'" onmouseout="document.getElementById('${ttId}').style.display='none';this.style.transform='scale(1)'">${i + 1}</div><div id="${ttId}" style="display:none;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:10px;padding:8px 10px;min-width:150px;max-width:200px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none"><p style="font-size:12px;font-weight:700;margin:0 0 5px 0;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.12)">${s.name}</p><p style="font-size:10px;margin:0 0 3px 0;opacity:.8">${timeStr ? '🚌 ' + timeStr : '시간 미설정'} · 👥 ${s.count}명</p>${studentStr ? '<p style="font-size:10px;margin:0;font-weight:600;color:' + busColor + '">' + studentStr + '</p>' : ''}<div style="position:absolute;bottom:-5px;left:50%;margin-left:-5px;width:10px;height:10px;background:#1E293B;transform:rotate(45deg)"></div></div></div>`
      markersRef.current.push(new kakao.maps.CustomOverlay({
        map, position: new kakao.maps.LatLng(c.lat, c.lng), content: label, yAnchor: 0.5, zIndex: i + 1,
      }))
    })

    // 학원 오버레이
    if (schoolCoord) {
      const schoolLabel = `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:#004EA2;color:#fff;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:900;white-space:nowrap">${schoolName.slice(0, 8) || '학원'}</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #004EA2;margin-top:-1px"></div></div>`
      markersRef.current.push(new kakao.maps.CustomOverlay({
        map, position: new kakao.maps.LatLng(schoolCoord.lat, schoolCoord.lng), content: schoolLabel, yAnchor: 1, zIndex: 20,
      }))
    }

    // 지도 범위 조정 (좌상단 카드 패딩)
    if (allPts.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      allPts.forEach((ll: any) => bounds.extend(ll))
      map.setBounds(bounds, 60, 40, 60, 320)
    }
  }, [mapReady, sidebarPage, p2SelectedBus, p2VisibleStudents, coords, buses, p2Dir, effectiveSchoolName])

  // Page 2: 선택된 버스 노선 거리/시간 fetch
  useEffect(() => {
    setP2RouteSummary(null)
    const appKey = process.env.NEXT_PUBLIC_TMAP_APP_KEY
    if (!appKey || !p2SelectedBus || p2VisibleStudents.length === 0) return
    const seen = new Set<string>()
    const stopOrder: { name: string; coord: { lat: number; lng: number } }[] = []
    for (const s of p2VisibleStudents) {
      if (!s.location || seen.has(s.location)) continue
      seen.add(s.location)
      if (coords[s.location]) stopOrder.push({ name: s.location, coord: coords[s.location] })
    }
    const schoolName = effectiveSchoolName ?? ''
    const schoolCoord = coords[schoolName] ?? (!campusId ? { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng } : null)
    const allPts = p2Dir === 'arr'
      ? [...(schoolCoord ? [{ name: schoolName, coord: schoolCoord }] : []), ...stopOrder.slice().reverse()]
      : [...stopOrder, ...(schoolCoord ? [{ name: schoolName, coord: schoolCoord }] : [])]
    if (allPts.length < 2) return
    const start = allPts[0], end = allPts[allPts.length - 1], waypoints = allPts.slice(1, -1)
    const body: Record<string, string> = {
      startX: String(start.coord.lng), startY: String(start.coord.lat), startName: start.name,
      endX: String(end.coord.lng), endY: String(end.coord.lat), endName: end.name,
      reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0',
    }
    if (waypoints.length > 0) body.passList = waypoints.slice(0, 5).map(w => `${w.coord.lng},${w.coord.lat}`).join('_')
    fetch(`https://apis.openapi.sk.com/tmap/routes?version=1&format=json&appKey=${encodeURIComponent(appKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    }).then(async r => {
      if (!r.ok) return
      let data: any; try { data = await r.json() } catch { return }
      for (const f of data.features ?? [])
        if (f.geometry?.type === 'Point' && f.properties?.totalTime != null)
          setP2RouteSummary({ time: f.properties.totalTime, distance: f.properties.totalDistance ?? 0 })
    }).catch(() => {})
  }, [p2SelectedBus, p2VisibleStudents, coords, p2Dir, effectiveSchoolName, campusId])

  // ── 좌측 패널 편집 함수들
  const refreshBothDirGroups = useCallback(async () => {
    const cx = campusId ?? ''
    try { sessionStorage.removeItem(`vc-arr-${cx}`); sessionStorage.removeItem(`vc-dep-${cx}`) } catch {}
    const [a, d] = await Promise.all([
      fetch(`/api/campus/vehicles?direction=arr&master=true${cqs}`).then(r => r.ok ? r.json() : { timeGroups: [] }),
      fetch(`/api/campus/vehicles?direction=dep&master=true${cqs}`).then(r => r.ok ? r.json() : { timeGroups: [] }),
    ])
    setBothDirGroups([
      ...(a.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'arr' as const })),
      ...(d.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'dep' as const })),
    ])
  }, [campusId, cqs])

  function openLeftEdit(student: StudentEntry, busName: string, dir: 'arr' | 'dep', sessionName: string) {
    setLeftEditModal({ student, busName, dir, sessionName })
    setLeftEditBus(busName)
    setLeftEditLoc(student.location ?? '')
    setLeftEditTime(student.pickup_time ?? '')
    setLeftEditDays([...student.days])
  }

  async function handleLeftEditSave() {
    if (!leftEditModal) return
    setLeftEditSaving(true)
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_enrollment_schedule',
        student_id: leftEditModal.student.student_id,
        class_id: leftEditModal.student.class_id,
        direction: leftEditModal.dir,
        days: leftEditDays,
        bus_name: leftEditBus || undefined,
        location: leftEditLoc,
        pickup_time: leftEditTime || undefined,
      }),
    })
    setLeftEditSaving(false)
    if (!res.ok) { alert('저장 실패'); return }
    setLeftEditModal(null)
    refreshBothDirGroups()
  }

  async function handleLeftEditDelete() {
    if (!leftEditModal) return
    if (!confirm(`${leftEditModal.student.name}의 ${leftEditModal.dir === 'arr' ? '등원' : '하원'} 배정을 삭제하시겠습니까?`)) return
    setLeftEditSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remove_rider',
        student_id: leftEditModal.student.student_id,
        class_id: leftEditModal.student.class_id,
        direction: leftEditModal.dir,
      }),
    })
    setLeftEditSaving(false)
    setLeftEditModal(null)
    refreshBothDirGroups()
  }

  // ── 좌측 패널 탑승자 추가 함수들
  async function loadLeftAllStudents() {
    if (leftAllStudents.length > 0) return
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search_students', query: '' }),
    })
    const d = await res.json()
    setLeftAllStudents(d.students ?? [])
  }
  function filterLeftStudents(q: string) {
    setLeftRiderSearch(q)
    setLeftRiderSelected(null)
    if (!q.trim()) { setLeftRiderResults([]); return }
    const lower = q.toLowerCase()
    setLeftRiderResults(leftAllStudents.filter(s => s.name.includes(q) || (s.english_name ?? '').toLowerCase().includes(lower)).slice(0, 20))
  }
  function resetLeftRiderForm() {
    setLeftRiderSearch(''); setLeftRiderResults([]); setLeftRiderSelected(null)
    setLeftRiderTime(''); setLeftRiderTimeMode('select')
    setLeftRiderLocation(''); setLeftRiderLocMode('select')
    setLeftRiderDays([])
  }
  async function handleLeftAddRider() {
    if (!leftRiderSelected || !leftAddModal) return
    setLeftRiderSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_rider',
        student_id: leftRiderSelected.id,
        direction: leftAddModal.dir,
        bus_name: leftAddModal.bus,
        session_name: leftAddModal.sessionName,
        pickup_time: leftRiderTime || undefined,
        pickup_location: leftRiderLocation || undefined,
        days: leftRiderDays,
      }),
    })
    setLeftRiderSaving(false)
    setLeftAddModal(null)
    resetLeftRiderForm()
    refreshBothDirGroups()
  }

  // ── 정류장 검색 결과 클릭 — 지도 이동 + 하이라이트
  function handleStopResultClick(row: StopSearchRow) {
    const coord = coords[row.stopName]
    if (!coord || !mapRef.current) return
    const kakao = (window as any).kakao
    if (!kakao?.maps) return

    mapRef.current.panTo(new kakao.maps.LatLng(coord.lat, coord.lng))

    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.setMap(null)
      highlightMarkerRef.current = null
    }

    const busIdx = buses.findIndex(b => b.name === row.busName)
    const color = getBusColor(row.busName, busIdx)

    const content = document.createElement('div')
    content.style.cssText = `width:40px;height:40px;border-radius:50%;border:3px solid ${color};animation:stop-pulse 1.2s ease-out infinite;pointer-events:none;transform:translate(-50%,-50%)`

    if (!document.getElementById('stop-search-pulse-style')) {
      const style = document.createElement('style')
      style.id = 'stop-search-pulse-style'
      style.textContent = `@keyframes stop-pulse{0%{transform:translate(-50%,-50%) scale(0.8);opacity:1}100%{transform:translate(-50%,-50%) scale(2.4);opacity:0}}`
      document.head.appendChild(style)
    }

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(coord.lat, coord.lng),
      content,
      zIndex: 500,
    })
    overlay.setMap(mapRef.current)
    highlightMarkerRef.current = overlay

    setTimeout(() => {
      if (highlightMarkerRef.current === overlay) {
        overlay.setMap(null)
        highlightMarkerRef.current = null
      }
    }, 3000)
  }

  // ── 검색 함수들
  async function searchStop(stopName: string) {
    const q = stopQuery[stopName] || stopName
    setStopSearching(prev => ({ ...prev, [stopName]: true }))
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      const results: KakaoResult[] = res.ok ? ((await res.json()).results ?? []) : []
      setStopResults(prev => ({ ...prev, [stopName]: results }))
      if (results.length > 0) applyCandidate(stopName, results[0])
    } finally { setStopSearching(prev => ({ ...prev, [stopName]: false })) }
  }

  function applyCandidate(stopName: string, result: KakaoResult) {
    setCandidateStop(stopName); setCandidateCoord({ lat: result.lat, lng: result.lng })
    setStopSelectedResult(prev => ({ ...prev, [stopName]: result }))
    setManualCoord(prev => ({ ...prev, [stopName]: { lat: result.lat.toFixed(6), lng: result.lng.toFixed(6) } }))
    // 검색 결과 주소 자동 채우기
    setStopAddress(prev => {
      const next = { ...prev, [stopName]: result.address }
      try { localStorage.setItem(addressKey, JSON.stringify(next)) } catch {}
      return next
    })
    if (mapRef.current && (window as any).kakao?.maps) {
      mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(result.lat, result.lng))
      mapRef.current.setLevel(3)
    }
  }

  function openStop(stopName: string) {
    setExpandedStop(prev => prev === stopName ? null : stopName)
    if (!stopQuery[stopName]) setStopQuery(prev => ({ ...prev, [stopName]: stopName }))
    const c = coords[stopName]
    if (c && mapRef.current && (window as any).kakao?.maps) {
      mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(c.lat, c.lng))
      mapRef.current.setLevel(4)
    }
    if (candidateStop !== stopName) { setCandidateStop(null); setCandidateCoord(null) }
  }

  function saveStop(stopName: string) { saveCoord(stopName) }

  function saveCoord(stopName: string) {
    // candidateCoord 우선, 없으면 manualCoord 사용
    let lat: number, lng: number
    if (candidateCoord && candidateStop === stopName) {
      lat = candidateCoord.lat; lng = candidateCoord.lng
    } else {
      const m = manualCoord[stopName]
      if (!m) return
      lat = parseFloat(m.lat); lng = parseFloat(m.lng)
      if (isNaN(lat) || isNaN(lng)) return
    }
    updateCoords({ ...coords, [stopName]: { lat, lng } })
    setCandidateStop(null); setCandidateCoord(null)
    setManualCoord(prev => { const n = { ...prev }; delete n[stopName]; return n })
    // 주소 저장
    const addr = stopAddress[stopName]
    if (addr !== undefined) {
      try { localStorage.setItem(addressKey, JSON.stringify(stopAddress)) } catch {}
    }
  }

  async function renameStop(stopName: string) {
    const newName = (stopRename[stopName] ?? '').trim()
    if (!newName || newName === stopName) return
    setRenaming(prev => ({ ...prev, [stopName]: true }))
    const coord = coords[stopName]
    try {
      await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: stopName, newName, ...(coord ?? {}) }),
      })
      // 로컬 coords 갱신
      const newCoords = { ...coords }
      if (coord) { newCoords[newName] = coord; delete newCoords[stopName] }
      else delete newCoords[stopName]
      setCoords(newCoords)
      localStorage.setItem(coordsKey, JSON.stringify(newCoords))
      // 로컬 주소 갱신
      if (stopAddress[stopName] !== undefined) {
        const newAddr = { ...stopAddress, [newName]: stopAddress[stopName] }
        delete newAddr[stopName]
        setStopAddress(newAddr)
        try { localStorage.setItem(addressKey, JSON.stringify(newAddr)) } catch {}
      }
      setStopRename(prev => { const n = { ...prev }; delete n[stopName]; return n })
      setExpandedStop(newName)
    } finally {
      setRenaming(prev => { const n = { ...prev }; delete n[stopName]; return n })
    }
  }

  async function runBatchSearch() {
    setBatchLoading(true); setBatchProgress(0)
    const targets = allStops.filter(s => !coords[s.name])
    const newCoords = { ...coords }
    for (let i = 0; i < targets.length; i++) {
      const stop = targets[i]
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(stopQuery[stop.name] || stop.name)}`)
        const results: KakaoResult[] = res.ok ? ((await res.json()).results ?? []) : []
        if (results.length > 0) newCoords[stop.name] = { lat: results[0].lat, lng: results[0].lng }
      } catch {}
      setBatchProgress(Math.round(((i+1)/targets.length)*100))
      await new Promise(r => setTimeout(r, 120))
    }
    updateCoords(newCoords); setBatchLoading(false)
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    // 등하원 통합 — 방향별로 정렬 후 출력
    const sorted = [...allStops].sort((a, b) => {
      const da = a.directions.join(''), db = b.directions.join('')
      return da.localeCompare(db) || a.name.localeCompare(b.name)
    })
    const data = sorted.map(s => ({
      '정류장명': s.name,
      '방향': s.directions.join(', '),
      '호차': s.busNames.join(', '),
      '주소': '',           // 주소 입력 시 위도/경도 자동 변환
      '위도': coords[s.name]?.lat ?? '',
      '경도': coords[s.name]?.lng ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 40 }, { wch: 14 }, { wch: 14 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '정류장좌표_등하원')
    XLSX.writeFile(wb, '정류장좌표_등하원.xlsx')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[]
    const newCoords = { ...coords }
    let directCount = 0
    const toGeocode: { name: string; address: string }[] = []

    for (const row of rows) {
      const name = String(row['정류장명'] ?? '').trim()
      if (!name) continue
      const lat = parseFloat(String(row['위도'] ?? ''))
      const lng = parseFloat(String(row['경도'] ?? ''))
      if (!isNaN(lat) && !isNaN(lng)) {
        // 위도/경도 직접 입력
        newCoords[name] = { lat, lng }; directCount++
      } else {
        const address = String(row['주소'] ?? '').trim()
        if (address) toGeocode.push({ name, address })
      }
    }

    // 주소 → 자동 지오코딩
    if (toGeocode.length > 0) {
      setUploadGeocoding(true)
      setUploadMsg(`🔄 주소 ${toGeocode.length}개 자동 변환 중...`)
      let geoCount = 0
      for (const item of toGeocode) {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(item.address)}`)
          const results: KakaoResult[] = res.ok ? ((await res.json()).results ?? []) : []
          if (results.length > 0) { newCoords[item.name] = { lat: results[0].lat, lng: results[0].lng }; geoCount++ }
        } catch {}
        await new Promise(r => setTimeout(r, 100))
      }
      setUploadGeocoding(false)
      updateCoords(newCoords)
      setUploadMsg(`✅ 좌표 ${directCount}개 직접 적용 + 주소 변환 ${geoCount}/${toGeocode.length}개 완료`)
    } else {
      updateCoords(newCoords)
      setUploadMsg(`✅ ${directCount}개 정류장 좌표 업데이트 완료`)
    }
    setUploadPanelOpen(false)
    setTimeout(() => setUploadMsg(''), 8000)
  }

  // ── 공통 정류장 확장 패널 렌더 (통합형 — 항상 전체 컨트롤 표시)
  function renderStopExpanded(stopName: string) {
    const hasCoord = !!coords[stopName]
    const isCandidate = candidateStop === stopName
    const results = stopResults[stopName] ?? []
    const searching = stopSearching[stopName] ?? false
    const isSearchOpen = searchOpen[stopName] ?? false
    const canSave = isCandidate
      ? true
      : !!(manualCoord[stopName]?.lat && manualCoord[stopName]?.lng)
    const renameVal = stopRename[stopName] ?? stopName
    const isRenamingNow = renaming[stopName] ?? false

    return (
      <div className="px-3 pb-3 space-y-2.5 border-t border-[#F1F5F9] pt-2.5">

        {/* ── 위치 이동 중 배너 */}
        {isCandidate && candidateCoord && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-[#92400E] font-bold">위치 이동 중 — 마커를 드래그하세요</p>
              <p className="text-[10px] font-mono text-[#78350F] truncate">
                {candidateCoord.lat.toFixed(6)}, {candidateCoord.lng.toFixed(6)}
              </p>
            </div>
            <button onClick={() => { setCandidateStop(null); setCandidateCoord(null) }}
              className="text-[10px] text-[#64748B] px-2 py-1 rounded-lg border border-[#E2E8F0] hover:bg-[#F1F5F9] shrink-0">
              취소
            </button>
          </div>
        )}

        {/* ── 정류장명 변경 */}
        <div className="space-y-1">
          <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">정류장명</p>
          <div className="flex gap-1.5">
            <input
              name={`rename-${stopName}`}
              value={renameVal}
              onChange={e => setStopRename(prev => ({ ...prev, [stopName]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && renameVal !== stopName && renameStop(stopName)}
              className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
            <button
              onClick={() => renameStop(stopName)}
              disabled={!renameVal || renameVal === stopName || isRenamingNow}
              className="px-3 py-2 text-[11px] font-bold rounded-xl border border-[#E2E8F0] text-[#004EA2] hover:bg-[#EAF2FB] disabled:opacity-40 transition-colors shrink-0">
              {isRenamingNow ? '…' : '변경'}
            </button>
          </div>
        </div>

        {/* ── 저장된 주소 */}
        <div className="space-y-1">
          <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">저장된 주소</p>
          <input
            name={`address-${stopName}`}
            value={stopAddress[stopName] ?? ''}
            onChange={e => {
              const next = { ...stopAddress, [stopName]: e.target.value }
              setStopAddress(next)
              try { localStorage.setItem(addressKey, JSON.stringify(next)) } catch {}
            }}
            placeholder="주소 검색 시 자동 입력, 직접 수정 가능"
            className="w-full text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
          />
        </div>

        {/* ── 주소로 검색 (토글) */}
        <div className="space-y-1">
          <button
            onClick={() => setSearchOpen(prev => ({ ...prev, [stopName]: !isSearchOpen }))}
            className="w-full flex items-center justify-between text-[11px] font-bold text-[#004EA2] bg-[#EAF2FB] hover:bg-[#DBEAFE] rounded-xl px-3 py-2 transition-colors">
            <span>🔍 주소로 검색</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${isSearchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {isSearchOpen && (
            <div className="space-y-1 pt-0.5">
              <div className="flex gap-1.5">
                <input
                  name={`search-${stopName}`}
                  value={stopQuery[stopName] ?? stopName}
                  onChange={e => setStopQuery(prev => ({ ...prev, [stopName]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && searchStop(stopName)}
                  placeholder="장소명 또는 주소 입력"
                  className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  autoFocus
                />
                <button onClick={() => searchStop(stopName)} disabled={searching}
                  className="px-3 py-2 bg-[#004EA2] text-white text-[11px] font-bold rounded-xl disabled:opacity-50 hover:bg-[#003580] shrink-0">
                  {searching ? '…' : '검색'}
                </button>
              </div>
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.slice(0, 4).map((r, ri) => {
                    const sel = stopSelectedResult[stopName]
                    const isSelected = sel ? (sel.lat === r.lat && sel.lng === r.lng) : ri === 0
                    return (
                      <button key={ri} onClick={() => applyCandidate(stopName, r)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-[10px] leading-relaxed transition-colors ${isSelected ? 'bg-[#DBEAFE] border border-[#93C5FD] text-[#1E40AF]' : 'bg-[#F7F8FA] text-[#475569] hover:bg-[#E8F0FB]'}`}>
                        <span className="font-bold block">{isSelected ? '✓ ' : ''}{r.name}</span>
                        <span className="opacity-75">{r.address}</span>
                      </button>
                    )
                  })}
                  <button
                    onClick={() => {
                      const sel = stopSelectedResult[stopName] ?? results[0]
                      updateCoords({ ...coords, [stopName]: { lat: sel.lat, lng: sel.lng } })
                      setStopAddress(prev => {
                        const next = { ...prev, [stopName]: sel.address }
                        try { localStorage.setItem(addressKey, JSON.stringify(next)) } catch {}
                        return next
                      })
                      setCandidateStop(null); setCandidateCoord(null)
                      setSearchOpen(prev => ({ ...prev, [stopName]: false }))
                    }}
                    className="w-full py-2.5 rounded-xl text-[12px] font-bold text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors mt-1 shadow-sm">
                    이 위치로 저장
                  </button>
                </div>
              )}
              {results.length === 0 && !searching && stopResults[stopName] !== undefined && (
                <p className="text-[10px] text-[#94A3B8] text-center py-1">결과 없음 — 검색어를 바꿔보세요</p>
              )}
            </div>
          )}
        </div>

        {/* ── 좌표 직접 입력 */}
        <div className="space-y-1">
          <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">좌표 직접 입력</p>
          <div className="flex gap-1.5">
            <input
              name={`lat-${stopName}`}
              type="text" inputMode="decimal"
              value={manualCoord[stopName]?.lat ?? ''}
              onChange={e => setManualCoord(prev => ({ ...prev, [stopName]: { lat: e.target.value, lng: prev[stopName]?.lng ?? '' } }))}
              placeholder="위도 37.xxxx"
              className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
            <input
              name={`lng-${stopName}`}
              type="text" inputMode="decimal"
              value={manualCoord[stopName]?.lng ?? ''}
              onChange={e => setManualCoord(prev => ({ ...prev, [stopName]: { lat: prev[stopName]?.lat ?? '', lng: e.target.value } }))}
              placeholder="경도 127.xxxx"
              className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
          </div>
        </div>

        {/* ── 현재 저장된 좌표 표시 */}
        {hasCoord && (
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3 py-2">
            <p className="text-[9px] text-[#16A34A] font-bold mb-0.5">현재 위치</p>
            <p className="text-[10px] font-mono text-[#14532D]">
              {coords[stopName].lat.toFixed(6)}, {coords[stopName].lng.toFixed(6)}
            </p>
          </div>
        )}

        {/* ── 액션 버튼 */}
        <div className="flex gap-1.5">
          <button
            onClick={() => saveCoord(stopName)}
            disabled={!canSave}
            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-[#004EA2] hover:bg-[#003580] disabled:opacity-40 transition-colors">
            저장
          </button>
          <button
            onClick={() => {
              const c = coords[stopName] ?? candidateCoord
              if (!c) return
              setCandidateStop(stopName)
              setCandidateCoord(c)
              setManualCoord(prev => ({ ...prev, [stopName]: { lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) } }))
              if (mapRef.current && (window as any).kakao?.maps) {
                mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(c.lat, c.lng))
                mapRef.current.setLevel(3)
              }
            }}
            disabled={!hasCoord && !candidateCoord}
            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-[#004EA2] border border-[#BFDBFE] hover:bg-[#EAF2FB] disabled:opacity-40 transition-colors">
            위치이동
          </button>
          <button
            onClick={() => { const c = { ...coords }; delete c[stopName]; updateCoords(c) }}
            disabled={!hasCoord}
            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-[#EF4444] border border-[#FCA5A5] hover:bg-[#FEF2F2] disabled:opacity-40 transition-colors">
            삭제
          </button>
        </div>

      </div>
    )
  }

  // 버스 수에 따라 컬럼 수 결정: 4개는 2×2, 나머지는 최대 3열
  const gridCols = selectedBuses.length <= 1 ? 1
    : selectedBuses.length === 2 || selectedBuses.length === 4 ? 2
    : 3
  const gridRows = Math.ceil(selectedBuses.length / Math.max(gridCols, 1))
  const gridContainerW = gridCols === 1 ? 300 : gridCols === 2 ? 530 : 648
  // 카드 높이: 지도 전체 높이를 행 수로 나눔 (지도 배율 무관하게 항상 전체 노선 표시)
  const cardMaxH = `calc((100vh - 200px) / ${gridRows})`
  // 컬럼 수에 따라 글자·패딩·원크기 자동 축소
  const cs = {
    busName:  [20, 14, 11][gridCols - 1],
    dirLabel: [17, 12, 10][gridCols - 1],
    stats:    [13, 10,  8][gridCols - 1],
    badge:    [13, 11,  8][gridCols - 1],
    stopName: [16, 12, 10][gridCols - 1],
    timeCnt:  [13, 10,  8][gridCols - 1],
    student:  [11,  9,  7][gridCols - 1],
    circleW:  [30, 22, 18][gridCols - 1],
    circleTxt:[12, 10,  9][gridCols - 1],
    hdrPX:    [16, 10,  7][gridCols - 1],
    hdrPY:    [10,  7,  5][gridCols - 1],
    stopPX:   [10,  7,  5][gridCols - 1],
    stopPY:   [ 9,  6,  4][gridCols - 1],
    itemGap:  [ 8,  5,  3][gridCols - 1],
  }

  return (
    <>
    <Script
      src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`}
      strategy="afterInteractive"
      onLoad={() => setKakaoSdkReady(true)}
      onError={() => console.error('[KakaoMap] SDK 로드 실패 — 카카오 콘솔 도메인/키 확인 필요')}
    />
    <div className="flex bg-[#EEF2F7] rounded-2xl p-2" style={{ height: 'calc(100vh - 230px)', minHeight: 520, gap: 4 }}>

      {/* ── 좌측 차량관리 패널 */}
      <div className="flex shrink-0 gap-0">
        {/* 콘텐츠 영역 (애니메이션 폭) */}
        <div className="overflow-hidden bg-white rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col"
          style={{ width: leftExpanded ? 480 : 0, transition: 'width 250ms ease', minHeight: 0 }}>
          {leftExpanded && (() => {
            // 방향별 세션 데이터 계산
            const dirItems = bothDirGroups.filter(x => x.dir === leftDir)
            const byLabel = new Map<string, TimeGroup[]>()
            for (const { group } of dirItems) {
              const label = getRunLabel(group.session_name, leftDir)
              if (!byLabel.has(label)) byLabel.set(label, [])
              byLabel.get(label)!.push(group)
            }
            // 세션 목록
            const sessionLabels = [...byLabel.keys()]
            // 선택 세션 적용
            const activeLabels = leftSession ? [leftSession] : sessionLabels
            // 선택 세션의 버스별 학생 합산
            const combined: Record<string, StudentEntry[]> = {}
            for (const lbl of activeLabels) {
              for (const g of (byLabel.get(lbl) ?? []))
                for (const [bn, sts] of Object.entries(g.busMap)) {
                  if (!combined[bn]) combined[bn] = []
                  combined[bn].push(...sts)
                }
            }
            const activeBuses = buses.filter(b => !b.name.includes('결석') && (combined[b.name]?.length ?? 0) > 0)
            // 선택 호차 적용
            const displayBuses = leftBus ? activeBuses.filter(b => b.name === leftBus) : activeBuses

            return (
              <div className="flex flex-col h-full p-3 min-w-[480px]">
                <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2 shrink-0">차량 일정</p>

                {/* 방향 토글 */}
                <div className="grid grid-cols-2 gap-1.5 mb-2 shrink-0">
                  {(['arr', 'dep'] as const).map(d => (
                    <button key={d} onClick={() => { setLeftDir(d); setLeftSession(''); setLeftBus('') }}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${leftDir === d
                        ? d === 'arr' ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-[#C62828] text-white border-[#C62828]'
                        : 'bg-white border-[#E2E8F0] text-[#64748B]'}`}>
                      {d === 'arr' ? '🚌 등원' : '🏠 하원'}
                    </button>
                  ))}
                </div>

                {/* 세션 선택 (단일 토글) */}
                <div className="mb-2 shrink-0">
                  <p className="text-[8px] font-bold text-[#94A3B8] mb-1">수업 유형</p>
                  <div className="flex flex-wrap gap-1">
                    {sessionLabels.map(lbl => {
                      const color = getSessionColor(lbl)
                      const isOn = leftSession === lbl
                      return (
                        <button key={lbl}
                          onClick={() => { setLeftSession(isOn ? '' : lbl); setLeftBus('') }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors"
                          style={isOn ? { background: color, color: '#fff', borderColor: color } : { background: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }}>
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 호차 선택 (단일 토글) */}
                <div className="mb-2 shrink-0">
                  <p className="text-[8px] font-bold text-[#94A3B8] mb-1">호차</p>
                  <div className="flex flex-wrap gap-1">
                    {activeBuses.map(bus => {
                      const bColor = getBusColor(bus.name, buses.indexOf(bus))
                      const isOn = leftBus === bus.name
                      return (
                        <button key={bus.name}
                          onClick={() => setLeftBus(isOn ? '' : bus.name)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors"
                          style={isOn ? { background: bColor, color: '#fff', borderColor: bColor } : { background: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }}>
                          {bus.name}
                          <span className="ml-1 opacity-70 text-[8px]">({(combined[bus.name] ?? []).length})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 구분선 */}
                <div className="border-t border-[#F1F5F9] mb-2 shrink-0"/>

                {/* 학생 목록 */}
                <div className="flex-1 overflow-y-auto">
                  {displayBuses.length === 0 ? (
                    <p className="text-[10px] text-[#94A3B8] text-center py-8">데이터 없음</p>
                  ) : (
                    <div className="space-y-3">
                      {displayBuses.map(bus => {
                        const bColor = getBusColor(bus.name, buses.indexOf(bus))
                        const sts = [...(combined[bus.name] ?? [])].sort((a, b) => parseTimeMin(a.pickup_time) - parseTimeMin(b.pickup_time))
                        // 세션 레이블 (이 호차가 속한 세션)
                        const busSession = leftSession || (() => {
                          for (const [lbl, grps] of byLabel.entries())
                            for (const g of grps)
                              if (g.busMap[bus.name]?.length) return lbl
                          return ''
                        })()
                        const sessColor = getSessionColor(busSession)
                        return (
                          <div key={bus.name} className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] overflow-hidden">
                            {/* 호차 헤더 */}
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#F1F5F9]"
                              style={{ borderLeft: `4px solid ${bColor}` }}>
                              <span className="font-black text-sm" style={{ color: bColor }}>{bus.name}</span>
                              {busSession && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: sessColor + '20', color: sessColor }}>
                                  {busSession}
                                </span>
                              )}
                              <span className="ml-auto text-[10px] text-[#94A3B8] font-semibold">{sts.length}명</span>
                            </div>
                            {/* 학생 테이블 */}
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="text-[8px] text-[#94A3B8] font-semibold border-b border-[#F1F5F9]">
                                  <th className="text-left px-3 py-1">이름</th>
                                  <th className="text-left px-2 py-1">시간</th>
                                  <th className="text-left px-2 py-1">정류장</th>
                                  <th className="text-left px-2 py-1">요일</th>
                                  <th className="px-2 py-1"/>
                                </tr>
                              </thead>
                              <tbody>
                                {sts.map((s, si) => (
                                  <tr key={s.student_id}
                                    className={`cursor-pointer hover:bg-[#EFF6FF] transition-colors ${si % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}
                                    onClick={() => openLeftEdit(s, bus.name, leftDir, busSession)}>
                                    <td className="px-3 py-1 font-semibold text-[#1E293B]">{s.name}</td>
                                    <td className="px-2 py-1 text-[#64748B]">{normalizeTime(s.pickup_time)}</td>
                                    <td className="px-2 py-1 text-[#64748B] max-w-[120px] truncate">{s.location ?? '-'}</td>
                                    <td className="px-2 py-1"><DayDots days={s.days} /></td>
                                    <td className="px-2 py-1 text-[9px] text-[#2563EB] font-bold">편집</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <button
                              onClick={() => {
                                const defaultDays = busSession.includes('2일반') ? ['화', '목']
                                  : busSession.includes('3일반') ? ['월', '수', '금']
                                  : ['월', '화', '수', '목', '금']
                                resetLeftRiderForm()
                                setLeftRiderDays(defaultDays)
                                setLeftAddModal({ bus: bus.name, sessionName: busSession, dir: leftDir })
                                loadLeftAllStudents()
                              }}
                              className="w-full text-[10px] font-semibold text-[#94A3B8] hover:text-[#004EA2] hover:bg-[#EFF6FF] py-1.5 transition-colors border-t border-dashed border-[#E2E8F0]">
                              + 탑승자 추가
                            </button>
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
        {/* 좌측 핸들 (항상 표시) */}
        <button
          onClick={() => setLeftExpanded(e => !e)}
          title={leftExpanded ? '차량관리 패널 접기' : '차량관리 패널 펼치기'}
          className="flex flex-col items-center justify-center rounded-lg hover:bg-[#CBD5E1]/60 transition-colors cursor-pointer"
          style={{ width: 14, background: '#E2E8F0', marginLeft: leftExpanded ? 4 : 0 }}>
          <div style={{ width: 14, height: 40, background: '#94A3B8', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
            {leftExpanded ? '‹' : '›'}
          </div>
        </button>
      </div>

      {/* ── 지도 (flex-1로 최대 크기) */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm">


        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* ── 정류장 검색 오버레이 — 지도 우상단 */}
        <div className="absolute top-3 right-3 z-[1000] w-72 pointer-events-auto">
          <div className="bg-white rounded-2xl shadow-lg border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                placeholder="정류장 검색..."
                value={stopSearchQuery}
                onChange={e => setStopSearchQuery(e.target.value)}
                className="flex-1 text-xs outline-none text-[#0F172A] placeholder-[#CBD5E1] bg-transparent"
              />
              {stopSearchQuery && (
                <button
                  onClick={() => {
                    setStopSearchQuery('')
                    if (highlightMarkerRef.current) {
                      highlightMarkerRef.current.setMap(null)
                      highlightMarkerRef.current = null
                    }
                  }}
                  className="text-[#CBD5E1] hover:text-[#94A3B8] text-sm leading-none font-bold shrink-0">×</button>
              )}
            </div>

            {stopSearchQuery.trim() && (
              <div className="border-t border-[#F1F5F9] max-h-72 overflow-y-auto">
                {stopSearchResults.length === 0 ? (
                  <p className="text-xs text-[#CBD5E1] text-center py-4">일치하는 정류장 없음</p>
                ) : (
                  <>
                    {Array.from(new Set(stopSearchResults.map(r => r.stopName))).map(stopName => {
                      const rows = stopSearchResults.filter(r => r.stopName === stopName)
                      const hasCoord = !!coords[stopName]
                      return (
                        <div key={stopName} className="px-3 pt-2.5 pb-1.5 border-b border-[#F8FAFC] last:border-b-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[10px] font-bold text-[#0F172A]">{stopName}</span>
                            {!hasCoord && (
                              <span className="text-[9px] text-[#F59E0B] bg-[#FFFBEB] px-1.5 py-0.5 rounded font-semibold">좌표 미설정</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {rows.map((row, i) => {
                              const busIdx = buses.findIndex(b => b.name === row.busName)
                              const color = getBusColor(row.busName, busIdx)
                              const dirLabel = row.dir === 'dep' ? '하원' : '등원'
                              const timeStr = row.time
                                ? (() => {
                                    const m = row.time!.match(/(\d{1,2}):(\d{2})/)
                                    if (!m) return row.time
                                    let h = parseInt(m[1]); if (h < 8) h += 12
                                    return `${String(h).padStart(2, '0')}:${m[2]}`
                                  })()
                                : '시간미정'
                              return (
                                <button
                                  key={i}
                                  onClick={() => hasCoord && handleStopResultClick(row)}
                                  className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${hasCoord ? 'hover:bg-[#F8FAFC] cursor-pointer' : 'cursor-default opacity-60'}`}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                  <span className="text-[11px] font-bold text-[#1E293B] shrink-0">{row.busName}</span>
                                  <span className="text-[10px] font-semibold shrink-0"
                                    style={{ color: row.dir === 'dep' ? '#2196F3' : '#FF6B35' }}>{dirLabel}</span>
                                  <span className="text-[10px] text-[#64748B] font-mono shrink-0">{timeStr}</span>
                                  <span className="text-[9px] text-[#94A3B8] shrink-0">{row.sessionLabel}</span>
                                  <span className="ml-auto text-[9px] text-[#CBD5E1] shrink-0">{row.count}명</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Page 2: 오늘 탑승 학생 목록 카드 — 지도 좌상단 (BusCard 스타일) */}
        {sidebarPage === 2 && p2SelectedBus && (() => {
          const busIdx = buses.findIndex(b => b.name === p2SelectedBus)
          const busColor = getBusColor(p2SelectedBus, busIdx)
          const busObj = buses.find(b => b.name === p2SelectedBus)
          const students = p2VisibleStudents
          const sessLabelStr = p2SessionFilter || (() => {
            const g = p2MasterGroups[p2Dir].find(g => (g.busMap[p2SelectedBus]?.length ?? 0) > 0)
            return g ? getRunLabel(g.session_name, p2Dir) : ''
          })()
          return (
            <div className="absolute top-3 left-3 z-[1000] pointer-events-auto" style={{ width: 290 }}>
              <div className="bg-white rounded-2xl shadow-lg border border-[#E2E8F0] flex flex-col overflow-hidden"
                style={{ maxHeight: 'calc(100vh - 190px)' }}>
                {/* 헤더 — BusCard 동일 */}
                <div className="px-3 py-2 shrink-0 flex flex-col" style={{ background: busColor }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-white">{p2SelectedBus}</span>
                      {sessLabelStr && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>{sessLabelStr}</span>}
                      <span className="text-xs font-bold text-white opacity-75">{students.length}명</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.25)' }}>
                        {p2Dir === 'arr' ? '등원' : '하원'}
                      </span>
                      {p2DayFilter.length > 0 && <span className="text-[9px] text-white opacity-70">{p2DayFilter.join('·')}요일</span>}
                    </div>
                    <button onClick={() => setP2SelectedBus(null)} className="text-white opacity-60 hover:opacity-100 font-bold text-base leading-none">×</button>
                  </div>
                  {busObj && (busObj.driver || busObj.safety || busObj.driver_phone || busObj.safety_phone) && (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {(busObj.driver || busObj.driver_phone) && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-white opacity-60">🚌 기사님</span>
                          {busObj.driver && <span className="text-[9px] text-white font-semibold opacity-90">{busObj.driver}</span>}
                          {busObj.driver_phone && <a href={`tel:${busObj.driver_phone}`} className="text-[9px] text-white font-bold opacity-90">{busObj.driver_phone}</a>}
                        </div>
                      )}
                      {(busObj.safety || busObj.safety_phone) && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-white opacity-60">👩 여사님</span>
                          {busObj.safety && <span className="text-[9px] text-white font-semibold opacity-90">{busObj.safety}</span>}
                          {busObj.safety_phone && <a href={`tel:${busObj.safety_phone}`} className="text-[9px] text-white font-bold opacity-90">{busObj.safety_phone}</a>}
                        </div>
                      )}
                    </div>
                  )}
                  {p2RouteSummary && (
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-[9px] text-white opacity-75">⏱ {Math.round(p2RouteSummary.time / 60)}분</span>
                      <span className="text-[9px] text-white opacity-75">📏 {(p2RouteSummary.distance / 1000).toFixed(1)}km</span>
                    </div>
                  )}
                </div>
                {/* 그리드 헤더 */}
                <div className="grid text-[9px] text-[#94A3B8] font-semibold px-2 pt-1.5 pb-0.5 border-b border-[#F1F5F9] shrink-0"
                  style={{ gridTemplateColumns: '14px 36px 1fr 1fr 38px' }}>
                  <span>#</span><span className="text-center">시간</span>
                  <span>이름</span><span>장소</span><span className="text-center">요일</span>
                </div>
                {students.length === 0 ? (
                  <p className="text-center text-sm text-[#CBD5E1] py-6">오늘 배차 없음</p>
                ) : (
                  <div className="overflow-y-auto flex-1">
                    {students.map((s, idx) => (
                      <div key={s.student_id}
                        className={`grid items-center gap-x-1 px-2 py-1.5 border-b border-[#f5f5f5] ${idx % 2 === 0 ? 'bg-[#fafafa]' : 'bg-white'}`}
                        style={{ gridTemplateColumns: '14px 36px 1fr 1fr 38px' }}>
                        <span className="text-[9px] text-[#ccc]">{idx + 1}</span>
                        <div className="text-center">
                          {s.pickup_time
                            ? <span className="text-[9px] font-bold text-[#1E293B]">{normalizeTime(s.pickup_time)}</span>
                            : <span className="text-[9px] text-[#CBD5E1]">-</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-semibold text-[#1a1a1a] truncate">{s.name}</span>
                            {s.override && <span className="text-[8px] font-bold px-1 rounded shrink-0" style={{ color: busColor, background: `${busColor}22` }}>변경</span>}
                          </div>
                        </div>
                        <div className="min-w-0">
                          {s.location
                            ? <span className="text-[9px] text-[#475569] line-clamp-2">📍 {s.location}</span>
                            : <span className="text-[9px] text-[#CBD5E1]">-</span>}
                        </div>
                        <DayDots days={s.days} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* 호차별 노선 카드 — 지도 좌상단 */}
        {sidebarPage === 1 && panelView === 'route' && selectedSession && selectedBuses.length > 0 && !loading && (
          <div className="absolute top-3 left-3 z-[1000] grid gap-2 pointer-events-auto overflow-y-auto"
            style={{ gridTemplateColumns: bothDir ? 'repeat(2, 1fr)' : `repeat(${gridCols}, 1fr)`, width: bothDir ? 600 : gridContainerW, maxHeight: 'calc(100vh - 190px)' }}>
            {/* bothDir 모드: 등원(파랑)·하원(빨강) 카드 2장 */}
            {bothDir && selectedBuses.slice(0,1).flatMap(busName => {
              const busIdx = buses.findIndex(b => b.name === busName)
              const busColor = getBusColor(busName, busIdx)
              return (['arr', 'dep'] as const).map(targetDir => {
                const dirColor = BOTH_DIR_COLOR[targetDir]
                const stops = bothDirStopsByBus[targetDir][busName] ?? []
                const dirLabel = targetDir === 'arr' ? '🔵 등원' : '🔴 하원'
                const isDep = targetDir === 'dep'
                return (
                  <div key={busName + targetDir} className="bg-white rounded-2xl shadow-lg border-2 overflow-hidden flex flex-col"
                    style={{ maxHeight: cardMaxH, borderColor: dirColor }}>
                    <div className="flex items-center gap-1 flex-wrap border-b border-[#F1F5F9] shrink-0"
                      style={{ borderLeft: `5px solid ${dirColor}`, padding: `${cs.hdrPY}px ${cs.hdrPX}px`, borderLeftStyle: isDep ? 'dashed' : 'solid', background: dirColor + '0D' }}>
                      <span className="font-black leading-tight" style={{ color: busColor, fontSize: cs.busName }}>{busName}</span>
                      <span className="font-bold leading-tight" style={{ color: dirColor, fontSize: cs.dirLabel }}>{dirLabel}</span>
                      <span className="text-[#94A3B8] leading-tight" style={{ fontSize: cs.stats }}>{stops.length - 1}정</span>
                    </div>
                    {stops.length === 0 ? (
                      <p className="text-[#CBD5E1] text-center py-3" style={{ fontSize: cs.stats }}>데이터 없음</p>
                    ) : (
                      <div className="overflow-y-auto flex-1 px-1.5 pb-1.5 pt-1.5">
                        <div className="flex flex-col" style={{ gap: cs.itemGap }}>
                          {stops.map((stop, idx) => {
                            const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
                            const hasCoord = !!coords[stop.name]
                            if (isSchool) return (
                              <div key="school" className="flex items-center bg-[#EAF2FB] rounded-xl border border-[#004EA2]/30"
                                style={{ gap: cs.itemGap, padding: `${cs.stopPY}px ${cs.stopPX}px` }}>
                                <div className="rounded-lg flex items-center justify-center font-black text-white shrink-0 bg-[#004EA2]"
                                  style={{ width: cs.circleW, height: cs.circleW, fontSize: cs.circleTxt, minWidth: cs.circleW }}>P</div>
                                <span className="font-bold text-[#004EA2] truncate" style={{ fontSize: cs.stopName }}>{effectiveSchoolName ?? SCHOOL_STOP.name}</span>
                              </div>
                            )
                            return (
                              <div key={stop.name} className="bg-white rounded-xl border border-[#F1F5F9] flex items-start"
                                style={{ gap: cs.itemGap, padding: `${cs.stopPY}px ${cs.stopPX}px` }}>
                                <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
                                  style={{ width: cs.circleW, height: cs.circleW, minWidth: cs.circleW, fontSize: cs.circleTxt, background: hasCoord ? dirColor : '#CBD5E1' }}>
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold truncate" style={{ fontSize: cs.stopName, color: hasCoord ? '#1E293B' : '#94A3B8' }}>{stop.name}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[#64748B] font-mono" style={{ fontSize: cs.timeCnt }}>
                                      {stop.time ? `🚌 ${normalizeTime(stop.time)}` : '미설정'}
                                    </span>
                                    <span className="text-[#94A3B8]" style={{ fontSize: cs.timeCnt }}>👥{stop.count}명</span>
                                  </div>
                                  {stop.studentNames.length > 0 && (
                                    <div className="flex flex-wrap mt-0.5" style={{ gap: 2 }}>
                                      {stop.studentNames.slice(0, 2).map(n => (
                                        <span key={n} className="font-semibold rounded-full" style={{ fontSize: cs.student, color: dirColor, background: dirColor + '18', padding: '1px 4px' }}>{n}</span>
                                      ))}
                                      {stop.studentNames.length > 2 && <span className="text-[#94A3B8]" style={{ fontSize: cs.student }}>+{stop.studentNames.length-2}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            })}
            {/* 일반 모드: 기존 카드 */}
            {!bothDir && selectedBuses.map(busName => {
              const stops = routeStopsByBus[busName] ?? []
              const busIdx = buses.findIndex(b => b.name === busName)
              const color = getBusColor(busName, busIdx)
              const cnt = busStudentCount[busName] ?? 0
              const dirLabel = dir === 'arr' ? '등원' : '하원'
              const summary = tmapSummaries[busName]
              const timeStr = summary ? (() => { const m = Math.floor(summary.time / 60); return m >= 60 ? `${Math.floor(m/60)}시간 ${m%60}분` : `${m}분` })() : null
              const distStr = summary ? (summary.distance >= 1000 ? `${(summary.distance/1000).toFixed(1)}km` : `${summary.distance}m`) : null
              return (
                <div key={busName} className="bg-white rounded-2xl shadow-lg border border-[#E2E8F0] overflow-hidden flex flex-col" style={{ maxHeight: cardMaxH }}>
                  {/* 헤더 */}
                  <div className="flex items-center flex-wrap gap-1 border-b border-[#F1F5F9] shrink-0"
                    style={{ borderLeft: `4px solid ${color}`, padding: `${cs.hdrPY}px ${cs.hdrPX}px` }}>
                    <span className="font-black leading-tight" style={{ color, fontSize: cs.busName }}>{busName}</span>
                    <span className="font-bold text-[#64748B] leading-tight" style={{ fontSize: cs.dirLabel }}>{dirLabel}</span>
                    <span className="text-[#94A3B8] leading-tight" style={{ fontSize: cs.stats }}>{cnt}명·{stops.length}정</span>
                    {timeStr && distStr && (
                      <span className="ml-auto font-bold tracking-wide rounded-md text-white shrink-0 leading-tight bg-[#334155]"
                        style={{ fontSize: cs.badge, padding: '2px 7px' }}>
                        {timeStr}·{distStr}
                      </span>
                    )}
                  </div>
                  {/* 정류장 목록 */}
                  {stops.length === 0 ? (
                    <p className="text-[#CBD5E1] text-center py-3" style={{ fontSize: cs.stats }}>정류장 데이터 없음</p>
                  ) : (
                    <div className="overflow-y-auto flex-1">
                      <div className="relative px-1.5 pb-1.5">
                        <div className="absolute top-2 bottom-2 w-0.5 bg-[#E2E8F0] z-0"
                          style={{ left: cs.circleW / 2 + 6 }} />
                        <div className="relative z-10 pt-1.5" style={{ display: 'flex', flexDirection: 'column', gap: cs.itemGap }}>
                          {stops.map((stop, idx) => {
                            const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
                            const hasCoord = !!coords[stop.name]
                            const isExpanded = expandedStop === stop.name
                            if (isSchool) return (
                              <div key="school" className="flex items-center bg-[#EAF2FB] rounded-xl border border-[#004EA2]/30"
                                style={{ gap: cs.itemGap, padding: `${cs.stopPY}px ${cs.stopPX}px` }}>
                                <div className="rounded-lg flex items-center justify-center font-black text-white shrink-0 bg-[#004EA2]"
                                  style={{ width: cs.circleW, height: cs.circleW, fontSize: cs.circleTxt, minWidth: cs.circleW }}>P</div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-bold text-[#004EA2] truncate block" style={{ fontSize: cs.stopName }}>{effectiveSchoolName ?? SCHOOL_STOP.name}</span>
                                  <p className="text-[#64748B]" style={{ fontSize: cs.badge }}>{dir === 'arr' ? '도착지' : '출발지'}</p>
                                </div>
                              </div>
                            )
                            return (
                              <div key={stop.name + busName} className={`bg-white rounded-xl border transition-all overflow-hidden ${isExpanded ? 'border-[#004EA2] shadow-sm' : 'border-[#F1F5F9]'}`}>
                                <button onClick={() => openStop(stop.name)}
                                  className="w-full flex items-start hover:bg-[#F7F8FA] transition-colors"
                                  style={{ gap: cs.itemGap, padding: `${cs.stopPY}px ${cs.stopPX}px` }}>
                                  <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
                                    style={{ width: cs.circleW, height: cs.circleW, minWidth: cs.circleW, fontSize: cs.circleTxt, background: hasCoord ? color : '#CBD5E1' }}>
                                    {idx + 1}
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className={`font-bold truncate ${hasCoord ? 'text-[#1E293B]' : 'text-[#94A3B8]'}`} style={{ fontSize: cs.stopName }}>{stop.name}</span>
                                      {!hasCoord && <span className="text-[#EF4444] bg-[#FEF2F2] rounded font-bold shrink-0" style={{ fontSize: cs.badge, padding: '1px 3px' }}>없음</span>}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="text-[#64748B] font-mono" style={{ fontSize: cs.timeCnt }}>
                                        {stop.time ? `🚌 ${normalizeTime(stop.time)}` : <span className="text-[#CBD5E1]">미설정</span>}
                                      </span>
                                      <span className="text-[#94A3B8]" style={{ fontSize: cs.timeCnt }}>👥{stop.count}명</span>
                                    </div>
                                    {stop.studentNames.length > 0 && (
                                      <div className="flex flex-wrap mt-1" style={{ gap: 2 }}>
                                        {stop.studentNames.slice(0, gridCols === 1 ? 4 : gridCols === 2 ? 3 : 2).map(n => (
                                          <span key={n} className="font-semibold rounded-full text-[#374151] bg-[#F1F5F9]" style={{ fontSize: cs.student, padding: '1px 5px' }}>{n}</span>
                                        ))}
                                        {stop.studentNames.length > (gridCols === 1 ? 4 : gridCols === 2 ? 3 : 2) && (
                                          <span className="text-[#94A3B8]" style={{ fontSize: cs.student }}>외 {stop.studentNames.length - (gridCols === 1 ? 4 : gridCols === 2 ? 3 : 2)}명</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <svg className={`text-[#CBD5E1] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                    style={{ width: cs.circleTxt + 2, height: cs.circleTxt + 2, minWidth: cs.circleTxt + 2 }}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {isExpanded && (
                                  <div className="border-t border-[#F1F5F9]">
                                    {renderStopExpanded(stop.name)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 티맵 디버그 */}
        {tmapDebug && panelView === 'route' && selectedBuses.length > 0 && (
          <div className="absolute bottom-3 left-3 z-[1000] pointer-events-none">
            <div className="bg-black/75 text-white text-[10px] font-mono px-2 py-1 rounded-lg max-w-xs break-all">
              TMAP: {tmapDebug}
            </div>
          </div>
        )}

        {/* DB 저장 중 표시 */}
        {coordsSaving && (
          <div className="absolute bottom-3 right-3 z-[1000] bg-white/95 rounded-xl shadow px-3 py-1.5 flex items-center gap-1.5 border border-[#E2E8F0] text-xs text-[#64748B]">
            <div className="w-3 h-3 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
            저장 중...
          </div>
        )}

        {/* 미세조정 배너 */}
        {candidateStop && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#004EA2] text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-xl z-[1001] pointer-events-none flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FCD34D] animate-pulse" />
            &quot;{candidateStop}&quot; — 지도 클릭으로 위치 조정
          </div>
        )}

        {/* 좌표 미설정 안내 */}
        {!loading && panelView === 'route' && selectedBuses.length > 0 &&
          Object.values(routeStopsByBus).flat().length > 0 &&
          Object.values(routeStopsByBus).flat().every(s => !coords[s.name]) && !candidateStop && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/95 rounded-2xl shadow-xl px-7 py-6 text-center max-w-xs">
              <p className="text-3xl mb-3">📍</p>
              <p className="text-sm font-bold text-[#1E293B] mb-2">정류장 좌표 미설정</p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                <b>좌표 설정 탭</b>에서 정류장 위치를 설정하거나<br />
                각 정류장을 클릭하여 검색하세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 우측 fold 핸들 (책 척추 스타일) */}
      <div
        onClick={() => setSidebarExpanded(e => !e)}
        title={sidebarExpanded ? '패널 접기' : '패널 펼치기'}
        className="shrink-0 flex flex-col items-center justify-center cursor-pointer rounded-lg hover:brightness-95 transition-all"
        style={{ width: 12, background: '#D1D5DB' }}>
        <div style={{ width: 12, height: 48, background: '#6B7280', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
          {sidebarExpanded ? '›' : '‹'}
        </div>
      </div>

      {/* ── 우측 패널 */}
      <div className="flex flex-col gap-2 shrink-0 overflow-hidden" style={{ width: sidebarExpanded ? 384 : 160, transition: 'width 250ms ease' }}>

        {/* 페이지 네비게이션 */}
        <div className="flex items-center justify-between px-1.5 py-1.5 bg-white rounded-xl border border-[#E2E8F0] shrink-0">
          <button
            onClick={() => setSidebarPage(p => Math.max(1, p - 1) as 1 | 2 | 3)}
            disabled={sidebarPage === 1}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base leading-none">
            ‹
          </button>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map(p => (
              <button key={p} onClick={() => setSidebarPage(p)}
                className={`w-5 h-5 rounded-full text-[9px] font-bold transition-all ${sidebarPage === p ? 'bg-[#004EA2] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]'}`}>
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSidebarPage(p => Math.min(3, p + 1) as 1 | 2 | 3)}
            disabled={sidebarPage === 3}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base leading-none">
            ›
          </button>
        </div>

        {/* ─ 확장 패널 (Page 1: 좌표 설정 포함) ─ */}
        {sidebarExpanded && sidebarPage === 1 && (
          <>
            {/* */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-2 space-y-1.5 shrink-0">
              <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider px-1">빠른 선택 (전체호차)</p>
              {sessionDirOptions.filter(opt => !opt.label.includes('결석')).map(opt => (
                <div key={opt.label} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold w-14 text-right shrink-0" style={{ color: opt.color }}>{opt.label}</span>
                  <div className="flex gap-1 flex-1">
                    {opt.arr && (
                      <button
                        onClick={() => { setDir('arr'); setSelectedSession(opt.label); setSelectedBuses([]) }}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                          dir === 'arr' && selectedSession === opt.label
                            ? 'text-white border-transparent'
                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#2196F3] hover:text-[#2196F3]'
                        }`}
                        style={dir === 'arr' && selectedSession === opt.label ? { background: opt.color, borderColor: opt.color } : {}}>
                        🚌 등원
                      </button>
                    )}
                    {opt.dep && (
                      <button
                        onClick={() => { setDir('dep'); setSelectedSession(opt.label); setSelectedBuses([]) }}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                          dir === 'dep' && selectedSession === opt.label
                            ? 'text-white border-transparent'
                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#DC2626] hover:text-[#DC2626]'
                        }`}
                        style={dir === 'dep' && selectedSession === opt.label ? { background: opt.color, borderColor: opt.color } : {}}>
                        🏠 하원
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ══ 호차 선택 — 항상 표시 ══ */}
            <div className="shrink-0">
              {sessionBuses.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[10px] text-[#94A3B8] font-semibold">호차 선택</span>
                    <div className="flex items-center gap-1.5">
                      {/* 등하원 동시보기 토글 */}
                      <button
                        onClick={() => { setBothDir(b => { if (!b) setSelectedBuses(prev => prev.slice(0,1)); return !b }) }}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border transition-colors ${bothDir ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#004EA2]'}`}>
                        등↕하
                      </button>
                      {!bothDir && (
                        <button
                          onClick={() => setSelectedBuses(allSelected ? [] : sessionBuses.map(b => b.name))}
                          className="text-[10px] font-bold text-[#004EA2] hover:underline">
                          {allSelected ? '전체 해제' : '전체 선택'}
                        </button>
                      )}
                    </div>
                  </div>
                  {bothDir && <p className="text-[9px] text-[#F59E0B] font-semibold">등하원 동시보기: 1대만 선택 가능</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {sessionBuses.map(bus => {
                      const color = getBusColor(bus.name, buses.findIndex(b => b.id === bus.id))
                      const active = selectedBuses.includes(bus.name)
                      const cnt = busStudentCount[bus.name] ?? 0
                      return (
                        <button key={bus.name} onClick={() => toggleBus(bus.name)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors"
                          style={active
                            ? { background: color + '20', borderColor: color, color }
                            : { background: '#F8FAFC', borderColor: '#E2E8F0', color: '#94A3B8' }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? color : '#CBD5E1' }} />
                          {bus.name}
                          <span className="text-[10px] opacity-70">{cnt}명</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#94A3B8] text-center py-2">세션을 선택해주세요</p>
              )}
            </div>

            {/* 정류장 설정 토글 버튼 */}
            <button
              onClick={() => setPanelView(v => v === 'coords' ? 'route' : 'coords')}
              className={`w-full py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${panelView === 'coords' ? 'bg-[#004EA2] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
              📍 정류장 설정 ({setStopsCount}/{allStops.length})
            </button>

            {/* ══ 좌표 설정 ══ */}
            {panelView === 'coords' && (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">

                {/* 캠퍼스 좌표 지정 — 최상단 */}
                {effectiveSchoolName !== null && (
                  <div className={`rounded-2xl border overflow-hidden bg-white ${expandedStop === effectiveSchoolName ? 'border-[#004EA2] shadow-md' : 'border-[#E2E8F0]'}`}>
                    <button
                      onClick={() => openStop(effectiveSchoolName)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F7F8FA] transition-colors"
                    >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 bg-[#004EA2]">P</div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="text-xs font-bold text-[#004EA2]">캠퍼스 좌표 지정</span>
                        <p className="text-[9px] text-[#64748B] mt-0.5">{effectiveSchoolName} · 등원 도착지 · 하원 출발지</p>
                      </div>
                      {coords[effectiveSchoolName]
                        ? <span className="text-[9px] text-[#10B981] font-bold shrink-0">설정됨</span>
                        : <span className="text-[9px] text-[#EF4444] bg-[#FEF2F2] px-1.5 py-0.5 rounded font-bold shrink-0">미설정</span>
                      }
                      <svg className={`w-3 h-3 text-[#CBD5E1] transition-transform shrink-0 ${expandedStop === effectiveSchoolName ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedStop === effectiveSchoolName && (
                      <div className="max-h-[52vh] overflow-y-auto">
                        {renderStopExpanded(effectiveSchoolName)}
                      </div>
                    )}
                  </div>
                )}

                {allStops.filter(s => !coords[s.name]).length > 0 && (
                  <button onClick={runBatchSearch} disabled={batchLoading}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#004EA2] text-white hover:bg-[#003580] disabled:opacity-60 flex items-center justify-center gap-2">
                    {batchLoading
                      ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />자동 검색 중... {batchProgress}%</>
                      : <>🔍 미설정 {allStops.filter(s => !coords[s.name]).length}개 자동 검색</>}
                  </button>
                )}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                  <button
                    onClick={() => setUploadPanelOpen(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F7F8FA] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1E293B]">좌표 일괄 입력</span>
                      {uploadMsg && !uploadPanelOpen && (
                        <span className="text-[10px] text-[#10B981] font-semibold">{uploadMsg}</span>
                      )}
                    </div>
                    <svg className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform ${uploadPanelOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {uploadPanelOpen && (
                    <div className="px-4 pb-4 space-y-2 border-t border-[#F1F5F9]">
                      <p className="text-[10px] text-[#64748B] pt-3 leading-relaxed">
                        주소 입력 시 위도/경도 자동 변환 · 좌표 직접 입력도 가능
                      </p>
                      <button onClick={downloadTemplate}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-white border border-[#E2E8F0] text-[#004EA2] hover:bg-[#EAF2FB] transition-colors">
                        📥 양식 다운로드 ({allStops.length}개 정류장)
                      </button>
                      <button onClick={() => uploadRef.current?.click()} disabled={uploadGeocoding}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#004EA2] text-white hover:bg-[#003580] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                        {uploadGeocoding
                          ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />주소 변환 중...</>
                          : '📤 좌표 파일 업로드'}
                      </button>
                      <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
                      {uploadMsg && (
                        <div className="border border-[#86EFAC] bg-[#DCFCE7] rounded-xl px-3 py-2 text-xs font-semibold text-[#166534] text-center">
                          {uploadMsg}
                        </div>
                      )}
                      {setStopsCount > 0 && (
                        <button onClick={async () => { if (confirm(`설정된 좌표 ${setStopsCount}개를 모두 초기화할까요?`)) { await fetch('/api/campus/stop-coords', { method: 'DELETE' }); updateCoords({}) } }}
                          className="w-full py-2 rounded-xl text-[10px] text-[#EF4444] border border-[#FECACA] hover:bg-[#FEF2F2]">
                          좌표 전체 초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {allStops.map(stop => {
                    const hasCoord = !!coords[stop.name]
                    const isExpanded = expandedStop === stop.name
                    return (
                      <div key={stop.name} className={`bg-white rounded-2xl border overflow-hidden ${isExpanded ? 'border-[#004EA2] shadow-md' : 'border-[#E2E8F0]'}`}>
                        <button onClick={() => openStop(stop.name)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F7F8FA] transition-colors">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasCoord ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'}`} />
                          <div className="flex-1 min-w-0 text-left">
                            <span className={`text-xs font-semibold block truncate ${hasCoord ? 'text-[#1E293B]' : 'text-[#94A3B8]'}`}>{stop.name}</span>
                            <div className="flex gap-1 mt-0.5">
                              {stop.directions.map(d => (
                                <span key={d} className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${d === '등원' ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>{d}</span>
                              ))}
                            </div>
                          </div>
                          {hasCoord && !isExpanded && <span className="text-[9px] text-[#10B981] font-bold shrink-0">설정됨</span>}
                          <svg className={`w-3 h-3 text-[#CBD5E1] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isExpanded && renderStopExpanded(stop.name)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ══ 차량 설정 ══ */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shrink-0">
              <button onClick={() => setBusSettingsOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#F7F8FA] transition-colors">
                <span className="text-xs font-bold text-[#1E293B]">🚌 차량 설정</span>
                <svg className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform ${busSettingsOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {busSettingsOpen && (
                <div className="border-t border-[#F1F5F9] p-2 space-y-1.5">
                  {buses.map((bus, bi) => {
                    const color = getBusColor(bus.name, bi)
                    const isEditing = editingBus?.id === bus.id
                    return (
                      <div key={bus.id} className={`rounded-xl border overflow-hidden ${isEditing ? 'border-[#004EA2]' : 'border-[#F1F5F9]'}`}>
                        <div className="flex items-center gap-2 px-2.5 py-2 bg-white">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#1E293B] truncate">{bus.name}</p>
                            {bus.driver && <p className="text-[9px] text-[#94A3B8]">{bus.driver} {bus.driver_phone}</p>}
                          </div>
                          <button onClick={() => {
                            if (isEditing) { setEditingBus(null); return }
                            setEditingBus(bus)
                            setEditBusForm({ name: bus.name, driver: bus.driver??'', driver_phone: bus.driver_phone??'', safety: bus.safety??'', safety_phone: bus.safety_phone??'', kt_name: bus.kt_name??'', kt_phone: bus.kt_phone??'' })
                          }}
                            className="text-[10px] font-bold text-[#004EA2] hover:bg-[#EAF2FB] px-2 py-0.5 rounded-lg shrink-0">
                            {isEditing ? '닫기' : '수정'}
                          </button>
                        </div>
                        {isEditing && (
                          <div className="border-t border-[#F1F5F9] px-2.5 pb-2.5 pt-2 space-y-1.5 bg-[#F8FAFC]">
                            {[['차량명', 'name'],['기사', 'driver'],['기사 연락처','driver_phone'],['안전교사','safety'],['안전 연락처','safety_phone']] .map(([label, field]) => (
                              <div key={field}>
                                <p className="text-[9px] font-bold text-[#94A3B8] mb-0.5">{label}</p>
                                <input value={(editBusForm as any)[field]} onChange={e => setEditBusForm(f => ({...f, [field]: e.target.value}))}
                                  className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                              </div>
                            ))}
                            <button disabled={busFormSaving}
                              onClick={async () => {
                                setBusFormSaving(true)
                                await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                                  body: JSON.stringify({ action: 'update_bus', bus_id: bus.id, ...editBusForm }) })
                                setBuses(prev => prev.map(b => b.id === bus.id ? {...b, ...editBusForm} : b))
                                setEditingBus(null); setBusFormSaving(false)
                              }}
                              className="w-full bg-[#004EA2] text-white py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50">
                              {busFormSaving ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {/* 차량 추가 */}
                  <div className="border border-dashed border-[#E2E8F0] rounded-xl p-2 space-y-1.5">
                    <input value={addBusName} onChange={e => setAddBusName(e.target.value)}
                      placeholder="차량명 (예: 4호차)"
                      className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                    <button disabled={!addBusName.trim() || busFormSaving}
                      onClick={async () => {
                        setBusFormSaving(true)
                        const res = await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                          body: JSON.stringify({ action: 'add_bus', name: addBusName.trim() }) })
                        if (res.ok) { const d = await res.json(); setBuses(prev => [...prev, d.bus ?? { id: d.id, name: addBusName.trim(), sort_order: 99 }]); setAddBusName('') }
                        setBusFormSaving(false)
                      }}
                      className="w-full bg-[#F1F5F9] text-[#004EA2] py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 hover:bg-[#EAF2FB]">
                      + 차량 추가
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─ Page 1: 등하원 → 차량설정 → 호차 (축소 상태) ─ */}
        {sidebarPage === 1 && !sidebarExpanded && (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-1.5 bg-white rounded-2xl border border-[#E2E8F0] p-2">

            {/* 1. 등 · 하원 — 최상단 */}
            <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider text-center mb-0.5">등 · 하원</p>
            {sessionDirOptions.filter(opt => !opt.label.includes('결석')).map(opt => (
              <div key={opt.label} className="space-y-0.5">
                <span className="text-[9px] font-bold block text-center truncate px-1" style={{ color: opt.color }}>{opt.label}</span>
                <div className="grid grid-cols-2 gap-0.5">
                  {opt.arr ? (
                    <button
                      onClick={() => { setDir('arr'); setSelectedSession(opt.label) }}
                      className={`py-1.5 rounded-lg text-[9px] font-bold transition-colors border ${
                        dir === 'arr' && selectedSession === opt.label
                          ? 'text-white border-transparent'
                          : 'bg-white border-[#E2E8F0] text-[#64748B]'
                      }`}
                      style={dir === 'arr' && selectedSession === opt.label ? { background: opt.color } : {}}>
                      등원
                    </button>
                  ) : <div />}
                  {opt.dep ? (
                    <button
                      onClick={() => { setDir('dep'); setSelectedSession(opt.label) }}
                      className={`py-1.5 rounded-lg text-[9px] font-bold transition-colors border ${
                        dir === 'dep' && selectedSession === opt.label
                          ? 'text-white border-transparent'
                          : 'bg-white border-[#E2E8F0] text-[#64748B]'
                      }`}
                      style={dir === 'dep' && selectedSession === opt.label ? { background: opt.color } : {}}>
                      하원
                    </button>
                  ) : <div />}
                </div>
              </div>
            ))}

            {/* 2. 차량 설정 — 중간 */}
            <div className="rounded-xl border border-[#E2E8F0] overflow-hidden shrink-0">
              <button onClick={() => setBusSettingsOpen(o => !o)}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-[#F7F8FA] transition-colors bg-white">
                <span className="text-[10px] font-bold text-[#1E293B]">🚌 차량 설정</span>
                <svg className={`w-3 h-3 text-[#94A3B8] transition-transform ${busSettingsOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {busSettingsOpen && (
                <div className="border-t border-[#F1F5F9] p-1.5 space-y-1">
                  {buses.filter(b => !b.name.includes('결석')).map((bus, bi) => {
                    const color = getBusColor(bus.name, bi)
                    const isEditing = editingBus?.id === bus.id
                    return (
                      <div key={bus.id} className={`rounded-lg border overflow-hidden ${isEditing ? 'border-[#004EA2]' : 'border-[#F1F5F9]'}`}>
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-[#1E293B] truncate">{bus.name}</p>
                            {bus.driver && <p className="text-[8px] text-[#94A3B8] truncate">{bus.driver}</p>}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => {
                              if (isEditing) { setEditingBus(null); return }
                              setEditingBus(bus)
                              setEditBusForm({ name: bus.name, driver: bus.driver??'', driver_phone: bus.driver_phone??'', safety: bus.safety??'', safety_phone: bus.safety_phone??'', kt_name: bus.kt_name??'', kt_phone: bus.kt_phone??'' })
                            }}
                              className="text-[9px] font-bold text-[#004EA2] hover:bg-[#EAF2FB] px-1.5 py-0.5 rounded">
                              {isEditing ? '닫기' : '수정'}
                            </button>
                            <button onClick={async () => {
                              if (!confirm(`${bus.name}을 삭제하시겠습니까?`)) return
                              setBusFormSaving(true)
                              await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                                body: JSON.stringify({ action: 'delete_bus', bus_id: bus.id }) })
                              setBuses(prev => prev.filter(b => b.id !== bus.id))
                              if (editingBus?.id === bus.id) setEditingBus(null)
                              setBusFormSaving(false)
                            }}
                              className="text-[9px] font-bold text-[#EF4444] hover:bg-[#FEF2F2] px-1.5 py-0.5 rounded">
                              삭제
                            </button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="border-t border-[#F1F5F9] px-2 pb-2 pt-1.5 space-y-1 bg-[#F8FAFC]">
                            {[['차량명','name'],['기사','driver'],['기사 연락처','driver_phone'],['안전교사','safety'],['안전 연락처','safety_phone']].map(([label, field]) => (
                              <div key={field}>
                                <p className="text-[8px] font-bold text-[#94A3B8] mb-0.5">{label}</p>
                                <input value={(editBusForm as any)[field]} onChange={e => setEditBusForm(f => ({...f, [field]: e.target.value}))}
                                  className="w-full border border-[#E2E8F0] rounded px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                              </div>
                            ))}
                            <button disabled={busFormSaving}
                              onClick={async () => {
                                setBusFormSaving(true)
                                await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                                  body: JSON.stringify({ action: 'update_bus', bus_id: bus.id, ...editBusForm }) })
                                setBuses(prev => prev.map(b => b.id === bus.id ? {...b, ...editBusForm} : b))
                                setEditingBus(null); setBusFormSaving(false)
                              }}
                              className="w-full bg-[#004EA2] text-white py-1 rounded text-[10px] font-bold disabled:opacity-50">
                              {busFormSaving ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div className="border border-dashed border-[#E2E8F0] rounded-lg p-1.5 space-y-1">
                    <input value={addBusName} onChange={e => setAddBusName(e.target.value)}
                      placeholder="차량명 (예: 4호차)"
                      className="w-full border border-[#E2E8F0] rounded px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                    <button disabled={!addBusName.trim() || busFormSaving}
                      onClick={async () => {
                        setBusFormSaving(true)
                        const res = await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                          body: JSON.stringify({ action: 'add_bus', name: addBusName.trim() }) })
                        if (res.ok) { const d = await res.json(); setBuses(prev => [...prev, d.bus ?? { id: d.id, name: addBusName.trim(), sort_order: 99 }]); setAddBusName('') }
                        setBusFormSaving(false)
                      }}
                      className="w-full bg-[#F1F5F9] text-[#004EA2] py-1 rounded text-[10px] font-bold disabled:opacity-40 hover:bg-[#EAF2FB]">
                      + 차량 추가
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. 호차 선택 — 하단 (마미버스 제외) */}
            {(() => {
              const selectable = buses.filter(b => b.name !== '마미버스' && !b.name.includes('결석'))
              return (
                <>
                  <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider text-center mt-0.5">호차 선택</p>
                  <div className={selectable.length >= 8 ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-1'}>
                    {selectable.map((bus) => {
                      const bi = buses.findIndex(b => b.id === bus.id)
                      const color = getBusColor(bus.name, bi)
                      const active = selectedBuses.includes(bus.name)
                      return (
                        <button key={bus.name} onClick={() => toggleBus(bus.name)}
                          className="w-full py-1.5 rounded-xl text-[10px] font-bold border transition-colors flex items-center justify-center gap-1"
                          style={active
                            ? { background: color + '20', borderColor: color, color }
                            : { background: '#F8FAFC', borderColor: '#E2E8F0', color: '#94A3B8' }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? color : '#CBD5E1' }} />
                          {bus.name}
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ─ Page 2: 오늘 등하원 ─ */}
        {sidebarPage === 2 && (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-1.5 bg-white rounded-2xl border border-[#E2E8F0] p-2">
            <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider text-center mb-0.5 shrink-0">오늘 등하원</p>

            {/* 등 / 하원 단일선택 */}
            <div className="grid grid-cols-2 gap-1 shrink-0">
              <button onClick={() => { setP2Dir('arr'); setP2SelectedBus(null) }}
                className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${p2Dir === 'arr' ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white border-[#E2E8F0] text-[#64748B]'}`}>
                🚌 등원
              </button>
              <button onClick={() => { setP2Dir('dep'); setP2SelectedBus(null) }}
                className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${p2Dir === 'dep' ? 'bg-[#C62828] text-white border-[#C62828]' : 'bg-white border-[#E2E8F0] text-[#64748B]'}`}>
                🏠 하원
              </button>
            </div>

            {/* 세션 필터 (단일 선택, 재클릭 시 해제) */}
            <div className="shrink-0">
              <p className="text-[8px] font-bold text-[#94A3B8] mb-0.5">수업 유형</p>
              <div className="grid grid-cols-2 gap-0.5">
                {(['유치부', '매일반', '3일반', '2일반'] as const).map(f => (
                  <button key={f} onClick={() => { setP2SessionFilter(p2SessionFilter === f ? '' : f); setP2SelectedBus(null) }}
                    className={`py-1 rounded text-[9px] font-bold border transition-colors ${p2SessionFilter === f ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#004EA2]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* 호차 선택 */}
            {bothDirGroups.length === 0 ? (
              <div className="flex items-center justify-center py-2">
                <div className="w-4 h-4 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="shrink-0">
                <p className="text-[8px] font-bold text-[#94A3B8] mb-0.5">호차 설정</p>
                <select
                  value={p2SelectedBus ?? ''}
                  onChange={e => setP2SelectedBus(e.target.value || null)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#004EA2] bg-white">
                  <option value="">-- 호차를 선택하세요 --</option>
                  {filteredP2Buses.map(bus => {
                    const students = getP2BusStudents(bus.name, p2Dir, p2SessionFilter)
                    const filtered = p2DayFilter.length > 0 ? students.filter(s => s.days.some(d => p2DayFilter.includes(d))) : students
                    return (
                      <option key={bus.name} value={bus.name}>
                        {bus.name} ({filtered.length}명)
                      </option>
                    )
                  })}
                </select>
                {filteredP2Buses.length === 0 && (
                  <p className="text-[9px] text-[#94A3B8] text-center mt-1">해당 조건의 배차 없음</p>
                )}
              </div>
            )}

            {/* 요일 선택 */}
            <div className="shrink-0">
              <p className="text-[8px] font-bold text-[#94A3B8] mb-0.5">
                {p2SelectedBus ? `요일별 탑승 현황 (${p2SelectedBus})` : '요일'}
              </p>
              <div className="flex gap-0.5">
                {DAYS_ALL.map((d, di) => {
                  const isSelected = p2DayFilter.includes(d)
                  const busStudents = p2SelectedBus
                    ? getP2BusStudents(p2SelectedBus, p2Dir, p2SessionFilter).filter(s => s.days.includes(d))
                    : []
                  const hasBusOnDay = p2SelectedBus ? busStudents.length > 0 : false
                  return (
                    <button key={d}
                      onClick={() => setP2DayFilter(prev => prev.includes(d) ? [] : [d])}
                      className="flex-1 rounded text-[9px] font-bold border transition-colors flex flex-col items-center justify-center"
                      style={{
                        height: p2SelectedBus ? 38 : 24,
                        background: isSelected ? DAY_DOT_COLOR[di] : '#F1F5F9',
                        color: isSelected ? '#fff' : hasBusOnDay ? '#1E293B' : '#94A3B8',
                        borderColor: isSelected ? DAY_DOT_COLOR[di] : hasBusOnDay ? DAY_DOT_COLOR[di] + '80' : '#E2E8F0',
                      }}>
                      <span>{d}</span>
                      {p2SelectedBus && (
                        <span style={{ fontSize: 8, opacity: isSelected ? 0.85 : 0.7, marginTop: 1 }}>
                          {hasBusOnDay ? `${busStudents.length}명` : '-'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─ Page 3: 변경승인 (위) / 변경기록 (아래) 2분할 ─ */}
        {sidebarPage === 3 && (() => {
          const pending = changeRequests.filter(r => r.status === 'pending')
          const processed = changeRequests.filter(r => r.status !== 'pending').slice(0, 20)
          const refreshBtn = (
            <button onClick={() => {
              setP3Loading(true)
              fetch(`/api/campus/vehicles?requests=true${cqs}`)
                .then(r => r.ok ? r.json() : {} as any)
                .then((d: any) => { setChangeRequests(d.requests ?? []); setP3Loading(false) })
                .catch(() => setP3Loading(false))
            }} className="text-[9px] text-[#004EA2] font-bold hover:underline shrink-0">↺</button>
          )
          return (
            <div className="flex flex-col flex-1 min-h-0 gap-1.5">
              {/* 위: 변경 승인 */}
              <div className="flex flex-col bg-white rounded-2xl border border-[#E2E8F0] p-2 gap-1" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
                <div className="flex items-center justify-between shrink-0">
                  <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider">변경 승인</p>
                  {refreshBtn}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                  {p3Loading ? (
                    <div className="flex items-center justify-center py-3">
                      <div className="w-3 h-3 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : pending.length === 0 ? (
                    <p className="text-[9px] text-[#94A3B8] text-center py-2">대기 없음 ✅</p>
                  ) : pending.map(req => (
                    <div key={req.id} className="rounded-xl border border-[#FEF3C7] bg-[#FFFBEB] p-2 space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-[#1E293B] truncate flex-1">{req.student_name}</span>
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${req.direction === 'arr' ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'bg-[#FCE7F3] text-[#9D174D]'}`}>
                          {req.direction === 'arr' ? '등원' : '하원'}
                        </span>
                      </div>
                      <div className="text-[9px] text-[#475569]">
                        {req.from_bus ? `${req.from_bus} →` : '신규 →'} <span className="font-bold">{req.to_bus}</span>
                      </div>
                      {req.note && <div className="text-[9px] text-[#64748B] truncate">"{req.note}"</div>}
                      <div className="flex gap-1">
                        <button disabled={p3ActionLoading === req.id + '-approve'}
                          onClick={async () => {
                            setP3ActionLoading(req.id + '-approve')
                            const res = await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                              body: JSON.stringify({ action: 'approve_change_request', request_id: req.id }) })
                            if (res.ok) setChangeRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r))
                            setP3ActionLoading(null)
                          }}
                          className="flex-1 bg-[#10B981] text-white rounded-lg py-1 text-[9px] font-bold disabled:opacity-50">
                          {p3ActionLoading === req.id + '-approve' ? '...' : '승인'}
                        </button>
                        <button disabled={p3ActionLoading === req.id + '-reject'}
                          onClick={async () => {
                            setP3ActionLoading(req.id + '-reject')
                            const res = await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                              body: JSON.stringify({ action: 'reject_change_request', request_id: req.id }) })
                            if (res.ok) setChangeRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' } : r))
                            setP3ActionLoading(null)
                          }}
                          className="flex-1 bg-[#EF4444] text-white rounded-lg py-1 text-[9px] font-bold disabled:opacity-50">
                          {p3ActionLoading === req.id + '-reject' ? '...' : '거절'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 아래: 변경 기록 */}
              <div className="flex flex-col bg-white rounded-2xl border border-[#E2E8F0] p-2 gap-1" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
                <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider shrink-0">변경 기록</p>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                  {p3Loading ? (
                    <div className="flex items-center justify-center py-3">
                      <div className="w-3 h-3 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : processed.length === 0 ? (
                    <p className="text-[9px] text-[#94A3B8] text-center py-2">기록 없음</p>
                  ) : processed.map(req => (
                    <div key={req.id} className="rounded-xl border border-[#F1F5F9] bg-[#FAFAFA] p-1.5 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-[#475569] truncate flex-1">{req.student_name}</span>
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
                          {req.status === 'approved' ? '승인' : '거절'}
                        </span>
                      </div>
                      <div className="text-[9px] text-[#94A3B8]">
                        {req.from_bus ? `${req.from_bus} → ` : ''}{req.to_bus} · {req.direction === 'arr' ? '등원' : '하원'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>

    {/* ── 좌측 패널 편집 모달 */}
    {leftEditModal && (() => {
      const stu = leftEditModal.student
      const busColor = getBusColor(leftEditBus, buses.findIndex(b => b.name === leftEditBus))
      return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 pointer-events-auto"
          onClick={e => { if (e.target === e.currentTarget) setLeftEditModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] w-[360px] p-5 space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-extrabold text-[#1E293B] text-base">{stu.name}</p>
                <p className="text-xs text-[#64748B]">{leftEditModal.dir === 'arr' ? '등원' : '하원'} · {leftEditModal.sessionName}</p>
              </div>
              <button onClick={() => setLeftEditModal(null)} className="text-[#94A3B8] hover:text-[#475569] text-xl font-bold leading-none">×</button>
            </div>

            {/* 호차 선택 */}
            <div>
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1">호차</p>
              <div className="flex flex-wrap gap-1.5">
                {buses.filter(b => !b.name.includes('결석') && b.name !== '마미버스').map((b, bi) => {
                  const bc = getBusColor(b.name, bi)
                  const isOn = leftEditBus === b.name
                  return (
                    <button key={b.name} onClick={() => setLeftEditBus(b.name)}
                      className="px-3 py-1 rounded-lg text-xs font-bold border transition-colors"
                      style={isOn ? { background: bc, color: '#fff', borderColor: bc } : { background: '#F8FAFC', color: '#475569', borderColor: '#E2E8F0' }}>
                      {b.name}
                    </button>
                  )
                })}
                <button onClick={() => setLeftEditBus('')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${leftEditBus === '' ? 'bg-[#EF4444] text-white border-[#EF4444]' : 'bg-white text-[#94A3B8] border-[#E2E8F0]'}`}>
                  미배정
                </button>
              </div>
            </div>

            {/* 정류장 */}
            <div>
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1">정류장</p>
              <input value={leftEditLoc} onChange={e => setLeftEditLoc(e.target.value)}
                placeholder="정류장 이름"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
            </div>

            {/* 탑승 시간 */}
            <div>
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1">탑승 시간</p>
              <input value={leftEditTime} onChange={e => setLeftEditTime(e.target.value)}
                placeholder="예: 17:10"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
            </div>

            {/* 요일 */}
            <div>
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1">요일</p>
              <div className="flex gap-1.5">
                {(['월','화','수','목','금'] as const).map((d, di) => {
                  const isOn = leftEditDays.includes(d)
                  return (
                    <button key={d}
                      onClick={() => setLeftEditDays(prev => isOn ? prev.filter(x => x !== d) : [...prev, d])}
                      className="flex-1 h-8 rounded-lg text-xs font-bold border transition-colors"
                      style={isOn ? { background: DAY_DOT_COLOR[di], color: '#fff', borderColor: DAY_DOT_COLOR[di] } : { background: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' }}>
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 pt-1">
              <button onClick={handleLeftEditDelete} disabled={leftEditSaving}
                className="px-4 py-2 rounded-xl text-sm font-bold text-[#EF4444] border border-[#FECACA] hover:bg-[#FEF2F2] disabled:opacity-40 transition-colors">
                배정 삭제
              </button>
              <div className="flex-1"/>
              <button onClick={() => setLeftEditModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9] transition-colors">
                취소
              </button>
              <button onClick={handleLeftEditSave} disabled={leftEditSaving}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40"
                style={{ background: busColor }}>
                {leftEditSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )
    })()}
    {/* ── 좌측 패널 탑승자 추가 모달 */}
    {leftAddModal && (
      <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[9001] px-0 sm:px-4"
        onClick={() => { setLeftAddModal(null); resetLeftRiderForm() }}>
        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-[#1E293B]">신규 탑승자 추가</h3>
              <p className="text-[11px] text-[#64748B]">{leftAddModal.bus} · {leftAddModal.dir === 'arr' ? '등원' : '하원'} · 영구</p>
            </div>
            <button onClick={() => { setLeftAddModal(null); resetLeftRiderForm() }} className="text-[#94A3B8] text-xl">✕</button>
          </div>
          {(() => {
            const bus = leftAddModal.bus
            const dir = leftAddModal.dir
            const dirGroups = bothDirGroups.filter(x => x.dir === dir).map(x => x.group)
            const srcGroups = leftAddModal.sessionName
              ? dirGroups.filter(g => getRunLabel(g.session_name, dir) === leftAddModal.sessionName)
              : dirGroups
            const existTimes = [...new Set(
              srcGroups.flatMap(g => (g.busMap[bus] ?? []).map(s => s.pickup_time)).filter(Boolean) as string[]
            )].sort()
            const locsAtTime = leftRiderTime
              ? [...new Set(dirGroups.flatMap(g =>
                  (g.busMap[bus] ?? []).filter(s => normalizeTime(s.pickup_time ?? '') === leftRiderTime).map(s => s.location).filter((x): x is string => x != null)
                ))]
              : []
            const allLocs = [...new Set(srcGroups.flatMap(g => g.busLocations[bus] ?? []))]
            const existLocs = locsAtTime.length > 0 ? locsAtTime : allLocs
            return (
              <div className="space-y-3">
                {/* 학생 검색 */}
                <div>
                  <label className="text-[10px] font-bold text-[#64748B] mb-1 block">학생명 *</label>
                  {leftRiderSelected ? (
                    <div className="flex items-center gap-2 border border-[#004EA2] rounded-xl px-3 py-2">
                      <span className="text-sm font-semibold flex-1">{leftRiderSelected.name}</span>
                      <button onClick={() => { setLeftRiderSelected(null); setLeftRiderSearch('') }} className="text-[#94A3B8] text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={leftRiderSearch} onChange={e => filterLeftStudents(e.target.value)} placeholder="이름 검색..."
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus />
                      {leftRiderSearch.trim().length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                          {leftRiderResults.length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-[#94A3B8] text-center">검색 결과 없음</div>
                          ) : (
                            leftRiderResults.map(s => (
                              <button key={s.id}
                                onClick={() => { setLeftRiderSelected({ id: s.id, name: s.name }); setLeftRiderSearch(''); setLeftRiderResults([]) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFF6FF] transition-colors">
                                <span className="font-semibold">{s.name}</span>
                                {s.english_name && <span className="ml-1.5 text-[10px] text-[#94A3B8]">{s.english_name}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* 승차 시간 */}
                <div>
                  <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">승차 시간</label>
                  {leftRiderTimeMode === 'select' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {existTimes.map(t => (
                        <button key={t} onClick={() => { setLeftRiderTime(normalizeTime(t)); setLeftRiderLocation(''); setLeftRiderLocMode('select') }}
                          className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                          style={leftRiderTime === normalizeTime(t) ? { background: '#004EA2', color: '#fff', borderColor: '#004EA2' } : { background: '#F7F8FA', color: '#475569', borderColor: '#E2E8F0' }}>
                          ⏱ {normalizeTime(t)}
                        </button>
                      ))}
                      <button onClick={() => { setLeftRiderTimeMode('new'); setLeftRiderTime('') }}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2]">
                        + 새 시간
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input value={leftRiderTime} onChange={e => setLeftRiderTime(e.target.value)}
                        onBlur={e => setLeftRiderTime(normalizeTime(e.target.value))}
                        placeholder="예: 08:40"
                        className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus />
                      {existTimes.length > 0 && (
                        <button onClick={() => { setLeftRiderTimeMode('select'); setLeftRiderTime('') }}
                          className="text-xs text-[#94A3B8] px-2">목록</button>
                      )}
                    </div>
                  )}
                </div>
                {/* 승차 장소 */}
                <div>
                  <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">
                    승차 장소
                    {leftRiderTime && locsAtTime.length > 0 && (
                      <span className="text-[9px] text-[#94A3B8] ml-1">({leftRiderTime} 기존 정류장)</span>
                    )}
                  </label>
                  {leftRiderLocMode === 'select' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {existLocs.map(loc => (
                        <button key={loc} onClick={() => {
                          setLeftRiderLocation(loc)
                          if (!leftRiderTime) {
                            const times = dirGroups.flatMap(g =>
                              (g.busMap[bus] ?? []).filter(s => s.location === loc && s.pickup_time).map(s => s.pickup_time as string)
                            )
                            if (times.length > 0) {
                              const freq: Record<string, number> = {}
                              times.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 })
                              setLeftRiderTime(normalizeTime(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]))
                              setLeftRiderTimeMode('select')
                            }
                          }
                        }}
                          className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                          style={leftRiderLocation === loc ? { background: '#004EA2', color: '#fff', borderColor: '#004EA2' } : { background: '#F7F8FA', color: '#475569', borderColor: '#E2E8F0' }}>
                          📍 {loc}
                        </button>
                      ))}
                      <button onClick={() => { setLeftRiderLocMode('new'); setLeftRiderLocation('') }}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2]">
                        + 새 장소
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input value={leftRiderLocation} onChange={e => setLeftRiderLocation(e.target.value)} placeholder="예: 중계역 2번출구"
                        className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus />
                      {existLocs.length > 0 && (
                        <button onClick={() => { setLeftRiderLocMode('select'); setLeftRiderLocation('') }}
                          className="text-xs text-[#94A3B8] px-2">목록</button>
                      )}
                    </div>
                  )}
                </div>
                {/* 탑승 요일 */}
                <div>
                  <label className="text-[10px] font-bold text-[#64748B] mb-1 block">탑승 요일 *</label>
                  <div className="flex gap-2">
                    {(['월','화','수','목','금'] as const).map((d, di) => {
                      const active = leftRiderDays.includes(d)
                      return (
                        <button key={d}
                          onClick={() => setLeftRiderDays(prev => active ? prev.filter(x => x !== d) : [...prev, d])}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
                          style={active ? { background: DAY_DOT_COLOR[di], color: '#fff', borderColor: DAY_DOT_COLOR[di] } : { background: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' }}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setLeftAddModal(null); resetLeftRiderForm() }}
              className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
            <button onClick={handleLeftAddRider}
              disabled={!leftRiderSelected || leftRiderDays.length === 0 || leftRiderSaving}
              className="flex-1 bg-[#004EA2] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
              {leftRiderSaving ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
