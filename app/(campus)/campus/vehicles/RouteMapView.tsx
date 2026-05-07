'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

const COORDS_KEY = 'shuttle-stop-coords'

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
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return t
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

export default function RouteMapView() {
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

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedBus, setSelectedBus] = useState<string | null>(null)
  const [panelView, setPanelView] = useState<PanelView>('route')

  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [stopQuery, setStopQuery] = useState<Record<string, string>>({})
  const [stopResults, setStopResults] = useState<Record<string, KakaoResult[]>>({})
  const [stopSearching, setStopSearching] = useState<Record<string, boolean>>({})
  const [candidateStop, setCandidateStop] = useState<string | null>(null)
  const [candidateCoord, setCandidateCoord] = useState<{ lat: number; lng: number } | null>(null)

  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [excelDownloaded, setExcelDownloaded] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadGeocoding, setUploadGeocoding] = useState(false)

  // 등하원 통합 정류장 데이터 (좌표 설정용)
  const [bothDirGroups, setBothDirGroups] = useState<{ group: TimeGroup; dir: 'arr' | 'dep' }[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/campus/vehicles?direction=arr&master=true').then(r => r.ok ? r.json() : { timeGroups: [] }),
      fetch('/api/campus/vehicles?direction=dep&master=true').then(r => r.ok ? r.json() : { timeGroups: [] }),
    ]).then(([a, d]) => {
      setBothDirGroups([
        ...(a.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'arr' as const })),
        ...(d.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'dep' as const })),
      ])
    })
  }, [])

  useEffect(() => {
    try { const s = localStorage.getItem(COORDS_KEY); if (s) setCoords(JSON.parse(s)) } catch {}
  }, [])

  const updateCoords = useCallback((c: Record<string, { lat: number; lng: number }>) => {
    setCoords(c); localStorage.setItem(COORDS_KEY, JSON.stringify(c))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campus/vehicles?direction=${dir}&master=true`)
      if (res.ok) { const d = await res.json(); setGroups(d.timeGroups ?? []); setBuses(d.buses ?? []) }
    } finally { setLoading(false) }
  }, [dir])
  useEffect(() => { loadData() }, [loadData])

  // 세션 옵션
  const sessionOptions = useMemo(() => {
    const labelMap = new Map<string, number>()
    for (const g of groups) {
      const label = getRunLabel(g.session_name, dir)
      const pri = getSessPriority(g.session_name, dir)
      if (!labelMap.has(label) || labelMap.get(label)! > pri) labelMap.set(label, pri)
    }
    return [...labelMap.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => ({ label, color: getSessionColor(label) }))
  }, [groups, dir])

  // 세션 자동 선택
  useEffect(() => {
    if (!sessionOptions.length) return
    setSelectedSession(prev => (!prev || !sessionOptions.find(s => s.label === prev)) ? sessionOptions[0].label : prev)
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

  // 버스 자동 선택
  useEffect(() => {
    if (!sessionBuses.length) return
    setSelectedBus(prev => (!prev || !sessionBuses.find(b => b.name === prev)) ? sessionBuses[0].name : prev)
  }, [sessionBuses])

  // 선택 버스의 정류장 (시간순)
  const routeStops = useMemo((): RouteStop[] => {
    if (!selectedSession || !selectedBus) return []
    const locMap = new Map<string, { time: string | null; count: number; names: string[] }>()
    for (const g of groups) {
      if (getRunLabel(g.session_name, dir) !== selectedSession) continue
      for (const s of (g.busMap[selectedBus] ?? [])) {
        if (!s.location) continue
        const loc = s.location.trim()
        if (!locMap.has(loc)) locMap.set(loc, { time: null, count: 0, names: [] })
        const e = locMap.get(loc)!
        e.count++
        if (!e.names.includes(s.name)) e.names.push(s.name)
        if (s.pickup_time && (!e.time || parseTimeMin(s.pickup_time) < parseTimeMin(e.time))) e.time = s.pickup_time
      }
    }
    return [...locMap.entries()]
      .map(([name, info]) => ({ name, time: info.time, count: info.count, studentNames: info.names }))
      .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
  }, [groups, dir, selectedSession, selectedBus])

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
    const h = (e: any) => { if (candidateStop) setCandidateCoord({ lat: e.latlng.lat, lng: e.latlng.lng }) }
    map.on('click', h)
    return () => map.off('click', h)
  }, [mapReady, candidateStop])

  useEffect(() => {
    const c = mapRef.current?.getContainer?.()
    if (c) c.style.cursor = candidateStop ? 'crosshair' : ''
  }, [candidateStop])

  // 후보 마커
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current; if (!map) return
      if (candidateMarkerRef.current) { map.removeLayer(candidateMarkerRef.current); candidateMarkerRef.current = null }
      if (!candidateCoord || !candidateStop) return
      candidateMarkerRef.current = L.marker([candidateCoord.lat, candidateCoord.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="background:#FCD34D;border:3px solid #F59E0B;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.4)">
              <div style="width:8px;height:8px;background:#92400E;border-radius:50%"></div></div>
            <div style="margin-top:3px;background:#1E293B;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,.3)">${candidateStop}</div>
          </div>`,
          iconSize: [30, 54], iconAnchor: [15, 15],
        }), zIndexOffset: 1000,
      }).addTo(map)
    })
  }, [mapReady, candidateCoord, candidateStop])

  // 노선 렌더 (선택 버스만, 번호 마커)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current; if (!map) return
      markersRef.current.forEach(m => map.removeLayer(m)); markersRef.current = []
      polylinesRef.current.forEach(p => map.removeLayer(p)); polylinesRef.current = []
      if (!selectedBus || routeStops.length === 0) return

      const busIdx = buses.findIndex(b => b.name === selectedBus)
      const color = getBusColor(selectedBus, busIdx)
      const pts: [number, number][] = routeStops.filter(s => coords[s.name]).map(s => [coords[s.name].lat, coords[s.name].lng])

      if (pts.length > 1) {
        polylinesRef.current.push(L.polyline(pts, { color, weight: 5, opacity: 0.9 }).addTo(map))
        for (let i = 0; i < pts.length - 1; i++) {
          const mid: [number, number] = [(pts[i][0]+pts[i+1][0])/2, (pts[i][1]+pts[i+1][1])/2]
          const angle = Math.atan2(pts[i+1][1]-pts[i][1], pts[i+1][0]-pts[i][0]) * 180 / Math.PI
          markersRef.current.push(L.marker(mid, {
            icon: L.divIcon({ className: '', html: `<div style="transform:rotate(${angle}deg);color:${color};font-size:16px;text-shadow:0 0 4px white">▶</div>`, iconSize:[16,16], iconAnchor:[8,8] }),
            interactive: false,
          }).addTo(map))
        }
      }

      let num = 0
      for (const stop of routeStops) {
        const c = coords[stop.name]; if (!c) continue
        num++
        const timeStr = stop.time ? normalizeTime(stop.time) : ''
        const names = stop.studentNames.slice(0, 6).join(', ') + (stop.studentNames.length > 6 ? ` 외 ${stop.studentNames.length-6}명` : '')
        markersRef.current.push(
          L.marker([c.lat, c.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="display:flex;flex-direction:column;align-items:center">
                <div style="background:${color};border:2.5px solid #fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,.35)">${num}</div>
                <div style="margin-top:3px;background:white;border:1.5px solid ${color};color:#1E293B;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.15)">${stop.name}</div>
              </div>`,
              iconSize: [34, 56], iconAnchor: [17, 17],
            }),
          })
          .bindPopup(`<div style="font-family:sans-serif;min-width:160px;padding:4px 2px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${num}</span>
              <b style="font-size:14px">${stop.name}</b>
            </div>
            ${timeStr ? `<div style="color:#64748B;font-size:12px;margin-bottom:4px">⏱ ${timeStr}</div>` : ''}
            <div style="color:#1E293B;font-size:11px">👥 ${stop.count}명 — ${names}</div>
          </div>`, { maxWidth: 250 })
          .addTo(map)
        )
      }

      if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] })
    })
  }, [mapReady, routeStops, coords, selectedBus, buses])

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
    mapRef.current?.flyTo([result.lat, result.lng], 17, { animate: true, duration: 0.6 })
  }

  function openStop(stopName: string) {
    setExpandedStop(prev => prev === stopName ? null : stopName)
    if (!stopQuery[stopName]) setStopQuery(prev => ({ ...prev, [stopName]: stopName }))
    const c = coords[stopName]
    if (c) mapRef.current?.flyTo([c.lat, c.lng], 16, { animate: true, duration: 0.5 })
    if (candidateStop !== stopName) { setCandidateStop(null); setCandidateCoord(null) }
  }

  function saveStop(stopName: string) {
    if (!candidateCoord) return
    updateCoords({ ...coords, [stopName]: candidateCoord })
    setCandidateStop(null); setCandidateCoord(null); setExpandedStop(null)
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
    XLSX.writeFile(wb, '정류장좌표_등하원.xlsx'); setExcelDownloaded(true)
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
    setExcelDownloaded(false); setTimeout(() => setUploadMsg(''), 5000)
  }

  // ── 공통 정류장 확장 패널 렌더
  function renderStopExpanded(stopName: string) {
    const hasCoord = !!coords[stopName]
    const isCandidate = candidateStop === stopName
    const results = stopResults[stopName] ?? []
    const searching = stopSearching[stopName] ?? false

    return (
      <div className="px-3 pb-3 space-y-2 border-t border-[#F1F5F9]">

        {/* ① 현재 설정된 좌표 + 삭제 버튼 */}
        {hasCoord && (
          <div className="mt-2 flex items-center justify-between bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3 py-2">
            <div>
              <p className="text-[9px] text-[#16A34A] font-bold mb-0.5">현재 위치</p>
              <p className="text-[10px] font-mono text-[#14532D]">
                {coords[stopName].lat.toFixed(5)}, {coords[stopName].lng.toFixed(5)}
              </p>
            </div>
            <button
              onClick={() => { const c = { ...coords }; delete c[stopName]; updateCoords(c) }}
              className="text-[11px] font-bold text-[#EF4444] border border-[#FCA5A5] px-3 py-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors shrink-0">
              삭제
            </button>
          </div>
        )}

        {/* ② 검색 입력 */}
        <div className={`flex gap-1.5 ${hasCoord ? '' : 'pt-2'}`}>
          <input
            value={stopQuery[stopName] ?? stopName}
            onChange={e => setStopQuery(prev => ({ ...prev, [stopName]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && searchStop(stopName)}
            placeholder="장소명 또는 주소 입력"
            className="flex-1 text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
          />
          <button onClick={() => searchStop(stopName)} disabled={searching}
            className="px-3 py-2 bg-[#004EA2] text-white text-[11px] font-bold rounded-xl disabled:opacity-50 hover:bg-[#003580] shrink-0">
            {searching ? '…' : '검색'}
          </button>
        </div>

        {/* ③ 검색 결과 목록 */}
        {results.length > 0 && (
          <div className="space-y-1">
            {results.slice(0, 4).map((r, ri) => {
              const sel = isCandidate && candidateCoord?.lat === r.lat && candidateCoord?.lng === r.lng
              return (
                <button key={ri} onClick={() => applyCandidate(stopName, r)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-[10px] leading-relaxed transition-colors ${sel ? 'bg-[#004EA2] text-white' : 'bg-[#F7F8FA] text-[#475569] hover:bg-[#E8F0FB]'}`}>
                  <span className="font-bold block">{r.name}</span>
                  <span className="opacity-75">{r.address}</span>
                </button>
              )
            })}
          </div>
        )}
        {results.length === 0 && !searching && stopResults[stopName] !== undefined && (
          <p className="text-[10px] text-[#94A3B8] text-center py-1">검색 결과 없음 — 검색어 변경 또는 지도 직접 클릭</p>
        )}

        {/* ④ 후보 선택됨 → 추가/변경/취소 버튼 */}
        {isCandidate && candidateCoord ? (
          <div className="bg-[#FEF9C3] border border-[#FCD34D] rounded-xl px-3 py-2.5 space-y-2">
            <p className="text-[10px] text-[#92400E] font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse inline-block shrink-0" />
              지도 클릭으로 위치 미세 조정 가능
            </p>
            <p className="text-[10px] font-mono text-[#78350F]">
              {candidateCoord.lat.toFixed(6)}, {candidateCoord.lng.toFixed(6)}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setCandidateStop(null); setCandidateCoord(null) }}
                className="flex-1 py-2 rounded-xl text-[11px] font-semibold text-[#64748B] bg-white border border-[#E2E8F0] hover:bg-[#F7F8FA] transition-colors">
                취소
              </button>
              <button
                onClick={() => saveStop(stopName)}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white transition-colors"
                style={{ background: hasCoord ? '#D97706' : '#004EA2' }}>
                {hasCoord ? '변경' : '추가'}
              </button>
            </div>
          </div>
        ) : (
          /* ⑤ 후보 미선택 상태 안내 */
          !hasCoord && results.length === 0 && stopResults[stopName] === undefined && (
            <p className="text-[10px] text-[#CBD5E1] text-center pb-1">
              검색하거나 지도를 클릭해 위치를 선택하세요
            </p>
          )
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-3" style={{ height: 'calc(100vh - 230px)', minHeight: 520 }}>

      {/* ── 왼쪽 패널 */}
      <div className="w-72 flex flex-col gap-2 shrink-0">

        {/* 방향 토글 */}
        <div className="flex gap-1.5">
          {(['arr', 'dep'] as const).map(d => (
            <button key={d} onClick={() => setDir(d)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                dir === d ? (d === 'arr' ? 'bg-[#2196F3] text-white' : 'bg-[#DC2626] text-white')
                : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>
              {d === 'arr' ? '🚌 등원' : '🏠 하원'}
            </button>
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

        {/* ══ 노선 보기 ══ */}
        {panelView === 'route' && (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">

            {/* 세션 선택 */}
            {sessionOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sessionOptions.map(opt => (
                  <button key={opt.label}
                    onClick={() => { setSelectedSession(opt.label); setSelectedBus(null) }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border`}
                    style={selectedSession === opt.label
                      ? { background: opt.color, borderColor: opt.color, color: '#fff' }
                      : { background: '#fff', borderColor: '#E2E8F0', color: '#64748B' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* 버스 선택 */}
            {sessionBuses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sessionBuses.map(bus => {
                  const color = getBusColor(bus.name, buses.findIndex(b => b.id === bus.id))
                  const active = selectedBus === bus.name
                  const cnt = busStudentCount[bus.name] ?? 0
                  return (
                    <button key={bus.name} onClick={() => setSelectedBus(bus.name)}
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
            )}

            {/* 타임라인 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !selectedBus || routeStops.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-10">
                  {!selectedSession ? '세션을 선택해주세요' : !selectedBus ? '호차를 선택해주세요' : '정류장 데이터 없음'}
                </p>
              ) : (
                <div className="relative pl-1">
                  {/* 세로 타임라인 선 */}
                  <div className="absolute left-[23px] top-5 bottom-5 w-0.5 bg-[#E2E8F0] z-0" />
                  <div className="space-y-1.5 relative z-10">
                    {routeStops.map((stop, idx) => {
                      const busIdx = buses.findIndex(b => b.name === selectedBus)
                      const color = getBusColor(selectedBus ?? '', busIdx)
                      const hasCoord = !!coords[stop.name]
                      const isExpanded = expandedStop === stop.name
                      return (
                        <div key={stop.name}
                          className={`bg-white rounded-2xl border transition-all overflow-hidden ${isExpanded ? 'border-[#004EA2] shadow-md' : 'border-[#E2E8F0]'}`}>
                          <button onClick={() => openStop(stop.name)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F7F8FA] transition-colors">
                            {/* 번호 뱃지 */}
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
                              {/* 탑승 학생 */}
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
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-[#1E293B]">좌표 일괄 입력 (등하원 통합)</p>
                <p className="text-[10px] text-[#64748B] mt-0.5 leading-relaxed">
                  주소 칸을 입력하면 위도/경도 자동 변환<br />
                  위도/경도 직접 입력도 가능합니다
                </p>
              </div>
              <div className={`rounded-2xl border p-3 space-y-2 ${!excelDownloaded ? 'border-[#004EA2] bg-[#F0F9FF]' : 'border-[#E2E8F0] opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${!excelDownloaded ? 'bg-[#004EA2] text-white' : 'bg-[#10B981] text-white'}`}>
                    {excelDownloaded ? '✓' : '1'}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1E293B]">양식 다운로드</p>
                    <p className="text-[9px] text-[#64748B]">등원+하원 정류장 {allStops.length}개 포함</p>
                  </div>
                </div>
                <button onClick={downloadTemplate}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#004EA2] text-white hover:bg-[#003580]">
                  📥 등하원 통합 양식 다운로드
                </button>
                {excelDownloaded && (
                  <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl p-2.5 space-y-1">
                    <p className="text-[9px] font-bold text-[#92400E]">💡 작성 방법 (둘 중 하나만 입력)</p>
                    <p className="text-[9px] text-[#78350F] leading-relaxed">
                      · <b>주소</b> 칸: 실제 주소 입력 → 자동 변환<br />
                      · <b>위도/경도</b> 칸: 좌표 직접 입력<br />
                      · 방향/호차는 참고용 (수정 불필요)
                    </p>
                  </div>
                )}
              </div>
              <div className={`rounded-2xl border p-3 space-y-2 ${excelDownloaded ? 'border-[#004EA2] bg-[#F0F9FF]' : 'border-[#E2E8F0] opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${excelDownloaded ? 'bg-[#004EA2] text-white' : 'bg-[#E2E8F0] text-[#94A3B8]'}`}>2</div>
                  <p className="text-xs font-semibold text-[#1E293B]">채운 파일 업로드</p>
                </div>
                <button onClick={() => uploadRef.current?.click()} disabled={!excelDownloaded || uploadGeocoding}
                  className="w-full py-2.5 rounded-xl text-xs font-bold border-2 border-dashed border-[#004EA2] text-[#004EA2] hover:bg-[#EAF2FB] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {uploadGeocoding
                    ? <><div className="w-3 h-3 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />주소 변환 중...</>
                    : '📤 파일 선택하여 업로드'}
                </button>
                <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
              </div>
              {uploadMsg && (
                <div className={`border rounded-xl px-3 py-2.5 text-xs font-semibold text-center ${uploadGeocoding ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]' : 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'}`}>
                  {uploadMsg}
                </div>
              )}
              {setStopsCount > 0 && (
                <button onClick={() => { if (confirm(`설정된 좌표 ${setStopsCount}개를 모두 초기화할까요?`)) { updateCoords({}); setExcelDownloaded(false) } }}
                  className="w-full py-2 rounded-xl text-[10px] text-[#EF4444] border border-[#FECACA] hover:bg-[#FEF2F2]">
                  좌표 전체 초기화
                </button>
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
        {panelView === 'route' && selectedSession && selectedBus && !loading && (
          <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
            <div className="bg-white/95 rounded-xl shadow-md px-3 py-2 flex items-center gap-2 border border-[#E2E8F0]">
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg text-white"
                style={{ background: getSessionColor(selectedSession) }}>
                {selectedSession}
              </span>
              <span className="text-xs font-bold" style={{ color: getBusColor(selectedBus, buses.findIndex(b => b.name === selectedBus)) }}>
                {selectedBus}
              </span>
              <span className="text-xs text-[#64748B]">
                {dir === 'arr' ? '등원' : '하원'} · {routeStops.filter(s => coords[s.name]).length}/{routeStops.length}
              </span>
            </div>
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
        {!loading && panelView === 'route' && routeStops.length > 0 && routeStops.every(s => !coords[s.name]) && !candidateStop && (
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
