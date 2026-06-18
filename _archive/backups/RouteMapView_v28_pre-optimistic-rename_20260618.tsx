'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Script from 'next/script'
import { buildStopSearchResults, type StopSearchRow, type RegisteredStop } from '@/lib/utils/stop-search'
import { cleanRoutePolyline, type LatLng } from '@/lib/utils/route-geometry'
import { buildScheduleUpdate, detectPerDay } from '@/lib/utils/vehicle-schedule'
import { normStop, sameStop } from '@/lib/utils/stop-name'
import { aptNameMatches } from '@/lib/utils/apartment-name'
import { PresenceBadge } from '@/components/campus/PresenceBadge'
import { ConflictModal, type Conflict } from '@/components/campus/ConflictModal'

const COORDS_KEY = 'shuttle-stop-coords'
const SCHOOL_STOP = { name: '중계폴리어학원', lat: 37.6556, lng: 127.0686 }

// 지도 오버레이(CustomOverlay content)는 HTML 문자열로 DOM에 삽입되므로,
// DB·엑셀 유래 문자열(정류장명·학생명·학교/아파트명)은 반드시 이스케이프해 저장형 XSS를 막는다.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string))

// 서로 최대한 구분되는 팔레트 (겹침/유사색 제거)
const BUS_COLORS = ['#2563EB','#EA580C','#16A34A','#9333EA','#0891B2','#DB2777','#CA8A04','#64748B','#0D9488','#B45309']
const BUS_COLOR_MAP: Record<string, string> = {
  '1호차': '#EA580C', '2호차': '#2563EB', '3호차': '#9333EA',
  '5호차': '#16A34A', '6호차': '#0891B2', '7호차': '#DB2777',
  '8호차': '#64748B', '마미버스': '#CA8A04', '개별등하원': '#CA8A04',
}
// 노선·탑승장소가 없는 "개별 등하원" 성격의 차량 (개별등하원/마미버스/차량안탐)
const isIndividualBus = (name: string) => /개별|마미|안탐/.test(name)
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

interface Bus { id: string; name: string; sort_order: number; capacity?: number; driver?: string; driver_phone?: string; safety?: string; safety_phone?: string; kt_name?: string; kt_phone?: string }
interface StudentEntry {
  student_id: string; name: string; class_id?: string
  location: string | null; pickup_time: string | null; days: string[]
  dayLocs?: Record<string, string>  // 요일별 탑승 장소
  dayTimes?: Record<string, string>  // 요일별 탑승 시간 (정류장 자동 매칭)
  busByDay?: Record<string, string>  // 요일별 호차 (요일별 다른 호차 편집용)
  override?: boolean
  updated_at?: string | null  // enrollment 버전(충돌검사 baseVersion)
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

// 차량 정원 상태 (정원 17명 기준) — 여유 / 주의 / 만차
const BUS_CAP = 17
function capStatus(n: number, cap: number = BUS_CAP): { label: string; color: string; bg: string; ring: string } {
  if (n > cap) return { label: '만차', color: '#DC2626', bg: '#FEF2F2', ring: '#FECACA' }
  if (n >= cap - 2) return { label: '주의', color: '#D97706', bg: '#FFFBEB', ring: '#FDE68A' }
  return { label: '여유', color: '#16A34A', bg: '#F0FDF4', ring: '#BBF7D0' }
}

export default function RouteMapView({ campusId, campusName, fullscreen = false, showPresence = true, onEditingChange }: { campusId?: string; campusName?: string; fullscreen?: boolean; showPresence?: boolean; onEditingChange?: (editing: boolean) => void }) {
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
  const schoolMarkersRef = useRef<any[]>([])
  const campusMarkerRef = useRef<any>(null)
  const centeredRef = useRef(false)
  const coordsRef = useRef<Record<string, { lat: number; lng: number }>>({})
  const schoolGeocodedRef = useRef(false)
  const academyGeoRef = useRef(false) // 좌표0 캠퍼스 학원명 지오코딩 센터링 1회 가드

  const [loading, setLoading] = useState(true)
  const [dir, setDir] = useState<'arr' | 'dep'>('dep')
  const [groups, setGroups] = useState<TimeGroup[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  // 현재 좌표(coords)가 어느 캠퍼스(coordsKey)의 것인지 추적 — 캠퍼스 전환 중 옛 좌표로 잘못 센터링되는 것 방지
  const [coordsLoadedKey, setCoordsLoadedKey] = useState('')
  // DB 좌표 로드 완료 키 — 로드 중 잠깐 빈 좌표로 학원 지오코딩 폴백이 잘못 도는 것 방지
  const [coordsDbLoadedKey, setCoordsDbLoadedKey] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [coordsSaving, setCoordsSaving] = useState(false)
  const [schoolSpots, setSchoolSpots] = useState<Record<string, { lat: number; lng: number; count: number }>>({})
  const [aptSpots, setAptSpots] = useState<Record<string, { lat: number; lng: number; count: number }>>({})
  const [showSchoolSpots, setShowSchoolSpots] = useState(true)
  const [showAptSpots, setShowAptSpots] = useState(true)
  const [spotManage, setSpotManage] = useState<'school' | 'apt' | null>(null)
  const [schoolRaw, setSchoolRaw] = useState<{ name: string; count: number }[]>([])
  const [aptRaw, setAptRaw] = useState<{ name: string; count: number }[]>([])
  const [placeSpots, setPlaceSpots] = useState<{ kind: string; name: string; lat: number | null; lng: number | null; hidden: boolean }[]>([])
  const [placeAddName, setPlaceAddName] = useState('')
  const aptMarkersRef = useRef<any[]>([])
  // v5: 2026-06-17 — 캠퍼스 전환 중 옛 캠퍼스 센터로 잘못 지오코딩되어 캐시에 저장된
  // 오염 데이터(타캠퍼스 권역 마킹)를 무효화하기 위해 v4→v5 버전업.
  const schoolSpotsCacheKey = `school-spots-v5-${campusId ?? 'default'}`
  const aptSpotsCacheKey = `apt-spots-v5-${campusId ?? 'default'}`

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedBuses, setSelectedBuses] = useState<string[]>([])

  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  // 카드에서 정류장 클릭 시 뜨는 작은 팝업 (명단·좌표설정) — 인라인이 아니라 오버레이로
  const [stopPopup, setStopPopup] = useState<{ bus: string; stop: string } | null>(null)
  const [stopQuery, setStopQuery] = useState<Record<string, string>>({})
  const [stopResults, setStopResults] = useState<Record<string, KakaoResult[]>>({})
  const [stopSearching, setStopSearching] = useState<Record<string, boolean>>({})
  const [candidateStop, setCandidateStop] = useState<string | null>(null)
  const [candidateCoord, setCandidateCoord] = useState<{ lat: number; lng: number } | null>(null)
  // 빈 정류장 마스터 (학생 0명 정류장) — DB campus_registered_stops
  const [registeredStops, setRegisteredStops] = useState<RegisteredStop[]>([])
  // "새 정류장 추가" 모달 (빈 정류장 등록 — 학생 배정 없음)
  const [addStopModal, setAddStopModal] = useState<{ bus: string; dir: 'arr' | 'dep'; sessionName: string } | null>(null)
  const [addStopName, setAddStopName] = useState('')
  const [addStopTime, setAddStopTime] = useState('')
  const [addStopSaving, setAddStopSaving] = useState(false)
  // true면 지도에서 핀을 찍는 중 (모달을 안내 바로 축소해 지도 클릭 허용)
  const [addStopPlacing, setAddStopPlacing] = useState(false)
  // "새 정류장 추가" 카드 드래그 위치 (null이면 기본 중앙 상단)
  const addStopCardRef = useRef<HTMLDivElement | null>(null)
  const [addStopCardPos, setAddStopCardPos] = useState<{ x: number; y: number } | null>(null)
  // 정류장 수정 팝업(renderStopExpanded) 드래그 위치 (null이면 기본 우상단)
  const stopCardRef = useRef<HTMLDivElement | null>(null)
  const [stopCardPos, setStopCardPos] = useState<{ x: number; y: number } | null>(null)

  const [manualCoord, setManualCoord] = useState<Record<string, { lat: string; lng: string }>>({})
  const [advOpen, setAdvOpen] = useState<Record<string, boolean>>({})
  // 좌표 탭: 정류장 검색 + 보기 모드 (전체 / 호차별 / 미설정)
  const [coordsSearch, setCoordsSearch] = useState('')
  const [coordsView, setCoordsView] = useState<'all' | 'bus' | 'unset'>('all')
  // 호차별 보기 — 선택된 호차/수업유형
  const [coordsBus, setCoordsBus] = useState('')
  const [coordsSession, setCoordsSession] = useState('')
  // 정류장 편집창: 세션·방향별 운행 시간 편집
  const [stopTimeEdit, setStopTimeEdit] = useState<Record<string, string>>({})
  const [stopTimeSaving, setStopTimeSaving] = useState<string | null>(null)
  const [stopTimeEditingKey, setStopTimeEditingKey] = useState<string | null>(null)
  // 위치 조정 모드 — 지도에서 정류장 핀을 끌어 좌표 수정
  const [adjustMode, setAdjustMode] = useState(false)
  const [adjustToast, setAdjustToast] = useState('')
  // 드래그 후 저장 확인 대기 (자동저장 대신 확인 + 되돌리기)
  const [pendingMove, setPendingMove] = useState<{ name: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null>(null)
  const pendingMarkerRef = useRef<any>(null)
  // 학교/아파트(placeSpot) 위치 보정 — 드래그 핀 + 좌표 입력 (탑승장소 수정과 유사)
  const [placeAdjust, setPlaceAdjust] = useState<{ kind: 'school' | 'apt'; name: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null>(null)
  const [placeCoordStr, setPlaceCoordStr] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' })
  const placeMarkerRef = useRef<any>(null)
  // 탑승장소 수정 팝업 열림 시 해당 정류장을 지도에서 강조하는 하이라이트 마커
  const stopEditHlRef = useRef<any>(null)
  const [stopAddress, setStopAddress] = useState<Record<string, string>>({})
  const [stopRename, setStopRename] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<Record<string, boolean>>({})
  const [stopSelectedResult, setStopSelectedResult] = useState<Record<string, KakaoResult>>({})

  const [tmapRoutes, setTmapRoutes] = useState<Record<string, [number, number][]>>({})
  const [tmapSummaries, setTmapSummaries] = useState<Record<string, { time: number; distance: number }>>({})
  const [tmapBothDirRoutes, setTmapBothDirRoutes] = useState<{ arr: Record<string, [number,number][]>; dep: Record<string, [number,number][]> }>({ arr: {}, dep: {} })
  const [tmapDebug, setTmapDebug] = useState<string>('')

  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadGeocoding, setUploadGeocoding] = useState(false)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false)
  const [bothDir, setBothDir] = useState(false)
  const [editingBus, setEditingBus] = useState<Bus | null>(null)
  const [editBusForm, setEditBusForm] = useState({ name:'', capacity:'', driver:'', driver_phone:'', safety:'', safety_phone:'', kt_name:'', kt_phone:'' })
  const [busSettingsOpen, setBusSettingsOpen] = useState(false)
  const [addBusName, setAddBusName] = useState('')
  const [busFormSaving, setBusFormSaving] = useState(false)
  const [kakaoSdkReady, setKakaoSdkReady] = useState(false)
  const [stopSearchQuery, setStopSearchQuery] = useState('')
  const highlightMarkerRef = useRef<any>(null)

  // 등하원 통합 정류장 데이터 (좌표 설정용)
  const [bothDirGroups, setBothDirGroups] = useState<{ group: TimeGroup; dir: 'arr' | 'dep' }[]>([])

  // 차량 일정 편집 모달 (우측 통합 패널 타임라인에서 사용)
  const [leftEditModal, setLeftEditModal] = useState<{ student: StudentEntry; busName: string; dir: 'arr' | 'dep'; sessionName: string } | null>(null)
  // 지도 탭 편집 중 여부(presence '편집 중' 표시용) — 페이지(부모)에 보고
  const mapEditing = !!leftEditModal || !!candidateStop || !!addStopModal || adjustMode || !!placeAdjust
  useEffect(() => { onEditingChange?.(mapEditing) }, [mapEditing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange?.(false), []) // 언마운트 시 편집 해제 // eslint-disable-line react-hooks/exhaustive-deps
  const [leftEditBus, setLeftEditBus] = useState('')
  const [leftEditLoc, setLeftEditLoc] = useState('')
  const [leftEditTime, setLeftEditTime] = useState('')
  const [leftEditDays, setLeftEditDays] = useState<string[]>([])
  const [leftEditSaving, setLeftEditSaving] = useState(false)
  // 동시편집 충돌(409) 모달
  const [conflict, setConflict] = useState<Conflict | null>(null)
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
  const [sidebarPage, setSidebarPage] = useState<1 | 2 | 3 | 4 | 5>(1)
  // 리모컨 플로팅 위치 (지도 컨테이너 기준 px). null = 기본(우상단). 드래그로 이동, localStorage 기억
  const [remotePos, setRemotePos] = useState<{ x: number; y: number } | null>(null)
  const [remoteMinimized, setRemoteMinimized] = useState(false)
  const vehRootRef = useRef<HTMLDivElement>(null)
  const remoteWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { const s = localStorage.getItem('veh-remote-pos'); if (s) setRemotePos(JSON.parse(s)) } catch {}
  }, [])
  useEffect(() => {
    try { const s = localStorage.getItem(`veh-remote-min-${campusId ?? 'default'}`); setRemoteMinimized(s === '1') } catch {}
  }, [campusId])
  useEffect(() => {
    try { localStorage.setItem(`veh-remote-min-${campusId ?? 'default'}`, remoteMinimized ? '1' : '0') } catch {}
  }, [remoteMinimized, campusId])
  function startRemoteDrag(e: React.PointerEvent) {
    const cont = vehRootRef.current, wrap = remoteWrapRef.current
    if (!cont || !wrap) return
    const cr = cont.getBoundingClientRect(), wr = wrap.getBoundingClientRect()
    const offX = e.clientX - wr.left, offY = e.clientY - wr.top
    const w = wrap.offsetWidth, h = wrap.offsetHeight
    const move = (ev: PointerEvent) => {
      let x = ev.clientX - cr.left - offX, y = ev.clientY - cr.top - offY
      x = Math.max(0, Math.min(x, cr.width - w)); y = Math.max(0, Math.min(y, cr.height - h))
      setRemotePos({ x, y })
    }
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end)
      setRemotePos(p => { try { if (p) localStorage.setItem('veh-remote-pos', JSON.stringify(p)) } catch {} return p })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  // ── 호차 명단 카드(학생설정 풀편집) 상태 — 리모컨 스타일 플로팅, 페이지와 무관하게 토글 ──
  const [rosterOpen, setRosterOpen] = useState(false)
  const [rosterMin, setRosterMin] = useState(false)
  const [rosterPos, setRosterPos] = useState<{ x: number; y: number } | null>(null)
  const rosterWrapRef = useRef<HTMLDivElement>(null)
  const [rosterBus, setRosterBus] = useState<string | null>(null)
  const [rosterSession, setRosterSession] = useState('')
  const [rosterDir, setRosterDir] = useState<'arr' | 'dep'>('dep')
  const [rosterDay, setRosterDay] = useState('') // '' = 주간 전체, 아니면 월~금 (정원은 하루 단위라 요일별로 봐야 정확)
  // 노선(Page1) 요일 필터 — '' = 주간 전체, 아니면 월~금. 선택 요일에 타는 학생만으로 노선 그려 하루치 동선만 깔끔.
  const [routeDay, setRouteDay] = useState('')
  // 기본은 '주간 전체'(routeDay/rosterDay='') — 모든 요일 학생·정류장을 다 보여준다.
  // (오늘 자동필터로 강제하면 그날 안 타는 학생/정류장이 통째로 숨어 '엉망'으로 보여 되돌림.)
  // 오늘 요일(월~금, 주말이면 ''). 카드 헤더 '오늘 N명' 표시 전용 — 목록/노선 필터엔 절대 사용 안 함.
  const todayWeekday = useMemo(() => { const k = ['일','월','화','수','목','금','토'][new Date().getDay()]; return (['월','화','수','목','금'] as string[]).includes(k) ? k : '' }, [])
  // 호차 명단 풀편집 인라인 에디터 상태 (요일별 호차/장소/시간)
  const [rEditModal, setREditModal] = useState<{ student: StudentEntry; busName: string; dir: 'arr' | 'dep'; sessionName: string } | null>(null)
  const [rEditBus, setREditBus] = useState('')
  const [rEditLoc, setREditLoc] = useState('')
  const [rEditTime, setREditTime] = useState('')
  const [rEditDays, setREditDays] = useState<string[]>([])
  const [rEditPerDay, setREditPerDay] = useState(false)
  const [rEditDayBus, setREditDayBus] = useState<Record<string, string>>({})
  const [rEditDayLoc, setREditDayLoc] = useState<Record<string, string>>({})
  const [rEditDayTime, setREditDayTime] = useState<Record<string, string>>({})
  const [rEditSaving, setREditSaving] = useState(false)
  useEffect(() => { try { const s = localStorage.getItem('veh-roster-pos'); if (s) setRosterPos(JSON.parse(s)) } catch {} }, [])
  useEffect(() => { try { setRosterOpen(localStorage.getItem(`veh-roster-open-${campusId ?? 'default'}`) === '1') } catch {} }, [campusId])
  useEffect(() => { try { localStorage.setItem(`veh-roster-open-${campusId ?? 'default'}`, rosterOpen ? '1' : '0') } catch {} }, [rosterOpen, campusId])
  useEffect(() => { try { setRosterMin(localStorage.getItem(`veh-roster-min-${campusId ?? 'default'}`) === '1') } catch {} }, [campusId])
  useEffect(() => { try { localStorage.setItem(`veh-roster-min-${campusId ?? 'default'}`, rosterMin ? '1' : '0') } catch {} }, [rosterMin, campusId])
  function startFloatDrag(e: React.PointerEvent, wrapRef: React.RefObject<HTMLDivElement | null>, setPos: (p: { x: number; y: number }) => void, storageKey: string) {
    const cont = vehRootRef.current, wrap = wrapRef.current
    if (!cont || !wrap) return
    const cr = cont.getBoundingClientRect(), wr = wrap.getBoundingClientRect()
    const offX = e.clientX - wr.left, offY = e.clientY - wr.top
    const w = wrap.offsetWidth, h = wrap.offsetHeight
    let last: { x: number; y: number } | null = null
    const move = (ev: PointerEvent) => {
      let x = ev.clientX - cr.left - offX, y = ev.clientY - cr.top - offY
      x = Math.max(0, Math.min(x, cr.width - w)); y = Math.max(0, Math.min(y, cr.height - h))
      last = { x, y }; setPos(last)
    }
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end)
      try { if (last) localStorage.setItem(storageKey, JSON.stringify(last)) } catch {}
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  function startRosterDrag(e: React.PointerEvent) { startFloatDrag(e, rosterWrapRef, setRosterPos, 'veh-roster-pos') }
  // Hero 정원 배지 클릭 시 호차별 현황 팝업
  const [capPopup, setCapPopup] = useState<{ name: string; count: number; cap: number }[] | null>(null)
  // 좌측 호차 카드 클릭 시 확장 팝업 (호차명)
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

  // 호차 명단 카드: 현재 보고 있는 화면의 선택(방향/세션/호차)을 "처음 뜰 때 기본값"으로 매칭.
  //  - 노선(Page1): 우측 리모컨의 dir/selectedSession/selectedBuses
  //  - 그 외(정류장학생 등): p2Dir/p2SessionFilter/p2SelectedBus
  // ※ 매칭은 기본값일 뿐 — 카드 셀렉터로 옆 호차·다른 세션 자유 이동 가능(못 가게 막지 않음).
  //   리모컨 선택이 "실제로" 바뀐 경우(시그니처 변경)에만 재매칭해, 카드 수동 변경을 되돌리지 않는다.
  const rosterSyncRef = useRef('')
  useEffect(() => {
    if (!rosterOpen) { rosterSyncRef.current = ''; return } // 닫으면 리셋 → 다시 열 때 재매칭
    const src = sidebarPage === 1
      ? { d: dir, session: selectedSession ?? '', buses: selectedBuses }
      : { d: p2Dir, session: p2SessionFilter, buses: p2SelectedBus ? [p2SelectedBus] : [] }
    const sig = `${sidebarPage}|${src.d}|${src.session}|${src.buses.join(',')}`
    if (sig === rosterSyncRef.current) return // 리모컨 선택 그대로 → 카드 수동 변경 보존
    rosterSyncRef.current = sig
    setRosterDir(src.d)
    if (src.session) setRosterSession(src.session)
    setRosterBus(prev => {
      const first = src.buses[0]
      if (!first) return prev
      if (prev && src.buses.includes(prev)) return prev
      return first
    })
  }, [rosterOpen, sidebarPage, dir, selectedSession, selectedBuses, p2Dir, p2SessionFilter, p2SelectedBus])

  useEffect(() => {
    const cx = campusId ?? ''
    // stale-while-revalidate: 캐시 즉시 표시 후 항상 최신 재조회 (외부 변경 stale 방지)
    const apply = (a: { timeGroups?: TimeGroup[] }, d: { timeGroups?: TimeGroup[] }) => setBothDirGroups([
      ...(a.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'arr' as const })),
      ...(d.timeGroups ?? []).map((g: TimeGroup) => ({ group: g, dir: 'dep' as const })),
    ])
    // 1) 캐시가 둘 다 있으면 즉시 표시
    try {
      const ca = sessionStorage.getItem(`vc-arr-${cx}`), cd = sessionStorage.getItem(`vc-dep-${cx}`)
      if (ca && cd) { const pa = JSON.parse(ca), pd = JSON.parse(cd); if (pa.d && pd.d) apply(pa.d, pd.d) }
    } catch {}
    // 2) 항상 최신 재조회 후 갱신
    const fetchFresh = (direction: string) =>
      fetch(`/api/campus/vehicles?direction=${direction}&master=true${cqs}`)
        .then(r => r.ok ? r.json() : { timeGroups: [] })
        .then(d => { try { sessionStorage.setItem(`vc-${direction}-${cx}`, JSON.stringify({ d, t: Date.now() })) } catch {}; return d })
    Promise.all([fetchFresh('arr'), fetchFresh('dep')]).then(([a, d]) => apply(a, d))
  }, [campusId, cqs])

  // 옛 공유 캐시(캠퍼스 구분 이전 'shuttle-stop-coords') 제거 — 캠퍼스 간 정류장/좌표 오염 방지
  useEffect(() => {
    try { localStorage.removeItem(COORDS_KEY); localStorage.removeItem(`${COORDS_KEY}-address`) } catch {}
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
    // 먼저 localStorage로 빠르게 표시 (이 캠퍼스(coordsKey)의 좌표로 교체 → 옛 캠퍼스 좌표 제거)
    try {
      const s = localStorage.getItem(coordsKey)
      if (s) setCoords({ ...schoolFallback, ...JSON.parse(s) })
      else setCoords(schoolFallback)
    } catch { setCoords(schoolFallback) }
    setCoordsLoadedKey(coordsKey)
    // DB에서 최신 데이터 가져와 덮어쓰기 (DB 값이 있으면 하드코딩보다 우선)
    fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.coords) return
        const merged = { ...schoolFallback, ...d.coords }
        setCoords(merged)
        setCoordsLoadedKey(coordsKey)
        localStorage.setItem(coordsKey, JSON.stringify(merged))
      })
      .catch(() => {})
      .finally(() => setCoordsDbLoadedKey(coordsKey))
  }, [coordsKey])

  // coordsRef: coords 상태를 ref에 동기화 (비동기 effect에서 최신 좌표 접근용)
  useEffect(() => { coordsRef.current = coords }, [coords])

  // 빈 정류장 마스터 로드
  const reloadRegisteredStops = useCallback(() => {
    fetch(`/api/campus/registered-stops${campusId ? `?campus_id=${campusId}` : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stops) setRegisteredStops(d.stops) })
      .catch(() => {})
  }, [campusId])
  useEffect(() => { reloadRegisteredStops() }, [reloadRegisteredStops])

  // 학교/아파트 spot 오버라이드(좌표보정·추가·숨김) 로드
  const reloadPlaceSpots = () => {
    fetch(`/api/campus/place-spots${campusId ? `?campus_id=${campusId}` : ''}`)
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.spots) setPlaceSpots(d.spots) }).catch(() => {})
  }
  useEffect(() => { reloadPlaceSpots() }, [campusId])

  // 학교/아파트 상위 목록(인원수) — 지오코딩 캐시와 무관하게 항상 로드
  // HQ에서 캠퍼스를 볼 때는 campus_id를 넘겨야 해당 캠퍼스 기준으로 집계됨(없으면 세션 캠퍼스).
  useEffect(() => {
    const cq = campusId ? `&campus_id=${campusId}` : ''
    fetch(`/api/campus/students?schools=1${cq}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.schools) setSchoolRaw(d.schools) }).catch(() => {})
    fetch(`/api/campus/students?apartments=1${cq}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.apartments) setAptRaw(d.apartments) }).catch(() => {})
  }, [campusId])

  // 자동 지오코딩 spot + 오버라이드(좌표보정/추가/숨김) 병합
  function applyPlaceOverrides(auto: Record<string, { lat: number; lng: number; count: number }>, kind: 'school' | 'apt', raw: { name: string; count: number }[]) {
    const out: Record<string, { lat: number; lng: number; count: number }> = { ...auto }
    const countOf = (n: string) => raw.find(r => r.name === n)?.count ?? 0
    for (const p of placeSpots) {
      if (p.kind !== kind) continue
      if (p.hidden) { delete out[p.name]; continue }
      if (p.lat != null && p.lng != null) out[p.name] = { lat: p.lat, lng: p.lng, count: out[p.name]?.count ?? countOf(p.name) }
    }
    return out
  }
  const effSchoolSpots = useMemo(() => applyPlaceOverrides(schoolSpots, 'school', schoolRaw), [schoolSpots, placeSpots, schoolRaw]) // eslint-disable-line react-hooks/exhaustive-deps
  const effAptSpots = useMemo(() => applyPlaceOverrides(aptSpots, 'apt', aptRaw), [aptSpots, placeSpots, aptRaw]) // eslint-disable-line react-hooks/exhaustive-deps

  // 캠퍼스 변경 시 중심·지오코딩 재설정 (캠퍼스별 독립 지도 — campusId가 늦게 도착해도 다시 적용).
  // 지오코딩 effect보다 먼저 선언해야 같은 렌더에서 ref가 먼저 리셋됨.
  useEffect(() => {
    centeredRef.current = false; schoolGeocodedRef.current = false; academyGeoRef.current = false
    // 캠퍼스 전환 시 옛 캠퍼스 마커가 잔존(타캠퍼스 권역 표시)하지 않도록 즉시 비움 → 새 캠퍼스 캐시/지오코딩으로 재구성
    setSchoolSpots({}); setAptSpots({})
  }, [campusId])

  // 학교/아파트 스팟: 캠퍼스 좌표 준비 후 지오코딩 (캐시 우선)
  useEffect(() => {
    if (schoolGeocodedRef.current) return
    // 캐시 확인
    try {
      const cs = localStorage.getItem(schoolSpotsCacheKey)
      const ca = localStorage.getItem(aptSpotsCacheKey)
      if (cs) setSchoolSpots(JSON.parse(cs))
      if (ca) setAptSpots(JSON.parse(ca))
      if (cs && ca) { schoolGeocodedRef.current = true; return }
    } catch {}
    // ★ HQ에서 campusId가 있는 경우, 이 캠퍼스의 DB 좌표가 로드 완료될 때까지 대기.
    //   (대기 안 하면 캠퍼스 전환 직후 coordsRef에 옛 캠퍼스 좌표가 남아 그 중심으로 지오코딩 →
    //    새 캠퍼스 아파트가 타캠퍼스 권역에 찍히거나 안 찍히는 버그. ref 미설정으로 좌표 도착 후 재시도.)
    if (campusId && coordsDbLoadedKey !== coordsKey) return
    // 캠퍼스 중심 좌표: 캠퍼스명 매칭 우선 → (게이트 통과 후라 같은 캠퍼스인) 임의 stop → 기본(중계)
    const schoolName = effectiveSchoolName ?? SCHOOL_STOP.name
    const center = coordsRef.current[schoolName]
      ?? Object.values(coordsRef.current)[0]
      ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    if (!center) return
    schoolGeocodedRef.current = true
    const GEO_RADIUS = 5000
    const centerSuffix = `&x=${center.lng}&y=${center.lat}&radius=${GEO_RADIUS}`
    // 중심으로부터 거리(m) — Kakao가 반경을 못 지켜 먼 동명 결과를 줄 때 타캠퍼스 권역 마킹 방지용 가드
    const distM = (lat: number, lng: number) => {
      const R = 6371000, toRad = (d: number) => d * Math.PI / 180
      const dLat = toRad(lat - center.lat), dLng = toRad(lng - center.lng)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(center.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
    }

    async function geocodeList(
      items: { name: string; count: number }[],
      setter: (v: Record<string, { lat: number; lng: number; count: number }>) => void,
      cacheKey: string,
      fallbackRe: RegExp
    ) {
      const spots: Record<string, { lat: number; lng: number; count: number }> = {}
      for (const item of items.slice(0, 25)) {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(item.name)}${centerSuffix}`)
          const data = res.ok ? await res.json() : null
          const results = (data?.results ?? []) as { name: string; lat: number; lng: number }[]
          // 공백·표기차 무시 정확매칭 → 없으면 같은 종류(아파트/학교)인 반경 내 최근접 결과로만 폴백
          // (카페·부동산 등 엉뚱한 상호로 마킹되는 것 방지)
          const matched = results.find(r => aptNameMatches(r.name, item.name))
            ?? results.find(r => fallbackRe.test(r.name))
          // 중심에서 반경(+여유 20%) 밖이면 타캠퍼스 권역으로 판단해 버림
          if (matched && distM(matched.lat, matched.lng) <= GEO_RADIUS * 1.2)
            spots[item.name] = { lat: matched.lat, lng: matched.lng, count: item.count }
        } catch {}
        await new Promise(r => setTimeout(r, 120))
      }
      if (Object.keys(spots).length > 0) {
        setter(spots)
        try { localStorage.setItem(cacheKey, JSON.stringify(spots)) } catch {}
      }
    }

    // 학교 fetch (HQ에서 캠퍼스를 볼 때 campus_id를 넘겨야 400이 안 나고 해당 캠퍼스 기준으로 집계됨)
    fetch(`/api/campus/students?schools=1${cqs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.schools?.length) return geocodeList(d.schools, setSchoolSpots, schoolSpotsCacheKey, /학교|초등|중학교|고등학교/) })
      .catch(() => {})

    // 아파트 fetch
    fetch(`/api/campus/students?apartments=1${cqs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.apartments?.length) return geocodeList(d.apartments, setAptSpots, aptSpotsCacheKey, /아파트|단지/) })
      .catch(() => {})
  }, [campusId, coords, cqs, coordsDbLoadedKey, coordsKey])

  const updateCoords = useCallback(async (c: Record<string, { lat: number; lng: number }>) => {
    setCoords(c)
    localStorage.setItem(coordsKey, JSON.stringify(c))
    setCoordsSaving(true)
    try {
      const res = await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coords: c }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        alert(`좌표 저장 실패: ${b?.error ?? res.status}\n변경이 저장되지 않았습니다. 다시 시도해주세요.`)
        // 서버(DB) 기준으로 복원 — '저장된 것처럼' 보이는 오해 방지
        try {
          const rr = await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`)
          const dd = rr.ok ? await rr.json() : null
          if (dd?.coords) {
            const schoolFallback = campusId ? {} : { [SCHOOL_STOP.name]: { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng } }
            const restored = { ...schoolFallback, ...dd.coords }
            setCoords(restored)
            localStorage.setItem(coordsKey, JSON.stringify(restored))
          }
        } catch {}
      }
    } catch {
      alert('좌표 저장 중 네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    }
    setCoordsSaving(false)
  }, [campusId, coordsKey])

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
    const cx = campusId ?? '', cKey = `vc-${dir}-${cx}`
    // stale-while-revalidate: 캐시가 있으면 즉시 표시(로딩 깜빡임 없음), 그래도 '항상' 최신을 다시 받아 갱신.
    // (예전엔 5분 TTL이면 재조회를 건너뛰어 개설반 등 외부 변경이 늦게 반영되는 stale 문제가 있었음 → 항상 재조회)
    let hadCache = false
    try {
      const cached = sessionStorage.getItem(cKey)
      if (cached) { const { d } = JSON.parse(cached); if (d) { setGroups(d.timeGroups ?? []); setBuses(d.buses ?? []); hadCache = true } }
    } catch {}
    if (!hadCache) setLoading(true)
    try {
      const res = await fetch(`/api/campus/vehicles?direction=${dir}&master=true${cqs}`)
      if (res.ok) {
        const d = await res.json()
        setGroups(d.timeGroups ?? []); setBuses(d.buses ?? [])
        try { sessionStorage.setItem(cKey, JSON.stringify({ d, t: Date.now() })) } catch {}
      }
    } finally { setLoading(false) }
  }, [dir, campusId, cqs])
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
      if (b.name.includes('결석') || isIndividualBus(b.name)) return false
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
          // 요일별로 펼침 — 각 요일의 장소/시간을 그 정류장에 반영 (같은 호차, 요일별 다른 지점)
          for (const day of s.days) {
            if (routeDay && day !== routeDay) continue // 요일 필터: 선택 요일에 타는 정류장만
            const loc = (s.dayLocs?.[day] ?? s.location ?? '').trim()
            if (!loc) continue
            const t = s.dayTimes?.[day] ?? s.pickup_time
            if (!locMap.has(loc)) locMap.set(loc, { time: null, count: 0, names: [] })
            const e = locMap.get(loc)!
            if (!e.names.includes(s.name)) { e.names.push(s.name); e.count++ }  // 학생 distinct 카운트
            if (t && (!e.time || parseTimeMin(t) < parseTimeMin(e.time))) e.time = t
          }
        }
      }
      // 빈 정류장 마스터(학생 0명) 합집합 — 세션 무관, 해당 호차·방향만 (요일 필터 시엔 그날 타는 정류장만 보려 제외)
      if (!routeDay) for (const rs of registeredStops) {
        if (rs.bus_name !== busName || rs.direction !== dir) continue
        const loc = rs.stop_name.trim()
        if (!locMap.has(loc)) locMap.set(loc, { time: rs.default_time, count: 0, names: [] })
      }
      const sorted = [...locMap.entries()]
        .map(([name, info]) => ({ name, time: info.time, count: info.count, studentNames: info.names }))
        .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
      // 등원: 학원이 마지막(도착지) / 하원: 학원이 첫번째(출발지)
      result[busName] = dir === 'arr' ? [...sorted, schoolStop] : [schoolStop, ...sorted]
    }
    return result
  }, [groups, dir, selectedSession, selectedBuses, registeredStops, routeDay]) // eslint-disable-line react-hooks/exhaustive-deps

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
            for (const day of s.days) {
              if (routeDay && day !== routeDay) continue // 요일 필터
              const loc = (s.dayLocs?.[day] ?? s.location ?? '').trim()
              if (!loc) continue
              const t = s.dayTimes?.[day] ?? s.pickup_time
              if (!locMap.has(loc)) locMap.set(loc, { time: null, count: 0, names: [] })
              const e = locMap.get(loc)!
              if (!e.names.includes(s.name)) { e.names.push(s.name); e.count++ }
              if (t && (!e.time || parseTimeMin(t) < parseTimeMin(e.time))) e.time = t
            }
          }
        }
        // 빈 정류장 마스터(학생 0명) 합집합 — 해당 호차·방향만 (요일 필터 시엔 제외)
        if (!routeDay) for (const rs of registeredStops) {
          if (rs.bus_name !== busName || rs.direction !== targetDir) continue
          const loc = rs.stop_name.trim()
          if (!locMap.has(loc)) locMap.set(loc, { time: rs.default_time, count: 0, names: [] })
        }
        const sorted = [...locMap.entries()]
          .map(([name, info]) => ({ name, time: info.time, count: info.count, studentNames: info.names }))
          .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
        result[busName] = targetDir === 'arr' ? [...sorted, schoolStop] : [schoolStop, ...sorted]
      }
      return result
    }
    return { arr: compute('arr'), dep: compute('dep') }
  }, [bothDirGroups, selectedSession, selectedBuses, bothDir, effectiveSchoolName, registeredStops, routeDay])

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
    // 빈 정류장 마스터(학생 0명)도 목록·검색에 노출
    for (const rs of registeredStops) {
      const loc = rs.stop_name.trim()
      const dirLabel = rs.direction === 'arr' ? '등원' : '하원'
      if (!m.has(loc)) m.set(loc, { busNames: [], directions: [] })
      const e = m.get(loc)!
      if (!e.busNames.includes(rs.bus_name)) e.busNames.push(rs.bus_name)
      if (!e.directions.includes(dirLabel)) e.directions.push(dirLabel)
    }
    return [...m.entries()]
      .map(([name, info]) => ({ name, busNames: info.busNames, directions: info.directions }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [bothDirGroups, registeredStops])

  // 정류장별 학생 수 (등·하원 중복 제거) — 컴팩트 리스트 인원 표시용
  const stopStudentCounts = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const { group } of bothDirGroups) {
      for (const students of Object.values(group.busMap))
        for (const s of students) {
          if (!s.location) continue
          const loc = s.location.trim()
          if (!m.has(loc)) m.set(loc, new Set())
          m.get(loc)!.add(s.student_id)
        }
    }
    const out: Record<string, number> = {}
    for (const [loc, set] of m) out[loc] = set.size
    return out
  }, [bothDirGroups])

  const stopSearchResults = useMemo<StopSearchRow[]>(
    () => buildStopSearchResults(bothDirGroups, stopSearchQuery, registeredStops),
    [bothDirGroups, stopSearchQuery, registeredStops]
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

  // 호차별 '하루 최대' 탑승 인원 — 정원(좌석)은 하루 1회 운행 기준이라 주간합계가 아닌 요일별 최대로 비교해야 정확.
  const busDayMaxCount = useMemo(() => {
    const WK = ['월', '화', '수', '목', '금'] as const
    const perDay: Record<string, Record<string, Set<string>>> = {}
    for (const g of groups) {
      if (!selectedSession || getRunLabel(g.session_name, dir) !== selectedSession) continue
      for (const [busName, students] of Object.entries(g.busMap)) {
        if (!perDay[busName]) perDay[busName] = { 월: new Set(), 화: new Set(), 수: new Set(), 목: new Set(), 금: new Set() }
        for (const s of students as StudentEntry[]) for (const d of WK) if (s.days.includes(d)) perDay[busName][d].add(s.student_id)
      }
    }
    const out: Record<string, number> = {}
    for (const [bus, pd] of Object.entries(perDay)) out[bus] = Math.max(...WK.map(d => pd[d].size))
    return out
  }, [groups, dir, selectedSession])

  // 호차별 '당일(routeDay)' 배차 인원 — 컴팩트 카드 등 당일 기준 표시용 (routeDay='' 이면 null=주간 사용)
  const busRouteDayCount = useMemo(() => {
    if (!routeDay) return null
    const m: Record<string, Set<string>> = {}
    for (const g of groups) {
      if (!selectedSession || getRunLabel(g.session_name, dir) !== selectedSession) continue
      for (const [busName, students] of Object.entries(g.busMap)) {
        if (!m[busName]) m[busName] = new Set()
        for (const s of students as StudentEntry[]) if (s.days.includes(routeDay)) m[busName].add(s.student_id)
      }
    }
    const out: Record<string, number> = {}
    for (const k in m) out[k] = m[k].size
    return out
  }, [groups, dir, selectedSession, routeDay])

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

  // 학원 좌표 로드 후 지도 중심 이동 (캠퍼스 좌표 준비되면 1회)
  useEffect(() => {
    if (!mapReady || !mapRef.current || centeredRef.current) return
    // 현재 coords가 지금 캠퍼스(coordsKey)의 것으로 로드된 뒤에만 센터링
    // (campusId 도착 전 잠깐 로드되는 옛/중계 좌표로 잘못 묶이는 레이스 방지)
    if (coordsLoadedKey !== coordsKey) return
    const kakao = (window as any).kakao
    const schoolName = effectiveSchoolName ?? SCHOOL_STOP.name
    // 1순위: 캠퍼스(학원) 좌표 — 이름이 정확히 일치할 때
    const school = coords[schoolName] ?? (campusId ? undefined : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    if (school) {
      centeredRef.current = true
      mapRef.current.setCenter(new kakao.maps.LatLng(school.lat, school.lng))
      return
    }
    // 2순위(폴백): 학원 좌표가 없거나 이름이 안 맞으면 이 캠퍼스 정류장 전체 범위로 맞춤
    // → 캠퍼스명-좌표 매칭이 없어도 항상 올바른 지역에 위치 (중계 기본값에 묶이는 문제 해결)
    const all = Object.values(coords)
    if (all.length >= 2) {
      const bounds = new kakao.maps.LatLngBounds()
      for (const p of all) bounds.extend(new kakao.maps.LatLng(p.lat, p.lng))
      centeredRef.current = true
      mapRef.current.setBounds(bounds)
    } else if (all.length === 1) {
      centeredRef.current = true
      mapRef.current.setCenter(new kakao.maps.LatLng(all[0].lat, all[0].lng))
    } else if (campusId && effectiveSchoolName && coordsDbLoadedKey === coordsKey && !academyGeoRef.current) {
      // 3순위(좌표 0개 캠퍼스, DB 로드 완료 후): 학원명으로 지오코딩해 센터 → 중계 기본값(초기 하드코딩)에 묶이는 것 방지.
      // 결과는 localStorage에 캐시(반복 Kakao 호출 방지). DB 미기록(클라 표시 전용).
      academyGeoRef.current = true
      const cacheK = `academy-center-${campusId}`
      const applyCenter = (lat: number, lng: number) => {
        if (mapRef.current && !centeredRef.current) {
          centeredRef.current = true
          mapRef.current.setCenter(new kakao.maps.LatLng(lat, lng))
        }
      }
      let cachedHit = false
      try {
        const cached = localStorage.getItem(cacheK)
        if (cached) { const { lat, lng } = JSON.parse(cached); applyCenter(lat, lng); cachedHit = true }
      } catch {}
      if (!cachedHit) {
        ;(async () => {
          try {
            const res = await fetch(`/api/geocode?q=${encodeURIComponent('폴리어학원 ' + effectiveSchoolName)}`)
            const data = res.ok ? await res.json() : null
            const results = (data?.results ?? []) as { name: string; lat: number; lng: number }[]
            const hit = results.find(r => /폴리|poly/i.test(r.name)) ?? results[0]
            if (hit) {
              try { localStorage.setItem(cacheK, JSON.stringify({ lat: hit.lat, lng: hit.lng })) } catch {}
              applyCenter(hit.lat, hit.lng)
            }
          } catch {}
        })()
      }
    }
  }, [mapReady, coords, campusId, effectiveSchoolName, coordsLoadedKey, coordsDbLoadedKey, coordsKey])

  // 패널 접기/펼치기 · 전체화면 토글 시 지도 리레이아웃 (CSS transition 완료 후)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const center = mapRef.current.getCenter?.()
    const t = setTimeout(() => {
      mapRef.current?.relayout?.()
      if (center) mapRef.current?.setCenter?.(center) // 리레이아웃 후 중심 유지
    }, 260)
    return () => clearTimeout(t)
  }, [fullscreen, mapReady, remoteMinimized])

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

  // 노선 폴리라인 후처리(트림 + 정류장 보호 루프 접기)는 순수 함수로 분리:
  // `@/lib/utils/route-geometry`의 cleanRoutePolyline 사용. 정류장을 지나는 하차
  // 진입 구간을 루프로 오인해 접어버리던 버그(우리은행 미통과)를 막는다.

  // T맵 스타일 진행방향 화살표 — 폴리라인 위 일정 간격으로 배치 (북쪽 기준 회전)
  function addDirectionArrows(kakao: any, map: any, pts: any[], color: string, sink: any[]) {
    if (!pts || pts.length < 2) return
    const step = Math.max(1, Math.floor(pts.length / 8))
    for (let i = step; i < pts.length - 1; i += step) {
      const p1 = pts[i - 1], p2 = pts[i]
      const lat1 = p1.getLat(), lng1 = p1.getLng()
      const lat2 = p2.getLat(), lng2 = p2.getLng()
      const dy = lat2 - lat1
      const dx = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180)
      if (dx === 0 && dy === 0) continue
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI
      const html = `<div style="transform:rotate(${deg}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${color};filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff);pointer-events:none"></div>`
      sink.push(new kakao.maps.CustomOverlay({
        map, position: p2, content: html, yAnchor: 0.5, xAnchor: 0.5, zIndex: 3,
      }))
    }
  }

  // 위치 조정 모드용 드래그 핀 — 끌어 놓으면(dragend) 저장 확인 대기 상태로 전환 (자동저장 X)
  function makeAdjustMarker(kakao: any, map: any, name: string, lat: number, lng: number) {
    const m = new kakao.maps.Marker({
      map, position: new kakao.maps.LatLng(lat, lng), draggable: true, zIndex: 60,
    })
    kakao.maps.event.addListener(m, 'dragend', () => {
      const pos = m.getPosition()
      setPendingMove(prev => {
        // 이전 미확정 이동이 있으면 먼저 원위치로 되돌림 (한 번에 하나만 확인)
        if (prev && pendingMarkerRef.current && pendingMarkerRef.current !== m) {
          try { pendingMarkerRef.current.setPosition(new kakao.maps.LatLng(prev.from.lat, prev.from.lng)) } catch {}
        }
        pendingMarkerRef.current = m
        return { name, from: { lat, lng }, to: { lat: pos.getLat(), lng: pos.getLng() } }
      })
    })
    return m
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
    // 좌표 변경(드래그 등) 시 기존 캐시 경로 즉시 제거 → 새 위치로 바로 반영(직선) 후 티맵 도로경로로 교체
    setTmapRoutes(prev => { const n = { ...prev }; for (const b of selectedBuses) delete n[b]; return n })

    for (const busName of selectedBuses) {
      // 좌표 중복 정류장 제거 (동일 좌표 viapoint 중복 시 TMAP 경로 실패 → ETA 누락 방지)
      const _seenC = new Set<string>()
      const stops = (routeStopsByBus[busName] ?? []).filter(s => {
        const c = coords[s.name]; if (!c) return false
        const k = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
        if (_seenC.has(k)) return false
        _seenC.add(k); return true
      })
      if (stops.length < 2) continue
      pending++

      const end = stops[stops.length - 1]
      // 서울 리전 서버 프록시 호출 (브라우저→TMAP CORS 회피 + 한국 IP). 시작/경유/도착은 서버가 처리
      const stopsPayload = stops.map(s => ({ name: s.name, lat: coords[s.name].lat, lng: coords[s.name].lng }))

      fetch('/api/tmap-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopsPayload }),
      }).then(async r => {
        const text = await r.text()
        if (!r.ok) { setTmapDebug(`❌ 경로 ${r.status}: ${text.slice(0, 120)}`); return }
        let data: any
        try { data = JSON.parse(text) } catch { setTmapDebug(`❌ JSON 파싱 실패: ${text.slice(0, 100)}`); return }
        if (data.time != null) newSummaries[busName] = { time: data.time, distance: data.distance ?? 0 }
        const pts: [number, number][] = data.coordinates ?? []
        if (pts.length > 1) {
          const destCoord: LatLng = [coords[end.name].lat, coords[end.name].lng]
          // 실제 정류장 좌표를 넘겨, 하차 진입 구간을 루프로 오인해 접지 않도록 보호
          const stopCoords: LatLng[] = stops.map(s => [coords[s.name].lat, coords[s.name].lng])
          const trimmed = cleanRoutePolyline(pts, destCoord, stopCoords)
          newRoutes[busName] = trimmed
          setTmapDebug(`✅ ${busName}: ${pts.length}개 → ${trimmed.length}개 좌표`)
        } else setTmapDebug(`⚠️ 도로 좌표 없음`)
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
      const _seenC2 = new Set<string>()
      const stops = (bothDirStopsByBus[targetDir][busName] ?? []).filter(s => {
        const c = coords[s.name]; if (!c) return false
        const k = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
        if (_seenC2.has(k)) return false
        _seenC2.add(k); return true
      })
      if (stops.length < 2) continue
      pending++
      const end = stops[stops.length - 1]
      const stopsPayload = stops.map(s => ({ name: s.name, lat: coords[s.name].lat, lng: coords[s.name].lng }))
      fetch('/api/tmap-route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopsPayload }),
      }).then(async r => {
        if (!r.ok) return
        let data: any; try { data = await r.json() } catch { return }
        const pts: [number, number][] = data.coordinates ?? []
        if (pts.length > 1) {
          const dest: LatLng = [coords[end.name].lat, coords[end.name].lng]
          const stopCoords: LatLng[] = stops.map(s => [coords[s.name].lat, coords[s.name].lng])
          newRoutes[targetDir][busName] = cleanRoutePolyline(pts, dest, stopCoords)
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
      // 등원 정류장 이름 집합 — 하원 마커가 같은 위치에 겹칠 때 살짝 어긋나게 표시
      const arrStopNames = new Set((bothDirStopsByBus['arr'][busName] ?? []).map(s => s.name))
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
          addDirectionArrows(kakao, map, routePts, dirColor, polylinesRef.current)
        }
        let num = 0
        for (const stop of stops) {
          const c = coords[stop.name]; if (!c) continue
          const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
          if (isSchool) continue // 캠퍼스는 항상-표시 엠블럼 마커가 담당
          const isSpot = stop.count === 0 // 이 방향 탑승 0명 = 스팟(경유·추가가능)
          if (!isSpot) num++
          const ttId = `tt-${targetDir}-${markersRef.current.length}`
          const timeStr = stop.time ? normalizeTime(stop.time) : ''
          const isArr = targetDir === 'arr'
          const dirLabel = isArr ? '등원' : '하원'
          // 등원=원형, 하원=둥근 사각형 → 겹쳐도 모양으로 방향 구분
          const radius = isArr ? '50%' : '7px'
          // 하원 정류장이 등원과 같은 위치면 살짝 어긋나게 표시(겹침 방지)
          const offset = (!isArr && arrStopNames.has(stop.name)) ? 'transform:translate(16px,-16px);' : ''
          const overlayHtml = isSpot
            ? `<div style="${offset}position:relative;display:flex;flex-direction:column;align-items:center"><div style="background:#fff;border:2.5px dashed ${dirColor};border-radius:${radius};width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:${dirColor};font-size:13px;font-weight:900;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.2);cursor:pointer" onmouseover="document.getElementById('${ttId}').style.display='block'" onmouseout="document.getElementById('${ttId}').style.display='none'">+</div><div id="${ttId}" style="display:none;position:absolute;bottom:30px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:8px;padding:6px 8px;min-width:130px;z-index:999;font-size:10px"><p style="font-weight:700;margin:0 0 3px 0;color:${dirColor}">${dirLabel} · ${esc(stop.name)}</p><p style="margin:0;opacity:.8">차량 경유 · 탑승 추가 가능</p></div></div>`
            : `<div style="${offset}position:relative;display:flex;flex-direction:column;align-items:center"><div style="background:${dirColor};border:2.5px solid #fff;border-radius:${radius};width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;font-variant-numeric:tabular-nums;box-shadow:0 3px 9px rgba(0,0,0,.3);cursor:pointer" onmouseover="document.getElementById('${ttId}').style.display='block'" onmouseout="document.getElementById('${ttId}').style.display='none'">${num}</div><div id="${ttId}" style="display:none;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:8px;padding:6px 8px;min-width:120px;z-index:999;font-size:10px"><p style="font-weight:700;margin:0 0 3px 0;color:${dirColor}">${dirLabel} · ${esc(stop.name)}</p><p style="margin:0;opacity:.8">${timeStr ? `🚌 ${timeStr}` : '시간 미설정'} · ${stop.count}명</p></div></div>`
          markersRef.current.push(new kakao.maps.CustomOverlay({
            map, position: new kakao.maps.LatLng(c.lat, c.lng), content: overlayHtml,
            yAnchor: isSchool ? 1 : 0.5, zIndex: isSchool ? 20 : 6,
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
        addDirectionArrows(kakao, map, routeLatLngs, color, polylinesRef.current)
      }

      // 카드(타임라인 리스트)와 동일한 정류장 순서·번호 사용 → 카드 #N == 지도 마커 #N
      // 탑승 정류장(학생 1명+)만 순번 부여. 학생 0명 '스팟'(빈/등록 정류장)은 번호 없이 빈 마커 — 차량은 경유하므로 탑승 추가 가능 지점.
      const stopNumByName = new Map<string, number>()
      { let bn = 0; for (const node of getOrderedStopNodesForBus(busName)) { if (node.students.length > 0) { bn++; stopNumByName.set(node.name, bn) } } }
      let fallbackNum = 0
      for (const stop of stops) {
        const c = coords[stop.name]; if (!c) continue
        const isSchool = stop.name === (effectiveSchoolName ?? SCHOOL_STOP.name)
        if (isSchool) continue // 캠퍼스는 항상-표시 엠블럼 마커가 담당
        const isSpot = stop.count === 0 // 이 방향 탑승 0명 = 스팟(경유·추가가능)
        const num = isSpot ? 0 : (stopNumByName.get(stop.name) ?? ++fallbackNum)
        const timeStr = stop.time ? normalizeTime(stop.time) : ''
        const studentStr = stop.studentNames.slice(0, 4).join(', ') + (stop.studentNames.length > 4 ? ` 외 ${stop.studentNames.length - 4}명` : '')
        const ttId = `tt-${busIdx}-${markersRef.current.length}`
        // 등원=원형, 하원=둥근 사각형 (방향을 모양으로 구분)
        const stopRadius = dir === 'arr' ? '50%' : '9px'

        const overlayHtml = isSpot
          ? `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="background:#fff;border:2.5px dashed ${color};border-radius:${stopRadius};width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:${color};font-size:15px;font-weight:900;line-height:1;box-shadow:0 2px 7px rgba(0,0,0,.2);cursor:pointer"
                onmouseover="document.getElementById('${ttId}').style.display='block'" onmouseout="document.getElementById('${ttId}').style.display='none'">+</div>
              <div id="${ttId}" style="display:none;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:9px;padding:7px 9px;min-width:150px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none">
                <p style="font-size:11px;font-weight:700;margin:0 0 3px 0;color:${color}">${esc(stop.name)}</p>
                <p style="font-size:10px;margin:0;opacity:.85">${timeStr ? `🚌 ${timeStr} · ` : ''}차량 경유 · 탑승 추가 가능</p>
              </div>
            </div>`
          : `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="background:${color};border:3px solid #fff;border-radius:${stopRadius};width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;box-shadow:0 3px 10px rgba(0,0,0,.32),0 0 0 1px rgba(0,0,0,.04);cursor:pointer;transition:transform .15s"
                onmouseover="document.getElementById('${ttId}').style.display='block';this.style.transform='scale(1.18)'"
                onmouseout="document.getElementById('${ttId}').style.display='none';this.style.transform='scale(1)'"
              >${num}</div>
              <div id="${ttId}" style="display:none;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:10px;padding:8px 10px;min-width:150px;max-width:200px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none">
                <p style="font-size:12px;font-weight:700;margin:0 0 5px 0;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.12)">${esc(stop.name)}</p>
                <p style="font-size:10px;margin:0 0 3px 0;opacity:.8">${timeStr ? `🚌 ${timeStr}` : '시간 미설정'} · 👥 ${stop.count}명</p>
                ${studentStr ? `<p style="font-size:10px;margin:0;font-weight:600;color:${color}">${esc(studentStr)}</p>` : ''}
                <div style="position:absolute;bottom:-5px;left:50%;margin-left:-5px;width:10px;height:10px;background:#1E293B;transform:rotate(45deg)"></div>
              </div>
            </div>`

        const overlay = new kakao.maps.CustomOverlay({
          map, position: new kakao.maps.LatLng(c.lat, c.lng),
          content: overlayHtml,
          yAnchor: isSchool ? 1 : 0.5, zIndex: isSchool ? 20 : 6,
        })
        markersRef.current.push(overlay)
        // 위치 조정 모드: 학원 외 정류장에 드래그 핀 추가
        if (adjustMode && !isSchool) {
          markersRef.current.push(makeAdjustMarker(kakao, map, stop.name, c.lat, c.lng))
        }
      }
    }

    if (allLatLngs.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      allLatLngs.forEach((ll: any) => bounds.extend(ll))
      // 좌측 카드 너비만큼 padding을 줘서 노선이 카드에 가려지지 않도록
      // 2대 이상은 컴팩트 카드(232px)라 패딩을 줄여 지도를 더 넓게 사용
      const n = selectedBuses.length
      const cardW = n === 0 ? 0 : n === 1 ? 300 : 250
      map.setBounds(bounds, 60, 40, 60, cardW + 20)
    }
  }, [mapReady, routeStopsByBus, coords, selectedBuses, buses, tmapRoutes, tmapBothDirRoutes, bothDir, bothDirStopsByBus, sidebarPage, p2SelectedBus, adjustMode])

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
      addDirectionArrows(kakao, map, linePts, busColor, polylinesRef.current)
    }

    // 정류장 오버레이
    withCoords.forEach((s, i) => {
      const c = coords[s.name]
      const ttId = `p2tt-${i}`
      const timeStr = s.time ? normalizeTime(s.time) : ''
      const names = s.studentNames ?? []
      const studentStr = names.slice(0, 4).join(', ') + (names.length > 4 ? ` 외 ${names.length - 4}명` : '')
      const label = `<div style="position:relative;display:flex;flex-direction:column;align-items:center"><div style="background:${busColor};border:3px solid #fff;border-radius:9px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;box-shadow:0 3px 10px rgba(0,0,0,.32),0 0 0 1px rgba(0,0,0,.04);cursor:pointer;transition:transform .15s" onmouseover="document.getElementById('${ttId}').style.display='block';this.style.transform='scale(1.18)'" onmouseout="document.getElementById('${ttId}').style.display='none';this.style.transform='scale(1)'">${i + 1}</div><div id="${ttId}" style="display:none;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;border-radius:10px;padding:8px 10px;min-width:150px;max-width:200px;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none"><p style="font-size:12px;font-weight:700;margin:0 0 5px 0;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.12)">${esc(s.name)}</p><p style="font-size:10px;margin:0 0 3px 0;opacity:.8">${timeStr ? '🚌 ' + timeStr : '시간 미설정'} · 👥 ${s.count}명</p>${studentStr ? '<p style="font-size:10px;margin:0;font-weight:600;color:' + busColor + '">' + esc(studentStr) + '</p>' : ''}<div style="position:absolute;bottom:-5px;left:50%;margin-left:-5px;width:10px;height:10px;background:#1E293B;transform:rotate(45deg)"></div></div></div>`
      markersRef.current.push(new kakao.maps.CustomOverlay({
        map, position: new kakao.maps.LatLng(c.lat, c.lng), content: label, yAnchor: 0.5, zIndex: i + 1,
      }))
      // 위치 조정 모드: 드래그 핀 추가
      if (adjustMode) {
        markersRef.current.push(makeAdjustMarker(kakao, map, s.name, c.lat, c.lng))
      }
    })

    // 학원(캠퍼스)은 항상-표시 엠블럼 마커가 담당 — 여기선 별도 마커 생략

    // 지도 범위 조정 (좌상단 카드 패딩)
    if (allPts.length > 0) {
      const bounds = new kakao.maps.LatLngBounds()
      allPts.forEach((ll: any) => bounds.extend(ll))
      map.setBounds(bounds, 60, 40, 60, 320)
    }
  }, [mapReady, sidebarPage, p2SelectedBus, p2VisibleStudents, coords, buses, p2Dir, effectiveSchoolName, adjustMode])

  // Page 2: 선택된 버스 노선 거리/시간 fetch
  // 서버 프록시(/api/tmap-route) 경유 — 브라우저→TMAP 직접 호출은 CORS+한국 IP 제약으로
  // 실패해 거리/시간이 안 뜨던 문제, 그리고 경유지 5개 초과 시 잘려 거리/시간이 과소
  // 계산되던 문제를 함께 해결(서버가 7개 단위로 분할 호출·합산).
  useEffect(() => {
    setP2RouteSummary(null)
    if (!p2SelectedBus || p2VisibleStudents.length === 0) return
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
    // 동일 좌표 경유지 중복 제거 (TMAP 경로 실패 방지) — 메인 경로 fetch와 동일 규칙
    const _seen = new Set<string>()
    const stopsPayload = allPts
      .filter(p => {
        const k = `${p.coord.lat.toFixed(5)},${p.coord.lng.toFixed(5)}`
        if (_seen.has(k)) return false
        _seen.add(k); return true
      })
      .map(p => ({ name: p.name, lat: p.coord.lat, lng: p.coord.lng }))
    if (stopsPayload.length < 2) return
    let cancelled = false
    fetch('/api/tmap-route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: stopsPayload }),
    }).then(async r => {
      if (!r.ok) return
      let data: any; try { data = await r.json() } catch { return }
      if (!cancelled && data.time != null)
        setP2RouteSummary({ time: data.time, distance: data.distance ?? 0 })
    }).catch(() => {})
    return () => { cancelled = true }
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

  // H4: 모바일 등 다른 기기/탭에서 한 변경이 데스크톱 5분 캐시에 막혀 안 보이는 문제 →
  // 탭이 다시 활성화(focus/visible)되면 캐시 무효화 후 재조회. (4초 throttle로 과도호출 방지)
  const lastAutoRefreshRef = useRef(0)
  useEffect(() => {
    const refresh = () => {
      const now = Date.now()
      if (now - lastAutoRefreshRef.current < 4000) return
      lastAutoRefreshRef.current = now
      const cx = campusId ?? ''
      try { sessionStorage.removeItem(`vc-arr-${cx}`); sessionStorage.removeItem(`vc-dep-${cx}`) } catch {}
      loadData()
      refreshBothDirGroups()
    }
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refresh)
    }
  }, [loadData, refreshBothDirGroups, campusId])

  // 학교/아파트 버블 마커 공통 생성 헬퍼
  function makeBubbleOverlay(
    kakao: any,
    map: any,
    lat: number, lng: number,
    count: number,
    label: string,
    icon: string,
    color: string,       // rgba fill
    borderColor: string, // border + text color
    tooltipBg: string,
    zIndex = 2,
    rank = 0
  ) {
    // 인원수 비례 — 더 크게 (base 26 + sqrt 스케일)
    const size = Math.round(26 + Math.sqrt(count) * 8)
    const fontSize = Math.round(10 + Math.sqrt(count) * 1.3)
    const safeId = `bbl-${Math.random().toString(36).slice(2)}`
    const ttBottom = size + 6
    // 클릭 점멸 애니메이션 키프레임 1회 주입
    if (typeof document !== 'undefined' && !document.getElementById('spot-flash-style')) {
      const st = document.createElement('style')
      st.id = 'spot-flash-style'
      st.textContent = '@keyframes spot-flash{0%,40%,80%,100%{transform:scale(1);filter:brightness(1)}20%,60%{transform:scale(1.35);filter:brightness(1.8)}}'
      document.head.appendChild(st)
    }
    const html =
      `<div style="position:relative;display:flex;flex-direction:column;align-items:center">`
      + `<div onmouseover="document.getElementById('${safeId}').style.display='flex'" `
      +      `onmouseout="document.getElementById('${safeId}').style.display='none'" `
      +      `onclick="this.style.animation='spot-flash 1.1s ease-in-out';var el=this;setTimeout(function(){el.style.animation=''},1150)" `
      +  `style="width:${size}px;height:${size}px;border-radius:50%;background:${color};`
      +        `border:2.5px solid ${borderColor};display:flex;align-items:center;justify-content:center;`
      +        `color:#fff;font-size:${fontSize}px;font-weight:900;`
      +        `box-shadow:0 0 0 1.5px rgba(0,0,0,.18),0 3px 10px rgba(0,0,0,.35);cursor:pointer;line-height:1;transition:transform .12s">`
      +   `${count}`
      + `</div>`
      + (rank >= 1 && rank <= 3
          ? `<div style="position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 3px;border-radius:9px;background:${rank === 1 ? '#F59E0B' : rank === 2 ? '#9CA3AF' : '#B45309'};color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);line-height:1;white-space:nowrap">${rank}위</div>`
          : '')
      + `<div id="${safeId}" style="display:none;position:absolute;bottom:${ttBottom}px;left:50%;`
      +   `transform:translateX(-50%);background:${tooltipBg};color:#fff;border-radius:8px;`
      +   `padding:5px 10px;white-space:nowrap;z-index:999;pointer-events:none;`
      +   `box-shadow:0 3px 12px rgba(0,0,0,.3);flex-direction:column;align-items:center;gap:1px">`
      +   `<span style="font-size:10px;font-weight:700">${icon} ${esc(label)}</span>`
      +   `<span style="font-size:9px;opacity:.8;font-weight:600">${count}명 재원</span>`
      + `</div>`
      + `</div>`
    return new kakao.maps.CustomOverlay({
      map, position: new kakao.maps.LatLng(lat, lng),
      content: html, yAnchor: 0.5, zIndex,
    })
  }

  // 학교 버블 렌더링
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    schoolMarkersRef.current.forEach(m => m.setMap(null))
    schoolMarkersRef.current = []
    if (!showSchoolSpots) return
    const rankedSchools = Object.entries(effSchoolSpots).sort((a, b) => b[1].count - a[1].count)
    rankedSchools.forEach(([school, spot], i) => {
      schoolMarkersRef.current.push(makeBubbleOverlay(
        kakao, mapRef.current,
        spot.lat, spot.lng, spot.count,
        school, '🏫',
        'rgba(22,163,74,0.6)', '#ffffff', '#065F46', 2,
        i < 3 ? i + 1 : 0
      ))
    })
  }, [mapReady, effSchoolSpots, showSchoolSpots])

  // 아파트 버블 렌더링
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    aptMarkersRef.current.forEach(m => m.setMap(null))
    aptMarkersRef.current = []
    if (!showAptSpots) return
    const rankedApts = Object.entries(effAptSpots).sort((a, b) => b[1].count - a[1].count)
    rankedApts.forEach(([apt, spot], i) => {
      aptMarkersRef.current.push(makeBubbleOverlay(
        kakao, mapRef.current,
        spot.lat, spot.lng, spot.count,
        apt, '🏠',
        'rgba(37,99,235,0.6)', '#ffffff', '#1E3A8A', 2,
        i < 3 ? i + 1 : 0
      ))
    })
  }, [mapReady, effAptSpots, showAptSpots])

  // 탑승장소 수정 팝업이 열린 정류장을 지도에서 눈에 띄게 강조 (펄스 핀 + '수정 중' 라벨)
  useEffect(() => {
    if (stopEditHlRef.current) { try { stopEditHlRef.current.setMap(null) } catch {} stopEditHlRef.current = null }
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    if (!kakao?.maps) return
    if (sidebarPage !== 4 || !expandedStop) return
    const c = coords[expandedStop]
    if (!c) return
    if (typeof document !== 'undefined' && !document.getElementById('stop-hl-style')) {
      const st = document.createElement('style')
      st.id = 'stop-hl-style'
      st.textContent = '@keyframes stop-hl-pulse{0%{transform:scale(.4);opacity:.75}100%{transform:scale(1.7);opacity:0}}'
      document.head.appendChild(st)
    }
    const html =
      `<div style="position:relative;display:flex;align-items:center;justify-content:center;pointer-events:none">`
      + `<span style="position:absolute;inset:0;margin:auto;width:58px;height:58px;border-radius:50%;background:rgba(239,68,68,.30);animation:stop-hl-pulse 1.5s ease-out infinite"></span>`
      + `<span style="position:absolute;inset:0;margin:auto;width:58px;height:58px;border-radius:50%;background:rgba(239,68,68,.30);animation:stop-hl-pulse 1.5s ease-out .75s infinite"></span>`
      + `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:3px">`
      +   `<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#F87171,#DC2626);border:3px solid #fff;box-shadow:0 4px 14px rgba(220,38,38,.7),0 0 0 2px rgba(220,38,38,.35);display:flex;align-items:center;justify-content:center;font-size:17px;line-height:1">📍</div>`
      +   `<span style="background:#DC2626;color:#fff;font-size:9px;font-weight:900;padding:2px 7px;border-radius:9px;white-space:nowrap;box-shadow:0 2px 7px rgba(0,0,0,.35)">수정 중</span>`
      + `</div>`
      + `</div>`
    stopEditHlRef.current = new kakao.maps.CustomOverlay({
      map: mapRef.current, position: new kakao.maps.LatLng(c.lat, c.lng),
      content: html, yAnchor: 0.5, zIndex: 250,
    })
  }, [mapReady, sidebarPage, expandedStop, coords])

  // 학교/아파트 관리 패널을 닫거나 다른 종류로 전환하면 진행 중인 위치 보정(드래그 핀) 정리 — 핀 잔존 방지
  useEffect(() => {
    if (placeAdjust && spotManage !== placeAdjust.kind) cancelPlaceAdjust()
  }, [spotManage]) // eslint-disable-line react-hooks/exhaustive-deps

  // 캠퍼스 엠블럼 마커 — 노선 선택과 무관하게 항상 지도에 고정 표시
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const kakao = (window as any).kakao
    if (!kakao?.maps) return
    if (campusMarkerRef.current) { campusMarkerRef.current.setMap(null); campusMarkerRef.current = null }
    const schoolName = effectiveSchoolName ?? SCHOOL_STOP.name
    const c = coords[schoolName] ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    if (!c) return
    const label = (schoolName || '캠퍼스').slice(0, 10)
    const html =
      `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">`
      + `<div style="width:52px;height:52px;border-radius:50%;background:#fff;border:3px solid #004EA2;`
      +   `box-shadow:0 4px 16px rgba(0,78,162,.45),0 0 0 4px rgba(0,78,162,.12);`
      +   `display:flex;align-items:center;justify-content:center">`
      +   `<img src="/poly-emblem.png" alt="campus" style="width:34px;height:34px;object-fit:contain" />`
      + `</div>`
      + `<div style="margin-top:4px;background:#004EA2;color:#fff;font-size:10px;font-weight:900;`
      +   `padding:2px 9px;border-radius:11px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.28)">${esc(label)}</div>`
      + `</div>`
    campusMarkerRef.current = new kakao.maps.CustomOverlay({
      map: mapRef.current,
      position: new kakao.maps.LatLng(c.lat, c.lng),
      content: html, yAnchor: 0.62, zIndex: 40,
    })
  }, [mapReady, coords, effectiveSchoolName, campusId])

  function openLeftEdit(student: StudentEntry, busName: string, dir: 'arr' | 'dep', sessionName: string) {
    setLeftEditModal({ student, busName, dir, sessionName })
    setLeftEditBus(busName)
    setLeftEditLoc(student.location ?? '')
    setLeftEditTime(student.pickup_time ?? '')
    setLeftEditDays([...student.days])
  }

  async function handleLeftEditSave(force = false) {
    if (!leftEditModal) return
    if (!leftEditModal.student.class_id) { alert('class_id 누락 — 페이지를 새로고침 후 다시 시도해주세요.'); return }
    if (leftEditDays.length === 0) { alert('요일을 1개 이상 선택해주세요.'); return }
    setLeftEditSaving(true)
    const res = await fetch(`/api/campus/vehicles${cqs ? `?${cqs.slice(1)}` : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_enrollment_schedule',
        student_id: leftEditModal.student.student_id,
        class_id: leftEditModal.student.class_id,
        direction: leftEditModal.dir,
        days: leftEditDays,
        bus_name: leftEditBus || undefined,
        old_bus_name: leftEditModal.busName || undefined,
        location: leftEditLoc,
        pickup_time: leftEditTime || undefined,
        baseVersion: leftEditModal.student.updated_at ?? null,
        force,
      }),
    })
    // 동시편집 충돌: 다른 사람이 방금 바꿈 → 덮어쓰기/취소 선택
    if (res.status === 409) {
      const cf = await res.json().catch(() => ({}))
      setLeftEditSaving(false)
      setConflict({
        updated_by: cf.updated_by ?? null,
        updated_at: cf.updated_at ?? new Date().toISOString(),
        onOverwrite: () => handleLeftEditSave(true),
        onReload: () => { setLeftEditModal(null); Promise.all([refreshBothDirGroups(), loadData()]) },
      })
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setLeftEditSaving(false)
      alert(`저장 실패: ${body?.error ?? res.status}`)
      return
    }
    setLeftEditModal(null)
    setLeftEditSaving(false)
    await Promise.all([refreshBothDirGroups(), loadData()])
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

  // ── 호차 명단 카드: 학생설정 풀편집 (요일별 호차/장소/시간) ──
  const RDAYS = ['월', '화', '수', '목', '금'] as const
  function openRosterEdit(student: StudentEntry, busName: string, dir: 'arr' | 'dep', sessionName: string) {
    const dayBus = { ...(student.busByDay ?? {}) }
    const dayLoc = { ...(student.dayLocs ?? {}) }
    const dayTime = { ...(student.dayTimes ?? {}) }
    // 이 학생이 (어떤 호차로든) 타는 전체 요일 — 요일별 모드는 전 요일을 다룬다
    const rideDays = RDAYS.filter(d => (dayBus[d] ?? '').trim())
    const distinctBus = new Set(rideDays.map(d => dayBus[d]))
    const baseLoc = student.location ?? '', baseTime = student.pickup_time ?? ''
    // 요일별로 다른 호차/장소/시간이면 요일별 모드로 자동 진입
    const perDay = distinctBus.size > 1 || detectPerDay({
      days: student.days, baseBus: busName, baseLoc, baseTime, dayBus: {}, dayLoc, dayTime,
    })
    setREditModal({ student, busName, dir, sessionName })
    setREditBus(busName)
    setREditLoc(baseLoc)
    setREditTime(baseTime)
    setREditDays(perDay && rideDays.length > 0 ? rideDays : [...student.days])
    setREditDayBus(dayBus)
    setREditDayLoc(dayLoc)
    setREditDayTime(dayTime)
    setREditPerDay(perDay)
  }
  // 요일별 모드 탑승요일 토글 (rEditDayBus 동기화 — 해제=빈호차, 추가=기본호차)
  function toggleREditDay(d: string) {
    const isOn = rEditDays.includes(d)
    setREditDays(isOn ? rEditDays.filter(x => x !== d) : [...rEditDays, d])
    setREditDayBus(b => ({ ...b, [d]: isOn ? '' : (b[d] || rEditBus) }))
  }

  async function handleRosterEditSave() {
    if (!rEditModal) return
    if (!rEditModal.student.class_id) { alert('class_id 누락 — 새로고침 후 다시 시도해주세요.'); return }
    if (rEditDays.length === 0) { alert('요일을 1개 이상 선택해주세요.'); return }
    setREditSaving(true)
    const reqBody = buildScheduleUpdate({
      studentId: rEditModal.student.student_id,
      classId: rEditModal.student.class_id,
      direction: rEditModal.dir,
      perDay: rEditPerDay,
      bus: rEditBus,
      oldBus: rEditModal.busName,
      location: rEditLoc,
      time: rEditTime,
      days: rEditDays,
      dayBus: rEditDayBus,
      dayLoc: rEditDayLoc,
      dayTime: rEditDayTime,
      orig: {
        dayBus: rEditModal.student.busByDay ?? {},
        dayLoc: rEditModal.student.dayLocs ?? {},
        dayTime: rEditModal.student.dayTimes ?? {},
      },
    })
    const res = await fetch(`/api/campus/vehicles${cqs ? `?${cqs.slice(1)}` : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setREditSaving(false)
      alert(`저장 실패: ${b?.error ?? res.status}`)
      return
    }
    const stuName = rEditModal.student.name
    const oldBus = rEditModal.busName
    const busMoved = !rEditPerDay && !!rEditBus && rEditBus !== oldBus
    setREditModal(null)
    setREditSaving(false)
    // 저장 직후 5분 TTL 캐시를 비워 stale 미반영을 막는다(master groups·노선 모두 새로고침)
    try { const cx = campusId ?? ''; sessionStorage.removeItem(`vc-arr-${cx}`); sessionStorage.removeItem(`vc-dep-${cx}`) } catch {}
    await Promise.all([refreshBothDirGroups(), loadData()])
    // 저장 성공 피드백 — 호차 이동 시 현재 호차 목록에서 학생이 빠져나가 '저장 안 됨'으로 오인되는 것 방지
    setAdjustToast(`💾 ${stuName} 저장됨${busMoved ? ` · ${oldBus}→${rEditBus}로 이동` : ''}`)
    setTimeout(() => setAdjustToast(''), 2600)
  }

  async function handleRosterEditDelete() {
    if (!rEditModal) return
    if (!confirm(`${rEditModal.student.name}의 ${rEditModal.dir === 'arr' ? '등원' : '하원'} 배정을 삭제하시겠습니까?`)) return
    setREditSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remove_rider',
        student_id: rEditModal.student.student_id,
        class_id: rEditModal.student.class_id,
        direction: rEditModal.dir,
      }),
    })
    setREditSaving(false)
    setREditModal(null)
    await Promise.all([refreshBothDirGroups(), loadData()])
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
    if (leftRiderDays.length === 0) { alert('요일을 1개 이상 선택해주세요.'); return }
    setLeftRiderSaving(true)
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_rider',
        student_id: leftRiderSelected.id,
        date: new Date().toISOString().slice(0, 10),
        direction: leftAddModal.dir,
        bus_name: leftAddModal.bus,
        session_name: leftAddModal.sessionName,
        pickup_time: leftRiderTime || undefined,
        pickup_location: leftRiderLocation || undefined,
        days: leftRiderDays,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setLeftRiderSaving(false)
      alert(`저장 실패: ${body?.error ?? res.status}`)
      return
    }
    setLeftRiderSaving(false)
    setLeftAddModal(null)
    resetLeftRiderForm()
    await Promise.all([refreshBothDirGroups(), loadData()])
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
    const willOpen = expandedStop !== stopName
    if (willOpen) setStopCardPos(null) // 새 정류장 열 때 팝업 위치 기본값으로
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

  // 정류장의 (세션·방향·호차) 그룹 시간 일괄 변경 — 개설반 현황·학생명단과 자동 일치
  async function saveStopGroupTime(busName: string, gdir: 'arr' | 'dep', sessionName: string, stopName: string, newTime: string) {
    if (!newTime) return
    const key = `${gdir}|${sessionName}|${busName}`
    setStopTimeSaving(key)
    try {
      const res = await fetch(`/api/campus/vehicles${cqs ? `?${cqs.slice(1)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_update_location_time', bus_name: busName, direction: gdir, location: stopName, session_name: sessionName, new_time: newTime }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(`시간 저장 실패: ${b?.error ?? res.status}`); return }
      setStopTimeEdit(prev => { const n = { ...prev }; delete n[key]; return n })
      await Promise.all([refreshBothDirGroups(), loadData()])
    } finally {
      setStopTimeSaving(null)
    }
  }

  // 정류장 위치 조정 시작 — 재검색 없이 지도에서 핀을 끌거나 클릭해 바로 조정
  function startAdjust(stopName: string) {
    const kakao = (window as any).kakao
    const c = coords[stopName]
    const center = c
      ?? coords[effectiveSchoolName ?? SCHOOL_STOP.name]
      ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    if (mapRef.current && kakao?.maps && center) {
      mapRef.current.setCenter(new kakao.maps.LatLng(center.lat, center.lng))
      mapRef.current.setLevel(3)
    }
    setCandidateStop(stopName)
    setCandidateCoord(c ?? null)
    if (c) setManualCoord(prev => ({ ...prev, [stopName]: { lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) } }))
  }

  // 학교/아파트 위치 보정 시작 — 드래그 핀 + 좌표 입력 (탑승장소 수정과 유사)
  function startPlaceAdjust(kind: 'school' | 'apt', name: string) {
    const kakao = (window as any).kakao
    const eff = kind === 'school' ? effSchoolSpots : effAptSpots
    const sp = eff[name]
    const center = sp ?? (() => { const c = mapRef.current?.getCenter?.(); return c ? { lat: c.getLat(), lng: c.getLng() } : null })()
    if (!center) return
    if (mapRef.current && kakao?.maps) {
      mapRef.current.setCenter(new kakao.maps.LatLng(center.lat, center.lng))
      mapRef.current.setLevel(3)
    }
    if (placeMarkerRef.current) {
      try { placeMarkerRef.current.setMap(null) } catch {}
      placeMarkerRef.current = null
    }
    if (mapRef.current && kakao?.maps) {
      const m = new kakao.maps.Marker({ map: mapRef.current, position: new kakao.maps.LatLng(center.lat, center.lng), draggable: true, zIndex: 80 })
      kakao.maps.event.addListener(m, 'dragend', () => {
        const pos = m.getPosition()
        const la = pos.getLat(), ln = pos.getLng()
        setPlaceAdjust(prev => prev ? { ...prev, to: { lat: la, lng: ln } } : prev)
        setPlaceCoordStr({ lat: la.toFixed(6), lng: ln.toFixed(6) })
      })
      placeMarkerRef.current = m
    }
    setPlaceAdjust({ kind, name, from: center, to: center })
    setPlaceCoordStr({ lat: center.lat.toFixed(6), lng: center.lng.toFixed(6) })
  }

  // 좌표 직접 입력 → 핀 위치 반영
  function applyPlaceCoordInput(lat: string, lng: string) {
    setPlaceCoordStr({ lat, lng })
    const la = parseFloat(lat), ln = parseFloat(lng)
    if (isNaN(la) || isNaN(ln)) return
    setPlaceAdjust(prev => prev ? { ...prev, to: { lat: la, lng: ln } } : prev)
    if (placeMarkerRef.current) {
      try { placeMarkerRef.current.setPosition(new (window as any).kakao.maps.LatLng(la, ln)) } catch {}
    }
  }

  async function savePlaceAdjust() {
    if (!placeAdjust) return
    const { kind, name, to } = placeAdjust
    try {
      await fetch('/api/campus/place-spots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campus_id: campusId, kind, name, lat: to.lat, lng: to.lng, hidden: false }),
      })
    } catch {}
    if (placeMarkerRef.current) {
      try { placeMarkerRef.current.setMap(null) } catch {}
      placeMarkerRef.current = null
    }
    setPlaceAdjust(null)
    reloadPlaceSpots()
  }

  function cancelPlaceAdjust() {
    if (placeMarkerRef.current) {
      try { placeMarkerRef.current.setMap(null) } catch {}
      placeMarkerRef.current = null
    }
    setPlaceAdjust(null)
  }

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

  // 새 정류장 좌표 지정 시작 — 기존 클릭/드래그(candidate) 인프라 재사용.
  // 좌표가 없으면 지도 중심(학원 좌표)을 기본값으로 두어 핀을 끌어 조정.
  function startAddStop(name: string) {
    const stopName = name.trim()
    if (!stopName) return
    const kakao = (window as any).kakao
    const center = coords[stopName]
      ?? coords[effectiveSchoolName ?? SCHOOL_STOP.name]
      ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    if (mapRef.current && kakao?.maps && center) {
      mapRef.current.setCenter(new kakao.maps.LatLng(center.lat, center.lng))
      mapRef.current.setLevel(3)
    }
    setCandidateStop(stopName)
    setCandidateCoord(coords[stopName] ?? center ?? null)
    const initial = coords[stopName] ?? center
    if (initial) setManualCoord(prev => ({ ...prev, [stopName]: { lat: initial.lat.toFixed(6), lng: initial.lng.toFixed(6) } }))
    setAddStopPlacing(true)
  }

  // "새 정류장 추가" 카드 헤더를 잡고 드래그해 위치 이동
  function startAddStopCardDrag(e: React.PointerEvent) {
    const card = addStopCardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const offX = e.clientX - rect.left
    const offY = e.clientY - rect.top
    const w = rect.width, h = rect.height
    const move = (ev: PointerEvent) => {
      setAddStopCardPos({
        x: Math.max(4, Math.min(window.innerWidth - w - 4, ev.clientX - offX)),
        y: Math.max(4, Math.min(window.innerHeight - 44, ev.clientY - offY)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 정류장 수정 팝업 드래그 — addStopCard와 동일 패턴
  function startStopCardDrag(e: React.PointerEvent) {
    const card = stopCardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const offX = e.clientX - rect.left
    const offY = e.clientY - rect.top
    const w = rect.width
    const move = (ev: PointerEvent) => {
      setStopCardPos({
        x: Math.max(4, Math.min(window.innerWidth - w - 4, ev.clientX - offX)),
        y: Math.max(4, Math.min(window.innerHeight - 44, ev.clientY - offY)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 빈 정류장(학생 0명) 삭제 — campus_registered_stops에서 제거
  async function handleDeleteRegisteredStop(stopName: string, busName: string, d: 'arr' | 'dep') {
    try {
      const res = await fetch(`/api/campus/registered-stops${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stop_name: stopName, bus_name: busName, direction: d }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        alert(`정류장 삭제 실패: ${b?.error ?? res.status}`)
        return
      }
      // 1) 낙관적 제거 (stop_name은 trim 비교로 공백 차이 방지)
      const remaining = registeredStops.filter(rs => !(rs.stop_name.trim() === stopName && rs.bus_name === busName && rs.direction === d))
      setRegisteredStops(remaining)
      // 2) 같은 이름을 다른 정류장(다른 호차·방향)이나 학생이 안 쓰면 좌표까지 제거 → 지도 핀 잔존 방지
      const usedByOtherReg = remaining.some(rs => rs.stop_name.trim() === stopName)
      const usedByStudent = bothDirGroups.some(({ group }) =>
        Object.values(group.busMap).some(sts => sts.some(s => (s.location ?? '').trim() === stopName)))
      if (!usedByOtherReg && !usedByStudent && coords[stopName]) {
        const c = { ...coords }; delete c[stopName]; updateCoords(c)
      }
      // 3) 서버 기준으로 재동기화 (DB 삭제가 반영됐는지 보장)
      await refreshBothDirGroups()
      reloadRegisteredStops()
    } catch {
      alert('정류장 삭제 중 오류가 발생했습니다.')
    }
  }

  async function handleAddStop() {
    if (!addStopModal) return
    const name = addStopName.trim()
    if (!name) { alert('정류장명을 입력해주세요.'); return }
    if (!addStopModal.bus) { alert('호차를 선택해주세요.'); return }
    setAddStopSaving(true)
    try {
      const res = await fetch(`/api/campus/registered-stops${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stop_name: name, bus_name: addStopModal.bus,
          direction: addStopModal.dir, default_time: addStopTime || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(`정류장 등록 실패: ${body?.error ?? res.status}`)
        return
      }
      const d = await res.json().catch(() => ({}))
      const saved: RegisteredStop = d.stop ?? { stop_name: name, bus_name: addStopModal.bus, direction: addStopModal.dir, default_time: addStopTime || null }
      setRegisteredStops(prev => {
        const others = prev.filter(rs => !(rs.stop_name === saved.stop_name && rs.bus_name === saved.bus_name && rs.direction === saved.direction))
        return [...others, saved]
      })
      // candidate 좌표가 지정돼 있으면 기존 campus_stop_coords 경로로 함께 저장
      if (candidateStop === name && (candidateCoord || (manualCoord[name]?.lat && manualCoord[name]?.lng))) {
        saveCoord(name)
      } else {
        setCandidateStop(null); setCandidateCoord(null)
      }
      setAddStopModal(null); setAddStopName(''); setAddStopTime(''); setAddStopPlacing(false)
      await refreshBothDirGroups()
    } finally {
      setAddStopSaving(false)
    }
  }

  async function renameStop(stopName: string) {
    const newName = (stopRename[stopName] ?? '').trim()
    if (!newName || newName === stopName) return
    setRenaming(prev => ({ ...prev, [stopName]: true }))
    const coord = coords[stopName]
    try {
      const res = await fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: stopName, newName, ...(coord ?? {}) }),
      })
      // 서버 변경 실패 시(권한·충돌 등) 로컬을 바꾸지 않아 화면과 DB가 어긋나지 않게 한다.
      if (!res.ok) {
        let msg = '정류장명 변경에 실패했습니다.'
        try { const e = await res.json(); if (e?.error && e.error !== 'conflict') msg = e.error } catch {}
        alert(msg)
        return
      }
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
      // 서버 파생 데이터(학생 위치·등록정류장)를 다시 받아 새 이름을 노선에 반영.
      // (다른 변경 핸들러들과 동일 — 안 하면 옛 이름이 그대로 남아 "변경 적용 안 됨"으로 보임)
      await Promise.all([refreshBothDirGroups(), loadData()])
      reloadRegisteredStops()
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

  // ── 공통 정류장 확장 패널 렌더 (검색 우선 + 고급 접기)
  function renderStopExpanded(stopName: string) {
    const hasCoord = !!coords[stopName]
    const isCandidate = candidateStop === stopName
    const results = stopResults[stopName] ?? []
    const searching = stopSearching[stopName] ?? false
    const canSaveManual = !!(manualCoord[stopName]?.lat && manualCoord[stopName]?.lng)
    const renameVal = stopRename[stopName] ?? stopName
    const isRenamingNow = renaming[stopName] ?? false
    const isAdvOpen = advOpen[stopName] ?? false

    return (
      <div className="px-2.5 pb-2.5 space-y-2 border-t border-[#F1F5F9] pt-2">

        {/* ── 위치 이동 중 배너 */}
        {isCandidate && candidateCoord && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#92400E] font-bold">위치 이동 중 — 마커를 드래그하세요</p>
              <p className="text-[10px] font-mono text-[#78350F] truncate">
                {candidateCoord.lat.toFixed(6)}, {candidateCoord.lng.toFixed(6)}
              </p>
            </div>
            <button onClick={() => { setCandidateStop(null); setCandidateCoord(null) }}
              className="text-[11px] font-bold text-[#64748B] px-2 py-1 rounded-lg border border-[#E2E8F0] hover:bg-[#F1F5F9] shrink-0">
              취소
            </button>
          </div>
        )}

        {/* ── 좌표 있을 때: 지도에서 바로 위치 수정 (재검색 불필요) */}
        {hasCoord && !isCandidate && (
          <button onClick={() => { startAdjust(stopName); setStopPopup(null) }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-black text-white bg-[#004EA2] hover:bg-[#003580] transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
            지도에서 위치 수정 (핀 끌어 조정)
          </button>
        )}

        {/* ── 검색 (장소명·주소로 다시 찾기) */}
        <div className="space-y-2">
          <p className="text-[11px] font-black text-[#334155] tracking-wide flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#004EA2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            {hasCoord ? '다른 위치로 검색' : '위치 검색 — 장소명·주소로 찾기'}
          </p>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              name={`search-${stopName}`}
              value={stopQuery[stopName] ?? stopName}
              onChange={e => setStopQuery(prev => ({ ...prev, [stopName]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && searchStop(stopName)}
              placeholder="예: 중계역 2번출구 / 상계로 123"
              className="w-full text-[12px] font-medium pl-9 pr-16 py-2.5 border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#004EA2] focus:ring-2 focus:ring-[#004EA2]/20 transition-colors"
            />
            <button onClick={() => searchStop(stopName)} disabled={searching}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#004EA2] text-white text-[11px] font-black rounded-lg disabled:opacity-50 hover:bg-[#003580] transition-colors">
              {searching ? '…' : '검색'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              {results.slice(0, 4).map((r, ri) => {
                const sel = stopSelectedResult[stopName]
                const isSelected = sel ? (sel.lat === r.lat && sel.lng === r.lng) : ri === 0
                return (
                  <button key={ri} onClick={() => applyCandidate(stopName, r)}
                    className={`w-full text-left px-3 py-2 rounded-xl leading-snug transition-colors ${isSelected ? 'bg-[#DBEAFE] ring-1 ring-[#93C5FD] text-[#1E40AF]' : 'bg-[#F7F8FA] text-[#475569] hover:bg-[#E8F0FB]'}`}>
                    <span className="font-bold block text-[12px]">{isSelected ? '✓ ' : ''}{r.name}</span>
                    <span className="opacity-75 text-[10px]">{r.address}</span>
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
                }}
                className="w-full py-2.5 rounded-xl text-[12px] font-black text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors mt-1 shadow-sm">
                이 위치로 저장
              </button>
            </div>
          )}
          {results.length === 0 && !searching && stopResults[stopName] !== undefined && (
            <p className="text-[12px] text-[#94A3B8] text-center py-1.5">결과 없음 — 검색어를 바꿔보세요</p>
          )}
        </div>

        {/* ── 현재 저장된 좌표 표시 */}
        {hasCoord && (
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#16A34A] font-black">현재 위치 설정됨</p>
              <p className="text-[10px] font-mono text-[#14532D] truncate">
                {coords[stopName].lat.toFixed(6)}, {coords[stopName].lng.toFixed(6)}
              </p>
            </div>
          </div>
        )}

        {/* ── 운행 시간 (세션·방향·호차별) — 개설반 현황·학생명단과 자동 일치 */}
        {(() => {
          const stopGroups: { key: string; gdir: 'arr' | 'dep'; sessionName: string; sessionLabel: string; busName: string; time: string | null; count: number }[] = []
          for (const { group, dir: d } of bothDirGroups) {
            for (const [busName, students] of Object.entries(group.busMap)) {
              const atStop = (students as StudentEntry[]).filter(s => (s.location ?? '').trim() === stopName)
              if (!atStop.length) continue
              let t: string | null = null
              for (const s of atStop) if (s.pickup_time && (!t || parseTimeMin(s.pickup_time) < parseTimeMin(t))) t = s.pickup_time
              stopGroups.push({ key: `${d}|${group.session_name}|${busName}`, gdir: d, sessionName: group.session_name, sessionLabel: getRunLabel(group.session_name, d), busName, time: t, count: atStop.length })
            }
          }
          if (stopGroups.length === 0) return null
          stopGroups.sort((a, b) => (a.gdir === b.gdir ? 0 : a.gdir === 'arr' ? -1 : 1) || a.sessionLabel.localeCompare(b.sessionLabel))
          return (
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-[#334155]">운행 시간 (세션·방향별)</p>
              {stopGroups.map(g => {
                const busColor = getBusColor(g.busName, buses.findIndex(b => b.name === g.busName))
                const dirColor = g.gdir === 'arr' ? '#1565C0' : '#C62828'
                const editing = stopTimeEditingKey === g.key
                const val = stopTimeEdit[g.key] ?? (g.time ? normalizeTime(g.time) : '')
                return (
                  <div key={g.key} className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-xl px-2.5 py-2 ring-1 ring-[#E2E8F0]">
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: dirColor + '18', color: dirColor }}>{g.gdir === 'arr' ? '등원' : '하원'}</span>
                    <span className="text-[11px] font-bold text-[#475569] shrink-0">{g.sessionLabel}</span>
                    <span className="text-[11px] font-black shrink-0" style={{ color: busColor }}>{g.busName}</span>
                    <span className="text-[10px] text-[#94A3B8] shrink-0">{g.count}명</span>
                    {editing ? (
                      <>
                        <input value={val} autoFocus
                          onChange={e => setStopTimeEdit(prev => ({ ...prev, [g.key]: e.target.value }))}
                          onBlur={e => setStopTimeEdit(prev => ({ ...prev, [g.key]: normalizeTime(e.target.value) || e.target.value }))}
                          placeholder="시간" inputMode="numeric"
                          className="ml-auto w-16 text-[12px] text-center px-1 py-1.5 border border-[#004EA2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004EA2]/30" style={{ fontVariantNumeric: 'tabular-nums' }} />
                        <button onClick={async () => { await saveStopGroupTime(g.busName, g.gdir, g.sessionName, stopName, normalizeTime(val) || val); setStopTimeEditingKey(null) }}
                          disabled={!val || stopTimeSaving === g.key}
                          className="text-[11px] font-black text-white bg-[#16A34A] rounded-lg px-2.5 py-1.5 disabled:opacity-40 shrink-0 hover:bg-[#15803D] transition-colors">
                          {stopTimeSaving === g.key ? '…' : '저장'}
                        </button>
                        <button onClick={() => { setStopTimeEditingKey(null); setStopTimeEdit(prev => { const n = { ...prev }; delete n[g.key]; return n }) }}
                          className="text-[11px] font-black text-[#64748B] bg-[#F1F5F9] rounded-lg px-2.5 py-1.5 shrink-0 hover:bg-[#E2E8F0] transition-colors">
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="ml-auto text-[13px] font-black text-[#0F172A]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {g.time ? normalizeTime(g.time) : '--:--'}
                        </span>
                        <button onClick={() => { setStopTimeEditingKey(g.key); setStopTimeEdit(prev => ({ ...prev, [g.key]: g.time ? normalizeTime(g.time) : '' })) }}
                          className="text-[11px] font-black text-[#004EA2] bg-[#EAF2FB] rounded-lg px-2.5 py-1.5 shrink-0 hover:bg-[#DBEAFE] transition-colors">
                          수정
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              <p className="text-[9px] text-[#94A3B8]">시간 저장 시 개설반 현황·학생 명단과 자동 일치됩니다.</p>
            </div>
          )
        })()}

        {/* ── 고급 설정 토글 */}
        <div>
          <button
            onClick={() => setAdvOpen(prev => ({ ...prev, [stopName]: !isAdvOpen }))}
            className="w-full flex items-center justify-between text-[11px] font-bold text-[#64748B] hover:text-[#475569] px-1 py-1.5 transition-colors">
            <span>고급 설정 (이름 변경 · 직접 입력 · 위치 이동)</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${isAdvOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isAdvOpen && (
            <div className="space-y-2.5 pt-1.5 mt-1 border-t border-dashed border-[#E2E8F0]">
              {/* 정류장명 변경 */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">정류장명</p>
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

              {/* 저장된 주소 */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">저장된 주소</p>
                <input
                  name={`address-${stopName}`}
                  value={stopAddress[stopName] ?? ''}
                  onChange={e => {
                    const next = { ...stopAddress, [stopName]: e.target.value }
                    setStopAddress(next)
                    try { localStorage.setItem(addressKey, JSON.stringify(next)) } catch {}
                  }}
                  placeholder="검색 시 자동 입력, 직접 수정 가능"
                  className="w-full text-[11px] px-2.5 py-2 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                />
              </div>

              {/* 좌표 직접 입력 */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">좌표 직접 입력</p>
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

              {/* 액션: 직접입력 저장 / 위치이동 / 삭제 */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => saveCoord(stopName)}
                  disabled={!isCandidate && !canSaveManual}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-[#004EA2] hover:bg-[#003580] disabled:opacity-40 transition-colors">
                  좌표 저장
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
          )}
        </div>

      </div>
    )
  }

  // 좌표 탭 정류장 행 (검색·호차별·미설정 보기에서 공통 사용)
  function renderCoordStopRow(stop: { name: string; directions: string[] }) {
    const hasCoord = !!coords[stop.name]
    const isExpanded = expandedStop === stop.name
    const isAdjusting = candidateStop === stop.name
    const count = stopStudentCounts[stop.name] ?? 0
    const hasArr = stop.directions.includes('등원')
    const hasDep = stop.directions.includes('하원')
    return (
      <button key={stop.name} onClick={() => openStop(stop.name)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors ${isExpanded || isAdjusting ? 'border-[#004EA2] bg-[#F5F9FF]' : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]'}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasCoord ? 'bg-[#10B981]' : 'bg-[#FCA5A5]'}`} />
        <span className={`flex-1 min-w-0 text-[12px] font-semibold truncate ${hasCoord ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>{stop.name}</span>
        <span className="shrink-0 text-[10px] font-bold">
          {hasArr && <span className="text-[#1D4ED8]">등</span>}
          {hasArr && hasDep && <span className="text-[#CBD5E1]">·</span>}
          {hasDep && <span className="text-[#DC2626]">하</span>}
        </span>
        {hasCoord
          ? (count > 0 ? <span className="shrink-0 w-6 text-right text-[10px] text-[#94A3B8] tabular-nums">{count}</span> : null)
          : <span className="shrink-0 text-[9px] font-black text-[#EF4444] bg-[#FEF2F2] px-1.5 py-0.5 rounded-full">미설정</span>}
        <svg className="shrink-0 w-3.5 h-3.5 text-[#CBD5E1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    )
  }

  // ── 차량 일정: 통합 선택기(dir/selectedSession/selectedBuses) 기반 데이터
  function getScheduleData() {
    const dirItems = bothDirGroups.filter(x => x.dir === dir)
    const byLabel = new Map<string, TimeGroup[]>()
    for (const { group } of dirItems) {
      const label = getRunLabel(group.session_name, dir)
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(group)
    }
    const sessionLabels = [...byLabel.keys()]
    const activeLabels = selectedSession ? [selectedSession] : sessionLabels
    const combined: Record<string, StudentEntry[]> = {}
    for (const lbl of activeLabels)
      for (const g of (byLabel.get(lbl) ?? []))
        for (const [bn, sts] of Object.entries(g.busMap)) {
          if (!combined[bn]) combined[bn] = []
          combined[bn].push(...sts)
        }
    const activeBuses = buses.filter(b => !b.name.includes('결석') && (combined[b.name]?.length ?? 0) > 0)
    const displayBuses = selectedBuses.length ? activeBuses.filter(b => selectedBuses.includes(b.name)) : activeBuses
    return { byLabel, combined, displayBuses }
  }

  // 호차별 정원 (설정값 없으면 17)
  const busCapOf = (name: string) => buses.find(b => b.name === name)?.capacity ?? BUS_CAP

  // Hero ETA 카드 (우측 노선 탭 최상단)
  function renderHeroEta() {
    const { combined, displayBuses } = getScheduleData()
    const allFocusStudents = displayBuses.flatMap(b => combined[b.name] ?? [])
    const focusTimes = allFocusStudents.map(s => parseTimeMin(s.pickup_time)).filter(t => t !== 9999).sort((a, b) => a - b)
    const focusStops = new Set(allFocusStudents.map(s => s.location?.trim()).filter(Boolean))
    const minT = focusTimes[0]
    const maxT = focusTimes[focusTimes.length - 1]
    const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const oneBus = selectedBuses.length === 1 ? selectedBuses[0] : null
    const tmapSel = oneBus ? tmapSummaries[oneBus] : null
    const accentDot = dir === 'arr' ? '#1A73E8' : '#FB7185'
    // 정원 상태 (단일 호차=해당 호차 / 복수=초과·주의 대수 요약)
    const overN = displayBuses.filter(b => (busDayMaxCount[b.name] ?? 0) > busCapOf(b.name)).length
    const warnN = displayBuses.filter(b => { const c = busDayMaxCount[b.name] ?? 0; const cap = busCapOf(b.name); return c <= cap && c >= cap - 2 }).length
    const heroSt: { label: string; color: string } = oneBus
      ? (() => { const s = capStatus(busDayMaxCount[oneBus] ?? 0, busCapOf(oneBus)); return { label: s.label, color: s.color } })()
      : overN > 0 ? { label: `만차 ${overN}대`, color: '#DC2626' }
      : warnN > 0 ? { label: `주의 ${warnN}대`, color: '#D97706' }
      : { label: '여유', color: '#16A34A' }
    return (
      <>
      <div className="rounded-2xl p-4 shadow-lg shrink-0"
        style={{
          background: dir === 'arr'
            ? 'linear-gradient(135deg, #0B3D91 0%, #1E5BB8 100%)'
            : 'linear-gradient(135deg, #7C1D2E 0%, #B83248 100%)',
        }}>
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {dir === 'arr' ? '등원 운행' : '하원 운행'}
                {' · '}{oneBus ? oneBus : `호차 ${displayBuses.length}대`}
                {selectedSession && ` · ${selectedSession}`}
              </p>
              <div className="flex items-baseline gap-2 mt-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span className="text-[28px] font-black text-white tracking-tight leading-none">
                  {minT != null ? fmtMin(minT) : '--:--'}
                </span>
                <span className="text-[14px] font-black text-white/55 leading-none">→</span>
                <span className="text-[18px] font-black text-white/85 tracking-tight leading-none">
                  {maxT != null ? fmtMin(maxT) : '--:--'}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 pl-3">
              <p className="text-[10px] font-black text-white/55 uppercase tracking-[0.18em]">총 인원</p>
              <p className="text-[28px] font-black text-white tracking-tight leading-none mt-1.5"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {allFocusStudents.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5 pt-2.5 border-t border-white/15">
            <div>
              <p className="text-[9px] font-black text-white/55 uppercase tracking-wider mb-0.5">정류장</p>
              <p className="text-[13px] font-black text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{focusStops.size}곳</p>
            </div>
            {tmapSel && (
              <>
                <div>
                  <p className="text-[9px] font-black text-white/55 uppercase tracking-wider mb-0.5">소요</p>
                  <p className="text-[13px] font-black text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(tmapSel.time / 60)}분</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-white/55 uppercase tracking-wider mb-0.5">거리</p>
                  <p className="text-[13px] font-black text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{(tmapSel.distance / 1000).toFixed(1)}km</p>
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setCapPopup(
                  displayBuses
                    .map(b => ({ name: b.name, count: busDayMaxCount[b.name] ?? 0, cap: busCapOf(b.name) }))
                    .sort((a, b2) => (b2.count - b2.cap) - (a.count - a.cap))
                )}
                title="호차별 정원 현황 보기"
                className="inline-flex items-center gap-1 rounded-full font-bold leading-none hover:brightness-95 transition"
                style={{ fontSize: 10, padding: '3px 8px', background: 'rgba(255,255,255,0.92)', color: heroSt.color, fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
                <span style={{ width: 5, height: 5, borderRadius: 9, background: heroSt.color }} />{heroSt.label}
                <span style={{ fontSize: 8, opacity: 0.65 }}>▾</span>
              </button>
              <span className="h-2 w-2 rounded-full animate-pulse"
                style={{ background: accentDot, boxShadow: `0 0 14px ${accentDot}` }} />
            </div>
          </div>
      </div>
      {capPopup && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => setCapPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs max-h-[80vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-[#1E293B]">{dir === 'arr' ? '등원' : '하원'} 호차별 정원 현황</h3>
              <button onClick={() => setCapPopup(null)} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none">✕</button>
            </div>
            <div className="space-y-1.5">
              {capPopup.map(b => {
                const st = capStatus(b.count, b.cap)
                const bcolor = getBusColor(b.name, buses.findIndex(x => x.name === b.name))
                return (
                  <div key={b.name} className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: st.bg, boxShadow: `inset 0 0 0 1px ${st.ring}` }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: bcolor }} />
                    <span className="text-[13px] font-bold text-[#1E293B] flex-1 truncate">{b.name}</span>
                    <span className="text-[12px] font-black" style={{ color: st.color, fontVariantNumeric: 'tabular-nums' }}>{b.count}/{b.cap}</span>
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 inline-flex items-center gap-1"
                      style={{ color: st.color, background: '#fff', boxShadow: `inset 0 0 0 1px ${st.ring}` }}>
                      <span style={{ width: 5, height: 5, borderRadius: 9, background: st.color }} />{st.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  // 정류장 타임라인 리스트 (우측 노선 탭 본문)
  // 명단 행 인라인 편집기 (별도 모달 없이 코스 명단 안에서 바로 수정)
  function renderLeftEditInline() {
    if (!leftEditModal) return null
    const stu = leftEditModal.student
    const busColor = getBusColor(leftEditBus, buses.findIndex(b => b.name === leftEditBus))
    return (
      <div className="mt-1.5 rounded-xl border border-[#004EA2]/30 bg-[#F8FAFC] p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold text-[#1E293B]">✏ {stu.name} <span className="text-[#94A3B8] font-bold">수정</span></p>
          <button onClick={() => setLeftEditModal(null)} className="text-[#94A3B8] hover:text-[#475569] text-base leading-none">×</button>
        </div>
        <div>
          <p className="text-[9px] font-bold text-[#94A3B8] mb-1">호차</p>
          <div className="flex flex-wrap gap-1">
            {buses.filter(b => !b.name.includes('결석') && !isIndividualBus(b.name)).map((b, bi) => {
              const bc = getBusColor(b.name, bi); const isOn = leftEditBus === b.name
              return (
                <button key={b.name} onClick={() => setLeftEditBus(b.name)}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors"
                  style={isOn ? { background: bc, color: '#fff', borderColor: bc } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>{b.name}</button>
              )
            })}
            <button onClick={() => setLeftEditBus('')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${leftEditBus === '' ? 'bg-[#EF4444] text-white border-[#EF4444]' : 'bg-white text-[#94A3B8] border-[#E2E8F0]'}`}>미배정</button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold text-[#94A3B8] mb-1">정류장</p>
            <input value={leftEditLoc} onChange={e => setLeftEditLoc(e.target.value)} placeholder="정류장"
              className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
          </div>
          <div className="w-20 shrink-0">
            <p className="text-[9px] font-bold text-[#94A3B8] mb-1">시간</p>
            <input value={leftEditTime} onChange={e => setLeftEditTime(e.target.value)} placeholder="17:10"
              className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold text-[#94A3B8] mb-1">요일</p>
          <div className="flex gap-1">
            {(['월','화','수','목','금'] as const).map((d, di) => {
              const isOn = leftEditDays.includes(d)
              return (
                <button key={d} onClick={() => setLeftEditDays(prev => isOn ? prev.filter(x => x !== d) : [...prev, d])}
                  className="flex-1 h-7 rounded-lg text-[11px] font-bold border transition-colors"
                  style={isOn ? { background: DAY_DOT_COLOR[di], color: '#fff', borderColor: DAY_DOT_COLOR[di] } : { background: '#fff', color: '#94A3B8', borderColor: '#E2E8F0' }}>{d}</button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-2 pt-0.5">
          <button onClick={handleLeftEditDelete} disabled={leftEditSaving}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-[#EF4444] border border-[#FECACA] hover:bg-[#FEF2F2] disabled:opacity-40">배정 삭제</button>
          <div className="flex-1" />
          <button onClick={() => handleLeftEditSave()} disabled={leftEditSaving}
            className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40" style={{ background: busColor }}>
            {leftEditSaving ? '저장…' : '저장'}</button>
        </div>
      </div>
    )
  }

  // 호차 명단 카드의 학생설정 풀편집 인라인 에디터 (요일별 호차/장소/시간 지원)
  // 호차 명단 편집기: (호차·정류장)의 기존 운행 시간 자동 매칭.
  // ※ 반드시 '학생이 속한 세션그룹'(group) 안에서만 매칭 — 같은 정류장을 유치부·초등부가
  //    공유해도 다른 세션 시간이 섞이지 않게 한다(모바일 timeFor와 동일 원칙).
  function rosterStopTimeFor(group: TimeGroup | undefined, bus: string, loc: string): string {
    if (!group || !bus || !loc) return ''
    const times: string[] = []
    for (const s of (group.busMap[bus] ?? []) as StudentEntry[]) {
      if (sameStop(s.location, loc) && s.pickup_time) times.push(s.pickup_time)
      if (s.dayLocs && s.dayTimes) for (const [d, l] of Object.entries(s.dayLocs)) {
        if (sameStop(l, loc) && s.dayTimes[d]) times.push(s.dayTimes[d] as string)
      }
    }
    if (!times.length) return ''
    const freq: Record<string, number> = {}
    times.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 })
    return normalizeTime(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])
  }
  // 이 세션그룹의 해당 호차 정류장 목록 (중복·공백 제거) — 다른 세션 정류장 섞지 않음
  function rosterBusStops(group: TimeGroup | undefined, bus: string): string[] {
    const seen = new Set<string>()
    for (const s of (group?.busMap[bus] ?? []) as StudentEntry[]) {
      if (s.location) { const n = normStop(s.location); if (n) seen.add(n) }
      if (s.dayLocs) for (const l of Object.values(s.dayLocs)) if (l) { const n = normStop(l); if (n) seen.add(n) }
    }
    for (const l of (group?.busLocations[bus] ?? [])) if (l) { const n = normStop(l); if (n) seen.add(n) }
    return [...seen].sort((a, b) => a.localeCompare(b, 'ko'))
  }
  function renderRosterEditInline() {
    if (!rEditModal) return null
    const stu = rEditModal.student
    const rDir = rEditModal.dir
    // 이 학생이 속한 세션그룹 — 정류장/시간 매칭을 이 세션 안으로 한정(유치부에 초등부 섞임 방지)
    const myGroup = p2MasterGroups[rDir].find(g => Object.values(g.busMap).some(arr => (arr as StudentEntry[]).some(s => s.student_id === stu.student_id)))
    const busColor = getBusColor(rEditBus, buses.findIndex(b => b.name === rEditBus))
    const selBuses = buses.filter(b => !b.name.includes('결석') && !isIndividualBus(b.name))
    return (
      <div className="mt-1.5 rounded-xl border border-[#4338CA]/30 bg-[#F8FAFC] p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold text-[#1E293B]">✏ {stu.name} <span className="text-[#94A3B8] font-bold">학생설정 수정</span></p>
          <button onClick={() => setREditModal(null)} className="text-[#94A3B8] hover:text-[#475569] text-base leading-none">×</button>
        </div>

        <button onClick={() => setREditPerDay(v => !v)}
          className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
          style={rEditPerDay ? { background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE' } : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
          <span>🗓️ 요일별 다른 호차·장소·시간</span>
          <span>{rEditPerDay ? 'ON' : 'OFF'}</span>
        </button>

        {!rEditPerDay ? (
          <>
            <div>
              <p className="text-[9px] font-bold text-[#94A3B8] mb-1">호차</p>
              <div className="flex flex-wrap gap-1">
                {selBuses.map((b, bi) => {
                  const bc = getBusColor(b.name, bi); const isOn = rEditBus === b.name
                  return (
                    <button key={b.name} onClick={() => setREditBus(b.name)}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors"
                      style={isOn ? { background: bc, color: '#fff', borderColor: bc } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>{b.name}</button>
                  )
                })}
                <button onClick={() => setREditBus('')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${rEditBus === '' ? 'bg-[#EF4444] text-white border-[#EF4444]' : 'bg-white text-[#94A3B8] border-[#E2E8F0]'}`}>미배정</button>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-[#94A3B8] mb-1">정류장 <span className="font-normal">(선택하면 시간 자동매칭)</span></p>
              {(() => { const stops = rEditBus ? rosterBusStops(myGroup, rEditBus) : []; return stops.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {stops.map(st => {
                    const on = sameStop(rEditLoc, st)
                    return (
                      <button key={st} onClick={() => { setREditLoc(st); const t = rosterStopTimeFor(myGroup, rEditBus, st); if (t) setREditTime(t) }}
                        className="text-[10px] px-1.5 py-0.5 rounded-lg border transition-colors"
                        style={on ? { background: '#4338CA', color: '#fff', borderColor: '#4338CA' } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>📍{st}</button>
                    )
                  })}
                </div>
              )})()}
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <input value={rEditLoc} onChange={e => { const v = e.target.value; setREditLoc(v); const t = rosterStopTimeFor(myGroup, rEditBus, v); if (t) setREditTime(t) }} placeholder="정류장 직접 입력"
                    className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#4338CA]" />
                </div>
                <div className="w-20 shrink-0">
                  <input value={rEditTime} onChange={e => setREditTime(e.target.value)} placeholder="시간"
                    className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#4338CA]" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-[#94A3B8] mb-1">요일</p>
              <div className="flex gap-1">
                {(['월','화','수','목','금'] as const).map((d, di) => {
                  const isOn = rEditDays.includes(d)
                  return (
                    <button key={d} onClick={() => setREditDays(prev => isOn ? prev.filter(x => x !== d) : [...prev, d])}
                      className="flex-1 h-7 rounded-lg text-[11px] font-bold border transition-colors"
                      style={isOn ? { background: DAY_DOT_COLOR[di], color: '#fff', borderColor: DAY_DOT_COLOR[di] } : { background: '#fff', color: '#94A3B8', borderColor: '#E2E8F0' }}>{d}</button>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[9px] font-bold text-[#94A3B8] mb-1">탑승 요일</p>
              <div className="flex gap-1">
                {(['월','화','수','목','금'] as const).map((d, di) => {
                  const isOn = rEditDays.includes(d)
                  return (
                    <button key={d} onClick={() => toggleREditDay(d)}
                      className="flex-1 h-7 rounded-lg text-[11px] font-bold border transition-colors"
                      style={isOn ? { background: DAY_DOT_COLOR[di], color: '#fff', borderColor: DAY_DOT_COLOR[di] } : { background: '#fff', color: '#94A3B8', borderColor: '#E2E8F0' }}>{d}</button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1">
              {rEditDays.length === 0
                ? <p className="text-[10px] text-[#94A3B8]">탑승 요일을 선택하세요</p>
                : (['월','화','수','목','금'] as const).filter(d => rEditDays.includes(d)).map(d => (
                  <div key={d} className="flex items-center gap-1">
                    <span className="w-4 text-[11px] font-bold text-[#475569] shrink-0">{d}</span>
                    <select value={rEditDayBus[d] ?? rEditBus} onChange={e => setREditDayBus(prev => ({ ...prev, [d]: e.target.value }))}
                      className="w-16 shrink-0 border border-[#E2E8F0] rounded-lg px-1 py-1 text-[11px] bg-white">
                      {selBuses.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                    </select>
                    <input value={rEditDayLoc[d] ?? ''} onChange={e => { const v = e.target.value; setREditDayLoc(prev => ({ ...prev, [d]: v })); const bus = rEditDayBus[d] || rEditBus; const t = rosterStopTimeFor(myGroup, bus, v); if (t) setREditDayTime(prev => ({ ...prev, [d]: t })) }} placeholder={rEditLoc || '정류장'}
                      className="flex-1 min-w-0 border border-[#E2E8F0] rounded-lg px-1.5 py-1 text-[11px]" />
                    <input value={rEditDayTime[d] ?? ''} onChange={e => setREditDayTime(prev => ({ ...prev, [d]: e.target.value }))} placeholder={rEditTime || '시간'}
                      className="w-14 shrink-0 border border-[#E2E8F0] rounded-lg px-1 py-1 text-[11px]" />
                  </div>
                ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-0.5">
          <button onClick={handleRosterEditDelete} disabled={rEditSaving}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-[#EF4444] border border-[#FECACA] hover:bg-[#FEF2F2] disabled:opacity-40">배정 삭제</button>
          <div className="flex-1" />
          <button onClick={handleRosterEditSave} disabled={rEditSaving}
            className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40" style={{ background: busColor }}>
            {rEditSaving ? '저장…' : '저장'}</button>
        </div>
      </div>
    )
  }

  // 정류장 정렬: 시간 있는 정류장은 시간순, 시간 미입력은 좌표상 가장 가까운 정류장 뒤에 배치
  function orderStopNodes<T extends { name: string; time: string | null }>(nodes: T[]): T[] {
    const hasTime = (n: T) => n.time != null && parseTimeMin(n.time) < 9999
    const timed = nodes.filter(hasTime).sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
    const untimed = nodes.filter(n => !hasTime(n))
    if (untimed.length === 0) return timed
    const result = [...timed]
    const orphan: T[] = []
    for (const u of untimed) {
      const uc = coords[u.name]
      if (!uc) { orphan.push(u); continue }
      let bestIdx = -1, bestDist = Infinity
      for (let i = 0; i < result.length; i++) {
        const c = coords[result[i].name]
        if (!c) continue
        const d = (c.lat - uc.lat) ** 2 + (c.lng - uc.lng) ** 2
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      if (bestIdx >= 0) result.splice(bestIdx + 1, 0, u)
      else orphan.push(u)
    }
    return [...result, ...orphan]
  }

  // 호차별 정류장 노드 순서 — 카드(타임라인 리스트)와 지도 마커가 같은 번호를 쓰도록 단일 소스로 사용
  // (현재 방향 dir 기준. combined 학생 + 빈 정류장 마스터 합집합 → orderStopNodes 정렬)
  function getOrderedStopNodesForBus(busName: string): { name: string; time: string | null; students: StudentEntry[] }[] {
    const { combined } = getScheduleData()
    const stopsMap = new Map<string, { time: string | null; students: StudentEntry[] }>()
    for (const s of (combined[busName] ?? [])) {
      // 요일별로 펼침 — 요일마다 다른 정류장/시간 반영. routeDay 설정 시 그날 타는 요일만(=지도 노선과 동일 당일 기준).
      for (const day of s.days) {
        if (routeDay && day !== routeDay) continue
        const loc = (s.dayLocs?.[day] ?? s.location)?.trim() || '정류장 미설정'
        if (!stopsMap.has(loc)) stopsMap.set(loc, { time: null, students: [] })
        const e = stopsMap.get(loc)!
        if (!e.students.some(x => x.student_id === s.student_id)) e.students.push(s)
        const t = s.dayTimes?.[day] ?? s.pickup_time
        if (t && (!e.time || parseTimeMin(t) < parseTimeMin(e.time))) e.time = t
      }
    }
    // 빈 정류장 마스터(학생 0명)는 당일 기준(routeDay 설정) 보기에선 제외 — 그날 타는 정류장만 깔끔하게(routeStopsByBus와 동일)
    if (!routeDay) for (const rs of registeredStops) {
      if (rs.bus_name !== busName || rs.direction !== dir) continue
      const loc = rs.stop_name.trim()
      if (!stopsMap.has(loc)) stopsMap.set(loc, { time: rs.default_time, students: [] })
      else if (!stopsMap.get(loc)!.time && rs.default_time) stopsMap.get(loc)!.time = rs.default_time
    }
    return orderStopNodes([...stopsMap.entries()].map(([name, info]) => ({ name, time: info.time, students: info.students })))
  }

  function renderScheduleTimelineList(onlyBus?: string) {
    const { byLabel, combined, displayBuses } = getScheduleData()
    const list = onlyBus ? displayBuses.filter(b => b.name === onlyBus) : displayBuses
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl" style={{ background: '#F4F6FA' }}>
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-white ring-1 ring-[#E2E8F0] flex items-center justify-center mb-3 shadow-sm">
                <span className="text-2xl">🚌</span>
              </div>
              <p className="text-[13px] font-bold text-[#475569]">데이터가 없습니다</p>
              <p className="text-[11px] text-[#94A3B8] mt-1">위에서 수업 유형·호차를 선택하세요</p>
            </div>
          ) : (
            <div className="p-2.5 space-y-3">
              {list.map(bus => {
                const bColor = getBusColor(bus.name, buses.indexOf(bus))
                const sts = [...(combined[bus.name] ?? [])].sort((a, b) => parseTimeMin(a.pickup_time) - parseTimeMin(b.pickup_time))
                // 인원 표시(숫자만) — 주간 전체 distinct + 오늘 실탑승 distinct. 목록·노선은 필터 안 함(전부 표시).
                const weekCount = new Set(sts.map(s => s.student_id)).size
                const todayCount = todayWeekday ? new Set(sts.filter(s => s.days.includes(todayWeekday)).map(s => s.student_id)).size : null
                const busSession = selectedSession || (() => {
                  for (const [lbl, grps] of byLabel.entries())
                    for (const g of grps)
                      if (g.busMap[bus.name]?.length) return lbl
                  return ''
                })()
                const sessColor = getSessionColor(busSession)
                // 카드·지도 마커가 같은 순서/번호를 쓰도록 단일 소스 함수 사용
                const stopNodes = getOrderedStopNodesForBus(bus.name)
                // 탑승 정류장(학생 1명+)만 순번. 학생 0명은 '스팟'(번호 없음) — 차량 경유·탑승 추가 가능
                const boardingNumByName = new Map<string, number>()
                { let bn = 0; for (const n of stopNodes) { if (n.students.length > 0) { bn++; boardingNumByName.set(n.name, bn) } } }
                return (
                  <div key={bus.name} className="bg-white rounded-2xl shadow-sm ring-1 ring-[#E2E8F0] overflow-hidden">
                    {/* 호차 헤더 — 1줄: 호차·세션 / 2줄: 인원·정류장 (한 줄 안 깨지게) */}
                    <div className="px-4 py-3"
                      style={{ background: `linear-gradient(135deg, ${bColor}14, transparent 70%)`, borderLeft: `4px solid ${bColor}` }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[17px] font-black tracking-tight" style={{ color: bColor }}>{bus.name}</span>
                        {busSession && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: sessColor + '20', color: sessColor }}>
                            {busSession}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1 mt-1.5 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {todayCount !== null ? (
                          <>
                            <span className="text-[9px] font-bold text-[#94A3B8]">오늘</span>
                            <span className="text-[16px] font-black text-[#0F172A]">{todayCount}</span>
                            <span className="text-[10px] font-bold text-[#94A3B8]">명</span>
                            <span className="text-[10px] text-[#CBD5E1] mx-1.5">·</span>
                            <span className="text-[9px] font-bold text-[#94A3B8]">주간</span>
                            <span className="text-[14px] font-black text-[#475569]">{weekCount}</span>
                            <span className="text-[10px] font-bold text-[#94A3B8]">명</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[16px] font-black text-[#0F172A]">{weekCount}</span>
                            <span className="text-[10px] font-bold text-[#94A3B8]">명</span>
                          </>
                        )}
                        <span className="text-[10px] text-[#CBD5E1] mx-1.5">·</span>
                        <span className="text-[16px] font-black text-[#0F172A]">{stopNodes.length}</span>
                        <span className="text-[10px] font-bold text-[#94A3B8]">정류장</span>
                      </div>
                    </div>
                    {/* 여유(정원) + ETA(분·거리) + 게이지 — 컴팩트 카드 통합 */}
                    {(() => {
                      // 정원 게이지는 요일별 최대 인원 기준(안전). 오늘 실탑승은 헤더 '오늘 N명'에서 별도 표시.
                      const dayMax = busDayMaxCount[bus.name] ?? weekCount
                      const st = capStatus(dayMax, busCapOf(bus.name))
                      const summary = tmapSummaries[bus.name]
                      const timeStr = summary ? (() => { const m = Math.floor(summary.time / 60); return m >= 60 ? `${Math.floor(m/60)}시간 ${m%60}분` : `${m}분` })() : null
                      const distStr = summary ? (summary.distance >= 1000 ? `${(summary.distance/1000).toFixed(1)}km` : `${summary.distance}m`) : null
                      return (
                        <div className="flex items-center gap-1.5 px-4 pb-2.5 -mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full shrink-0"
                            style={{ padding: '2px 7px', color: st.color, background: st.bg, boxShadow: `inset 0 0 0 1px ${st.ring}` }}
                            title="하루 최대 탑승(요일별 최대) 기준">
                            <span style={{ width: 5, height: 5, borderRadius: 9, background: st.color }} />{st.label} {dayMax}/{busCapOf(bus.name)}
                          </span>
                          {timeStr && distStr && (
                            <span className="text-[10px] font-bold rounded-md inline-flex items-center shrink-0"
                              style={{ padding: '2px 7px', color: '#B45309', background: '#FEF3C7', boxShadow: 'inset 0 0 0 1px #FDE68A', fontVariantNumeric: 'tabular-nums' }}>{timeStr}·{distStr}</span>
                          )}
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden ml-0.5" style={{ background: '#F1F5F9' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(dayMax / busCapOf(bus.name) * 100))}%`, background: st.color, transition: 'width .3s' }} />
                          </div>
                        </div>
                      )
                    })()}
                    {/* 정류장 타임라인 */}
                    <div className="relative px-4 py-3.5">
                      {stopNodes.length > 1 && (
                        <div className="absolute w-0.5 rounded-full"
                          style={{ left: 14.5, top: 22, bottom: 22, background: `linear-gradient(180deg, ${bColor} 0%, ${bColor}40 100%)` }} />
                      )}
                      {stopNodes.map((stop) => {
                        const hasCoord = !!coords[stop.name]
                        const isSpot = stop.students.length === 0 // 학생 0명 = 스팟(경유·추가가능)
                        return (
                          <div key={stop.name} className="relative pl-8 pb-3 last:pb-0">
                            <div className="absolute left-0 top-0.5 w-[24px] h-[24px] rounded-full flex items-center justify-center font-black text-[11px]"
                              style={{
                                background: isSpot ? '#fff' : (hasCoord ? bColor : '#94A3B8'),
                                color: isSpot ? bColor : '#fff',
                                border: isSpot ? `2px dashed ${bColor}` : undefined,
                                boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${(hasCoord ? bColor : '#94A3B8')}30, 0 2px 4px rgba(15,23,42,0.15)`,
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                              {isSpot ? '+' : boardingNumByName.get(stop.name)}
                            </div>
                            {/* 정류장 헤더 — 클릭 시 작은 팝업으로 명단·좌표설정 (카드는 접힌 채 유지) */}
                            <button onClick={() => setStopPopup(p => p?.bus === bus.name && p?.stop === stop.name ? null : { bus: bus.name, stop: stop.name })} className="w-full text-left">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[13px] font-bold text-[#0F172A] truncate">
                                  {stop.name}
                                  {!hasCoord && (
                                    <span className="ml-1.5 text-[9px] text-[#F59E0B] font-black bg-[#FFFBEB] px-1.5 py-0.5 rounded-full align-middle">좌표 없음</span>
                                  )}
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                  <span className="text-[13px] font-black text-[#0F172A]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {stop.time ? normalizeTime(stop.time) : '--:--'}
                                  </span>
                                  <span className="text-[#CBD5E1] text-[11px]">›</span>
                                </span>
                              </div>
                              <div className="text-[10px] text-[#94A3B8] font-bold tracking-wide uppercase mt-0.5">
                                탑승 <span className="text-[#475569]" style={{ fontVariantNumeric: 'tabular-nums' }}>{stop.students.length}</span>명
                              </div>
                            </button>
                            {stopPopup?.bus === bus.name && stopPopup?.stop === stop.name && (
                              // 위치 조정(검색·핀 이동) 중에는 지도를 가리지 않도록 하단 컴팩트 시트로 축소
                              // (검색 결과·저장은 그대로 유지, 지도/핀은 시트 위쪽에서 보이고 드래그 가능)
                              <div
                                className={candidateStop === stop.name
                                  ? "fixed inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-3 pointer-events-none"
                                  : "fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4"}
                                onClick={candidateStop === stop.name ? undefined : () => setStopPopup(null)}>
                                <div
                                  className={candidateStop === stop.name
                                    ? "bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[44vh] flex flex-col overflow-hidden ring-1 ring-black/10 pointer-events-auto"
                                    : "bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[82vh] flex flex-col overflow-hidden"}
                                  onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#E2E8F0] shrink-0" style={{ borderLeft: `4px solid ${bColor}` }}>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[15px] font-black text-[#0F172A] truncate">{stop.name}</p>
                                        {!coords[stop.name] && <span className="text-[9px] text-[#F59E0B] font-black bg-[#FFFBEB] px-1.5 py-0.5 rounded-full shrink-0">좌표 없음</span>}
                                      </div>
                                      <p className="text-[11px] text-[#94A3B8] font-bold mt-0.5">
                                        <span style={{ color: bColor }}>{bus.name}</span> · {dir === 'arr' ? '등원' : '하원'} · 탑승 {stop.students.length}명 · {stop.time ? normalizeTime(stop.time) : '시간 미설정'}
                                      </p>
                                    </div>
                                    <button onClick={() => setStopPopup(null)} className="w-7 h-7 rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] text-base leading-none shrink-0">✕</button>
                                  </div>
                                  <div className="overflow-y-auto">
                                    {/* ── 탑승 명단 */}
                                    <div className="px-3 pt-3 pb-2.5 border-b border-[#F1F5F9]">
                                      <p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider mb-1.5">🧑‍🎓 탑승 명단 <span className="text-[#475569]">{stop.students.length}명</span> · 탭하여 수정</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {stop.students.map(s => (
                                          <button key={s.student_id}
                                            onClick={() => openLeftEdit(s, bus.name, dir, busSession)}
                                            className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#EFF6FF] transition-all"
                                            style={{ boxShadow: 'inset 0 0 0 1px transparent' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `inset 0 0 0 1px ${bColor}` }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'inset 0 0 0 1px transparent' }}>
                                            <span className="text-[12px] font-bold text-[#1E293B] group-hover:text-[#0F172A]">{s.name}</span>
                                            <span className="scale-[0.82] origin-left -mr-1"><DayDots days={s.days} /></span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {leftEditModal && leftEditModal.busName === bus.name && leftEditModal.dir === dir
                                      && stop.students.some(st => st.student_id === leftEditModal!.student.student_id)
                                      && <div className="px-3 pb-1">{renderLeftEditInline()}</div>}
                                    {/* ── 정류장 위치·시간 설정 */}
                                    <p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider px-3 pt-2.5 pb-0.5">📍 정류장 위치 · 시간</p>
                                    {renderStopExpanded(stop.name)}
                                    {/* 탑승자 추가 — 이 정류장으로 미리 채움 */}
                                    <button onClick={() => {
                                      const defaultDays = busSession.includes('2일반') ? ['화', '목']
                                        : busSession.includes('3일반') ? ['월', '수', '금']
                                        : ['월', '화', '수', '목', '금']
                                      resetLeftRiderForm()
                                      setLeftRiderDays(defaultDays)
                                      setLeftRiderLocation(stop.name)
                                      setLeftAddModal({ bus: bus.name, sessionName: busSession, dir })
                                      loadLeftAllStudents()
                                      setStopPopup(null)
                                    }}
                                      className="w-full flex items-center justify-center gap-2 text-[12px] font-black text-[#004EA2] hover:bg-[#EFF6FF] py-3 border-t border-[#F1F5F9] transition-colors">
                                      <span className="w-[18px] h-[18px] rounded-full bg-[#EAF2FB] flex items-center justify-center text-[12px] font-black leading-none">+</span>
                                      이 정류장에 탑승자 추가
                                    </button>
                                    {/* 빈 정류장(학생 0명, 지도에서 추가한 정류장) 삭제 */}
                                    {stop.students.length === 0 && registeredStops.some(rs => rs.stop_name.trim() === stop.name && rs.bus_name === bus.name && rs.direction === dir) && (
                                      <button onClick={async () => {
                                        if (!confirm(`'${stop.name}' 빈 정류장을 삭제할까요?`)) return
                                        await handleDeleteRegisteredStop(stop.name, bus.name, dir)
                                        setStopPopup(null)
                                      }}
                                        className="w-full flex items-center justify-center gap-2 text-[12px] font-black text-[#EF4444] hover:bg-[#FEF2F2] py-3 border-t border-[#F1F5F9] transition-colors">
                                        <span className="text-[13px] leading-none">🗑</span>
                                        이 빈 정류장 삭제
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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

  // ── 지도 FAB 컨트롤 핸들러
  const fabCenterSchool = () => {
    const kakao = (window as any).kakao
    if (!mapRef.current || !kakao?.maps) return
    const schoolName = effectiveSchoolName ?? SCHOOL_STOP.name
    let c = coords[schoolName] ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng })
    // 학원 좌표 미설정 시 전체 정류장 좌표의 중심(centroid)으로 이동
    if (!c) {
      const all = Object.values(coords)
      if (all.length) c = { lat: all.reduce((s, v) => s + v.lat, 0) / all.length, lng: all.reduce((s, v) => s + v.lng, 0) / all.length }
    }
    if (!c) return
    mapRef.current.panTo(new kakao.maps.LatLng(c.lat, c.lng))
  }
  const fabFitRoute = () => {
    const kakao = (window as any).kakao
    if (!mapRef.current || !kakao?.maps) return
    const bounds = new kakao.maps.LatLngBounds()
    let has = false
    const extend = (lat: number, lng: number) => { bounds.extend(new kakao.maps.LatLng(lat, lng)); has = true }
    const schoolName = effectiveSchoolName ?? SCHOOL_STOP.name
    if (sidebarPage === 2 && p2SelectedBus) {
      for (const s of p2VisibleStudents) { const c = s.location ? coords[s.location] : null; if (c) extend(c.lat, c.lng) }
      const sc = coords[schoolName] ?? (campusId ? null : { lat: SCHOOL_STOP.lat, lng: SCHOOL_STOP.lng }); if (sc) extend(sc.lat, sc.lng)
    } else {
      const names = selectedBuses.length ? selectedBuses : Object.keys(routeStopsByBus)
      for (const bn of names) for (const s of (routeStopsByBus[bn] ?? [])) { const c = coords[s.name]; if (c) extend(c.lat, c.lng) }
    }
    // 노선 선택이 없거나 좌표를 못 모은 경우 → 전체 정류장 좌표로 폴백
    if (!has) for (const c of Object.values(coords)) extend(c.lat, c.lng)
    if (has) mapRef.current.setBounds(bounds, 60, 40, 60, 40)
  }
  const fabZoom = (delta: number) => {
    if (!mapRef.current) return
    const lvl = mapRef.current.getLevel()
    mapRef.current.setLevel(lvl + delta, { animate: true })
  }

  return (
    <>
    <Script
      src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`}
      strategy="afterInteractive"
      onLoad={() => setKakaoSdkReady(true)}
      onError={() => console.error('[KakaoMap] SDK 로드 실패 — 카카오 콘솔 도메인/키 확인 필요')}
    />
    <div
      ref={vehRootRef}
      className="relative bg-[#EEF2F7] rounded-2xl p-2"
      style={fullscreen
        ? { height: '100%', minHeight: 0 }
        : { height: 'calc(100vh - 150px)', minHeight: 480 }}>


      {/* ── 지도 (화면 전체 채움, 리모컨은 위에 떠 있음) */}
      <div className="w-full h-full relative rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm">


        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* ── 동시 접속자/편집자 표시 (캠퍼스 단위) — 지도 좌상단. 페이지가 자체 배지를 그리면(showPresence=false) 숨김 */}
        {showPresence && (
          <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
            <PresenceBadge campusId={campusId} editing={mapEditing} />
          </div>
        )}

        {/* ── 동시편집 충돌 모달 */}
        <ConflictModal c={conflict} onClose={() => setConflict(null)} />

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
          {/* 지도 스팟 토글 (학교/아파트 밀집) — 검색바 아래 */}
          <div className="flex gap-1.5 mt-2">
            {/* 🏫 학교 — 본체=표시토글, ▾=관리 */}
            <div className="flex-1 flex rounded-xl overflow-hidden shadow-md"
              style={showSchoolSpots ? { background: '#047857' } : { background: 'rgba(255,255,255,0.97)', outline: '1px solid #E2E8F0' }}>
              <button onClick={() => setShowSchoolSpots(v => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-black active:scale-95"
                style={{ color: showSchoolSpots ? '#fff' : '#94A3B8' }}>
                <span className="text-[12px] leading-none">🏫</span> 학교
              </button>
              <button onClick={() => setSpotManage(m => m === 'school' ? null : 'school')} title="학교 관리"
                className="px-2 flex items-center border-l text-[10px] font-black active:scale-95"
                style={{ color: showSchoolSpots ? '#fff' : '#94A3B8', borderColor: showSchoolSpots ? 'rgba(255,255,255,0.3)' : '#E2E8F0', background: spotManage === 'school' ? 'rgba(0,0,0,0.18)' : 'transparent' }}>▾</button>
            </div>
            {/* 🏠 아파트 */}
            <div className="flex-1 flex rounded-xl overflow-hidden shadow-md"
              style={showAptSpots ? { background: '#1D4ED8' } : { background: 'rgba(255,255,255,0.97)', outline: '1px solid #E2E8F0' }}>
              <button onClick={() => setShowAptSpots(v => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-black active:scale-95"
                style={{ color: showAptSpots ? '#fff' : '#94A3B8' }}>
                <span className="text-[12px] leading-none">🏠</span> 아파트
              </button>
              <button onClick={() => setSpotManage(m => m === 'apt' ? null : 'apt')} title="아파트 관리"
                className="px-2 flex items-center border-l text-[10px] font-black active:scale-95"
                style={{ color: showAptSpots ? '#fff' : '#94A3B8', borderColor: showAptSpots ? 'rgba(255,255,255,0.3)' : '#E2E8F0', background: spotManage === 'apt' ? 'rgba(0,0,0,0.18)' : 'transparent' }}>▾</button>
            </div>
          </div>
          {/* 학교/아파트 관리 패널 (목록·좌표설정·추가·삭제) */}
          {spotManage && (() => {
            const kind = spotManage
            const color = kind === 'school' ? '#047857' : '#1D4ED8'
            const label = kind === 'school' ? '학교' : '아파트'
            const raw = kind === 'school' ? schoolRaw : aptRaw
            const eff = kind === 'school' ? effSchoolSpots : effAptSpots
            const ovMap = new Map(placeSpots.filter(p => p.kind === kind).map(o => [o.name, o]))
            const names = [...new Set([...raw.map(r => r.name), ...placeSpots.filter(p => p.kind === kind).map(o => o.name)])]
            const items = names.map(name => {
              const ov = ovMap.get(name)
              return {
                name,
                count: raw.find(r => r.name === name)?.count ?? 0,
                hidden: ov?.hidden ?? false,
                overridden: !!(ov && ov.lat != null && ov.lng != null),
                placed: !!eff[name],
              }
            }).sort((a, b) => b.count - a.count)
            const mapCenter = () => { const c = mapRef.current?.getCenter?.(); return c ? { lat: c.getLat(), lng: c.getLng() } : null }
            const post = (b: object) => fetch('/api/campus/place-spots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campus_id: campusId, ...b }) }).then(reloadPlaceSpots)
            const del = (name: string) => fetch('/api/campus/place-spots', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campus_id: campusId, kind, name }) }).then(reloadPlaceSpots)
            const setCoordHere = (name: string) => { const c = mapCenter(); if (c) post({ kind, name, lat: c.lat, lng: c.lng, hidden: false }) }
            return (
              <div className="mt-1.5 rounded-xl border border-[#E2E8F0] bg-white p-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-black" style={{ color }}>{kind === 'school' ? '🏫' : '🏠'} {label} 관리 <span className="text-[#94A3B8]">{items.length}</span></p>
                  <button onClick={() => setSpotManage(null)} className="text-[#94A3B8] text-sm leading-none">✕</button>
                </div>
                <p className="text-[9px] text-[#94A3B8] mb-1.5">항목을 누르면 지도 핀(📍)을 끌거나 좌표를 입력해 위치를 보정할 수 있어요. 인원수 상위 3곳은 🥇🥈🥉 표시.</p>
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {items.length === 0 ? <p className="text-[10px] text-[#CBD5E1] py-2 text-center">데이터 없음</p> :
                    items.map((it, i) => {
                      const editing = placeAdjust?.kind === kind && placeAdjust?.name === it.name
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
                      return (
                      <div key={it.name} className={`rounded-lg ${editing ? 'bg-[#EFF6FF] ring-1 ring-[#93C5FD]' : 'hover:bg-[#F8FAFC]'}`}>
                        <div className="flex items-center gap-1 px-1 py-1">
                          <button onClick={() => startPlaceAdjust(kind, it.name)} title="클릭하여 위치 보정 (드래그·좌표)" className="flex-1 min-w-0 text-left flex items-center gap-1">
                            {medal
                              ? <span className="text-[11px] shrink-0 leading-none w-4 text-center">{medal}</span>
                              : <span className="text-[9px] text-[#CBD5E1] shrink-0 w-4 text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>}
                            <span className={`text-[11px] truncate ${it.hidden ? 'text-[#CBD5E1] line-through' : 'text-[#334155]'}`}>{it.name}</span>
                            <span className="text-[9px] shrink-0" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{it.count}</span>
                            {it.overridden && <span className="text-[8px] text-[#0891B2] shrink-0">보정</span>}
                            {!it.placed && !it.hidden && <span className="text-[8px] text-[#EF4444] shrink-0">좌표없음</span>}
                          </button>
                          {(it.overridden || it.hidden) && <button onClick={() => del(it.name)} title="자동값으로 복원" className="text-[10px] px-1 text-[#94A3B8] shrink-0">↺</button>}
                        </div>
                        {editing && placeAdjust && (
                          <div className="px-1.5 pb-1.5 pt-0.5 space-y-1">
                            <p className="text-[9px] text-[#0369A1] leading-snug">지도 핀(📍)을 끌거나 좌표를 입력해 위치를 보정한 뒤 저장하세요.</p>
                            <div className="flex gap-1">
                              <input value={placeCoordStr.lat} onChange={e => applyPlaceCoordInput(e.target.value, placeCoordStr.lng)} placeholder="위도" inputMode="decimal"
                                className="flex-1 min-w-0 text-[10px] border border-[#CBD5E1] rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                              <input value={placeCoordStr.lng} onChange={e => applyPlaceCoordInput(placeCoordStr.lat, e.target.value)} placeholder="경도" inputMode="decimal"
                                className="flex-1 min-w-0 text-[10px] border border-[#CBD5E1] rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                            </div>
                            <div className="flex gap-1">
                              <button onClick={savePlaceAdjust} className="flex-1 text-[10px] font-black px-2 py-1 rounded bg-[#004EA2] text-white">저장</button>
                              <button onClick={cancelPlaceAdjust} className="flex-1 text-[10px] font-bold px-2 py-1 rounded bg-[#F1F5F9] text-[#64748B]">취소</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )})}
                </div>
                <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-[#F1F5F9]">
                  <input value={placeAddName} onChange={e => setPlaceAddName(e.target.value)} placeholder={`${label}명 입력`}
                    className="flex-1 min-w-0 text-[11px] border border-[#E2E8F0] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                  <button onClick={() => { const n = placeAddName.trim(); if (n) { setCoordHere(n); setPlaceAddName('') } }}
                    disabled={!placeAddName.trim()}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[#004EA2] text-white disabled:opacity-40 shrink-0">+ 지도중심 추가</button>
                </div>
              </div>
            )
          })()}
        </div>

        {/* (호차 카드가 곧 상세 — 별도 확장 팝업 제거, renderScheduleTimelineList로 통합) */}

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
                      <div key={s.student_id}>
                        <div onClick={() => openLeftEdit(s, p2SelectedBus, p2Dir, sessLabelStr)} title="클릭하여 변경"
                          className={`grid items-center gap-x-1 px-2 py-1.5 border-b border-[#f5f5f5] cursor-pointer hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-[#fafafa]' : 'bg-white'}`}
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
                        {leftEditModal && leftEditModal.student.student_id === s.student_id && leftEditModal.busName === p2SelectedBus && leftEditModal.dir === p2Dir && (
                          <div className="px-2 pb-2 bg-white">{renderLeftEditInline()}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* 호차 명단 카드 — 선택 호차 전체 탑승생(학생설정) 풀편집, 리모컨 스타일 플로팅. 페이지 무관 토글 */}
        {rosterOpen && (
          <div ref={rosterWrapRef} className="absolute z-[1050] pointer-events-auto flex"
            style={{ ...(rosterPos ? { left: rosterPos.x, top: rosterPos.y } : { left: 12, top: 324 }) }}>
            {rosterMin ? (
              <div className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white pl-3 pr-1.5 py-1.5 shrink-0"
                style={{ boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
                <div onPointerDown={startRosterDrag} className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
                  <span className="text-[#475569] text-[11px] leading-none tracking-widest">⠿</span>
                  <span className="text-[12px] font-black text-[#202124] whitespace-nowrap">📋 {rosterBus ?? '호차 명단'}</span>
                </div>
                <button onClick={() => setRosterMin(false)} title="펼치기" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#1A73E8] hover:bg-[#E8F0FE] text-[13px] leading-none">▢</button>
              </div>
            ) : (() => {
              const sessionOpts = Array.from(new Set(p2MasterGroups[rosterDir].map(g => getRunLabel(g.session_name, rosterDir)))).filter(Boolean)
              const dayFilter = (s: StudentEntry) => !rosterDay || s.days.includes(rosterDay)
              const rosterBusList = buses.filter(b => !b.name.includes('결석') && !isIndividualBus(b.name) && getP2BusStudents(b.name, rosterDir, rosterSession).length > 0)
              const rosterStudents = rosterBus
                ? [...getP2BusStudents(rosterBus, rosterDir, rosterSession)].filter(dayFilter).sort((a, b) => parseTimeMin(a.pickup_time) - parseTimeMin(b.pickup_time))
                : []
              const rosterCap = rosterBus ? (buses.find(b => b.name === rosterBus)?.capacity ?? 0) : 0
              const rosterOver = !!rosterDay && rosterCap > 0 && rosterStudents.length > rosterCap
              const busIdx = rosterBus ? buses.findIndex(b => b.name === rosterBus) : -1
              const headColor = rosterBus ? getBusColor(rosterBus, busIdx) : '#475569'
              return (
                <div className="flex flex-col overflow-hidden rounded-2xl border border-[#DADCE0] bg-white"
                  style={{ width: 300, maxHeight: 'min(64vh, calc(100vh - 200px))', boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
                  <div className="flex items-center px-2 pt-1.5 shrink-0">
                    <div onPointerDown={startRosterDrag} className="flex-1 flex items-center justify-center gap-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
                      <span className="text-[#475569] text-[12px] leading-none tracking-widest">⠿⠿</span>
                      <span className="text-[#64748B] text-[9px] font-bold">호차 명단 · 학생설정</span>
                    </div>
                    <button onClick={() => setRosterMin(true)} title="최소화" className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-[#5F6368] hover:bg-black/5 text-[15px] leading-none">−</button>
                    <button onClick={() => setRosterOpen(false)} title="닫기" className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-[#5F6368] hover:bg-black/5 text-[15px] leading-none">×</button>
                  </div>
                  <div className="px-2 pb-1.5 flex items-center gap-1 shrink-0 flex-wrap">
                    {(['arr','dep'] as const).map(d => (
                      <button key={d} onClick={() => { setRosterDir(d); setP2Dir(d) }}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors"
                        style={rosterDir === d ? { background: d === 'arr' ? '#1A73E8' : '#D93025', color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>
                        {d === 'arr' ? '등원' : '하원'}</button>
                    ))}
                    <select value={rosterSession} onChange={e => { setRosterSession(e.target.value); setP2SessionFilter(e.target.value); setP2SelectedBus(null) }}
                      className="text-[10px] font-bold border border-[#E2E8F0] rounded-lg px-1.5 py-1 bg-white">
                      <option value="">전체 세션</option>
                      {sessionOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {/* 요일 토글 — 정원은 하루 단위라 요일별로 봐야 정확 ('전체'=주간 합집합) */}
                  <div className="px-2 pb-1.5 flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-[#94A3B8] font-bold mr-0.5">요일</span>
                    {(['월','화','수','목','금'] as const).map((d, di) => (
                      <button key={d} onClick={() => setRosterDay(rosterDay === d ? '' : d)}
                        className="w-6 h-6 rounded-lg text-[11px] font-bold transition-colors"
                        style={rosterDay === d ? { background: DAY_DOT_COLOR[di], color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>{d}</button>
                    ))}
                    <button onClick={() => setRosterDay('')}
                      className="px-2 h-6 rounded-lg text-[10px] font-bold transition-colors"
                      style={rosterDay === '' ? { background: '#475569', color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>전체</button>
                  </div>
                  <div className="px-2 pb-1.5 flex flex-wrap gap-1 shrink-0">
                    {rosterBusList.length === 0
                      ? <span className="text-[10px] text-[#94A3B8]">해당 세션 호차 없음</span>
                      : rosterBusList.map(b => {
                          const bc = getBusColor(b.name, buses.findIndex(x => x.id === b.id)); const isOn = rosterBus === b.name
                          const cnt = getP2BusStudents(b.name, rosterDir, rosterSession).filter(dayFilter).length
                          return (
                            <button key={b.name} onClick={() => { setRosterBus(b.name); setP2SelectedBus(b.name); setREditModal(null) }}
                              className="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors"
                              style={isOn ? { background: bc, color: '#fff', borderColor: bc } : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>
                              {b.name}<span className="opacity-70 ml-0.5 text-[9px]">{cnt}</span></button>
                          )
                        })}
                  </div>
                  {rosterBus && (
                    <div className="px-3 py-1.5 shrink-0 flex items-center gap-2 flex-wrap" style={{ background: headColor }}>
                      <span className="text-xs font-extrabold text-white">{rosterBus}</span>
                      <span className="text-[10px] font-bold text-white opacity-90">{rosterStudents.length}명{rosterCap ? ` / 정원 ${rosterCap}` : ''}</span>
                      {rosterOver && <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-[#DC2626] text-white">정원초과</span>}
                      <span className="text-[9px] font-bold text-white opacity-70">{rosterDir === 'arr' ? '등원' : '하원'}{rosterSession ? ` · ${rosterSession}` : ''} · {rosterDay ? `${rosterDay}요일` : '주간합계'}</span>
                    </div>
                  )}
                  {rosterBus && (
                    <div className="grid text-[9px] text-[#94A3B8] font-semibold px-2 pt-1.5 pb-0.5 border-b border-[#F1F5F9] shrink-0" style={{ gridTemplateColumns: '14px 36px 1fr 1fr 38px' }}>
                      <span>#</span><span className="text-center">시간</span><span>이름</span><span>장소</span><span className="text-center">요일</span>
                    </div>
                  )}
                  <div className="overflow-y-auto flex-1">
                    {!rosterBus ? (
                      <p className="text-center text-[12px] text-[#CBD5E1] py-8">위에서 호차를 선택하세요</p>
                    ) : rosterStudents.length === 0 ? (
                      <p className="text-center text-[12px] text-[#CBD5E1] py-8">해당 호차 탑승생 없음</p>
                    ) : rosterStudents.map((s, idx) => {
                      const perDay = detectPerDay({ days: s.days, baseBus: rosterBus!, baseLoc: s.location ?? '', baseTime: s.pickup_time ?? '', dayBus: s.busByDay ?? {}, dayLoc: s.dayLocs ?? {}, dayTime: s.dayTimes ?? {} })
                      const isEditing = rEditModal?.student.student_id === s.student_id && rEditModal?.busName === rosterBus
                      // 요일 선택 시 그 요일의 정류장·시간을 표시(요일별 다른 학생 정확 반영)
                      const dispLoc = rosterDay ? (s.dayLocs?.[rosterDay] ?? s.location) : s.location
                      const dispTime = rosterDay ? (s.dayTimes?.[rosterDay] ?? s.pickup_time) : s.pickup_time
                      return (
                        <div key={s.student_id}>
                          <div onClick={() => isEditing ? setREditModal(null) : openRosterEdit(s, rosterBus!, rosterDir, rosterSession)} title="클릭하여 학생설정 수정"
                            className={`grid items-center gap-x-1 px-2 py-1.5 border-b border-[#f5f5f5] cursor-pointer hover:bg-indigo-50 transition-colors ${idx % 2 === 0 ? 'bg-[#fafafa]' : 'bg-white'}`}
                            style={{ gridTemplateColumns: '14px 36px 1fr 1fr 38px' }}>
                            <span className="text-[9px] text-[#ccc]">{idx + 1}</span>
                            <div className="text-center">{dispTime ? <span className="text-[9px] font-bold text-[#1E293B]">{normalizeTime(dispTime)}</span> : <span className="text-[9px] text-[#CBD5E1]">-</span>}</div>
                            <div className="min-w-0"><div className="flex items-center gap-1"><span className="text-[11px] font-semibold text-[#1a1a1a] truncate">{s.name}</span>{perDay && <span className="text-[8px] font-bold px-1 rounded shrink-0 text-[#4338CA] bg-[#EEF2FF]">요일별</span>}</div></div>
                            <div className="min-w-0">{dispLoc ? <span className="text-[9px] text-[#475569] line-clamp-2">📍 {dispLoc}</span> : <span className="text-[9px] text-[#CBD5E1]">-</span>}</div>
                            <DayDots days={s.days} />
                          </div>
                          {isEditing && <div className="px-2 pb-2 bg-white">{renderRosterEditInline()}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* 호차별 노선 카드 (컴팩트) — 2대 이상 선택 시 요약만 표시해 지도 확보 */}
        {sidebarPage === 1 && selectedSession && selectedBuses.length >= 2 && !bothDir && !loading && (
          <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto overflow-y-auto"
            style={{ width: 232, maxHeight: 'calc(100vh - 190px)' }}>
            {selectedBuses.map(busName => {
              const busIdx = buses.findIndex(b => b.name === busName)
              const color = getBusColor(busName, busIdx)
              const cnt = routeDay ? (busRouteDayCount?.[busName] ?? 0) : (busStudentCount[busName] ?? 0)
              const stops = routeStopsByBus[busName] ?? []
              const summary = tmapSummaries[busName]
              const distStr = summary ? (summary.distance >= 1000 ? `${(summary.distance / 1000).toFixed(1)}km` : `${summary.distance}m`) : null
              const timeStr = summary ? `${Math.round(summary.time / 60)}분` : null
              return (
                <button key={busName} onClick={() => setSelectedBuses([busName])}
                  title={`${busName} 상세 노선 보기`}
                  className="group flex items-center gap-2 bg-white rounded-xl shadow-lg ring-1 ring-[#E2E8F0] hover:ring-2 transition-all pl-2.5 pr-2.5 py-2 text-left"
                  style={{ borderLeft: `4px solid ${color}` }}>
                  <span className="text-[14px] font-black shrink-0" style={{ color }}>{busName}</span>
                  <span className="text-[10px] font-bold text-[#94A3B8] shrink-0">{stops.length - 1}정</span>
                  <div className="flex items-baseline gap-0.5 ml-auto shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span className="text-[16px] font-black text-[#0F172A] leading-none">{cnt}</span>
                    <span className="text-[10px] font-bold text-[#94A3B8]">명</span>
                  </div>
                  {distStr && (
                    <span className="text-[10px] font-black rounded-md px-1.5 py-1 shrink-0 leading-none"
                      style={{ background: '#FEF3C7', color: '#B45309', boxShadow: 'inset 0 0 0 1px #FDE68A', fontVariantNumeric: 'tabular-nums' }}>
                      {timeStr}·{distStr}
                    </span>
                  )}
                </button>
              )
            })}
            <p className="text-[10px] font-bold text-center text-white/80 mt-0.5 px-2 py-1.5 rounded-lg pointer-events-none"
              style={{ background: 'rgba(11,18,32,0.7)', backdropFilter: 'blur(4px)' }}>
              카드를 누르면 해당 호차 상세 노선
            </p>
          </div>
        )}

        {/* 호차별 노선 카드 (상세) — 1대 선택 또는 등하원 동시보기 */}
        {sidebarPage === 1 && selectedSession && selectedBuses.length > 0 && !loading && !(selectedBuses.length >= 2 && !bothDir) && (
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
            {/* 일반 모드: 호차 카드 = 명단·수정·탑승자추가(renderScheduleTimelineList) + 여유/ETA. 별도 팝업 통합 */}
            {!bothDir && selectedBuses.map(busName => (
              <div key={busName} className="bg-white rounded-2xl shadow-lg border border-[#E2E8F0] overflow-hidden flex flex-col" style={{ maxHeight: cardMaxH }}>
                {renderScheduleTimelineList(busName)}
              </div>
            ))}
          </div>
        )}

        {/* DB 저장 중 표시 */}
        {coordsSaving && (
          <div className="absolute z-[1000] bg-white/95 rounded-xl shadow px-3 py-1.5 flex items-center gap-1.5 border border-[#E2E8F0] text-xs text-[#64748B]" style={{ bottom: 12, right: 64 }}>
            <div className="w-3 h-3 border-2 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
            저장 중...
          </div>
        )}

        {/* 위치 조정 배너 — 핀 드래그/지도 클릭 후 바로 저장 (새 정류장 추가 중엔 전용 바 사용) */}
        {candidateStop && !addStopPlacing && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto">
            <div className="flex items-center gap-2.5 rounded-2xl pl-3.5 pr-2 py-2 shadow-2xl ring-1 ring-white/10"
              style={{ background: 'rgba(11,18,32,0.96)', backdropFilter: 'blur(8px)' }}>
              <span className="w-2 h-2 rounded-full bg-[#FCD34D] animate-pulse shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-black text-white leading-tight truncate max-w-[180px]">{candidateStop}</p>
                <p className="text-[10px] font-bold text-white/55">핀을 끌거나 지도를 눌러 위치 조정</p>
              </div>
              <button
                onClick={() => { setCandidateStop(null); setCandidateCoord(null) }}
                className="px-3 py-2 rounded-xl text-[12px] font-black text-white/90 bg-white/10 hover:bg-white/20 transition-colors shrink-0">
                취소
              </button>
              <button
                onClick={() => saveCoord(candidateStop)}
                disabled={!candidateCoord && !(manualCoord[candidateStop]?.lat && manualCoord[candidateStop]?.lng)}
                className="px-4 py-2 rounded-xl text-[12px] font-black text-white shrink-0 transition-colors disabled:opacity-40"
                style={{ background: '#16A34A' }}>
                저장
              </button>
            </div>
          </div>
        )}

        {/* 위치 조정 모드 — 저장 확인 / 안내 띠 */}
        {adjustMode && !candidateStop && (pendingMove ? (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto">
            <div className="flex items-center gap-2.5 rounded-2xl pl-3.5 pr-2 py-2 shadow-2xl ring-1 ring-white/10"
              style={{ background: 'rgba(11,18,32,0.96)', backdropFilter: 'blur(8px)' }}>
              <svg className="w-4 h-4 text-[#FCD34D] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              <div className="min-w-0">
                <p className="text-[12px] font-black text-white leading-tight truncate max-w-[180px]">{pendingMove.name}</p>
                <p className="text-[10px] font-bold text-white/55">이 위치로 저장할까요?</p>
              </div>
              <button
                onClick={() => {
                  if (pendingMarkerRef.current) {
                    try { pendingMarkerRef.current.setPosition(new (window as any).kakao.maps.LatLng(pendingMove.from.lat, pendingMove.from.lng)) } catch {}
                  }
                  pendingMarkerRef.current = null
                  setPendingMove(null)
                  setAdjustToast('↩ 되돌렸습니다'); setTimeout(() => setAdjustToast(''), 1800)
                }}
                className="px-3 py-2 rounded-xl text-[12px] font-black text-white/90 bg-white/10 hover:bg-white/20 transition-colors shrink-0">
                되돌리기
              </button>
              <button
                onClick={() => {
                  updateCoords({ ...coordsRef.current, [pendingMove.name]: pendingMove.to })
                  pendingMarkerRef.current = null
                  setAdjustToast(`📍 ${pendingMove.name} 저장됨`); setTimeout(() => setAdjustToast(''), 2200)
                  setPendingMove(null)
                }}
                className="px-4 py-2 rounded-xl text-[12px] font-black text-white shrink-0 transition-colors"
                style={{ background: '#16A34A' }}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 text-white text-[12px] font-black px-4 py-2.5 rounded-full shadow-xl pointer-events-none"
            style={{ background: '#16A34A' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
            위치 조정 모드 — 정류장 핀을 끌어 옮기세요
          </div>
        ))}

        {/* 위치 변경 토스트 */}
        {adjustToast && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1002] bg-[#0B1220]/95 text-white text-[13px] font-black px-5 py-3 rounded-2xl shadow-2xl pointer-events-none ring-1 ring-white/10">
            {adjustToast}
          </div>
        )}

        {/* 좌표 미설정 안내 */}
        {!loading && sidebarPage === 1 && selectedBuses.length > 0 &&
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

        {/* ── 지도 FAB 컨트롤 (좌하단 — 명단·추가·이동·홈 한 줄 세로. 줌은 마우스 스크롤로 대체) */}
        <div className="absolute z-[1000] pointer-events-auto" style={{ bottom: 30, left: 10 }}>
          <div className="flex flex-col rounded-xl overflow-hidden shadow-lg ring-1 ring-[#E2E8F0] bg-white">
            <button onClick={() => setRosterOpen(v => !v)}
              title="호차 명단 — 선택 호차 전체 탑승생 학생설정 보기·수정"
              className="w-9 h-9 flex items-center justify-center transition-colors active:scale-95 text-[15px]"
              style={rosterOpen ? { background: '#4338CA', color: '#fff' } : { color: '#4338CA' }}>
              📋
            </button>
            <div className="h-px bg-[#E2E8F0]" />
            <button
              onClick={() => {
                setAddStopModal({ bus: selectedBuses.length === 1 ? selectedBuses[0] : '', dir, sessionName: '' })
                setAddStopName(''); setAddStopTime(''); setAddStopPlacing(false); setAddStopCardPos(null)
                setCandidateStop(null); setCandidateCoord(null)
              }}
              title="정류장 추가 — 지도에 빈 정류장 등록 (탑승장소·호차설정·학생 매칭에 자동 반영)"
              className="w-9 h-9 flex items-center justify-center transition-colors active:scale-95 text-[#004EA2] hover:bg-[#EAF2FB]">
              <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v6M9 10h6" />
              </svg>
            </button>
            <div className="h-px bg-[#E2E8F0]" />
            <button onClick={() => { setAdjustMode(v => !v); setPendingMove(null); pendingMarkerRef.current = null }} title="정류장 이동 — 정류장 핀을 끌어 좌표 변경"
              className="w-9 h-9 flex items-center justify-center transition-colors active:scale-95"
              style={adjustMode ? { background: '#16A34A', color: '#fff' } : { color: '#16A34A' }}>
              <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
            </button>
            <div className="h-px bg-[#E2E8F0]" />
            <button onClick={fabCenterSchool} title="학원 중심으로"
              className="w-9 h-9 flex items-center justify-center text-[#004EA2] hover:bg-[#EAF2FB] transition-colors active:scale-95">
              <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" />
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* 플로팅 리모컨 — 지도 위에 떠서 드래그 이동 */}
      <div ref={remoteWrapRef} className="absolute flex z-[1100]"
        style={{ ...(remotePos ? { left: remotePos.x, top: remotePos.y } : { right: 8, top: 8 }), maxHeight: 'calc(100% - 16px)' }}>
      {/* ── 최소화 캡슐 (선택 요약 + 펼치기) */}
      {remoteMinimized && (
        <div className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white pl-3 pr-1.5 py-1.5 shrink-0"
          style={{ boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
          <div onPointerDown={startRemoteDrag} className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
            <span className="text-[#475569] text-[11px] leading-none tracking-widest">⠿</span>
            <span className="text-[12px] font-black text-[#202124] whitespace-nowrap">
              {sidebarPage === 1
                ? (selectedSession
                    ? `🗺️ ${selectedSession} · ${dir === 'arr' ? '등원' : '하원'}${selectedBuses.length ? ` · ${allSelected ? `전체 ${sessionBuses.length}호차` : selectedBuses.join(',')}` : ''}`
                    : '🗺️ 세션 선택')
                : sidebarPage === 2 ? '📅 오늘'
                : sidebarPage === 3 ? '🔁 변경'
                : sidebarPage === 4 ? '📍 탑승장소설정'
                : '🚌 호차설정'}
            </span>
          </div>
          <button onClick={() => setRemoteMinimized(false)} title="펼치기"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#1A73E8] hover:bg-[#E8F0FE] text-[13px] leading-none">▢</button>
        </div>
      )}
      {/* ── 우측 리모컨 (구글 라이트 셸 — 모드 탭 + 본문 한 덩어리) */}
      {!remoteMinimized && (
      <div className="flex flex-col gap-2 shrink-0 overflow-hidden rounded-2xl border border-[#DADCE0]" style={{ width: 320, height: (sidebarPage === 1 || sidebarPage === 3) ? undefined : 'min(560px, calc(100vh - 190px))', background: '#FFFFFF', padding: 6, boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>

        {/* 드래그 그립 — 리모컨 이동 손잡이 + 최소화 */}
        <div className="flex items-center shrink-0">
          <div onPointerDown={startRemoteDrag} className="flex-1 flex items-center justify-center gap-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
            <span className="text-[#475569] text-[12px] leading-none tracking-widest">⠿⠿</span>
            <span className="text-[#64748B] text-[9px] font-bold">드래그로 이동</span>
          </div>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setRemoteMinimized(true)}
            title="최소화"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-[#5F6368] hover:bg-black/5 text-[15px] leading-none">−</button>
        </div>

        {/* 페이지 네비게이션 — 리모컨 모드 버튼 (다크) */}
        <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: '#F1F3F4' }}>
          {([
            { n: 1 as const, label: '노선', icon: '🗺️' },
            { n: 2 as const, label: '오늘', icon: '📅' },
            { n: 3 as const, label: '변경', icon: '🔁' },
            { n: 4 as const, label: '탑승장소설정', icon: '📍' },
            { n: 5 as const, label: '호차설정', icon: '🚌' },
          ]).map(t => (
            <button key={t.n} onClick={() => { setSidebarPage(t.n); if (t.n === 5) setBusSettingsOpen(true) }}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${sidebarPage === t.n ? 'bg-[#1A73E8] text-white shadow-sm' : 'text-[#5F6368] hover:bg-black/5'}`}>
              <span className="text-[13px] leading-none">{t.icon}</span>
              <span className="text-[9px] font-black leading-tight text-center break-keep">{t.label}</span>
              {t.n === 4 && sidebarPage !== 4 && setStopsCount < allStops.length && allStops.length > 0 && (
                <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              )}
            </button>
          ))}
        </div>

        {/* ─ Page 1: 컴팩트 다크 리모컨 (노선 조작) ─ */}
        {sidebarPage === 1 && (
          <>
            <div className="space-y-2 shrink-0">
              {/* 상태 화면 */}
              <div className="rounded-xl px-3 py-2 text-center" style={{ background: '#F1F3F4' }}>
                {selectedSession ? (
                  <>
                    <p className="text-[12px] font-black text-[#202124] leading-tight">{selectedSession} · {dir === 'arr' ? '등원' : '하원'}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: '#1A73E8' }}>
                      {selectedBuses.length === 0 ? '호차 미선택' : (allSelected ? `전체 ${sessionBuses.length}호차` : selectedBuses.join(', '))}
                    </p>
                  </>
                ) : <p className="text-[11px] font-bold text-[#5F6368]">세션을 선택하세요</p>}
              </div>

              {/* 등하원 토글 */}
              <div className="grid grid-cols-2 gap-1.5">
                {(['arr', 'dep'] as const).map(d => (
                  <button key={d} onClick={() => setDir(d)}
                    className="py-2 rounded-xl text-[12px] font-black transition-colors"
                    style={dir === d ? { background: d === 'arr' ? '#1A73E8' : '#D93025', color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>
                    {d === 'arr' ? '🚌 등원' : '🏠 하원'}
                  </button>
                ))}
              </div>

              {/* 세션 (개설반 기준) */}
              <div>
                <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1 px-0.5">세션</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {sessionDirOptions.filter(opt => !opt.label.includes('결석') && (dir === 'arr' ? opt.arr : opt.dep)).map(opt => (
                    <button key={opt.label} onClick={() => { setSelectedSession(opt.label); setSelectedBuses([]) }}
                      className="py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                      style={selectedSession === opt.label ? { background: opt.color, color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 호차 + 전체 + 등↕하 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider px-0.5">호차</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setBothDir(b => { if (!b) setSelectedBuses(prev => prev.slice(0, 1)); return !b }) }}
                      className="text-[9px] font-bold px-2 py-0.5 rounded-lg" style={bothDir ? { background: '#1A73E8', color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>등하원 같이보기</button>
                    {!bothDir && sessionBuses.length > 0 && (
                      <button onClick={() => setSelectedBuses(allSelected ? [] : sessionBuses.map(b => b.name))}
                        className="text-[10px] font-black" style={{ color: '#1A73E8' }}>{allSelected ? '해제' : '전체'}</button>
                    )}
                  </div>
                </div>
                {bothDir && <p className="text-[9px] text-[#F59E0B] font-semibold mb-1">동시보기: 1대만</p>}
                {sessionBuses.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {sessionBuses.map(bus => {
                      const color = getBusColor(bus.name, buses.findIndex(b => b.id === bus.id))
                      const active = selectedBuses.includes(bus.name)
                      const cnt = busStudentCount[bus.name] ?? 0
                      return (
                        <button key={bus.name} onClick={() => toggleBus(bus.name)}
                          className="flex flex-col items-center py-1.5 rounded-lg text-[11px] font-black transition-colors"
                          style={active ? { background: color, color: '#fff' } : { background: '#F1F3F4', color: '#5F6368' }}>
                          <span>{bus.name}</span>
                          <span className="text-[9px] opacity-80">{cnt}명</span>
                        </button>
                      )
                    })}
                  </div>
                ) : <p className="text-[11px] text-[#64748B] text-center py-2">세션을 선택하세요</p>}
              </div>
              {/* 요일 토글 제거(고4) — 노선/카드는 항상 '오늘 요일' 배차 기준(routeDay=오늘). 요일별 명단은 호차 명단 카드(📋)에서 확인 */}
            </div>

            {/* 등하원 동시보기는 좌측 팝업 미연동이라 우측 리스트 유지 / 그 외엔 지도 호차카드 안내 */}
            {bothDir
              ? renderScheduleTimelineList()
              : selectedBuses.length > 0 && (
                  <p className="text-[10px] text-[#5F6368] text-center py-2.5 px-3 rounded-2xl shrink-0" style={{ background: '#F1F3F4' }}>
                    지도의 <b className="text-[#202124]">호차 카드</b>를 누르면 명단·요일·시간·배정
                  </p>
                )}
          </>
        )}

        {/* ─ Page 4: 탑승장소설정 / Page 5: 호차설정 (같은 스크롤 컨테이너 공유) ─ */}
        {(sidebarPage === 4 || sidebarPage === 5) && (
          <>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">

                {sidebarPage === 4 && (<>
                {/* 상단 3개 병렬: 학원좌표 · 자동검색 · 좌표 일괄입력 */}
                <div className="grid grid-cols-3 gap-1.5">
                  {effectiveSchoolName !== null && (
                    <button onClick={() => openStop(effectiveSchoolName)}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 px-1 transition-colors ${expandedStop === effectiveSchoolName ? 'border-[#1A73E8] bg-[#E8F0FE]' : 'border-[#DADCE0] bg-white hover:bg-[#F8F9FA]'}`}>
                      <span className="text-[15px] leading-none">🏫</span>
                      <span className="text-[10px] font-bold text-[#202124]">학원 좌표</span>
                      <span className={`text-[8px] font-black ${coords[effectiveSchoolName] ? 'text-[#1E8E3E]' : 'text-[#D93025]'}`}>{coords[effectiveSchoolName] ? '설정됨' : '미설정'}</span>
                    </button>
                  )}
                  <button onClick={runBatchSearch} disabled={batchLoading || allStops.filter(s => !coords[s.name]).length === 0}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-[#DADCE0] bg-white py-2 px-1 hover:bg-[#F8F9FA] disabled:opacity-50 transition-colors">
                    <span className="text-[15px] leading-none">🔍</span>
                    <span className="text-[10px] font-bold text-[#202124]">자동검색</span>
                    <span className="text-[8px] font-black text-[#5F6368]">{batchLoading ? `${batchProgress}%` : `미설정 ${allStops.filter(s => !coords[s.name]).length}`}</span>
                  </button>
                  <button onClick={() => setUploadPanelOpen(p => !p)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 px-1 transition-colors ${uploadPanelOpen ? 'border-[#1A73E8] bg-[#E8F0FE]' : 'border-[#DADCE0] bg-white hover:bg-[#F8F9FA]'}`}>
                    <span className="text-[15px] leading-none">📥</span>
                    <span className="text-[10px] font-bold text-[#202124]">일괄입력</span>
                    <span className="text-[8px] font-black text-[#5F6368]">{uploadMsg ? '완료' : 'Excel'}</span>
                  </button>
                </div>
                {/* 학원 좌표·정류장 수정은 드래그 가능한 팝업(하단)으로 표시 */}
                </>)}

                {/* ══ 호차(차량) 설정 — Page 5 ══ */}
                {sidebarPage === 5 && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
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
                                setEditBusForm({ name: bus.name, capacity: String(bus.capacity ?? 17), driver: bus.driver??'', driver_phone: bus.driver_phone??'', safety: bus.safety??'', safety_phone: bus.safety_phone??'', kt_name: bus.kt_name??'', kt_phone: bus.kt_phone??'' })
                              }}
                                className="text-[10px] font-bold text-[#004EA2] hover:bg-[#EAF2FB] px-2 py-0.5 rounded-lg shrink-0">
                                {isEditing ? '닫기' : '수정'}
                              </button>
                              <button disabled={busFormSaving} onClick={async () => {
                                if (!confirm(`'${bus.name}' 차량을 삭제하시겠습니까?`)) return
                                setBusFormSaving(true)
                                await fetch('/api/campus/vehicles', { method: 'POST', headers: {'Content-Type':'application/json'},
                                  body: JSON.stringify({ action: 'delete_bus', bus_id: bus.id }) })
                                setBuses(prev => prev.filter(b => b.id !== bus.id))
                                if (editingBus?.id === bus.id) setEditingBus(null)
                                setBusFormSaving(false)
                              }}
                                className="text-[10px] font-bold text-[#EF4444] hover:bg-[#FEF2F2] px-2 py-0.5 rounded-lg shrink-0 disabled:opacity-40">
                                삭제
                              </button>
                            </div>
                            {isEditing && (
                              <div className="border-t border-[#F1F5F9] px-2.5 pb-2.5 pt-2 space-y-1.5 bg-[#F8FAFC]">
                                {[['차량명', 'name'],['차량 정원(좌석)','capacity'],['기사', 'driver'],['기사 연락처','driver_phone'],['안전교사','safety'],['안전 연락처','safety_phone']] .map(([label, field]) => (
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
                                    setBuses(prev => prev.map(b => b.id === bus.id ? {...b, ...editBusForm, capacity: Number(editBusForm.capacity) || b.capacity} : b))
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
                            if (res.ok) {
                              const d = await res.json()
                              const newBus = d.bus ?? { id: d.id, name: addBusName.trim(), sort_order: 99 }
                              setBuses(prev => [...prev, newBus])
                              setAddBusName('')
                              // 추가 직후 그 차량 편집 폼 자동 열기 → 정원·기사·안전 등 바로 입력
                              setEditingBus(newBus)
                              setEditBusForm({ name: newBus.name, capacity: String(newBus.capacity ?? 17), driver: newBus.driver ?? '', driver_phone: newBus.driver_phone ?? '', safety: newBus.safety ?? '', safety_phone: newBus.safety_phone ?? '', kt_name: newBus.kt_name ?? '', kt_phone: newBus.kt_phone ?? '' })
                            }
                            setBusFormSaving(false)
                          }}
                          className="w-full bg-[#F1F5F9] text-[#004EA2] py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 hover:bg-[#EAF2FB]">
                          + 차량 추가 (추가 후 상세 입력)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {sidebarPage === 4 && (<>
                {/* 좌표 일괄입력 펼침 (상단 카드 토글) */}
                {uploadPanelOpen && (
                  <div className="bg-white rounded-2xl border border-[#DADCE0] px-3 pb-3 space-y-2">
                    <p className="text-[10px] text-[#5F6368] pt-2.5 leading-relaxed">주소 입력 시 위도/경도 자동 변환 · 좌표 직접 입력도 가능</p>
                    <button onClick={downloadTemplate}
                      className="w-full py-2 rounded-xl text-[11px] font-bold bg-white border border-[#DADCE0] text-[#1A73E8] hover:bg-[#E8F0FE] transition-colors">
                      📥 양식 다운로드 ({allStops.length}개)
                    </button>
                    <button onClick={() => uploadRef.current?.click()} disabled={uploadGeocoding}
                      className="w-full py-2 rounded-xl text-[11px] font-bold bg-[#1A73E8] text-white hover:bg-[#1666c1] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                      {uploadGeocoding ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />주소 변환 중...</> : '📤 좌표 파일 업로드'}
                    </button>
                    <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
                    {uploadMsg && <div className="border border-[#86EFAC] bg-[#DCFCE7] rounded-xl px-3 py-2 text-[11px] font-semibold text-[#166534] text-center">{uploadMsg}</div>}
                    {setStopsCount > 0 && (
                      <button onClick={async () => { if (confirm(`설정된 좌표 ${setStopsCount}개를 모두 초기화할까요?`)) { await fetch('/api/campus/stop-coords', { method: 'DELETE' }); updateCoords({}) } }}
                        className="w-full py-1.5 rounded-xl text-[10px] text-[#D93025] border border-[#FECACA] hover:bg-[#FEF2F2]">좌표 전체 초기화</button>
                    )}
                  </div>
                )}
                {/* 검색 + 보기 모드 (전체 / 호차별 / 미설정) */}
                <div className="space-y-2">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input value={coordsSearch} onChange={e => setCoordsSearch(e.target.value)}
                      placeholder="정류장명 검색"
                      className="w-full text-[13px] pl-9 pr-8 py-2.5 border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white" />
                    {coordsSearch && (
                      <button onClick={() => setCoordsSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#CBD5E1] hover:text-[#94A3B8] text-base font-bold leading-none">×</button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {([['all', '전체'], ['bus', '호차별'], ['unset', '미설정']] as const).map(([v, lbl]) => {
                      const unsetCnt = allStops.filter(s => !coords[s.name]).length
                      return (
                        <button key={v} onClick={() => setCoordsView(v)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-colors ${coordsView === v ? 'bg-[#004EA2] text-white shadow-sm' : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'}`}>
                          {lbl}{v === 'unset' && unsetCnt > 0 ? ` ${unsetCnt}` : ''}
                        </button>
                      )
                    })}
                  </div>
                  {/* 현재 뷰 개수 요약 한 줄 (전체 총 N개 / 호차 N개 / 호차·세션 N개 / 미설정 N개) */}
                  {(() => {
                    const q = coordsSearch.trim()
                    const ms = allStops.filter(s => !q || s.name.includes(q))
                    let label = '', n = 0
                    if (coordsView === 'all') { label = '전체 총'; n = ms.length }
                    else if (coordsView === 'unset') { label = '미설정'; n = ms.filter(s => !coords[s.name]).length }
                    else {
                      if (!coordsBus) return null
                      const names = new Set<string>()
                      for (const { group, dir: d } of bothDirGroups) {
                        if (coordsSession && getRunLabel(group.session_name, d) !== coordsSession) continue
                        for (const s of (group.busMap[coordsBus] ?? [])) if (s.location) names.add(s.location.trim())
                      }
                      n = ms.filter(s => s.busNames.includes(coordsBus) && (!coordsSession || names.has(s.name))).length
                      label = coordsSession ? `${coordsBus} · ${coordsSession}` : coordsBus
                    }
                    return (
                      <div className="flex items-baseline gap-1 px-0.5 pt-0.5">
                        <span className="text-[11px] font-bold text-[#475569]">{label}</span>
                        <span className="text-[11px] font-black text-[#004EA2]">{n}개</span>
                      </div>
                    )
                  })()}
                </div>
                {(() => {
                  const q = coordsSearch.trim()
                  const matchStops = allStops.filter(s => !q || s.name.includes(q))
                  if (coordsView === 'unset') {
                    const list = matchStops.filter(s => !coords[s.name])
                    return list.length === 0
                      ? <p className="text-[12px] text-[#94A3B8] text-center py-6">미설정 정류장이 없습니다 ✅</p>
                      : <div className="space-y-1.5">{list.map(renderCoordStopRow)}</div>
                  }
                  if (coordsView === 'bus') {
                    const busNames = buses.filter(b => !b.name.includes('결석') && !isIndividualBus(b.name)).map(b => b.name)
                    const sessionOpts = ['유치부', '매일반', '3일반', '2일반']
                    // 선택 호차(+수업유형)의 정류장 이름 집합 — 양방향 enrollment 기반
                    const sessionStopNames = new Set<string>()
                    if (coordsBus) {
                      for (const { group, dir: d } of bothDirGroups) {
                        if (coordsSession && getRunLabel(group.session_name, d) !== coordsSession) continue
                        for (const s of (group.busMap[coordsBus] ?? [])) if (s.location) sessionStopNames.add(s.location.trim())
                      }
                    }
                    const busStops = coordsBus
                      ? matchStops.filter(s => s.busNames.includes(coordsBus) && (!coordsSession || sessionStopNames.has(s.name)))
                      : []
                    const openAdd = (d: 'arr' | 'dep') => {
                      if (!coordsBus) return
                      const sess = coordsSession || (() => {
                        for (const { group } of bothDirGroups) if ((group.busMap[coordsBus] ?? []).length) return getRunLabel(group.session_name, d)
                        return ''
                      })()
                      const defaultDays = sess.includes('2일반') ? ['화', '목'] : sess.includes('3일반') ? ['월', '수', '금'] : ['월', '화', '수', '목', '금']
                      resetLeftRiderForm()
                      setLeftRiderDays(defaultDays)
                      setLeftAddModal({ bus: coordsBus, sessionName: sess, dir: d })
                      loadLeftAllStudents()
                    }
                    return (
                      <div className="space-y-2">
                        {/* 호차 선택 */}
                        <div className="flex flex-wrap gap-1.5">
                          {busNames.map(bn => {
                            const c = getBusColor(bn, buses.findIndex(b => b.name === bn))
                            const on = coordsBus === bn
                            return (
                              <button key={bn} onClick={() => setCoordsBus(on ? '' : bn)}
                                className="px-3 py-1.5 rounded-full text-[12px] font-black transition-all"
                                style={on ? { background: c, color: '#fff', boxShadow: `0 4px 12px ${c}55` } : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0' }}>
                                {bn}
                              </button>
                            )
                          })}
                        </div>
                        {/* 수업유형 선택 */}
                        {coordsBus && (
                          <div className="flex flex-wrap gap-1.5">
                            {sessionOpts.map(s => {
                              const on = coordsSession === s
                              const c = getSessionColor(s)
                              return (
                                <button key={s} onClick={() => setCoordsSession(on ? '' : s)}
                                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
                                  style={on ? { background: c, color: '#fff' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                                  {s}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {/* 정류장 목록 */}
                        {!coordsBus ? (
                          <p className="text-[12px] text-[#94A3B8] text-center py-6">호차를 선택하세요</p>
                        ) : busStops.length === 0 ? (
                          <p className="text-[12px] text-[#94A3B8] text-center py-6">{coordsBus}{coordsSession ? ` · ${coordsSession}` : ''} 정류장 없음</p>
                        ) : (
                          <div className="space-y-1.5">{busStops.map(renderCoordStopRow)}</div>
                        )}
                        {/* 정류장 추가 = 탑승자 추가 (학생 설정 탭과 연동) */}
                        {coordsBus && (
                          <div className="flex gap-1.5 pt-1">
                            <button onClick={() => openAdd('arr')}
                              className="flex-1 py-2.5 rounded-xl text-[12px] font-black text-white bg-[#1565C0] hover:bg-[#0D47A1] transition-colors">
                              + 등원 정류장 추가
                            </button>
                            <button onClick={() => openAdd('dep')}
                              className="flex-1 py-2.5 rounded-xl text-[12px] font-black text-white bg-[#C62828] hover:bg-[#962020] transition-colors">
                              + 하원 정류장 추가
                            </button>
                          </div>
                        )}
                        {coordsBus && (
                          <p className="text-[10px] text-[#94A3B8] text-center leading-relaxed pt-0.5">
                            정류장 추가는 학생(탑승자) 추가로 이뤄지며 <b>학생 설정 탭</b>과 자동 연동됩니다.<br />좌표 설정·삭제는 각 정류장을 눌러 진행하세요.
                          </p>
                        )}
                        {/* 빈 정류장 등록 — 학생 배정 없이 정류장만 추가 (위 학생추가와 구분) */}
                        {coordsBus && (
                          <div className="pt-1.5 mt-1 border-t border-dashed border-[#E2E8F0]">
                            <button
                              onClick={() => {
                                const d: 'arr' | 'dep' = dir
                                const sess = coordsSession || (() => {
                                  for (const { group } of bothDirGroups) if ((group.busMap[coordsBus] ?? []).length) return getRunLabel(group.session_name, d)
                                  return ''
                                })()
                                setAddStopName(''); setAddStopTime(''); setCandidateStop(null); setCandidateCoord(null); setAddStopCardPos(null)
                                setAddStopModal({ bus: coordsBus, dir: d, sessionName: sess })
                              }}
                              className="w-full py-2.5 rounded-xl text-[12px] font-black text-[#16A34A] bg-[#F0FDF4] border-2 border-[#16A34A] hover:bg-[#DCFCE7] transition-colors">
                              + 새 정류장 추가 <span className="font-bold text-[10px] text-[#16A34A]/70">(빈 정류장 · 학생 없음)</span>
                            </button>
                            <p className="text-[10px] text-[#94A3B8] text-center leading-relaxed pt-1">
                              학생 배정 없이 <b>{coordsBus}</b>에 정류장만 등록합니다. 좌표는 지도에서 핀으로 지정하세요.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return matchStops.length === 0
                    ? <p className="text-[12px] text-[#94A3B8] text-center py-6">결과 없음</p>
                    : <div className="space-y-1.5">{matchStops.map(renderCoordStopRow)}</div>
                })()}
                </>)}
              </div>

          </>
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
            <div className="flex flex-col gap-1.5">
              {/* 위: 변경 승인 */}
              <div className="flex flex-col bg-white rounded-2xl border border-[#E2E8F0] p-2 gap-1">
                <div className="flex items-center justify-between shrink-0">
                  <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider">변경 승인</p>
                  {refreshBtn}
                </div>
                <div className="overflow-y-auto space-y-1.5" style={{ maxHeight: 170 }}>
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
              <div className="flex flex-col bg-white rounded-2xl border border-[#E2E8F0] p-2 gap-1">
                <p className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-wider shrink-0">변경 기록</p>
                <div className="overflow-y-auto space-y-1" style={{ maxHeight: 140 }}>
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
      )}
      </div>
    </div>

    {/* ── 정류장 수정 팝업 (드래그 이동 가능) — 탑승장소설정에서 정류장/학원좌표 클릭 시 표시 */}
    {sidebarPage === 4 && expandedStop && (
      <div ref={stopCardRef}
        className="fixed z-[8000] bg-white w-[92vw] sm:w-96 max-w-sm rounded-2xl shadow-2xl ring-1 ring-black/10 max-h-[82vh] overflow-y-auto"
        style={stopCardPos
          ? { left: stopCardPos.x, top: stopCardPos.y }
          : { left: '50%', top: 80, transform: 'translateX(-50%)' }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[#E2E8F0] cursor-move select-none touch-none sticky top-0 bg-white z-10 rounded-t-2xl"
          onPointerDown={startStopCardDrag}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#94A3B8] text-[12px] tracking-widest leading-none">⠿⠿</span>
            <span className="text-[13px] font-black text-[#0F172A] truncate">📍 {expandedStop}</span>
          </div>
          <button onClick={() => setExpandedStop(null)} title="닫기"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#5F6368] hover:bg-black/5 text-[16px] leading-none">×</button>
        </div>
        {renderStopExpanded(expandedStop)}
      </div>
    )}

    {/* ── 새 정류장 추가 모달 (빈 정류장 — 학생 배정 없음) */}
    {/* 좌표 지정 중에는 지도 클릭이 가능하도록 모달을 작은 안내 바로 축소 */}
    {addStopModal && addStopPlacing && (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9003] pointer-events-auto">
        <div className="flex items-center gap-2.5 rounded-2xl pl-3.5 pr-2 py-2 shadow-2xl ring-1 ring-white/10"
          style={{ background: 'rgba(11,18,32,0.96)', backdropFilter: 'blur(8px)' }}>
          <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-black text-white leading-tight truncate max-w-[180px]">{addStopName.trim()}</p>
            <p className="text-[10px] font-bold text-white/55">핀을 끌거나 지도를 눌러 위치 지정</p>
          </div>
          <button onClick={() => { setCandidateStop(null); setCandidateCoord(null); setAddStopPlacing(false) }}
            className="px-3 py-2 rounded-xl text-[12px] font-black text-white/90 bg-white/10 hover:bg-white/20 transition-colors shrink-0">
            지우기
          </button>
          <button onClick={() => { setAddStopPlacing(false) }}
            className="px-4 py-2 rounded-xl text-[12px] font-black text-white shrink-0 transition-colors"
            style={{ background: '#16A34A' }}>
            위치 확정
          </button>
        </div>
      </div>
    )}
    {addStopModal && !addStopPlacing && (
      <div ref={addStopCardRef}
        className="fixed z-[9002] bg-white w-[92vw] sm:w-96 max-w-sm rounded-2xl shadow-2xl ring-1 ring-black/10 p-5 max-h-[88vh] overflow-y-auto"
        style={addStopCardPos
          ? { left: addStopCardPos.x, top: addStopCardPos.y }
          : { left: '50%', top: 72, transform: 'translateX(-50%)' }}>
          <div className="flex items-center justify-between mb-4 cursor-move select-none touch-none" onPointerDown={startAddStopCardDrag}>
            <div>
              <h3 className="font-bold text-[#1E293B] flex items-center gap-1.5">
                <span className="text-[#94A3B8] text-sm" title="드래그해서 이동">⠿</span>
                새 정류장 추가
              </h3>
              <p className="text-[11px] text-[#64748B]">{addStopModal.bus ? `${addStopModal.bus} · ` : ''}빈 정류장 (학생 없음) · 카드를 끌어 이동</p>
            </div>
            <button onPointerDown={e => e.stopPropagation()} onClick={() => { setAddStopModal(null); setAddStopCardPos(null); setCandidateStop(null); setCandidateCoord(null); setAddStopPlacing(false) }} className="text-[#94A3B8] text-xl">✕</button>
          </div>
          <div className="space-y-3">
            {/* 호차 */}
            <div>
              <label className="text-[10px] font-bold text-[#64748B] mb-1 block">호차 *</label>
              <select value={addStopModal.bus} onChange={e => setAddStopModal(m => m ? { ...m, bus: e.target.value } : m)}
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16A34A]">
                <option value="">호차 선택</option>
                {buses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            {/* 정류장명 */}
            <div>
              <label className="text-[10px] font-bold text-[#64748B] mb-1 block">정류장명 *</label>
              <input value={addStopName} onChange={e => setAddStopName(e.target.value)} placeholder="예: 중계역 2번출구"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]" autoFocus />
            </div>
            {/* 방향 */}
            <div>
              <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">방향</label>
              <div className="flex gap-2">
                {([['arr', '등원'], ['dep', '하원']] as const).map(([v, lbl]) => (
                  <button key={v} onClick={() => setAddStopModal(m => m ? { ...m, dir: v } : m)}
                    className="flex-1 py-2 rounded-xl text-[12px] font-black border transition-colors"
                    style={addStopModal.dir === v
                      ? { background: v === 'arr' ? '#1565C0' : '#C62828', color: '#fff', borderColor: 'transparent' }
                      : { background: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {/* 운행 시간 */}
            <div>
              <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">운행 시간 (선택)</label>
              <input value={addStopTime} onChange={e => setAddStopTime(e.target.value)}
                onBlur={e => setAddStopTime(normalizeTime(e.target.value) || e.target.value)}
                placeholder="예: 08:40"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]" />
            </div>
            {/* 좌표 지정 */}
            <div>
              <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">지도 위치 (선택)</label>
              <button
                onClick={() => { if (!addStopName.trim()) { alert('먼저 정류장명을 입력해주세요.'); return } startAddStop(addStopName) }}
                className="w-full py-2 rounded-xl text-[12px] font-bold border border-[#16A34A] text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] transition-colors">
                {candidateStop === addStopName.trim() && (candidateCoord || coords[addStopName.trim()]) ? '📍 위치 지정됨 — 핀을 끌어 조정' : '🗺 지도에서 위치 지정'}
              </button>
              {candidateStop === addStopName.trim() && candidateCoord && (
                <p className="text-[10px] text-[#64748B] text-center pt-1">{candidateCoord.lat.toFixed(5)}, {candidateCoord.lng.toFixed(5)}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setAddStopModal(null); setAddStopCardPos(null); setCandidateStop(null); setCandidateCoord(null); setAddStopPlacing(false) }}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-[#64748B] bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors">
              취소
            </button>
            <button onClick={handleAddStop} disabled={addStopSaving || !addStopName.trim() || !addStopModal.bus}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-black text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors disabled:opacity-40">
              {addStopSaving ? '저장 중...' : '정류장 등록'}
            </button>
          </div>
      </div>
    )}

    {/* ── 좌측 패널 학생 편집: 코스 명단 안 인라인(renderLeftEditInline)으로 대체됨 ── */}
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
            // 빈 정류장 마스터(학생 0명) — 세션 무관, 해당 호차·방향만 후보에 합집합
            const regForBus = registeredStops.filter(rs => rs.bus_name === bus && rs.direction === dir)
            const existTimes = [...new Set([
              ...(srcGroups.flatMap(g => (g.busMap[bus] ?? []).map(s => s.pickup_time)).filter(Boolean) as string[]),
              ...regForBus.map(rs => rs.default_time).filter((x): x is string => !!x),
            ])].sort()
            const locsAtTime = leftRiderTime
              ? [...new Set(dirGroups.flatMap(g =>
                  (g.busMap[bus] ?? []).filter(s => normalizeTime(s.pickup_time ?? '') === leftRiderTime).map(s => s.location).filter((x): x is string => x != null)
                ))]
              : []
            const allLocs = [...new Set([
              ...srcGroups.flatMap(g => g.busLocations[bus] ?? []),
              ...regForBus.map(rs => rs.stop_name),
            ])]
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
                            } else {
                              // 빈 정류장 마스터: 학생 시간이 없으면 등록된 default_time 폴백
                              const regTime = regForBus.find(rs => rs.stop_name === loc)?.default_time
                              if (regTime) { setLeftRiderTime(normalizeTime(regTime)); setLeftRiderTimeMode('select') }
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
