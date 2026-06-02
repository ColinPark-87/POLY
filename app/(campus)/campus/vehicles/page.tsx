'use client'

import { useEffect, useState, useCallback } from 'react'
import RouteMapView from './RouteMapView'

const DAYS = ['월', '화', '수', '목', '금'] as const
const DAY_DOT_COLOR = ['#2196F3','#9C27B0','#4CAF50','#FF9800','#E91E63']

// 서로 최대한 구분되는 팔레트 (겹침/유사색 제거) — RouteMapView와 동일
const BUS_COLORS = ['#2563EB','#EA580C','#16A34A','#9333EA','#0891B2','#DB2777','#CA8A04','#64748B','#0D9488','#B45309']
const BUS_COLOR_MAP: Record<string,string> = {
  '1호차':'#EA580C','2호차':'#2563EB','3호차':'#9333EA',
  '5호차':'#16A34A','6호차':'#0891B2','7호차':'#DB2777','8호차':'#64748B','마미버스':'#CA8A04','개별등하원':'#CA8A04',
}
function getBusColor(name: string, idx: number) {
  return BUS_COLOR_MAP[name] ?? BUS_COLORS[idx % BUS_COLORS.length]
}
function getTextColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16)
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? '#1a1a1a' : '#ffffff'
}

function getRunColor(sessName: string, dir?: 'arr'|'dep') {
  // 유치부 방과후 → 유치부 색상 / 초등 방과후 → 하원 파랑, 등원 보라
  if (sessName.includes('방과후')) {
    if (sessName.includes('유치부')) return '#FF6B35'
    return dir === 'dep' ? '#2196F3' : '#8B5CF6'
  }
  if (sessName.includes('매일반')||sessName.includes('5일')) return '#2196F3'
  if (sessName.includes('월수금')||sessName.includes('3일')) return '#4CAF50'
  if (sessName.includes('화목')||sessName.includes('2일')) return '#9C27B0'
  if (sessName.includes('유치부')) return '#FF6B35'
  return '#64748B'
}
function getRunLabel(sessName: string, dir: 'arr'|'dep') {
  const d = dir === 'arr' ? '등원' : '하원'
  // 유치부 방과후 → 유치부 등원/하원 / 초등 방과후 → 하원 매일반, 등원 방과후
  if (sessName.includes('방과후')) {
    if (sessName.includes('유치부')) return `유치부 ${d}`
    return dir === 'dep' ? `매일반 ${d}` : `방과후 ${d}`
  }
  if (sessName.includes('매일반')||sessName.includes('5일')) return `매일반 ${d}`
  if (sessName.includes('월수금')||sessName.includes('3일')) return `3일반 ${d}`
  if (sessName.includes('화목')||sessName.includes('2일')) return `2일반 ${d}`
  if (sessName.includes('유치부')) return `유치부 ${d}`
  return `${sessName} ${d}`
}
function parseTimeMin(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}
function normalizeTime(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  const min = m[2]
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${min}`
}

function getRunTime(timeRange: string, dir: 'arr'|'dep') {
  if (!timeRange) return ''
  const p = timeRange.split('~')
  const t = dir === 'arr' ? (p[0]?.trim() ?? '') : (p[1]?.trim() ?? '')
  return t || timeRange.trim()  // split 실패 시 전체 time_range 반환
}
// 같은 학생이 여러 enrollment로 같은 버스에 중복 등록된 경우 days 합산 후 1명으로 표기
function deduplicateStudents(students: StudentEntry[]): StudentEntry[] {
  const map = new Map<string, StudentEntry>()
  for (const s of students) {
    if (map.has(s.student_id)) {
      const ex = map.get(s.student_id)!
      ex.days = [...new Set([...ex.days, ...s.days])]
    } else {
      map.set(s.student_id, { ...s })
    }
  }
  return [...map.values()]
}

// 같은 레이블(예: '매일반 하원')을 가진 timeGroups를 하나로 병합
// 방과후+dep와 매일반+dep가 각각 다른 time_range로 분리되는 문제 해결
function mergeGroupsByLabel(groups: TimeGroup[], dir: 'arr'|'dep'): TimeGroup[] {
  const merged: TimeGroup[] = []
  for (const group of groups) {
    const label = getRunLabel(group.session_name, dir)
    const existing = merged.find(g => getRunLabel(g.session_name, dir) === label)
    if (existing) {
      // 방과후보다 매일반 session_name 우선 유지 (카드 스타일/레이블 정확도)
      if (existing.session_name.includes('방과후') && !group.session_name.includes('방과후')) {
        existing.session_name = group.session_name
        existing.time_range = group.time_range
      }
      for (const [bus, students] of Object.entries(group.busMap)) {
        if (!existing.busMap[bus]) existing.busMap[bus] = []
        existing.busMap[bus].push(...students)
        // 동일 학생 중복 제거 (다른 enrollment에서 같은 버스에 배정된 경우)
        existing.busMap[bus] = deduplicateStudents(existing.busMap[bus])
        if (group.busLocations[bus]) {
          const locSet = new Set(existing.busLocations[bus] ?? [])
          for (const loc of group.busLocations[bus]) locSet.add(loc)
          existing.busLocations[bus] = [...locSet]
        }
      }
    } else {
      merged.push({ ...group, busMap: { ...group.busMap }, busLocations: { ...group.busLocations } })
    }
  }
  return merged
}

function getSessPriority(sessName: string, dir?: 'arr'|'dep'): number {
  // 방과후(유치부 방과후 포함): 하원→매일반(2), 등원→유치부(1)과 매일반(2) 사이
  if (sessName.includes('방과후')) return dir === 'dep' ? 2 : 1.5
  if (sessName.includes('유치부')) return 1
  if (sessName.includes('매일반') || sessName.includes('5일')) return 2
  if (sessName.includes('월수금') || sessName.includes('3일')) return 3
  if (sessName.includes('화목') || sessName.includes('2일')) return 4
  return 9
}
function sessMatchesFilter(sessName: string, filter: string, dir?: 'arr'|'dep') {
  if (filter === '전체') return true
  // 방과후(유치부 방과후 포함): 하원→매일반 필터, 등원→전체/유치부 필터에서 표시
  if (sessName.includes('방과후')) {
    return dir === 'dep' ? filter === '매일반' : (filter === '전체' || filter === '유치부')
  }
  if (filter === '유치부') return sessName.includes('유치부')
  if (filter === '매일반') return sessName.includes('매일반') || sessName.includes('5일')
  if (filter === '3일반') return sessName.includes('월수금') || sessName.includes('3일')
  if (filter === '2일반') return sessName.includes('화목') || sessName.includes('2일')
  return true
}

interface Bus { id: string; name: string; sort_order: number; capacity?: number; driver?: string; driver_phone?: string; safety?: string; safety_phone?: string; kt_name?: string; kt_phone?: string }
interface ChangeRequest {
  id: string; student_id: string; student_name: string; class_id: string
  direction: 'arr' | 'dep'; from_bus: string | null; to_bus: string
  days: string[]; location: string | null; pickup_time: string | null
  note: string | null; status: 'pending' | 'approved' | 'rejected'
  created_at: string; approved_at: string | null
}
interface StudentEntry {
  student_id: string; name: string; english_name: string|null
  class_id: string
  override?: boolean; location: string|null; days: string[]; pickup_time: string|null
  is_bangwaHu?: boolean  // 방과후 세션 + 하원 → 매일반 탭 내 유치 배지용
}
interface AbsentEntry { student_id: string; name: string }
interface TimeGroup {
  session_name: string; time_range: string
  busMap: Record<string, StudentEntry[]>
  busLocations: Record<string, string[]>
}

function Spinner() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin"/></div>
}

// ── Day dot row ────────────────────────────────────────────────
function DayDots({ days }: { days: string[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {DAYS.map((d, di) => (
        <span key={d} className="w-3.5 h-3.5 rounded-full text-[6px] font-bold flex items-center justify-center"
          style={days.includes(d)
            ? { background: DAY_DOT_COLOR[di], color: '#fff' }
            : { background: '#F1F5F9', color: '#CBD5E1' }}>
          {d}
        </span>
      ))}
    </div>
  )
}

export default function VehiclesPage() {
  const today = new Date()
  const todayStr = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-')

  const [tab, setTab] = useState<'master'|'today'|'map'>('map')
  const [fullscreen, setFullscreen] = useState(false)
  const [vehiclesRestricted, setVehiclesRestricted] = useState(false)
  const [campusName, setCampusName] = useState<string | undefined>(undefined)
  const [campusId, setCampusId] = useState<string | undefined>(undefined)

  // ── 백업 ─────────────────────────────────────────────────────
  const [backupModal, setBackupModal] = useState(false)
  const [backups, setBackups] = useState<{ id: string; label: string; created_at: string }[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupSaving, setBackupSaving] = useState(false)

  // ── 공통 ─────────────────────────────────────────────────────
  const [month, setMonth] = useState('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [buses, setBuses] = useState<Bus[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ── 차량 관리 (master) ────────────────────────────────────────
  const [masterDir, setMasterDir] = useState<'arr'|'dep'>('arr')
  const [sessFilter, setSessFilter] = useState('전체')
  const [masterGroups, setMasterGroups] = useState<TimeGroup[]>([])
  const [masterBusMap, setMasterBusMap] = useState<Record<string, StudentEntry[]>>({})
  const [masterBusLocMap, setMasterBusLocMap] = useState<Record<string,string[]>>({})
  // 빈 정류장 마스터의 운행시간 폴백 — key `${bus_name}|${stop_name}` → default_time
  const [masterRegStopTimes, setMasterRegStopTimes] = useState<Record<string,string>>({})
  // 빈 정류장 마스터 — 호차별 정류장명 (현재 방향, 학생 0명이어도 후보로 노출)
  const [masterRegStopsByBus, setMasterRegStopsByBus] = useState<Record<string,string[]>>({})
  const [masterLoading, setMasterLoading] = useState(true)
  const [collapsedBuses, setCollapsedBuses] = useState<Set<string>>(new Set())

  // ── 오늘 등하원 (today) ───────────────────────────────────────
  const [todayDir, setTodayDir] = useState<'arr'|'dep'>('dep')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [todayGroups, setTodayGroups] = useState<TimeGroup[]>([])
  const [todayBusMap, setTodayBusMap] = useState<Record<string, StudentEntry[]>>({})
  const [absentStudents, setAbsentStudents] = useState<AbsentEntry[]>([])
  const [todayLoading, setTodayLoading] = useState(true)
  const [overrideModal, setOverrideModal] = useState<{student: StudentEntry; bus: string}|null>(null)
  const [overrideBus, setOverrideBus] = useState('')
  const [overrideLoc, setOverrideLoc] = useState('')
  const [overrideLocNew, setOverrideLocNew] = useState('')  // 직접 입력 모드
  const [overrideLocMode, setOverrideLocMode] = useState<'select'|'new'>('select')
  const [overrideTime, setOverrideTime] = useState('')
  const [busFilter, setBusFilter] = useState('전체')
  const [sessionFilter, setSessionFilter] = useState('전체')

  // ── 스케줄 편집 (차량관리 탭) ─────────────────────────────────
  const [editSchedModal, setEditSchedModal] = useState<{
    student: StudentEntry; currentBus: string; busLocs: Record<string,string[]>; sessionName: string; defaultTime: string
  }|null>(null)
  const [editSchedBus, setEditSchedBus] = useState('')
  const [editSchedLoc, setEditSchedLoc] = useState('')
  const [editSchedTime, setEditSchedTime] = useState('')
  const [editSchedDays, setEditSchedDays] = useState<string[]>([])
  const [editLocIsNew, setEditLocIsNew] = useState(false)
  const [editTimeEditing, setEditTimeEditing] = useState(false)
  const [editTimeDraft, setEditTimeDraft] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // ── 차량변경 요청 ─────────────────────────────────────────────
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  // 요청 제출 폼 (override 모달 내)
  const [reqFormOpen, setReqFormOpen] = useState(false)
  const [reqBus, setReqBus] = useState('')
  const [reqDays, setReqDays] = useState<string[]>([])
  const [reqNote, setReqNote] = useState('')
  const [reqStudent, setReqStudent] = useState<StudentEntry | null>(null)

  // ── 일괄 시간 설정 ────────────────────────────────────────────
  const [bulkTimeModal, setBulkTimeModal] = useState<{bus: string; dir: 'arr'|'dep'}|null>(null)
  const [bulkTime, setBulkTime] = useState('')

  // ── 탑승자 추가 ───────────────────────────────────────────────
  const [addRiderModal, setAddRiderModal] = useState<{bus: string; sessionName?: string; sessionLocs?: string[]; sessionDir?: 'arr'|'dep'}|null>(null)
  const [addRiderMode, setAddRiderMode] = useState<'permanent'|'today'>('permanent')
  const [riderSearch, setRiderSearch] = useState('')
  const [allStudents, setAllStudents] = useState<{id:string;name:string;english_name:string|null}[]>([])
  const [riderResults, setRiderResults] = useState<{id:string;name:string;english_name:string|null}[]>([])
  const [riderSelected, setRiderSelected] = useState<{id:string;name:string}|null>(null)
  const [riderTime, setRiderTime] = useState('')
  const [riderTimeMode, setRiderTimeMode] = useState<'select'|'new'>('select')
  const [riderLocation, setRiderLocation] = useState('')
  const [riderLocMode, setRiderLocMode] = useState<'select'|'new'>('select')
  const [riderDays, setRiderDays] = useState<string[]>([])

  // ── 앞으로 변경 (override modal 내 영구변경) ─────────────────
  const [permMode, setPermMode] = useState(false)
  const [permDays, setPermDays] = useState<string[]>([])

  // ── API 호출 ──────────────────────────────────────────────────
  const loadMaster = useCallback(async () => {
    setMasterLoading(true)
    const params = new URLSearchParams({ direction: masterDir, master: 'true', ...(month ? { month } : {}) })
    const res = await fetch(`/api/campus/vehicles?${params}`)
    const d = await res.json()
    setMasterGroups(d.timeGroups ?? [])
    setMasterBusMap(d.busMap ?? {})
    setMasterBusLocMap(d.busLocationMap ?? {})
    setMasterRegStopTimes(d.registeredStopTimes ?? {})
    {
      const byBus: Record<string, string[]> = {}
      for (const rs of (d.registeredStops ?? []) as { stop_name: string; bus_name: string }[]) {
        if (!byBus[rs.bus_name]) byBus[rs.bus_name] = []
        if (!byBus[rs.bus_name].includes(rs.stop_name)) byBus[rs.bus_name].push(rs.stop_name)
      }
      setMasterRegStopsByBus(byBus)
    }
    setBuses(d.buses ?? [])
    setAvailableMonths(d.availableMonths ?? [])
    setMonth(m => m || (d.month ?? ''))
    setMasterLoading(false)
  }, [masterDir, month])

  const loadToday = useCallback(async () => {
    setTodayLoading(true)
    const params = new URLSearchParams({ date: selectedDate, direction: todayDir, ...(month ? { month } : {}) })
    const res = await fetch(`/api/campus/vehicles?${params}`)
    const d = await res.json()
    setTodayGroups(d.timeGroups ?? [])
    setTodayBusMap(d.busMap ?? {})
    setAbsentStudents(d.absentStudents ?? [])
    setBuses(d.buses ?? [])
    setAvailableMonths(d.availableMonths ?? [])
    setMonth(m => m || (d.month ?? ''))
    setTodayLoading(false)
  }, [selectedDate, todayDir, month])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    const res = await fetch('/api/campus/vehicles?requests=true')
    const d = await res.json()
    setChangeRequests(d.requests ?? [])
    setPendingCount(d.pendingCount ?? 0)
    setRequestsLoading(false)
  }, [])

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
    if (!confirm(`"${label}" 시점으로 복원하시겠습니까?\n현재 차량 스케줄 데이터가 덮어써집니다.`)) return
    setSaving(true)
    const res = await fetch('/api/campus/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', backup_id: backupId }),
    })
    const d = await res.json()
    setSaving(false)
    if (d.ok) {
      alert('복원 완료')
      setBackupModal(false)
      loadMaster()
    } else {
      alert('복원 실패: ' + (d.error ?? ''))
    }
  }

  async function handleDeleteBackup(backupId: string) {
    if (!confirm('이 백업을 삭제하시겠습니까?')) return
    await fetch('/api/campus/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', backup_id: backupId }),
    })
    setBackups(prev => prev.filter(b => b.id !== backupId))
  }

  useEffect(() => {
    fetch('/api/campus/me')
      .then(r => r.json())
      .then(d => {
        if (d.permissions?.vehiclesRestricted) {
          setVehiclesRestricted(true)
          setTab('today')
        }
        if (d.campusName) setCampusName(d.campusName)
        if (d.campusId) setCampusId(d.campusId)
      })
  }, [])

  // 전체화면 중 Esc 로 종료
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => { if (tab === 'master') loadMaster() }, [tab, masterDir, month])
  useEffect(() => { if (tab === 'today') loadToday() }, [tab, selectedDate, todayDir, month])

  const busNames = buses.map(b => b.name)
  const allBusNames = [...new Set([...busNames, ...Object.keys(masterBusMap), ...Object.keys(todayBusMap)])]
  const globalBusIndex: Record<string,number> = {}
  allBusNames.forEach((n,i) => { globalBusIndex[n] = i })

  // ── Actions ───────────────────────────────────────────────────
  function closeOverrideModal() {
    setOverrideModal(null)
    setOverrideBus(''); setOverrideLoc(''); setOverrideLocNew(''); setOverrideLocMode('select'); setOverrideTime('')
    setReqFormOpen(false); setReqBus(''); setReqDays([]); setReqNote('')
  }

  function openOverrideModal(student: StudentEntry, bus: string) {
    setOverrideModal({ student, bus })
    setOverrideBus(bus)
    setOverrideLoc(student.location ?? '')
    setOverrideLocNew('')
    setOverrideLocMode('select')
    setOverrideTime(student.pickup_time ?? '')
    setPermMode(false)
    setPermDays([...student.days])
    setReqFormOpen(false); setReqBus(''); setReqDays([...student.days]); setReqNote('')
    setReqStudent(student)
  }

  async function doOverride(studentId: string, busName: string|null, isAbsent: boolean, location?: string, pickupTime?: string) {
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'set_override', student_id: studentId, date: selectedDate, direction: todayDir,
        bus_name: busName, is_absent: isAbsent,
        location: location || null, pickup_time: pickupTime || null,
      }),
    })
    setSaving(false); closeOverrideModal(); loadToday()
  }

  async function confirmOverride() {
    if (!overrideModal) return
    const finalLoc = overrideLocMode === 'new' ? overrideLocNew : overrideLoc
    await doOverride(overrideModal.student.student_id, overrideBus || null, false, finalLoc, overrideTime)
  }

  function openEditSched(student: StudentEntry, currentBus: string, busLocs: Record<string,string[]>, defaultTime?: string, sessionName?: string) {
    setEditSchedBus(currentBus)
    setEditSchedLoc(student.location ?? '')
    setEditSchedTime(student.pickup_time ?? '')
    setEditSchedDays([...student.days])
    setEditLocIsNew(false)
    setEditTimeEditing(false)
    setEditTimeDraft('')
    // 빈 정류장 마스터는 세션 무관 — 모든 호차 후보에 합집합 (학생 0명 호차로 전환해도 노출)
    const mergedLocs: Record<string, string[]> = { ...busLocs }
    for (const [b, locs] of Object.entries(masterRegStopsByBus)) {
      mergedLocs[b] = [...new Set([...(mergedLocs[b] ?? []), ...locs])]
    }
    setEditSchedModal({ student, currentBus, busLocs: mergedLocs, sessionName: sessionName ?? '', defaultTime: defaultTime ?? '' })
  }

  async function handleSaveEditSched() {
    if (!editSchedModal) return
    setSaving(true)
    // editTimeEditing 중이면 draft 값 우선 사용 (수정 후 "저장" 직접 클릭 시)
    const finalPickupTime = editTimeEditing && editTimeDraft
      ? normalizeTime(editTimeDraft)
      : editSchedTime
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'update_enrollment_schedule',
        student_id: editSchedModal.student.student_id,
        class_id: editSchedModal.student.class_id,
        direction: masterDir,
        days: editSchedDays,
        bus_name: editSchedBus || undefined,
        location: editSchedLoc,
        pickup_time: finalPickupTime,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok || d.error) { alert(d.error ?? '저장 실패'); return }
    setEditSchedModal(null)
    loadMaster()
  }

  async function handlePermChange() {
    if (!overrideModal || !overrideBus || permDays.length === 0) return
    setSaving(true)
    const finalLoc = overrideLocMode === 'new' ? overrideLocNew : overrideLoc
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'update_enrollment_schedule',
        student_id: overrideModal.student.student_id,
        class_id: overrideModal.student.class_id,
        direction: todayDir,
        days: permDays,
        bus_name: overrideBus,
        location: finalLoc,
        pickup_time: overrideTime,
      }),
    })
    setSaving(false)
    closeOverrideModal()
    loadToday()
  }

  async function handleBulkUpdateLocationTime() {
    if (!editSchedModal || !editSchedBus || !editSchedLoc || !editTimeDraft) return
    setBulkSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bulk_update_location_time',
        session_name: editSchedModal.sessionName,
        bus_name: editSchedBus,
        direction: masterDir,
        location: editSchedLoc,
        new_time: normalizeTime(editTimeDraft),
      }),
    })
    setEditSchedTime(normalizeTime(editTimeDraft))
    setEditTimeEditing(false)
    setEditTimeDraft('')
    setBulkSaving(false)
    loadMaster()
  }

  async function handleBulkSetTime() {
    if (!bulkTimeModal || !bulkTime) return
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_set_time', bus_name: bulkTimeModal.bus, direction: bulkTimeModal.dir, time: bulkTime, month }),
    })
    setSaving(false)
    setBulkTimeModal(null)
    setBulkTime('')
    loadMaster()
  }

  function resetRiderForm() {
    setRiderSearch(''); setRiderResults([]); setRiderSelected(null)
    setRiderTime(''); setRiderTimeMode('select')
    setRiderLocation(''); setRiderLocMode('select')
    setRiderDays([])
  }
  async function loadAllStudents() {
    if (allStudents.length > 0) return // 이미 로드됨
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'search_students', query: '' }),
    })
    const d = await res.json()
    setAllStudents(d.students ?? [])
  }
  function filterStudents(q: string) {
    setRiderSearch(q)
    setRiderSelected(null)
    if (!q.trim()) { setRiderResults([]); return }
    const lower = q.toLowerCase()
    setRiderResults(allStudents.filter(s => s.name.includes(q) || (s.english_name ?? '').toLowerCase().includes(lower)).slice(0, 20))
  }
  async function handleAddRider() {
    if (!riderSelected || !addRiderModal) return
    setSaving(true); setFormError('')
    if (addRiderMode === 'today') {
      // 오늘 하루만 override (임시 배정)
      await fetch('/api/campus/vehicles', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'set_override', student_id: riderSelected.id,
          date: selectedDate, direction: todayDir, bus_name: addRiderModal.bus, is_absent: false,
        }),
      })
      setSaving(false); setAddRiderModal(null); resetRiderForm(); loadToday()
    } else {
      // 영구: 스케줄 영구 변경
      const dir = addRiderModal.sessionDir ?? (tab === 'today' ? todayDir : masterDir)
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'add_rider', student_id: riderSelected.id,
          date: selectedDate, direction: dir, bus_name: addRiderModal.bus,
          session_name: addRiderModal.sessionName,
          pickup_time: riderTime || undefined, pickup_location: riderLocation || undefined, days: riderDays,
        }),
      })
      const d = await res.json()
      setSaving(false)
      if (!res.ok) { setFormError(d.error ?? '추가 실패'); return }
      setAddRiderModal(null); resetRiderForm()
      if (tab === 'today') loadToday(); else loadMaster()
    }
  }

  async function submitChangeRequest() {
    if (!reqStudent || !reqBus || reqDays.length === 0) return
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_change_request',
        student_id: reqStudent.student_id,
        student_name: reqStudent.name,
        class_id: reqStudent.class_id,
        direction: todayDir,
        from_bus: overrideModal?.bus || null,
        to_bus: reqBus,
        days: reqDays,
        note: reqNote || undefined,
      }),
    })
    setSaving(false)
    setReqFormOpen(false); setReqBus(''); setReqDays([]); setReqNote('')
    setPendingCount(c => c + 1)
    alert('변경 요청이 제출되었습니다.')
  }

  async function approveRequest(id: string) {
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_change_request', request_id: id }),
    })
    setSaving(false); loadRequests(); loadMaster()
  }

  async function rejectRequest(id: string) {
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject_change_request', request_id: id }),
    })
    setSaving(false); loadRequests()
  }

  async function handleRemoveRider(student: StudentEntry, bus: string) {
    if (!confirm(`${student.name}의 ${masterDir==='arr'?'등원':'하원'} ${bus} 배정을 삭제하시겠습니까?`)) return
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'remove_rider',
        student_id: student.student_id,
        class_id: student.class_id,
        direction: masterDir,
      }),
    })
    setSaving(false)
    loadMaster()
  }

  function toggleCollapse(key: string) {
    setCollapsedBuses(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── Bus Card (shared) ──────────────────────────────────────────
  function parseTimeMin(t: string | null | undefined): number {
    if (!t) return 9999
    const m = t.match(/(\d{1,2}):(\d{2})/)
    if (!m) return 9999
    return parseInt(m[1]) * 60 + parseInt(m[2])
  }

  function BusCard({ name, students, locations, bi, showAddRider, groupBusLocs, defaultTime, sessionName, dir }: {
    name: string; students: StudentEntry[]; locations: string[]; bi: number; showAddRider?: boolean
    groupBusLocs?: Record<string,string[]>; defaultTime?: string; sessionName?: string; dir?: 'arr'|'dep'
  }) {
    // 카드 전체 스타일은 병합된 session_name 기준 (매일반 우선)
    // 개별 학생 배지는 stu.is_bangwaHu로 판단
    const isBangwaHu = !!sessionName?.includes('방과후')
    const color = getBusColor(name, bi)
    const txtColor = getTextColor(color)
    const collapsed = collapsedBuses.has(name)
    const bus = buses.find(b => b.name === name)
    // 탑승 시간순 정렬 (개인 시간 우선, 파싱 실패/없으면 세션 기본 시간, 그래도 없으면 맨 뒤)
    const defMin = defaultTime ? parseTimeMin(defaultTime) : 9999
    const sorted = [...students].sort((a, b) => {
      const rawA = a.pickup_time ? parseTimeMin(a.pickup_time) : 9999
      const rawB = b.pickup_time ? parseTimeMin(b.pickup_time) : 9999
      const ta = rawA < 9999 ? rawA : defMin
      const tb = rawB < 9999 ? rawB : defMin
      return ta - tb
    })
    return (
      <div className="rounded-xl overflow-hidden border border-[#E2E8F0] bg-white shadow-sm">
        {/* 헤더 */}
        <div className="px-3 py-2 cursor-pointer select-none" style={{ background: color }}
          onClick={() => toggleCollapse(name)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold" style={{ color: txtColor }}>{name}</span>
              <span className="text-xs font-bold" style={{ color: txtColor, opacity: 0.75 }}>{students.length}명</span>
            </div>
            <div className="flex items-center gap-1.5">
              {tab === 'master' && (
                <button
                  onClick={e => { e.stopPropagation(); setBulkTimeModal({ bus: name, dir: masterDir }); setBulkTime('') }}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.25)', color: txtColor }}
                  title="이 버스 탑승 시간 일괄 설정"
                >⏱ 일괄</button>
              )}
              <span className="text-[10px]" style={{ color: txtColor, opacity: 0.6 }}>{collapsed ? '▶' : '▼'}</span>
            </div>
          </div>
          {/* 기사/안전/KT 정보 */}
          {bus && (bus.driver || bus.safety || bus.kt_name) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {bus.driver && <span className="text-[9px]" style={{ color: txtColor, opacity: 0.75 }}>기사: {bus.driver}{bus.driver_phone ? ` ${bus.driver_phone}` : ''}</span>}
              {bus.safety && <span className="text-[9px]" style={{ color: txtColor, opacity: 0.75 }}>안전: {bus.safety}{bus.safety_phone ? ` ${bus.safety_phone}` : ''}</span>}
              {bus.kt_name && <span className="text-[9px]" style={{ color: txtColor, opacity: 0.75 }}>KT: {bus.kt_name}{bus.kt_phone ? ` ${bus.kt_phone}` : ''}</span>}
            </div>
          )}
        </div>

        {!collapsed && (
          <>
            <div className="grid text-[9px] text-[#94A3B8] font-semibold px-2 pt-1.5 pb-0.5 border-b border-[#F1F5F9]"
              style={{ gridTemplateColumns: tab === 'master' ? '14px 32px 1fr 1fr 46px 52px' : '14px 32px 1fr 1fr 46px' }}>
              <span>#</span><span className="text-center">시간</span>
              <span>이름</span><span>장소</span><span className="text-center">요일</span>
              {tab === 'master' && <span className="text-center">관리</span>}
            </div>
            {sorted.length === 0 ? (
              <div className="text-center text-[#CBD5E1] text-[11px] py-4">탑승 없음</div>
            ) : sorted.map((stu, i) => (
              <div key={`${stu.student_id}-${i}`}
                className={`grid items-center gap-x-1 px-2 py-1.5 border-b border-[#f5f5f5] cursor-pointer hover:bg-blue-50 ${
                  isBangwaHu && dir === 'dep' ? 'bg-orange-50 border-l-2 border-l-orange-400' : i%2===0?'bg-[#fafafa]':'bg-white'}`}
                style={{ gridTemplateColumns: tab === 'master' ? '14px 32px 1fr 1fr 46px 52px' : '14px 32px 1fr 1fr 46px' }}
                onClick={() => tab === 'master'
                  ? openEditSched(stu, name, groupBusLocs ?? {}, defaultTime, sessionName)
                  : openOverrideModal(stu, name)}>
                <span className="text-[9px] text-[#ccc]">{i+1}</span>
                <div className="text-center">
                  {(() => {
                    const t = normalizeTime(stu.pickup_time || defaultTime || '')
                    return t
                      ? <span className={`text-[9px] font-bold ${stu.pickup_time ? 'text-[#1E293B]' : 'text-[#94A3B8]'}`}>{t}</span>
                      : <span className="text-[9px] text-[#CBD5E1]">-</span>
                  })()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] font-semibold text-[#1a1a1a] truncate">{stu.name}</span>
                    {stu.is_bangwaHu && (
                      <span className="text-[8px] font-bold px-1 rounded" style={{ color: '#FF6B35', background: '#FF6B3520' }}>유치</span>
                    )}
                    {stu.override && (
                      <span className="text-[8px] font-bold px-1 rounded" style={{ color, background: `${color}22` }}>변경</span>
                    )}
                  </div>
                  {stu.english_name && <div className="text-[9px] text-[#94A3B8] truncate">{stu.english_name}</div>}
                </div>
                <div className="min-w-0">
                  {stu.location
                    ? <span className="text-[9px] text-[#475569] line-clamp-2">📍 {stu.location}</span>
                    : <span className="text-[9px] text-[#CBD5E1]">-</span>}
                </div>
                <DayDots days={stu.days} />
                {tab === 'master' && (
                  <div className="flex flex-col gap-0.5 items-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => openEditSched(stu, name, groupBusLocs ?? {}, defaultTime, sessionName)}
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] transition-colors w-full text-center">
                      이동
                    </button>
                    <button
                      onClick={() => handleRemoveRider(stu, name)}
                      disabled={saving}
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#EF4444] hover:bg-[#FEE2E2] transition-colors w-full text-center disabled:opacity-40">
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
            {showAddRider && tab === 'master' && (
              <div className="px-2 py-1.5 border-t border-[#F1F5F9]">
                <button onClick={() => {
                  const days = sessionName?.includes('화목') || sessionName?.includes('2일반') ? ['화','목']
                    : sessionName?.includes('월수금') || sessionName?.includes('3일반') ? ['월','수','금']
                    : ['월','화','수','목','금']
                  setAddRiderMode('permanent'); setAddRiderModal({ bus: name, sessionName, sessionLocs: locations, sessionDir: dir }); resetRiderForm(); setRiderDays(days); loadAllStudents()
                }}
                  className="w-full text-[10px] font-semibold text-[#94A3B8] hover:text-[#004EA2] hover:bg-blue-50 rounded-lg py-1.5 transition-colors border border-dashed border-[#E2E8F0] hover:border-[#004EA2]">
                  + 탑승자 추가
                </button>
              </div>
            )}
            {showAddRider && tab === 'today' && (
              <div className="px-2 py-1.5 border-t border-[#F1F5F9] flex gap-1.5">
                <button onClick={() => {
                  const days = sessionName?.includes('화목') || sessionName?.includes('2일반') ? ['화','목']
                    : sessionName?.includes('월수금') || sessionName?.includes('3일반') ? ['월','수','금']
                    : ['월','화','수','목','금']
                  setAddRiderMode('permanent'); setAddRiderModal({ bus: name, sessionName, sessionLocs: locations, sessionDir: dir }); resetRiderForm(); setRiderDays(days); loadAllStudents()
                }}
                  className="flex-1 text-[10px] font-semibold text-[#004EA2] hover:bg-blue-50 rounded-lg py-1.5 transition-colors border border-[#004EA2]">
                  + 신규 탑승자 추가
                </button>
                <button onClick={() => { setAddRiderMode('today'); setAddRiderModal({ bus: name, sessionName, sessionLocs: locations, sessionDir: dir }); resetRiderForm(); loadAllStudents() }}
                  className="flex-1 text-[10px] font-semibold text-[#9333EA] hover:bg-purple-50 rounded-lg py-1.5 transition-colors border border-[#9333EA]">
                  + 오늘만 탑승 추가
                </button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Session Section ────────────────────────────────────────────
  const busOrderMap: Record<string,number> = {}
  buses.forEach((b, i) => { busOrderMap[b.name] = b.sort_order ?? i })

  function SessSection({ group, dir, showAddRider }: { group: TimeGroup; dir: 'arr'|'dep'; showAddRider?: boolean }) {
    const label = getRunLabel(group.session_name, dir)
    const runTime = getRunTime(group.time_range, dir)
    const color = getRunColor(group.session_name, dir)
    const groupBusNames = [...new Set([...allBusNames.filter(n => group.busMap[n]), ...Object.keys(group.busMap)])]
      .sort((a, b) => {
        const ao = busOrderMap[a] ?? 999, bo = busOrderMap[b] ?? 999
        if (ao !== bo) return ao - bo
        // fallback: numeric sort for 1호차 < 2호차 등
        const an = parseInt(a) || 9999, bn = parseInt(b) || 9999
        return an - bn
      })
    const groupTotal = Object.values(group.busMap).reduce((s,a) => s+a.length, 0)
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 pb-1.5 border-b-2" style={{ borderColor: color+'40' }}>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }}/>
          <span className="text-sm font-extrabold" style={{ color }}>{label}</span>
          {runTime && <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ background: color }}>⏱ {runTime}</span>}
          <span className="text-xs text-[#94A3B8] ml-auto">{groupTotal}명</span>
        </div>
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groupBusNames.map(n => (
            <BusCard key={n} name={n} students={group.busMap[n]??[]}
              locations={group.busLocations[n]??[]} bi={globalBusIndex[n]??0}
              showAddRider={showAddRider} groupBusLocs={group.busLocations}
              defaultTime={runTime} sessionName={group.session_name} dir={dir}/>
          ))}
        </div>
      </div>
    )
  }

  const isWeekend = [0,6].includes(new Date(selectedDate+'T00:00:00').getDay())
  const todayTotal = Object.values(todayBusMap).reduce((s,a)=>s+a.length,0)
  const todayBusNamesInUse = [...new Set(todayGroups.flatMap(g => Object.keys(g.busMap)))]
    .sort((a, b) => {
      const ai = buses.findIndex(bus => bus.name === a), bi = buses.findIndex(bus => bus.name === b)
      const ao = ai >= 0 ? buses[ai].sort_order : 999, bo = bi >= 0 ? buses[bi].sort_order : 999
      if (ao !== bo) return ao - bo
      return (parseInt(a) || 9999) - (parseInt(b) || 9999)
    })

  // 오늘 등하원 - 호차 필터된 그룹 (같은 레이블 병합 후 필터)
  const filteredTodayGroups = mergeGroupsByLabel(todayGroups, todayDir)
    .map(g => {
      if (busFilter === '전체') return g
      const filtered: typeof g = { ...g, busMap: {}, busLocations: {} }
      if (g.busMap[busFilter]) {
        filtered.busMap[busFilter] = g.busMap[busFilter]
        filtered.busLocations[busFilter] = g.busLocations[busFilter] ?? []
      }
      return filtered
    }).filter(g => Object.keys(g.busMap).length > 0)
    .filter(g => sessionFilter === '전체' || getRunLabel(g.session_name, todayDir).startsWith(sessionFilter))
    .sort((a, b) => {
      const ta = parseTimeMin(getRunTime(a.time_range, todayDir)), tb = parseTimeMin(getRunTime(b.time_range, todayDir))
      if (ta !== tb) return ta - tb
      return getSessPriority(a.session_name, todayDir) - getSessPriority(b.session_name, todayDir)
    })

  return (
    <div className={fullscreen
      ? 'fixed inset-0 z-[55] bg-[#F7F8FA] flex flex-col p-2 sm:p-3'
      : 'max-w-full'}>
      {/* 헤더 + 탭 (한 줄 압축) */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0 border-b border-[#E2E8F0]">
        <h1 className="text-sm font-bold text-[#1E293B] whitespace-nowrap pr-2 hidden md:block">차량 관리</h1>
        <div className="flex gap-0 overflow-x-auto">
          {([['map','시스템'],['today','모바일'],['master','학생 설정']] as const)
            .filter(([k]) => !vehiclesRestricted || k === 'today' || k === 'map')
            .map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`relative flex-shrink-0 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab===k ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 pr-0.5">
          {month && <span className="text-[11px] font-semibold text-[#1D4ED8] whitespace-nowrap hidden sm:inline">📅 {month}</span>}
          <button onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? '전체화면 종료 (Esc)' : '전체화면으로 보기'}
            className="flex items-center gap-1 text-xs font-bold text-[#334155] bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 hover:bg-[#F1F5F9] transition-colors whitespace-nowrap">
            <span className="text-sm leading-none">{fullscreen ? '🗗' : '⛶'}</span>
            <span className="hidden sm:inline">{fullscreen ? '닫기' : '전체화면'}</span>
          </button>
        </div>
      </div>

      {/* 탭 콘텐츠 (전체화면 시 남은 공간 채움) */}
      <div className={fullscreen ? 'flex-1 min-h-0 overflow-auto' : ''}>

      {/* ═══ 차량 관리 탭 ═══════════════════════════════════════ */}
      {tab === 'master' && (
        <div>
          {/* 세션 필터 버튼 + 방향 */}
          <div className="flex flex-wrap gap-1.5 mb-3 items-center">
            {/* 등원/하원 */}
            {(['arr','dep'] as const).map(dir => (
              <button key={dir} onClick={() => setMasterDir(dir)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  masterDir===dir
                    ? dir==='arr' ? 'bg-[#3B82F6] text-white' : 'bg-[#DC2626] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>
                {dir==='arr' ? '🚌 등원' : '🏠 하원'}
              </button>
            ))}
            <div className="w-px bg-[#E2E8F0] mx-1"/>
            {/* 세션 타입 필터 */}
            {['전체','유치부','매일반','3일반','2일반'].map(f => (
              <button key={f} onClick={() => setSessFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  sessFilter===f ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'bg-white text-[#64748B] border-[#E2E8F0]'}`}>
                {f}
              </button>
            ))}
            <div className="ml-auto">
              <button onClick={openBackupModal} className="text-sm bg-white border border-[#E2E8F0] text-[#64748B] px-3 py-1.5 rounded-lg hover:bg-[#F7F8FA] transition-colors">
                💾 백업
              </button>
            </div>
          </div>

          {masterLoading ? <Spinner /> : (
            <div className="space-y-6">
              {mergeGroupsByLabel(masterGroups, masterDir)
                .filter(g => sessMatchesFilter(g.session_name, sessFilter, masterDir))
                .length === 0 ? (
                <div className="text-center py-16 text-[#94A3B8]">
                  <p className="text-2xl mb-2">🚌</p>
                  <p className="text-sm">데이터가 없습니다.</p>
                </div>
              ) : mergeGroupsByLabel(masterGroups, masterDir)
                .filter(g => sessMatchesFilter(g.session_name, sessFilter, masterDir))
                .sort((a, b) => {
                  const ta = parseTimeMin(getRunTime(a.time_range, masterDir)), tb = parseTimeMin(getRunTime(b.time_range, masterDir))
                  if (ta !== tb) return ta - tb
                  return getSessPriority(a.session_name, masterDir) - getSessPriority(b.session_name, masterDir)
                })
                .map(group => (
                  <SessSection key={getRunLabel(group.session_name, masterDir)} group={group} dir={masterDir} showAddRider />
                ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 오늘 등하원 탭 ══════════════════════════════════════ */}
      {tab === 'today' && (
        <div>
          {/* 날짜 + 방향 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 bg-white focus:outline-none"/>
            {(['arr','dep'] as const).map(dir => (
              <button key={dir} onClick={() => setTodayDir(dir)}
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  todayDir===dir
                    ? dir==='arr' ? 'bg-[#3B82F6] text-white' : 'bg-[#DC2626] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>
                {dir==='arr' ? '🚌 등원' : '🏠 하원'}
              </button>
            ))}
            <span className="text-xs text-[#94A3B8] ml-auto">총 {todayTotal}명</span>
          </div>

          {/* 세션 필터 탭 */}
          {(() => {
            const labels = [...new Set(mergeGroupsByLabel(todayGroups, todayDir).map(g => getRunLabel(g.session_name, todayDir).replace(/ ?(등원|하원)$/, '')))]
            if (labels.length <= 1) return null
            return (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {['전체', ...labels].map(lbl => (
                  <button key={lbl} onClick={() => setSessionFilter(lbl)}
                    className={'px-3 py-1 rounded-lg text-xs font-semibold transition-colors ' + (sessionFilter === lbl ? 'bg-[#004EA2] text-white' : 'bg-[#F1F5F9] text-[#64748B]')}>
                    {lbl}
                  </button>
                ))}
              </div>
            )
          })()}

          {/* 호차 필터 */}
          {todayBusNamesInUse.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['전체', ...todayBusNamesInUse].map(bn => {
                const color = bn === '전체' ? '#64748B' : getBusColor(bn, globalBusIndex[bn]??0)
                return (
                  <button key={bn} onClick={() => setBusFilter(bn)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                    style={busFilter===bn
                      ? { background: color, color: getTextColor(color) }
                      : { background: '#F1F5F9', color: '#64748B' }}>
                    {bn}
                  </button>
                )
              })}
            </div>
          )}

          {isWeekend && (
            <div className="bg-[#FFF7ED] border border-[#FDE68A] rounded-xl px-4 py-3 mb-4 text-sm text-[#92400E]">
              주말입니다. 수업이 없을 수 있습니다.
            </div>
          )}

          {todayLoading ? <Spinner /> : (
            <div className="space-y-6">
              {filteredTodayGroups.map(group => (
                <SessSection key={getRunLabel(group.session_name, todayDir)} group={group} dir={todayDir} showAddRider />
              ))}

              {/* 결석 */}
              {absentStudents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 pb-1.5 border-b-2 border-red-100">
                    <div className="w-3 h-3 rounded-full bg-[#EF4444]"/>
                    <span className="text-sm font-extrabold text-[#EF4444]">오늘 결석</span>
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full bg-[#EF4444]">{absentStudents.length}명</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {absentStudents.map(stu => (
                      <div key={stu.student_id}
                        className="flex items-center gap-1.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-1.5 cursor-pointer hover:bg-[#FEE2E2]"
                        onClick={() => openOverrideModal({ ...stu, class_id: '', english_name: null, override: true, location: null, days: [], pickup_time: null }, '')}>
                        <span className="text-[10px]">🚫</span>
                        <span className="text-sm font-semibold text-[#EF4444]">{stu.name}</span>
                        <span className="text-[9px] text-[#F87171]">탑승변경</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredTodayGroups.length === 0 && absentStudents.length === 0 && (
                <div className="text-center py-16 text-[#94A3B8]">
                  <p className="text-2xl mb-2">🚌</p>
                  <p className="text-sm">{todayDir==='arr'?'등원':'하원'} 데이터가 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ 변경/기록 탭 (좌: 승인 대기 | 우: 변경 기록) ════════ */}
      {/* ═══ 노선 지도 탭 ════════════════════════════════════════ */}
      {tab === 'map' && <RouteMapView campusId={campusId} campusName={campusName} fullscreen={fullscreen} />}

      </div>{/* /탭 콘텐츠 */}

      {/* ── 스케줄 편집 모달 (차량관리 탭) ─────────── */}
      {editSchedModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
          onClick={() => setEditSchedModal(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold text-[#1E293B]">{editSchedModal.student.name} 스케줄 수정</h3>
                <p className="text-[11px] text-[#64748B]">{masterDir==='arr'?'등원':'하원'} 기준 · 영구 변경</p>
              </div>
              <button onClick={() => setEditSchedModal(null)} className="text-[#94A3B8] text-xl">✕</button>
            </div>

            {/* 호차 선택 */}
            <div className="mt-3 mb-3">
              <p className="text-[10px] font-bold text-[#64748B] mb-1.5">호차</p>
              <div className="flex flex-wrap gap-1.5">
                {allBusNames.map(bn => {
                  const color = getBusColor(bn, globalBusIndex[bn]??0)
                  return (
                    <button key={bn} onClick={() => setEditSchedBus(bn)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                      style={editSchedBus===bn
                        ? { background: color, color: getTextColor(color), borderColor: color }
                        : { background: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }}>
                      {bn}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 승하차 위치 + 시간 */}
            <div className="mb-3">
              <p className="text-[10px] font-bold text-[#64748B] mb-1.5">승하차 위치</p>
              {editSchedBus && (editSchedModal.busLocs[editSchedBus]?.length ?? 0) > 0 && !editLocIsNew ? (
                <>
                  <p className="text-[9px] text-[#94A3B8] mb-1">{editSchedBus} 기존 위치 선택</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {editSchedModal.busLocs[editSchedBus].map(loc => {
                      const isSelected = editSchedLoc === loc && !editLocIsNew
                      // 해당 위치의 대표 시간 계산
                      const locTimes = masterGroups.flatMap(g =>
                        (g.busMap[editSchedBus] ?? []).filter(s => s.location === loc && s.pickup_time).map(s => s.pickup_time as string)
                      )
                      const locFreq: Record<string,number> = {}
                      locTimes.forEach(t => { locFreq[t] = (locFreq[t]??0) + 1 })
                      const locTime = locTimes.length > 0
                        ? normalizeTime(Object.entries(locFreq).sort((a,b) => b[1]-a[1])[0][0])
                        : normalizeTime(masterRegStopTimes[`${editSchedBus}|${loc}`] ?? '')
                      return (
                        <button key={loc} onClick={() => {
                          setEditSchedLoc(loc)
                          setEditLocIsNew(false)
                          setEditTimeEditing(false)
                          setEditTimeDraft('')
                          if (locTime) setEditSchedTime(locTime)
                        }}
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-[#004EA2] text-white border-[#004EA2]'
                              : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0] hover:border-[#004EA2]'
                          }`}>
                          📍 {loc}
                        </button>
                      )
                    })}
                    <button onClick={() => { setEditLocIsNew(true); setEditSchedLoc(''); setEditSchedTime(''); setEditTimeEditing(false) }}
                      className="text-[10px] px-2 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2] hover:bg-blue-50 transition-colors">
                      + 새 장소
                    </button>
                  </div>
                  {/* 선택된 기존 위치의 시간 표시 */}
                  {editSchedLoc && !editLocIsNew && (
                    <div className="bg-[#F8FAFC] rounded-xl px-3 py-2.5 border border-[#E2E8F0]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] text-[#94A3B8] mb-0.5">승차 시간</p>
                          {editTimeEditing ? (
                            <input
                              autoFocus
                              value={editTimeDraft}
                              onChange={e => setEditTimeDraft(e.target.value)}
                              onBlur={e => setEditTimeDraft(normalizeTime(e.target.value))}
                              placeholder="예: 08:40"
                              className="text-sm font-bold text-[#1E293B] bg-transparent border-b border-[#004EA2] focus:outline-none w-24"
                            />
                          ) : (
                            <p className="text-sm font-bold text-[#1E293B]">{editSchedTime || '-'}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {editTimeEditing ? (
                            <>
                              <button onClick={() => { setEditTimeEditing(false); setEditTimeDraft('') }}
                                className="text-[10px] px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] transition-colors">
                                취소
                              </button>
                              <button onClick={handleBulkUpdateLocationTime}
                                disabled={bulkSaving || !editTimeDraft}
                                className="text-[10px] px-2 py-1 rounded-lg bg-[#004EA2] text-white font-bold hover:bg-[#003A82] disabled:opacity-40 transition-colors">
                                {bulkSaving ? '적용 중...' : '전체 적용'}
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { setEditTimeEditing(true); setEditTimeDraft(editSchedTime) }}
                              className="text-[10px] px-2 py-1 rounded-lg bg-[#EAF2FB] text-[#004EA2] hover:bg-[#DBEAFE] transition-colors">
                              ✏️ 수정
                            </button>
                          )}
                        </div>
                      </div>
                      {editTimeEditing && (
                        <p className="text-[9px] text-[#F59E0B] mt-1.5">⚠️ 전체 적용 시 {editSchedBus} 동일 세션·위치의 모든 학생 시간이 변경됩니다</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* 새 장소 입력 모드 or 기존 위치 없음 */
                <>
                  {(editSchedModal.busLocs[editSchedBus]?.length ?? 0) > 0 && editLocIsNew && (
                    <button onClick={() => { setEditLocIsNew(false); setEditSchedLoc(editSchedModal.busLocs[editSchedBus]?.[0] ?? '') }}
                      className="text-[9px] text-[#004EA2] hover:underline mb-1.5 block">
                      ← 기존 위치 선택으로 돌아가기
                    </button>
                  )}
                  <input value={editSchedLoc} onChange={e => setEditSchedLoc(e.target.value)}
                    placeholder="예: 중계역 2번출구"
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-2"/>
                  <p className="text-[10px] font-bold text-[#64748B] mb-1.5">승차 시간</p>
                  <input value={editSchedTime} onChange={e => setEditSchedTime(e.target.value)}
                    onBlur={e => setEditSchedTime(normalizeTime(e.target.value))}
                    placeholder={editSchedModal?.defaultTime ? `세션 기본 ${editSchedModal.defaultTime}` : '예: 08:40'}
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"/>
                </>
              )}
            </div>

            {/* 요일 */}
            <div className="mb-4">
              <p className="text-[10px] font-bold text-[#64748B] mb-1.5">적용 요일</p>
              <div className="flex gap-2">
                {DAYS.map((d, di) => {
                  const active = editSchedDays.includes(d)
                  return (
                    <button key={d} onClick={() => setEditSchedDays(prev => active ? prev.filter(x=>x!==d) : [...prev, d])}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
                      style={active ? { background: DAY_DOT_COLOR[di], color: '#fff' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditSchedModal(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={handleSaveEditSched}
                disabled={saving || editSchedDays.length===0 || !editSchedBus}
                className="flex-1 bg-[#004EA2] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 탑승변경 모달 (호차 + 탑승지 + 시간) ──────── */}
      {overrideModal && (() => {
        // 선택된 버스의 모든 세션에서 장소 목록 수집
        const availLocs = [...new Set(
          filteredTodayGroups.flatMap(g => g.busLocations[overrideBus] ?? [])
        )].filter(Boolean)

        return (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
            onClick={closeOverrideModal}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[92vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>

              {/* 헤더 */}
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="font-bold text-[#1E293B]">{overrideModal.student.name}</h3>
                  <p className="text-[11px] text-[#64748B]">{selectedDate} {todayDir==='arr'?'등원':'하원'} — 오늘만 적용</p>
                </div>
                <button onClick={closeOverrideModal} className="text-[#94A3B8] text-xl">✕</button>
              </div>

              {/* ① 호차 선택 */}
              <div className="mt-3 mb-3">
                <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">호차</p>
                <div className="flex flex-wrap gap-1.5">
                  {allBusNames.map(name => {
                    const color = getBusColor(name, globalBusIndex[name]??0)
                    const isSel = overrideBus === name
                    const isCurrent = overrideModal.bus === name
                    return (
                      <button key={name}
                        onClick={() => { setOverrideBus(name); setOverrideLoc(''); setOverrideLocMode('select') }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1"
                        style={isSel
                          ? { borderColor: color, background: color, color: getTextColor(color) }
                          : { borderColor: '#E2E8F0', color: '#475569', background: '#fff' }}>
                        {name}
                        {isCurrent && !isSel && <span className="text-[8px] opacity-60">현재</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ② 탑승지 선택 (버스가 선택된 경우만) */}
              {overrideBus && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">탑승지</p>
                  {/* 기존 장소 드롭다운 */}
                  {availLocs.length > 0 && overrideLocMode === 'select' && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {availLocs.map(loc => (
                        <button key={loc}
                          onClick={() => {
                            setOverrideLoc(loc)
                            // 장소 선택 시 해당 버스+장소의 대표 시간 자동 설정 (오늘 그룹 우선, 없으면 마스터)
                            let times = filteredTodayGroups.flatMap(g =>
                              (g.busMap[overrideBus] ?? []).filter(s => s.location === loc && s.pickup_time).map(s => s.pickup_time as string)
                            )
                            if (times.length === 0) {
                              times = masterGroups.flatMap(g =>
                                (g.busMap[overrideBus] ?? []).filter(s => s.location === loc && s.pickup_time).map(s => s.pickup_time as string)
                              )
                            }
                            if (times.length > 0) {
                              const freq: Record<string, number> = {}
                              times.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 })
                              setOverrideTime(normalizeTime(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]))
                            }
                          }}
                          className="text-[10px] px-2.5 py-1 rounded-lg border transition-colors"
                          style={overrideLoc === loc
                            ? { background: '#004EA2', color: '#fff', borderColor: '#004EA2' }
                            : { background: '#F7F8FA', color: '#475569', borderColor: '#E2E8F0' }}>
                          📍 {loc}
                        </button>
                      ))}
                      <button
                        onClick={() => { setOverrideLocMode('new'); setOverrideLocNew('') }}
                        className="text-[10px] px-2.5 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2]">
                        + 새 장소
                      </button>
                    </div>
                  )}
                  {/* 직접 입력 */}
                  {(overrideLocMode === 'new' || availLocs.length === 0) && (
                    <div className="flex gap-2">
                      <input
                        value={overrideLocNew}
                        onChange={e => setOverrideLocNew(e.target.value)}
                        placeholder="예: 중계역 2번출구"
                        className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                        autoFocus
                      />
                      {availLocs.length > 0 && (
                        <button onClick={() => { setOverrideLocMode('select'); setOverrideLocNew('') }}
                          className="text-xs text-[#94A3B8] px-2">목록</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ③ 시간 */}
              {overrideBus && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">탑승 시간 (선택)</p>
                  <input
                    type="time"
                    value={overrideTime}
                    onChange={e => setOverrideTime(e.target.value)}
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                  />
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2 mb-2">
                <button onClick={confirmOverride} disabled={!overrideBus || saving}
                  className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-40">
                  {saving ? '...' : '오늘만 변경'}
                </button>
                <button onClick={() => setPermMode(o => !o)} disabled={!overrideBus}
                  className={`flex-1 font-semibold py-2.5 rounded-xl text-sm border transition-colors ${
                    permMode ? 'bg-[#10B981] text-white border-[#10B981]' : 'bg-white text-[#10B981] border-[#10B981]'
                  } disabled:opacity-40`}>
                  앞으로 변경 {permMode ? '▲' : '▼'}
                </button>
              </div>

              {/* 앞으로 변경 — 요일 선택 */}
              {permMode && (
                <div className="mb-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-[#15803D]">적용 요일 선택 후 영구 변경</p>
                  <div className="flex gap-1.5">
                    {DAYS.map((d, di) => {
                      const active = permDays.includes(d)
                      return (
                        <button key={d} onClick={() => setPermDays(prev => active ? prev.filter(x=>x!==d) : [...prev, d])}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          style={active ? { background: DAY_DOT_COLOR[di], color:'#fff' } : { background:'#fff', color:'#94A3B8', border:'1px solid #E2E8F0' }}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={handlePermChange} disabled={saving || permDays.length===0 || !overrideBus}
                    className="w-full bg-[#10B981] text-white py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                    {saving ? '저장 중...' : '영구 변경 저장'}
                  </button>
                </div>
              )}

              {/* 결석 / 되돌리기 */}
              <div className="flex gap-2">
                <button onClick={() => doOverride(overrideModal.student.student_id, null, true)} disabled={saving}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold border border-[#FECACA] text-[#EF4444]">
                  🚫 결석
                </button>
                {overrideModal.student.override && (
                  <button onClick={() => doOverride(overrideModal.student.student_id, overrideModal.bus, false)} disabled={saving}
                    className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold border border-[#E2E8F0] text-[#64748B]">
                    ↩ 원래대로
                  </button>
                )}
              </div>

              {/* 변경 승인 요청 섹션 */}
              <div className="border-t border-[#E2E8F0] pt-3 mt-1">
                <button
                  onClick={() => setReqFormOpen(o => !o)}
                  className="w-full text-left text-xs font-semibold text-[#004EA2] flex items-center gap-1.5 py-1">
                  📋 변경 승인 요청 {reqFormOpen ? '▲' : '▼'}
                </button>
                {reqFormOpen && (
                  <div className="mt-2 bg-[#F0F7FF] rounded-xl p-3 space-y-2.5">
                    <p className="text-[10px] text-[#64748B]">학부모 요청 사항을 기록한 뒤 승인 탭에서 처리하세요.</p>

                    {/* 변경할 호차 */}
                    <div>
                      <p className="text-[10px] font-bold text-[#94A3B8] mb-1">변경할 호차</p>
                      <div className="flex flex-wrap gap-1.5">
                        {allBusNames.filter(n => n !== overrideBus).map(name => {
                          const color = getBusColor(name, globalBusIndex[name] ?? 0)
                          return (
                            <button key={name}
                              onClick={() => setReqBus(name)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                              style={reqBus === name
                                ? { background: color, color: getTextColor(color), borderColor: color }
                                : { background: '#fff', color: '#475569', borderColor: '#E2E8F0' }}>
                              {name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 적용 요일 */}
                    <div>
                      <p className="text-[10px] font-bold text-[#94A3B8] mb-1">적용 요일</p>
                      <div className="flex gap-1">
                        {DAYS.map((d, di) => {
                          const active = reqDays.includes(d)
                          return (
                            <button key={d}
                              onClick={() => setReqDays(prev => active ? prev.filter(x => x !== d) : [...prev, d])}
                              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
                              style={active
                                ? { background: DAY_DOT_COLOR[di], color: '#fff' }
                                : { background: '#fff', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 메모 */}
                    <input
                      value={reqNote}
                      onChange={e => setReqNote(e.target.value)}
                      placeholder="학부모 요청 메모 (선택)"
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
                    />

                    {/* 제출 */}
                    <button
                      onClick={submitChangeRequest}
                      disabled={saving || !reqBus || reqDays.length === 0}
                      className="w-full bg-[#004EA2] text-white py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                      {saving ? '제출 중...' : '변경 요청 제출 → 승인 대기'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 탑승자 추가 모달 ──────────────────────────── */}
      {addRiderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
          onClick={() => { setAddRiderModal(null); resetRiderForm() }}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#1E293B]">{addRiderMode === 'today' ? '오늘만 탑승 추가' : '신규 탑승자 추가'}</h3>
                <p className="text-[11px] text-[#64748B]">{addRiderModal.bus} · {addRiderMode === 'today' ? `${selectedDate} ${todayDir==='arr'?'등원':'하원'} (오늘만)` : `${(tab === 'today' ? todayDir : masterDir)==='arr'?'등원':'하원'} · 영구`}</p>
              </div>
              <button onClick={() => { setAddRiderModal(null); resetRiderForm() }} className="text-[#94A3B8] text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-[#64748B] mb-1 block">학생명 *</label>
                {riderSelected ? (
                  <div className="flex items-center gap-2 border border-[#004EA2] rounded-xl px-3 py-2">
                    <span className="text-sm font-semibold flex-1">{riderSelected.name}</span>
                    <button onClick={() => { setRiderSelected(null); setRiderSearch('') }} className="text-[#94A3B8] text-xs">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input value={riderSearch} onChange={e => filterStudents(e.target.value)} placeholder="이름 검색..."
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus/>
                    {riderSearch.trim().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                        {riderResults.length === 0 ? (
                          <div className="px-3 py-3 text-[11px] text-[#94A3B8] text-center">검색 결과 없음</div>
                        ) : (
                          riderResults.map(s => (
                            <button key={s.id}
                              onClick={() => { setRiderSelected({ id: s.id, name: s.name }); setRiderSearch(''); setRiderResults([]) }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-[#F1F5F9] last:border-0">
                              <span className="font-medium">{s.name}</span>
                              {s.english_name && <span className="text-[10px] text-[#94A3B8] ml-2">{s.english_name}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {addRiderMode !== 'today' && (() => {
                const bus = addRiderModal?.bus ?? ''
                const allGroups = tab === 'today' ? todayGroups : masterGroups
                // 현재 섹션(session+dir) 그룹만 필터링
                const sessLabel = addRiderModal?.sessionName ? getRunLabel(addRiderModal.sessionName, addRiderModal.sessionDir ?? 'arr') : ''
                const srcGroups = sessLabel
                  ? allGroups.filter(g => getRunLabel(g.session_name, addRiderModal?.sessionDir ?? 'arr') === sessLabel)
                  : allGroups
                // 해당 버스 기존 탑승자의 시간 목록 + 빈 정류장 마스터의 운행시간
                const regTimesForBus = Object.entries(masterRegStopTimes)
                  .filter(([k]) => k.startsWith(`${bus}|`))
                  .map(([, t]) => t)
                const existTimes = [...new Set([
                  ...(srcGroups.flatMap(g => (g.busMap[bus] ?? []).map(s => s.pickup_time)).filter(Boolean) as string[]),
                  ...regTimesForBus,
                ])].sort()
                // 선택된 시간의 장소 목록 (없으면 버스 전체 장소)
                const locsAtTime = riderTime
                  ? [...new Set([...srcGroups, ...masterGroups].flatMap(g =>
                      (g.busMap[bus] ?? []).filter(s => normalizeTime(s.pickup_time ?? '') === riderTime).map(s => s.location).filter((x): x is string => x != null)
                    ))]
                  : []
                const sessionLocs = addRiderModal?.sessionLocs ?? []
                // 빈 정류장 마스터는 세션 무관 — 항상 후보에 합집합
                const allLocs = [...new Set([
                  ...(sessionLocs.length > 0 ? sessionLocs : (masterBusLocMap[bus] ?? [])),
                  ...(masterRegStopsByBus[bus] ?? []),
                ])]
                const existLocs = locsAtTime.length > 0 ? locsAtTime : allLocs
                return (
                  <>
                    {/* 승차 시간 */}
                    <div>
                      <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">승차 시간</label>
                      {riderTimeMode === 'select' ? (
                        <div className="flex flex-wrap gap-1.5">
                          {existTimes.map(t => (
                            <button key={t} onClick={() => { setRiderTime(normalizeTime(t)); setRiderLocation(''); setRiderLocMode('select') }}
                              className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                              style={riderTime===normalizeTime(t) ? {background:'#004EA2',color:'#fff',borderColor:'#004EA2'} : {background:'#F7F8FA',color:'#475569',borderColor:'#E2E8F0'}}>
                              ⏱ {normalizeTime(t)}
                            </button>
                          ))}
                          <button onClick={() => { setRiderTimeMode('new'); setRiderTime('') }}
                            className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2]">
                            + 새 시간
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input value={riderTime} onChange={e => setRiderTime(e.target.value)}
                            onBlur={e => setRiderTime(normalizeTime(e.target.value))}
                            placeholder="예: 08:40"
                            className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus/>
                          {existTimes.length > 0 && (
                            <button onClick={() => { setRiderTimeMode('select'); setRiderTime('') }}
                              className="text-xs text-[#94A3B8] px-2">목록</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 승차 장소 */}
                    <div>
                      <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">
                        승차 장소
                        {riderTime && locsAtTime.length > 0 && (
                          <span className="text-[9px] text-[#94A3B8] ml-1">({riderTime} 기존 정류장)</span>
                        )}
                      </label>
                      {riderLocMode === 'select' ? (
                        <div className="flex flex-wrap gap-1.5">
                          {existLocs.map(loc => (
                            <button key={loc} onClick={() => {
                              setRiderLocation(loc)
                              if (!riderTime) {
                                const bus = addRiderModal?.bus ?? ''
                                const srcGroups = tab === 'today' ? todayGroups : masterGroups
                                const times = srcGroups.flatMap(g =>
                                  (g.busMap[bus] ?? []).filter(s => s.location === loc && s.pickup_time).map(s => s.pickup_time as string)
                                )
                                if (times.length > 0) {
                                  const freq: Record<string,number> = {}
                                  times.forEach(t => { freq[t] = (freq[t]??0) + 1 })
                                  setRiderTime(normalizeTime(Object.entries(freq).sort((a,b) => b[1]-a[1])[0][0]))
                                  setRiderTimeMode('select')
                                }
                              }
                            }}
                              className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                              style={riderLocation===loc ? {background:'#004EA2',color:'#fff',borderColor:'#004EA2'} : {background:'#F7F8FA',color:'#475569',borderColor:'#E2E8F0'}}>
                              📍 {loc}
                            </button>
                          ))}
                          <button onClick={() => { setRiderLocMode('new'); setRiderLocation('') }}
                            className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-[#004EA2] text-[#004EA2]">
                            + 새 장소
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input value={riderLocation} onChange={e => setRiderLocation(e.target.value)} placeholder="예: 중계역 2번출구"
                            className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" autoFocus/>
                          {existLocs.length > 0 && (
                            <button onClick={() => { setRiderLocMode('select'); setRiderLocation('') }}
                              className="text-xs text-[#94A3B8] px-2">목록</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 탑승 요일 */}
                    <div>
                      <label className="text-[10px] font-bold text-[#64748B] mb-1.5 block">탑승 요일</label>
                      <div className="flex gap-2">
                        {DAYS.map((d, di) => {
                          const active = riderDays.includes(d)
                          return (
                            <button key={d} onClick={() => setRiderDays(prev => active ? prev.filter(x=>x!==d) : [...prev, d])}
                              className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
                              style={active ? { background: DAY_DOT_COLOR[di], color: '#fff' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}
              {addRiderMode === 'today' && (
                <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-3 py-2 text-xs text-[#92400E]">
                  오늘({selectedDate}) {todayDir==='arr'?'등원':'하원'}에만 임시 배정됩니다. 기존 스케줄은 변경되지 않습니다.
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {formError && (
                <p className="text-[11px] text-[#EF4444] bg-[#FEF2F2] rounded-xl px-3 py-2">{formError}</p>
              )}
              <button onClick={() => { setAddRiderModal(null); resetRiderForm(); setFormError('') }}
                  className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
                <button onClick={handleAddRider} disabled={!riderSelected || (addRiderMode !== 'today' && riderDays.length === 0) || saving}
                  className="flex-1 bg-[#004EA2] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
                  {saving ? '추가 중...' : addRiderMode === 'today' ? '오늘 배정' : '추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 백업 모달 ────────────────────────────────────── */}
      {backupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="font-bold text-[#1E293B]">차량 데이터 백업</h2>
              <button onClick={() => setBackupModal(false)} className="text-[#94A3B8] hover:text-[#1E293B] text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <button onClick={handleSaveBackup} disabled={backupSaving}
                className="w-full bg-[#1e3a5f] text-white py-2.5 rounded-lg font-medium hover:bg-[#2c5f8a] disabled:opacity-50 transition-colors">
                {backupSaving ? '저장 중...' : '💾 지금 시점 백업 저장'}
              </button>
              <p className="text-xs text-[#94A3B8]">백업에는 차량 스케줄(등원/하원 배차, 탑승 위치, 요일) 전체가 포함됩니다. 복원 시 현재 데이터를 덮어씁니다.</p>
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
                          <p className="text-xs text-[#94A3B8]">{new Date(b.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                        </div>
                        <button onClick={() => handleRestoreBackup(b.id, b.label)} disabled={saving}
                          className="text-xs text-[#2563EB] border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1 rounded-lg hover:bg-[#DBEAFE] disabled:opacity-50 transition-colors shrink-0">
                          복원
                        </button>
                        <button onClick={() => handleDeleteBackup(b.id)}
                          className="text-xs text-[#DC2626] border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 rounded-lg hover:bg-[#FEE2E2] transition-colors shrink-0">
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 일괄 시간 설정 모달 ────────────────────────── */}
      {bulkTimeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={() => setBulkTimeModal(null)}>
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-[#1E293B] text-sm">{bulkTimeModal.bus} 시간 일괄 설정</h3>
                <p className="text-[11px] text-[#64748B]">{bulkTimeModal.dir === 'arr' ? '등원' : '하원'} · 이 버스 탑승 학생 전체 적용</p>
              </div>
              <button onClick={() => setBulkTimeModal(null)} className="text-[#94A3B8] text-xl">✕</button>
            </div>
            <input
              type="time"
              value={bulkTime}
              onChange={e => setBulkTime(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] mb-3"
            />
            <p className="text-[10px] text-[#94A3B8] mb-3">기존에 개별 시간이 없는 학생에게만 이 시간이 기본값으로 표시됩니다. 개별 설정이 있는 학생은 개별값 유지.</p>
            <div className="flex gap-2">
              <button onClick={() => setBulkTimeModal(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={handleBulkSetTime} disabled={!bulkTime || saving}
                className="flex-1 bg-[#004EA2] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
                {saving ? '적용 중...' : '일괄 적용'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
