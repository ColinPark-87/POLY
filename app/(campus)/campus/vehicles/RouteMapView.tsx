'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

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

interface Bus { id: string; name: string; sort_order: number }
interface StudentEntry {
  student_id: string; name: string
  location: string | null; pickup_time: string | null; days: string[]
}
interface TimeGroup {
  session_name: string; time_range: string
  busMap: Record<string, StudentEntry[]>
  busLocations: Record<string, string[]>
}
interface RouteStop { name: string; time: string | null; count: number; studentNames: string[] }
interface KakaoResult { name: string; address: string; lat: number; lng: number }

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

  const [tmapRoutes, setTmapRoutes] = useState<Record<string, [number, number][]>>({})
  const [tmapLoading, setTmapLoading] = useState(false)
  const [tmapDebug, setTmapDebug] = useState<string>('')

  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadGeocoding, setUploadGeocoding] = useState(false)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(true)

  // 등하원 통합 정류장 데이터 (좌표 설정용)
  const [bothDirGroups, setBothDirGroups] = useState<{ group: TimeGroup; dir: 'arr' | 'dep' }[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/campus/vehicles?direction=arr&master=true${cqs}`).then(r => r.ok ? r.json() : { timeGroups: [] }),
      fetch(`/api/campus/vehicles?direction=dep&master=true${cqs}`).then(r => r.ok ? r.json() : { timeGroups: [] }),
    ]).then(([a, d]) => {
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
    const schoolBase = campusId ? {} : { [SCHOOL_STOP.name]: { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng } }
    // 먼저 localStorage로 빠르게 표시
    try {
      const s = localStorage.getItem(coordsKey)
      if (s) setCoords({ ...schoolBase, ...JSON.parse(s) })
      else setCoords(schoolBase)
    } catch { setCoords(schoolBase) }
    // DB에서 최신 데이터 가져와 덮어쓰기
    fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.coords) return
        const merged = { ...schoolBase, ...d.coords }
        setCoords(merged)
        localStorage.setItem(coordsKey, JSON.stringify(d.coords))
      })
      .catch(() => {})
  }, [])

  const updateCoords = useCallback(async (c: Record<string, { lat: number; lng: number }>) => {
    let toSave: Record<string, { lat: number; lng: number }>
    if (campusId) {
      // 외부 캠퍼스: 캠퍼스 위치 포함 모든 좌표 저장
      setCoords(c)
      toSave = c
    } else {
      // 중계: 학원 좌표는 하드코딩이므로 DB 저장 제외
      const { [SCHOOL_STOP.name]: _school, ...rest } = c
      setCoords({ [SCHOOL_STOP.name]: { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng }, ...rest })
      toSave = rest
    }
    localStorage.setItem(coordsKey, JSON.stringify(toSave))
    // DB 저장
    setCoordsSaving(true)
    try {
      await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coords: toSave }),
      })
    } catch {}
    setCoordsSaving(false)
  }, [campusId])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campus/vehicles?direction=${dir}&master=true${cqs}`)
      if (res.ok) { const d = await res.json(); setGroups(d.timeGroups ?? []); setBuses(d.buses ?? []) }
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
    setSelectedBuses(prev =>
      prev.includes(name) ? prev.filter(b => b !== name) : [...prev, name]
    )
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

  // Leaflet 초기화
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapRef.current) return
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    import('leaflet').then(L => {
      if (!mapContainerRef.current || mapRef.current) return
      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(mapContainerRef.current!, { center: [37.5665, 127.0], zoom: 12, zoomControl: false })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19,
      }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map; setMapReady(true)
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setMapReady(false) } }
  }, [])

  // 지도 클릭
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const h = (e: any) => {
      if (!candidateStop) return
      const { lat, lng } = e.latlng
      setCandidateCoord({ lat, lng })
      setManualCoord(prev => ({ ...prev, [candidateStop]: { lat: lat.toFixed(6), lng: lng.toFixed(6) } }))
    }
    map.on('click', h)
    return () => map.off('click', h)
  }, [mapReady, candidateStop])

  useEffect(() => {
    const c = mapRef.current?.getContainer?.()
    if (c) c.style.cursor = candidateStop ? 'crosshair' : ''
  }, [candidateStop])

  // 후보 마커 (드래그 가능)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current; if (!map) return
      if (candidateMarkerRef.current) { map.removeLayer(candidateMarkerRef.current); candidateMarkerRef.current = null }
      if (!candidateCoord || !candidateStop) return
      const marker = L.marker([candidateCoord.lat, candidateCoord.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab">
            <div style="background:#FCD34D;border:3px solid #F59E0B;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.4)">
              <div style="width:8px;height:8px;background:#92400E;border-radius:50%"></div></div>
            <div style="margin-top:3px;background:#1E293B;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,.3)">${candidateStop}</div>
          </div>`,
          iconSize: [30, 54], iconAnchor: [15, 15],
        }),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map)
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        setCandidateCoord({ lat, lng })
        setManualCoord(prev => ({ ...prev, [candidateStop]: { lat: lat.toFixed(6), lng: lng.toFixed(6) } }))
      })
      candidateMarkerRef.current = marker
    })
  }, [mapReady, candidateCoord, candidateStop])

  // 티맵 경로 fetch — 브라우저에서 직접 호출 (한국 IP 필요)
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_TMAP_APP_KEY
    if (!selectedBuses.length) return
    if (!appKey) { setTmapDebug('❌ appKey 없음'); return }

    const newRoutes: Record<string, [number, number][]> = {}
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
          if (f.geometry?.type === 'LineString') {
            for (const c of f.geometry.coordinates ?? []) pts.push([c[1], c[0]])
          }
        }
        if (pts.length > 1) { newRoutes[busName] = pts; setTmapDebug(`✅ ${busName}: ${pts.length}개 좌표`) }
        else setTmapDebug(`⚠️ features: ${data.features?.length ?? 0}개, 좌표 없음`)
      }).catch(e => { setTmapDebug(`❌ fetch 오류: ${String(e).slice(0, 100)}`) }).finally(() => {
        pending--
        if (pending === 0) setTmapRoutes(prev => ({ ...prev, ...newRoutes }))
      })
    }
    if (pending === 0) { setTmapRoutes({}); setTmapDebug('⚠️ 좌표 설정된 정류장 2개 미만') }
  }, [selectedBuses, routeStopsByBus, coords])

  // 노선 렌더 (선택된 모든 버스, 버스별 색상)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current; if (!map) return
      markersRef.current.forEach(m => map.removeLayer(m)); markersRef.current = []
      polylinesRef.current.forEach(p => map.removeLayer(p)); polylinesRef.current = []

      const allPts: [number, number][] = []

      for (const busName of selectedBuses) {
        const stops = routeStopsByBus[busName] ?? []
        if (stops.length === 0) continue
        const busIdx = buses.findIndex(b => b.name === busName)
        const color = getBusColor(busName, busIdx)
        const pts: [number, number][] = stops.filter(s => coords[s.name]).map(s => [coords[s.name].lat, coords[s.name].lng])
        pts.forEach(p => allPts.push(p))

        // 티맵 경로가 있으면 도로 경로, 없으면 직선 폴백
        const routePts: [number, number][] = tmapRoutes[busName] ?? pts

        if (routePts.length > 1) {
          polylinesRef.current.push(L.polyline(routePts, { color, weight: 5, opacity: 0.85 }).addTo(map))
          // 방향 화살표는 중간 지점마다 표시
          const arrowPts = tmapRoutes[busName] ? routePts.filter((_, i) => i % 8 === 4) : routePts
          for (let i = 0; i < arrowPts.length - 1; i++) {
            const cur = arrowPts[i], next = arrowPts[i + 1]
            const mid: [number, number] = [(cur[0]+next[0])/2, (cur[1]+next[1])/2]
            const angle = Math.atan2(next[1]-cur[1], next[0]-cur[0]) * 180 / Math.PI
            markersRef.current.push(L.marker(mid, {
              icon: L.divIcon({ className: '', html: `<div style="transform:rotate(${angle}deg);color:${color};font-size:16px;text-shadow:0 0 4px white">▶</div>`, iconSize:[16,16], iconAnchor:[8,8] }),
              interactive: false,
            }).addTo(map))
          }
        }

        let num = 0
        for (const stop of stops) {
          const c = coords[stop.name]; if (!c) continue
          const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
          num++
          const timeStr = stop.time ? normalizeTime(stop.time) : ''
          const names = stop.studentNames.slice(0, 6).join(', ') + (stop.studentNames.length > 6 ? ` 외 ${stop.studentNames.length-6}명` : '')
          const markerHtml = isSchool
            ? `<div style="display:flex;flex-direction:column;align-items:center">
                <div style="background:#004EA2;border:3px solid #fff;border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;box-shadow:0 3px 12px rgba(0,0,0,.4)">P</div>
                <div style="margin-top:2px;background:#004EA2;color:#fff;font-size:8px;font-weight:800;padding:1px 5px;border-radius:4px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.2)">${effectiveSchoolName ?? '학원'}</div>
              </div>`
            : `<div style="display:flex;flex-direction:column;align-items:center">
                <div style="background:${color};border:2.5px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,.35)">${num}</div>
                <div style="margin-top:2px;background:white;border:1.5px solid ${color};color:#1E293B;font-size:8px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.15)">${stop.name}</div>
              </div>`
          markersRef.current.push(
            L.marker([c.lat, c.lng], {
              icon: L.divIcon({ className: '', html: markerHtml, iconSize: [34, 52], iconAnchor: [17, 17] }),
              zIndexOffset: isSchool ? 2000 : 0,
            })
            .bindPopup(`<div style="font-family:sans-serif;min-width:160px;padding:4px 2px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                ${isSchool
                  ? `<span style="background:#004EA2;color:#fff;border-radius:6px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900">P</span>`
                  : `<span style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${num}</span>`}
                <b style="font-size:13px">${stop.name}</b>
              </div>
              ${isSchool ? `<div style="color:#004EA2;font-size:11px;font-weight:700">${dir === 'arr' ? '🏫 도착지' : '🏫 출발지'}</div>` : `
              <div style="color:#94A3B8;font-size:10px;font-weight:700;margin-bottom:2px">${busName}</div>
              ${timeStr ? `<div style="color:#64748B;font-size:12px;margin-bottom:4px">⏱ ${timeStr}</div>` : ''}
              <div style="color:#1E293B;font-size:11px">👥 ${stop.count}명 — ${names}</div>`}
            </div>`, { maxWidth: 250 })
            .addTo(map)
          )
        }
      }

      if (allPts.length > 0) map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50] })
    })
  }, [mapReady, routeStopsByBus, coords, selectedBuses, buses, tmapRoutes])

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
    setManualCoord(prev => ({ ...prev, [stopName]: { lat: result.lat.toFixed(6), lng: result.lng.toFixed(6) } }))
    // 검색 결과 주소 자동 채우기
    setStopAddress(prev => {
      const next = { ...prev, [stopName]: result.address }
      try { localStorage.setItem(addressKey, JSON.stringify(next)) } catch {}
      return next
    })
    mapRef.current?.flyTo([result.lat, result.lng], 17, { animate: true, duration: 0.6 })
  }

  function openStop(stopName: string) {
    setExpandedStop(prev => prev === stopName ? null : stopName)
    if (!stopQuery[stopName]) setStopQuery(prev => ({ ...prev, [stopName]: stopName }))
    const c = coords[stopName]
    if (c) mapRef.current?.flyTo([c.lat, c.lng], 16, { animate: true, duration: 0.5 })
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
                  {results.slice(0, 4).map((r, ri) => (
                    <button key={ri} onClick={() => applyCandidate(stopName, r)}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-[10px] leading-relaxed bg-[#F7F8FA] text-[#475569] hover:bg-[#E8F0FB] transition-colors">
                      <span className="font-bold block">{r.name}</span>
                      <span className="opacity-75">{r.address}</span>
                    </button>
                  ))}
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
              type="text" inputMode="decimal"
              value={manualCoord[stopName]?.lat ?? ''}
              onChange={e => setManualCoord(prev => ({ ...prev, [stopName]: { lat: e.target.value, lng: prev[stopName]?.lng ?? '' } }))}
              placeholder="위도 37.xxxx"
              className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
            <input
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
              mapRef.current?.flyTo([c.lat, c.lng], 17, { animate: true, duration: 0.5 })
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

  return (
    <div className="flex gap-3" style={{ height: 'calc(100vh - 230px)', minHeight: 520 }}>

      {/* ── 왼쪽 패널 */}
      <div className="w-72 flex flex-col gap-2 shrink-0">

        {/* 세션 × 방향 빠른 선택 */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-2 space-y-1.5">
          <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider px-1">빠른 선택 (전체호차)</p>
          {sessionDirOptions.map(opt => (
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

        {/* 패널 탭 */}
        <div className="flex bg-[#F1F5F9] rounded-xl p-0.5 gap-0.5">
          {(['route', 'coords'] as const).map(v => (
            <button key={v} onClick={() => setPanelView(v)}
              className={`flex-1 py-1.5 rounded-[10px] text-xs font-semibold transition-colors ${panelView === v ? 'bg-white text-[#004EA2] shadow-sm' : 'text-[#64748B]'}`}>
              {v === 'route' ? '🗺 노선 보기' : `📍 좌표 설정 (${setStopsCount}/${allStops.length})`}
            </button>
          ))}
        </div>

        {/* 캠퍼스 좌표 지정 */}
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
          {expandedStop === effectiveSchoolName && renderStopExpanded(effectiveSchoolName)}
        </div>
        )}

        {/* ══ 노선 보기 ══ */}
        {panelView === 'route' && (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">

            {/* 버스 선택 (다중) */}
            {sessionBuses.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#94A3B8] font-semibold">호차 선택</span>
                  <button
                    onClick={() => setSelectedBuses(allSelected ? [] : sessionBuses.map(b => b.name))}
                    className="text-[10px] font-bold text-[#004EA2] hover:underline">
                    {allSelected ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
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
            )}

            {/* 타임라인 — 버스별 섹션 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedBuses.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-10">
                  {!selectedSession ? '세션을 선택해주세요' : '호차를 선택해주세요'}
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedBuses.map(busName => {
                    const stops = routeStopsByBus[busName] ?? []
                    const busIdx = buses.findIndex(b => b.name === busName)
                    const color = getBusColor(busName, busIdx)
                    const cnt = busStudentCount[busName] ?? 0
                    return (
                      <div key={busName}>
                        {/* 호차 헤더 */}
                        <div className="flex items-center gap-2 px-1 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs font-bold" style={{ color }}>{busName}</span>
                          <span className="text-[10px] text-[#94A3B8]">{cnt}명 · {stops.length}정류장</span>
                          <div className="flex-1 h-px bg-[#F1F5F9]" />
                        </div>
                        {stops.length === 0 ? (
                          <p className="text-[10px] text-[#CBD5E1] text-center py-2">정류장 데이터 없음</p>
                        ) : (
                          <div className="relative pl-1">
                            <div className="absolute left-[23px] top-3 bottom-3 w-0.5 bg-[#E2E8F0] z-0" />
                            <div className="space-y-1.5 relative z-10">
                              {stops.map((stop, idx) => {
                                const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
                                const hasCoord = !!coords[stop.name]
                                const isExpanded = expandedStop === stop.name
                                if (isSchool) return (
                                  <div key="school" className="flex items-center gap-2 px-3 py-2 bg-[#EAF2FB] rounded-2xl border border-[#004EA2]/30">
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 bg-[#004EA2]">P</div>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-bold text-[#004EA2]">{effectiveSchoolName ?? SCHOOL_STOP.name}</span>
                                      <p className="text-[9px] text-[#64748B] mt-0.5">{dir === 'arr' ? '도착지' : '출발지'}</p>
                                    </div>
                                  </div>
                                )
                                return (
                                  <div key={stop.name + busName}
                                    className={`bg-white rounded-2xl border transition-all overflow-hidden ${isExpanded ? 'border-[#004EA2] shadow-md' : 'border-[#E2E8F0]'}`}>
                                    <button onClick={() => openStop(stop.name)}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F7F8FA] transition-colors">
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                        style={{ background: hasCoord ? color : '#CBD5E1' }}>
                                        {idx + 1}
                                      </div>
                                      <div className="flex-1 text-left min-w-0">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className={`text-xs font-semibold truncate ${hasCoord ? 'text-[#1E293B]' : 'text-[#94A3B8]'}`}>
                                            {stop.name}
                                          </span>
                                          {!hasCoord && <span className="text-[9px] text-[#EF4444] bg-[#FEF2F2] px-1.5 py-0.5 rounded font-bold shrink-0">좌표없음</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="text-[10px] text-[#64748B] font-mono">
                                            {stop.time ? `⏱ ${normalizeTime(stop.time)}` : <span className="text-[#CBD5E1]">시간 미설정</span>}
                                          </span>
                                          <span className="text-[10px] text-[#94A3B8]">👥 {stop.count}명</span>
                                        </div>
                                      </div>
                                      <svg className={`w-3 h-3 text-[#CBD5E1] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    {isExpanded && (
                                      <div className="px-3 pb-3 space-y-2 border-t border-[#F1F5F9]">
                                        <div className="pt-2 flex flex-wrap gap-1">
                                          {stop.studentNames.map(n => (
                                            <span key={n} className="text-[10px] bg-[#F1F5F9] text-[#475569] px-2 py-0.5 rounded-lg">{n}</span>
                                          ))}
                                        </div>
                                        {renderStopExpanded(stop.name)}
                                      </div>
                                    )}
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
              )}
            </div>
          </div>
        )}

        {/* ══ 좌표 설정 ══ */}
        {panelView === 'coords' && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {allStops.filter(s => !coords[s.name]).length > 0 && (
              <button onClick={runBatchSearch} disabled={batchLoading}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#004EA2] text-white hover:bg-[#003580] disabled:opacity-60 flex items-center justify-center gap-2">
                {batchLoading
                  ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />자동 검색 중... {batchProgress}%</>
                  : <>🔍 미설정 {allStops.filter(s => !coords[s.name]).length}개 자동 검색</>}
              </button>
            )}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
              {/* 헤더 — 항상 표시 */}
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

              {/* 펼쳐진 내용 */}
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
      </div>

      {/* ── 지도 */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm">
        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 현재 노선 배지 */}
        {panelView === 'route' && selectedSession && selectedBuses.length > 0 && !loading && (
          <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
            <div className="bg-white/95 rounded-xl shadow-md px-3 py-2 flex items-center gap-2 border border-[#E2E8F0] flex-wrap max-w-xs">
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg text-white shrink-0"
                style={{ background: getSessionColor(selectedSession) }}>
                {selectedSession}
              </span>
              {selectedBuses.map(busName => (
                <span key={busName} className="text-xs font-bold shrink-0"
                  style={{ color: getBusColor(busName, buses.findIndex(b => b.name === busName)) }}>
                  {busName}
                </span>
              ))}
              <span className="text-xs text-[#64748B] shrink-0">{dir === 'arr' ? '등원' : '하원'}</span>
            </div>
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
    </div>
  )
}
