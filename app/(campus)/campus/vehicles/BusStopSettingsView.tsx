'use client'

// 호차별 정류장 세팅 (중계 전용) — 엑셀 배차표식.
// 상단 = 호차 선택 탭(호차별 정리). 호차 안에 세션별 섹션(유치부/매일반/3일반/화목반), 각 섹션 등원·하원 표.
// 표 = 시간 | 장소 | 탑승자 명단 | 작업 (정류장별 그룹 1행, 시간순).
//   시간·장소 = 셀 클릭 인라인 개별 수정(일괄 폼 없음). 좌표 = [좌표] 팝오버(주소검색/핀) 또는 [지도] 드래그.
//   학생 추가 검색 = 개설반 현황(enrolled) 소스. 학생명 = 분리 칩.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Bus { id: string; name: string; sort_order: number; capacity?: number | null; driver?: string | null; driver_phone?: string | null; safety?: string | null; safety_phone?: string | null; kt_name?: string | null; kt_phone?: string | null }
interface Student {
  student_id?: string
  class_id?: string
  name?: string
  location: string | null; pickup_time: string | null
  days?: string[]
  dayLocs?: Record<string, string>
  dayTimes?: Record<string, string>
}
interface StuRef { id: string; name: string; class_id: string; days: string[] }
const DAYS = ['월', '화', '수', '목', '금'] as const
interface TimeGroup { session_name: string; busMap: Record<string, Student[]> }
interface RegStop { stop_name: string; bus_name: string; direction: string; default_time: string | null }
interface MasterResp { buses: Bus[]; timeGroups: TimeGroup[]; registeredStops: RegStop[] }

type Dir = 'arr' | 'dep'
const ARR = '#3B82F6', DEP = '#DC2626'
const dirColor = (d: Dir) => (d === 'arr' ? ARR : DEP)
const dirLabel = (d: Dir) => (d === 'arr' ? '등원' : '하원')

// 세션 라벨 도출(전 캠퍼스 일반화) — page.tsx getRunLabel과 동일 규칙(미지정 캠퍼스는 session_name 그대로)
function runLabel(sessName: string, dir: Dir): string {
  const d = dir === 'arr' ? '등원' : '하원'
  if (sessName.includes('방과후')) {
    if (sessName.includes('유치부')) return `유치부 ${d}`
    return dir === 'dep' ? `매일반 ${d}` : `방과후 ${d}`
  }
  if (sessName.includes('매일반') || sessName.includes('5일')) return `매일반 ${d}`
  if (sessName.includes('월수금') || sessName.includes('3일')) return `3일반 ${d}`
  if (sessName.includes('화목') || sessName.includes('2일')) return `2일반 ${d}`
  if (sessName.includes('유치부')) return `유치부 ${d}`
  return `${sessName} ${d}`
}
// 방향 제거한 세션 베이스 라벨(= 세션 탭 키)
const sessBase = (sessName: string, dir: Dir) => runLabel(sessName, dir).replace(/ ?(등원|하원)$/, '')
function sessPriority(base: string): number {
  if (base.includes('방과후')) return 1.5
  if (base.includes('유치부')) return 1
  if (base.includes('매일반') || base.includes('5일')) return 2
  if (base.includes('월수금') || base.includes('3일')) return 3
  if (base.includes('화목') || base.includes('2일')) return 4
  return 9
}

function normalizeTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function stopDayTriples(s: Student): [string, string, string][] {
  const out: [string, string, string][] = []
  const days = s.days ?? []
  if (days.length) {
    for (const d of days) {
      const loc = (s.dayLocs?.[d] ?? s.location ?? '').trim()
      if (loc) out.push([loc, normalizeTime(s.dayTimes?.[d] ?? s.pickup_time), d])
    }
  } else {
    if (s.location) out.push([s.location.trim(), normalizeTime(s.pickup_time), ''])
    for (const [d, loc] of Object.entries(s.dayLocs ?? {})) if (loc) out.push([loc.trim(), normalizeTime(s.dayTimes?.[d] ?? s.pickup_time), d])
  }
  return out
}

interface Row { stop: string; time: string; sess: string[]; days: string[]; students: StuRef[]; hasStudents: boolean }
interface OvRow { student_id: string; bus_name: string | null; location: string | null; pickup_time: string | null; is_absent: boolean; direction: string; name: string }
const GRID = 'grid grid-cols-[46px_1fr_44px_116px_minmax(0,2.2fr)]'  // 시간 | 장소 | 탑승인원 | 작업(2x2) | 탑승자명단

export default function BusStopSettingsView({ campusName, onLocateStop, restricted = false }: { campusName?: string; onLocateStop?: (stop: string, bus: string, init?: { lat: number; lng: number }) => void; restricted?: boolean }) {
  void campusName
  const ro = restricted  // 차량선생님(여사님): 직접수정 금지 → 보기 + 학생추가는 변경신청
  const today = new Date()
  const todayStr = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')

  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [selectedBus, setSelectedBus] = useState('')
  const [msg, setMsg] = useState('')
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selDate, setSelDate] = useState(todayStr)  // 탑승인원 계산 기준 날짜(달력)
  const [selSession, setSelSession] = useState<string>('')  // 데스크톱 세션 탭(동적 라벨)
  // 인라인 셀 편집
  const [cellEdit, setCellEdit] = useState<{ key: string; field: 'time' | 'name' } | null>(null)
  const [cellVal, setCellVal] = useState('')
  // 좌표 팝오버
  const [coordKey, setCoordKey] = useState<string | null>(null)
  const [coordDraft, setCoordDraft] = useState<{ lat: string; lng: string; addr: string }>({ lat: '', lng: '', addr: '' })
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoResults, setGeoResults] = useState<{ name: string; address?: string; lat: number; lng: number }[]>([])
  // 학생 추가
  const [addRiderKey, setAddRiderKey] = useState<string | null>(null)
  const [riderQ, setRiderQ] = useState('')
  const [riderResults, setRiderResults] = useState<{ id: string; name: string; english_name: string | null; class_id?: string }[]>([])
  // 새 정류장
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})
  const composing = useRef(false)  // 한글 IME 조합 중 검색 트리거 억제(자모 분해 방지)
  // 당일만 탑승(override) — 선택 날짜 기준, 날짜 바뀌면 재조회되어 사라짐
  const [overrides, setOverrides] = useState<{ arr: OvRow[]; dep: OvRow[] }>({ arr: [], dep: [] })
  const [addDayKey, setAddDayKey] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)  // 모바일=슬라이드 뷰(세션×방향 1장씩), 지도/좌표 숨김
  const [slideIdx, setSlideIdx] = useState(0)
  const slideRef = useRef<HTMLDivElement>(null)
  const [busEditOpen, setBusEditOpen] = useState(false)  // 히어로 호차설정 편집
  const [busEdit, setBusEdit] = useState({ driver: '', driver_phone: '', safety: '', safety_phone: '', capacity: '' })
  const [backupOpen, setBackupOpen] = useState(false)
  const [backups, setBackups] = useState<{ id: string; label: string; created_at?: string }[]>([])
  const [backupBusy, setBackupBusy] = useState<string | null>(null)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3200) }

  const load = useCallback(async () => {
    setLoading(true)
    const [arr, dep, cd] = await Promise.all([
      fetch('/api/campus/vehicles?direction=arr&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/vehicles?direction=dep&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/stop-coords').then(r => r.json()).catch(() => ({})),
    ]) as [MasterResp, MasterResp, { coords?: Record<string, { lat: number; lng: number }> }]
    setRaw({ arr, dep })
    setCoords(cd.coords ?? {})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const loadOverrides = useCallback(async (date: string) => {
    const j = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_overrides', date }),
    }).then(r => r.json()).catch(() => ({}))
    const all: OvRow[] = j.overrides ?? []
    setOverrides({ arr: all.filter(o => o.direction === 'arr'), dep: all.filter(o => o.direction === 'dep') })
  }, [])
  useEffect(() => { loadOverrides(selDate) }, [selDate, loadOverrides])
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setIsMobile(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const buses: Bus[] = useMemo(() => (raw ? (raw.arr.buses?.length ? raw.arr.buses : raw.dep.buses) ?? [] : []), [raw])
  useEffect(() => { if (buses.length && !buses.some(b => b.name === selectedBus)) setSelectedBus(buses[0].name) }, [buses, selectedBus])

  const buildDir = useCallback((flt: string, dir: Dir): Record<string, Row[]> => {
    if (!raw) return {}
    const resp = raw[dir]
    const cellByBus: Record<string, Record<string, { times: string[]; sess: Set<string>; days: Set<string>; stu: Map<string, { id: string; name: string; class_id: string; days: Set<string> }>; hasStudents: boolean }>> = {}
    const ensure = (bus: string, stop: string) => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { times: [], sess: new Set(), days: new Set(), stu: new Map(), hasStudents: false }
      return cellByBus[bus][stop]
    }
    for (const tg of resp.timeGroups ?? []) {
      if (sessBase(tg.session_name, dir) !== flt) continue
      for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
        for (const s of students) {
          for (const [stop, t, day] of stopDayTriples(s)) {
            if (!stop) continue
            const c = ensure(bus, stop)
            c.hasStudents = true
            c.sess.add(tg.session_name)
            if (s.name && s.student_id) {
              let e = c.stu.get(s.student_id)
              if (!e) { e = { id: s.student_id, name: s.name, class_id: s.class_id ?? '', days: new Set() }; c.stu.set(s.student_id, e) }
              if (day) e.days.add(day)
            }
            if (day) c.days.add(day)
            if (t) c.times.push(t)
          }
        }
      }
    }
    for (const rs of resp.registeredStops ?? []) {
      const c = ensure(rs.bus_name, rs.stop_name.trim())
      const t = normalizeTime(rs.default_time)
      if (t && c.times.length === 0) c.times.push(t)
    }
    const out: Record<string, Row[]> = {}
    for (const bus of buses.map(b => b.name)) {
      const cells = cellByBus[bus] ?? {}
      out[bus] = Object.entries(cells)
        .map(([stop, c]) => ({
          stop, time: c.times.length ? c.times.slice().sort()[0] : '', sess: [...c.sess],
          days: DAYS.filter(d => c.days.has(d)),
          students: [...c.stu.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .map(e => ({ id: e.id, name: e.name, class_id: e.class_id, days: DAYS.filter(d => e.days.has(d)) })),
          hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, buses])

  // 세션 탭(동적) = 데이터의 세션 베이스 라벨들
  const sessions = useMemo(() => {
    if (!raw) return [] as string[]
    const set = new Set<string>()
    for (const dir of ['arr', 'dep'] as Dir[]) for (const tg of raw[dir].timeGroups ?? []) if (tg.session_name) set.add(sessBase(tg.session_name, dir))
    return [...set].sort((a, b) => sessPriority(a) - sessPriority(b) || a.localeCompare(b, 'ko'))
  }, [raw])
  const built = useMemo(() => {
    const res = {} as Record<string, { arr: Record<string, Row[]>; dep: Record<string, Row[]> }>
    for (const f of sessions) res[f] = { arr: buildDir(f, 'arr'), dep: buildDir(f, 'dep') }
    return res
  }, [buildDir, sessions])
  const rowsOf = (flt: string, dir: Dir, bus: string) => built[flt]?.[dir]?.[bus] ?? []

  const dkey = (dir: Dir, bus: string, stop: string) => `${dir}|${bus}|${stop}`

  // ── 저장 헬퍼 ──
  async function postRegistered(bus: string, stop: string, dir: Dir, time: string) {
    const res = await fetch('/api/campus/registered-stops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir, default_time: time || null }),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`기본값:${e.error ?? res.status}`) }
  }
  async function pushTime(bus: string, stop: string, dir: Dir, sessionName: string, time: string): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_update_location_time', bus_name: bus, location: stop, direction: dir, session_name: sessionName, new_time: time }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`시간:${d.error ?? res.status}`)
    return d.updated ?? 0
  }
  async function removeDayApi(bus: string, stop: string, dir: Dir, sessionName: string, days: string[]): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_stop_days', bus_name: bus, location: stop, direction: dir, session_name: sessionName, days }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`요일:${d.error ?? res.status}`)
    return d.updated ?? 0
  }
  async function renameApi(oldName: string, newName: string, coord?: { lat: number; lng: number }) {
    const res = await fetch('/api/campus/stop-coords', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName, ...(coord ? { lat: coord.lat, lng: coord.lng } : {}), force: true }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.ok === false) throw new Error(`이름/좌표:${j.error ?? res.status}`)
    return j as { ok?: boolean; result?: { coordsDeleted?: number; enrChanged?: number; regUpdated?: number } }
  }

  // ── 인라인 개별 저장 ──
  async function saveTime(dir: Dir, bus: string, r: Row, newTime: string) {
    if (newTime === r.time) return
    const k = dkey(dir, bus, r.stop); setSavingKey(k)
    try {
      await postRegistered(bus, r.stop, dir, newTime)
      let n = 0
      if (newTime) for (const sess of r.sess) n += await pushTime(bus, r.stop, dir, sess, newTime)
      flash(`'${r.stop}' 시간 ${newTime || '지움'} 저장 (학생 ${n}명)`); load()
    } catch (e) { alert(`시간 저장 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function saveName(dir: Dir, bus: string, r: Row, newName: string) {
    const nm = newName.trim()
    if (!nm) { flash('이름을 입력하세요'); return }
    if (nm === r.stop) { flash('변경 없음(이름 동일)'); return }
    const k = dkey(dir, bus, r.stop); setSavingKey(k)
    try {
      const j = await renameApi(r.stop, nm)
      const rr = j?.result ?? {}
      const changed = (rr.coordsDeleted ?? 0) + (rr.enrChanged ?? 0) + (rr.regUpdated ?? 0)
      flash(changed ? `정류장명 → '${nm}' 변경(${changed}건)` : `'${nm}' 저장 — 반영 대상 0(이름 불일치 가능)`)
      load()
    } catch (e) { alert(`이름 변경 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function geocode() {
    if (!coordDraft.addr.trim()) return
    setGeoBusy(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(coordDraft.addr.trim())}`)
      const j = await res.json().catch(() => ({}))
      const list = (j.results ?? []) as { name: string; address?: string; lat: number; lng: number }[]
      setGeoResults(list)
      if (!list.length) flash('검색 결과 없음')
    } finally { setGeoBusy(false) }
  }

  async function removeDay(dir: Dir, bus: string, r: Row, day: string) {
    if (!confirm(`${bus} '${r.stop}' ${dirLabel(dir)} ${day}요일 탑승을 제거할까요?`)) return
    const k = dkey(dir, bus, r.stop); setSavingKey(k)
    try {
      let n = 0
      for (const sess of r.sess) n += await removeDayApi(bus, r.stop, dir, sess, [day])
      flash(`${day}요일 제거됨 · 학생 ${n}명`); load()
    } catch (e) { alert(`요일 제거 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function removeRider(dir: Dir, bus: string, stop: string, stu: StuRef) {
    if (!stu.class_id) { alert('학생 반 정보 없음 — 새로고침'); return }
    if (!confirm(`'${stu.name}' 학생을 ${bus} ${dirLabel(dir)}에서 뺄까요?`)) return
    setSavingKey('rm|' + dir + stu.id)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_rider', student_id: stu.id, class_id: stu.class_id, direction: dir }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      flash(`'${stu.name}' 제외됨`); load()
    } catch (e) { alert(`제외 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function searchRiders(qstr: string) {
    if (!qstr.trim()) { setRiderResults([]); return }
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search_students', query: qstr.trim(), source: 'roster' }),
    })
    const d = await res.json().catch(() => ({}))
    setRiderResults((d.students ?? []).slice(0, 12))
  }
  async function addRider(dir: Dir, bus: string, r: Row, stu: { id: string; name: string; class_id?: string }, sess?: string) {
    if (ro) return reqAddRider(dir, bus, r, stu, sess)  // 여사님: 직접추가 대신 변경신청
    setSavingKey('add-rider|' + dir + stu.id)
    try {
      // 신규 정류장(학생0)은 r.sess가 비어 세션 유실 → 현재 세션 탭(sess)으로 배정 (엉뚱한 세션 enrollment 갱신 방지)
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_rider', student_id: stu.id, date: todayStr, direction: dir,
          bus_name: bus, pickup_location: r.stop, pickup_time: r.time || undefined,
          days: r.days.length ? r.days : [...DAYS], session_name: r.sess[0] ?? sess ?? undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      setRiderQ(''); setRiderResults([])
      flash(`'${stu.name}' 추가됨`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  // 여사님(restricted) 학생추가 = 변경신청(승인 대기) — submit_change_request
  async function reqAddRider(dir: Dir, bus: string, r: Row, stu: { id: string; name: string; class_id?: string }, _sess?: string) {
    void _sess
    if (!stu.class_id) { alert('학생 반 정보 없음 — 다시 검색해 주세요.'); return }
    setSavingKey('req|' + stu.id)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_change_request', student_id: stu.id, student_name: stu.name, class_id: stu.class_id,
          direction: dir, from_bus: null, to_bus: bus, days: r.days.length ? r.days : [...DAYS],
          location: r.stop, pickup_time: r.time || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      setRiderQ(''); setRiderResults([]); setAddRiderKey(null)
      flash(`'${stu.name}' 추가 신청 접수 — 데스크 승인 후 반영`)
    } catch (e) { alert(`신청 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  // ── 백업/복원 (학생설정 탭에서 이관) — 서버 /api/campus/backup ──
  async function loadBackups() {
    const d = await fetch('/api/campus/backup').then(r => r.json()).catch(() => ({}))
    setBackups(d.backups ?? [])
  }
  async function createBackup() {
    setBackupBusy('save')
    try {
      const label = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      const d = await fetch('/api/campus/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', label }) }).then(r => r.json())
      if (d.ok && d.backup) setBackups(prev => [d.backup, ...prev]); else if (d.error) throw new Error(d.error)
      flash('백업 저장됨')
    } catch (e) { alert(`백업 실패: ${(e as Error).message}`) } finally { setBackupBusy(null) }
  }
  async function restoreBackup(id: string, label: string) {
    if (!confirm(`"${label}" 시점으로 복원할까요?\n현재 차량 스케줄이 덮어써집니다.`)) return
    setBackupBusy('restore|' + id)
    try {
      const d = await fetch('/api/campus/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', backup_id: id }) }).then(r => r.json())
      if (!d.ok) throw new Error(d.error ?? '복원 실패')
      setBackupOpen(false); flash('복원 완료'); load(); loadOverrides(selDate)
    } catch (e) { alert(`복원 실패: ${(e as Error).message}`) } finally { setBackupBusy(null) }
  }
  async function deleteBackup(id: string) {
    if (!confirm('이 백업을 삭제할까요?')) return
    setBackupBusy('del|' + id)
    try {
      await fetch('/api/campus/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', backup_id: id }) })
      setBackups(prev => prev.filter(b => b.id !== id))
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setBackupBusy(null) }
  }

  // 호차 설정 저장(기사·차량정원·안전선생님) — update_bus (kt는 기존값 보존)
  async function saveBus(b: Bus) {
    setSavingKey('bus|' + b.id)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_bus', bus_id: b.id, name: b.name, force: true,
          driver: busEdit.driver, driver_phone: busEdit.driver_phone,
          safety: busEdit.safety, safety_phone: busEdit.safety_phone,
          kt_name: b.kt_name ?? '', kt_phone: b.kt_phone ?? '',
          capacity: busEdit.capacity,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      setBusEditOpen(false); flash(`${b.name} 설정 저장`); load()
    } catch (e) { alert(`호차 설정 저장 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  // 당일만 탑승 추가 (override, 선택 날짜 1회) — 개설반 검색, 다른 호차 중복 가능, 날짜 바뀌면 사라짐
  async function addDayRider(dir: Dir, bus: string, r: Row, stu: { id: string; name: string }) {
    // 그날 이미 다른 호차에 배정돼 있으면 경고 → 예/아니오 (예=그날만 이 호차로 이동, 원래 호차엔 그날 빠짐 = override)
    const [yy, mm, dd] = selDate.split('-').map(Number)
    const wd = yy ? (({ 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' } as Record<number, string>)[new Date(yy, mm - 1, dd).getDay()] ?? '') : ''
    let existBus: string | null = null
    const ov = overrides[dir].find(o => o.student_id === stu.id && !o.is_absent)
    if (ov?.bus_name) existBus = ov.bus_name
    else if (raw && wd) {
      for (const tg of raw[dir].timeGroups ?? []) {
        for (const [bn, sts] of Object.entries(tg.busMap ?? {})) {
          if (sts.some(s => s.student_id === stu.id && (s.days ?? []).includes(wd))) { existBus = bn; break }
        }
        if (existBus) break
      }
    }
    if (existBus && existBus !== bus) {
      if (!confirm(`'${stu.name}' 학생은 ${selDate}${wd ? `(${wd})` : ''} 이미 '${existBus}'에 배정돼 있습니다.\n\n${selDate} 그날만 '${bus}'로 이동시킬까요?\n(원래 '${existBus}'에서는 그날 빠집니다)`)) return
    }
    setSavingKey('dayadd|' + stu.id)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_override', student_id: stu.id, date: selDate, direction: dir, bus_name: bus, location: r.stop, pickup_time: r.time || null, is_absent: false }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      setRiderQ(''); setRiderResults([]); setAddDayKey(null)
      flash(existBus && existBus !== bus ? `'${stu.name}' ${selDate} '${bus}'로 이동` : `'${stu.name}' ${selDate} 당일 탑승 추가`)
      loadOverrides(selDate)
    } catch (e) { alert(`당일 추가 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function removeDayRider(dir: Dir, studentId: string, name: string) {
    if (!confirm(`'${name}' ${selDate} 당일 탑승을 취소할까요?`)) return
    setSavingKey('dayrm|' + studentId)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_override', student_id: studentId, date: selDate, direction: dir }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      flash(`'${name}' 당일 탑승 취소`); loadOverrides(selDate)
    } catch (e) { alert(`취소 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  // 학생별 요일 토글 (이름 아래 요일 체크) — 켜기=add_rider 단일요일, 끄기=remove_rider_day
  async function toggleRiderDay(dir: Dir, bus: string, r: Row, stu: StuRef, day: string, on: boolean) {
    setSavingKey('sday|' + stu.id + day)
    try {
      if (on) {
        const res = await fetch('/api/campus/vehicles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove_rider_day', student_id: stu.id, direction: dir, day, bus_name: bus, date: todayStr }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
        flash(`'${stu.name}' ${day}요일 제외`)
      } else {
        const res = await fetch('/api/campus/vehicles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_rider', student_id: stu.id, date: todayStr, direction: dir,
            bus_name: bus, pickup_location: r.stop, pickup_time: r.time || undefined,
            days: [day], session_name: r.sess[0] ?? undefined,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
        flash(`'${stu.name}' ${day}요일 추가`)
      }
      load()
    } catch (e) { alert(`요일 변경 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function addNewStop(dir: Dir, bus: string, flt: string) {
    const bk = `${dir}|${bus}|${flt}`; const a = addStop[bk]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSavingKey('addstop|' + bk)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [bk]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function deleteStop(dir: Dir, bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' (${dirLabel(dir)}) 정류장을 삭제할까요?`)) return
    setSavingKey('del|' + dkey(dir, bus, stop))
    try {
      await fetch('/api/campus/registered-stops', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir }),
      })
      flash(`'${stop}' 삭제됨`); load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  // 배차표 인쇄 — 호차당 1페이지(넘치면 zoom 축소). 컬럼 정렬 = table-layout:fixed+colgroup
  function printBuses(busNames: string[]) {
    const list = busNames.filter(Boolean)
    if (!list.length) return
    const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c])
    const pageHtml = (busName: string) => {
      const sections = sessions.map(f => (['arr', 'dep'] as Dir[]).map(dir => {
        const rows = rowsOf(f, dir, busName)
        if (!rows.length) return ''
        const body = rows.map(r => {
          const adds = ovAdds(dir, busName, r.stop, r.students)
          const riders = r.students.filter(s => ridesHere(s, r, dir, busName))
          const cnt = riders.length + adds.length
          const dayTag = r.days.length && r.days.length < 5 ? ` <span class="d">(${r.days.join('')})</span>` : ''
          const parts = riders.map((s, i) => `<span class="nm"><b>${i + 1}</b> ${esc(s.name)}</span>`)
            .concat(adds.map(o => `<span class="nm ov">[당일] ${esc(o.name)}</span>`))
          const names = parts.length ? parts.join('') : '<span class="d">탑승 없음</span>'
          return `<tr><td class="t">${esc(r.time || '-')}</td><td class="p">${esc(r.stop)}${dayTag}</td><td class="c">${cnt}</td><td class="s">${names}</td></tr>`
        }).join('')
        const col = dir === 'arr' ? ARR : DEP
        return `<div class="blk"><div class="h3" style="border-color:${col};color:${col}">${f} · ${dirLabel(dir)} <span class="d">정류장 ${rows.length}</span></div>`
          + `<table><colgroup><col style="width:42px"><col style="width:140px"><col style="width:30px"><col></colgroup>`
          + `<thead><tr><th>시간</th><th>장소</th><th>인원</th><th>탑승자 명단</th></tr></thead><tbody>${body}</tbody></table></div>`
      }).join('')).join('')
      return `<section class="page"><h2>${esc(busName)} 정류장 배차표 <span class="dt">(${selDate}${selDay ? ' ' + selDay : ''} 기준)</span></h2>${sections || '<p>데이터 없음</p>'}</section>`
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>배차표 인쇄</title><style>`
      + `@page{size:A4;margin:10mm}html,body{margin:0}`
      + `body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#111}`
      + `.page{width:190mm;box-sizing:border-box;transform-origin:top left}`
      + `.page + .page{page-break-before:always}`
      + `h2{font-size:15px;margin:0 0 8px}.dt{font-size:11px;color:#666;font-weight:normal}`
      + `.blk{margin-bottom:6px}.h3{font-size:11px;font-weight:bold;border-bottom:1.5px solid;padding-bottom:1px;margin:8px 0 3px}`
      + `table{width:100%;border-collapse:collapse;table-layout:fixed}`
      + `th,td{border:1px solid #aaa;padding:2px 4px;text-align:left;vertical-align:top;font-size:10px;word-break:break-all}`
      + `th{background:#eee;font-size:9px;text-align:center}td.t{text-align:center;font-weight:bold;white-space:nowrap}td.c{text-align:center;font-weight:bold}`
      + `td.p{font-weight:600}td.s .nm{display:inline-block;margin-right:8px;white-space:nowrap}td.s .nm b{color:#888;font-weight:normal;font-size:8px}td.s .nm.ov{color:#9A3412;font-weight:bold}`
      + `.d{color:#888;font-weight:normal}thead{display:table-header-group}`
      + `</style></head><body>${list.map(pageHtml).join('')}</body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('팝업이 차단됨 — 팝업 허용 후 다시'); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => {
      try {
        const availH = 1035  // A4 세로 프린트영역 ≈ (297-20)mm px. zoom=실제 리플로우(Chrome)
        w.document.querySelectorAll<HTMLElement>('.page').forEach(p => {
          const h = p.scrollHeight
          if (h > availH) (p.style as CSSStyleDeclaration & { zoom?: string }).zoom = String((availH / h).toFixed(3))
        })
      } catch { /* noop */ }
      setTimeout(() => { try { w.print() } catch { /* noop */ } }, 120)
    }, 350)
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  const inputCls = 'border border-[#E2E8F0] rounded px-1.5 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]'
  const q = search.trim().toLowerCase()
  // 선택 날짜 → 요일(월~금). 주말/미선택이면 '' (요일무관=전체 인원)
  const selDay = (() => {
    const [y, m, d] = selDate.split('-').map(Number)
    if (!y || !m || !d) return ''
    return ({ 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' } as Record<number, string>)[new Date(y, m - 1, d).getDay()] ?? ''
  })()
  const ridesOn = (s: StuRef, r: Row) => !selDay || (s.days.length ? s.days : r.days).includes(selDay)
  const normStopC = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const sameStopC = (a: string | null | undefined, b: string | null | undefined) => normStopC(a) === normStopC(b)
  // 학생별 그날 override(있으면 그날은 override가 우선 = 그날만 이동/결석)
  const ovByStudent = (dir: Dir) => { const m = new Map<string, OvRow>(); for (const o of overrides[dir]) if (!m.has(o.student_id)) m.set(o.student_id, o); return m }
  // 이 학생이 그날 이 (호차·정류장)에서 실제 타는가 — override 있으면 override 위치만, 없으면 주간요일
  const ridesHere = (s: StuRef, r: Row, dir: Dir, bus: string) => {
    const ov = ovByStudent(dir).get(s.id)
    if (ov?.is_absent) return false
    if (ov && !(ov.bus_name === bus && sameStopC(ov.location, r.stop))) return false  // 그날 다른 호차/정류장으로 이동됨
    return ridesOn(s, r)
  }
  // 당일추가(이동해 들어온) 학생 — 단, 이 정류장 주간명단에 이미 있으면 제외(중복 방지)
  const ovAdds = (dir: Dir, bus: string, stop: string, weekly: StuRef[] = []) =>
    overrides[dir].filter(o => !o.is_absent && o.bus_name === bus && sameStopC(o.location, stop) && !weekly.some(s => s.id === o.student_id))
  // 그 날짜 실제 탑승 인원 = 주간(이동/결석 제외) + 당일 이동 들어온 학생
  const dayCount = (r: Row, dir: Dir, bus: string) =>
    r.students.filter(s => ridesHere(s, r, dir, bus)).length + ovAdds(dir, bus, r.stop, r.students).length
  // 호차 해당일 총 탑승(방향별) = 전 세션 합
  const busTotalFor = (busName: string, dir: Dir) => sessions.reduce((n, f) => n + rowsOf(f, dir, busName).reduce((m, r) => m + dayCount(r, dir, busName), 0), 0)

  const startCell = (k: string, field: 'time' | 'name', cur: string) => { setCellEdit({ key: k, field }); setCellVal(cur) }
  const commitCell = (dir: Dir, bus: string, r: Row) => {
    if (!cellEdit) return
    const { field } = cellEdit; const val = cellVal
    setCellEdit(null)
    if (field === 'time') saveTime(dir, bus, r, val)
    else saveName(dir, bus, r, val)
  }

  // 엑셀 배차표 표 행 (정류장 그룹)
  const StopRow = ({ dir, bus, r, i, flt }: { dir: Dir; bus: string; r: Row; i: number; flt: string }) => {
    const k = dkey(dir, bus, r.stop)
    const busy = savingKey === k
    const editing = cellEdit?.key === k
    const adding = addRiderKey === k
    const dayAdding = addDayKey === k
    const coording = coordKey === k
    const hasCoord = !!coords[r.stop]
    const color = dirColor(dir)
    const adds = ovAdds(dir, bus, r.stop, r.students)
    const cnt = dayCount(r, dir, bus)
    return (
      <div className="border-b-2 border-[#CBD5E1] last:border-0" style={{ borderLeft: `3px solid ${color}` }}>
        <div className={`${GRID} items-center text-[11px] ${i % 2 === 0 ? 'bg-white' : 'bg-[#F1F5F9]'} hover:bg-[#EAF2FB]`}>
          {/* 시간 (클릭 → 아래 편집행) */}
          <div className="px-1 py-0.5 border-r border-[#F1F5F9] text-center">
            <button onClick={() => { if (ro) return; startCell(k, 'time', r.time) }} title={ro ? '' : '클릭해 시간 변경'}
              className={`font-bold tabular-nums ${ro ? '' : 'hover:underline'} ${editing && cellEdit!.field === 'time' ? 'ring-1 ring-[#004EA2] rounded px-1' : ''}`} style={{ color }}>{r.time || '–'}</button>
          </div>
          {/* 장소 (클릭 → 아래 편집행) + 요일 */}
          <div className="px-1.5 py-0.5 border-r border-[#F1F5F9] min-w-0">
            <button onClick={() => { if (ro) return; startCell(k, 'name', r.stop) }} title={ro ? '' : '클릭해 정류장명 변경'}
              className={`font-semibold text-[#1E293B] truncate block w-full text-left ${ro ? '' : 'hover:underline'} ${editing && cellEdit!.field === 'name' ? 'ring-1 ring-[#004EA2] rounded px-1' : ''}`}>
              {r.stop}{!hasCoord && <span className="text-[#F59E0B] font-normal"> *</span>}</button>
            {r.hasStudents && (
              <div className="flex gap-0.5 mt-0.5" title="정류장 운행요일 — 켜진 요일 누르면 해당 요일 전체 탑승 제거">
                {DAYS.map(day => {
                  const on = r.days.includes(day)
                  return (
                    <button key={day} onClick={() => on && !ro && removeDay(dir, bus, r, day)} disabled={!on || busy || ro}
                      title={on ? (ro ? `${day}요일 운행` : `${day}요일 운행 — 누르면 정류장 전체 제거`) : `${day}요일 미운행`}
                      className="text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center disabled:cursor-default"
                      style={on ? { background: color, color: '#fff' } : { background: '#F1F5F9', color: '#CBD5E1' }}>{day}</button>
                  )
                })}
              </div>
            )}
          </div>
          {/* 탑승인원 (선택 날짜 기준) */}
          <div className="px-0.5 py-0.5 border-r border-[#F1F5F9] flex flex-col items-center justify-center">
            <span className="text-[15px] font-extrabold leading-none tabular-nums" style={{ color }}>{cnt}</span>
            {selDay && cnt !== r.students.length && <span className="text-[8px] text-[#94A3B8] mt-0.5">주간 {r.students.length}</span>}
          </div>
          {/* 작업 — 여사님(ro)은 학생추가(신청)만 */}
          <div className="px-1 py-1 grid grid-cols-2 gap-0.5 content-start text-[9px] border-r border-[#F1F5F9]">
            <button onClick={() => { setAddRiderKey(a => a === k ? null : k); setAddDayKey(null); setRiderQ(''); setRiderResults([]) }}
              title={ro ? '학생 추가 신청(데스크 승인)' : '상시 탑승 추가(개설반, 요일 반복)'} className={`font-bold border rounded px-1 py-px ${ro ? 'col-span-2' : ''} ${adding ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'text-[#16A34A] border-[#16A34A]'}`}>{ro ? '학생추가 신청' : '학생+'}</button>
            {!ro && <button onClick={() => { setAddDayKey(a => a === k ? null : k); setAddRiderKey(null); setRiderQ(''); setRiderResults([]) }}
              title={`${selDate} 당일만 탑승(1회, 개설반)`} className={`font-bold border rounded px-1 py-px ${dayAdding ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'text-[#EA580C] border-[#EA580C]'}`}>당일+</button>}
            {!ro && onLocateStop
              ? <button onClick={() => onLocateStop(r.stop, bus)} title={hasCoord ? '시스템 지도로 이동 → 핀 드래그' : '지도에서 핀 찍어 좌표 설정'}
                  className="font-bold border rounded px-1 py-px bg-[#004EA2] text-white border-[#004EA2]">지도</button>
              : null}
            {!ro && <button onClick={() => { if (coording) setCoordKey(null); else { setCoordKey(k); setGeoResults([]); const c = coords[r.stop]; setCoordDraft({ lat: c ? String(c.lat) : '', lng: c ? String(c.lng) : '', addr: '' }) } }}
              title={hasCoord ? '좌표 설정됨 — 수정' : '좌표 없음 — 입력 필요'}
              className={`font-bold border rounded px-1 py-px ${coording ? 'bg-[#EA580C] text-white border-[#EA580C]' : hasCoord ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'text-[#B45309] border-[#F59E0B] bg-[#FEF3C7] animate-pulse'}`}>{hasCoord ? '좌표' : '좌표!'}</button>}
            {!ro && !r.hasStudents && adds.length === 0 && <button onClick={() => deleteStop(dir, bus, r.stop)} title="정류장 삭제" className="col-span-2 text-[#CBD5E1] hover:text-[#EF4444] font-bold">정류장 삭제</button>}
          </div>
          {/* 탑승자 명단 (칩) — 요일 미탑승/결석은 흐림, 당일추가는 주황 */}
          <div className="px-1.5 py-0.5 flex flex-wrap gap-1 items-center min-w-0">
            {r.students.map((s, si) => {
              const sd = s.days.length ? s.days : r.days
              const rides = ridesHere(s, r, dir, bus)
              return (
                <span key={s.id} className="inline-flex flex-col gap-0.5 bg-[#F1F5F9] rounded px-1 py-0.5 whitespace-nowrap" style={{ opacity: rides ? 1 : 0.4 }}>
                  <span className="flex items-center gap-0.5 text-[11px] text-[#334155]">
                    <span className="text-[8px] text-[#94A3B8]">{si + 1}</span><span className={`font-bold ${rides ? '' : 'line-through'}`}>{s.name}</span>
                    {!ro && <button onClick={() => removeRider(dir, bus, r.stop, s)} title="빼기(상시)" className="text-[#B6C0CC] hover:text-[#EF4444] leading-none ml-0.5">×</button>}
                  </span>
                  {!ro && <span className="flex gap-0.5" title="학생 운행요일 — 눌러 켜고/끄기">
                    {DAYS.map(day => {
                      const on = sd.includes(day)
                      return (
                        <button key={day} onClick={() => toggleRiderDay(dir, bus, r, s, day, on)} disabled={savingKey === 'sday|' + s.id + day}
                          title={`${s.name} ${day}요일 ${on ? '탑승 — 눌러 제외' : '미탑승 — 눌러 추가'}`}
                          className="text-[7px] font-bold rounded-full w-2.5 h-2.5 flex items-center justify-center"
                          style={on ? { background: color, color: '#fff' } : { background: '#E2E8F0', color: '#94A3B8' }}>{day}</button>
                      )
                    })}
                  </span>}
                </span>
              )
            })}
            {adds.map(o => (
              <span key={'ov' + o.student_id} className="inline-flex items-center gap-0.5 bg-[#FFEDD5] border border-[#FED7AA] rounded px-1 py-0.5 text-[11px] text-[#9A3412] whitespace-nowrap" title={`${selDate} 당일만 탑승`}>
                <span className="text-[7px] font-bold bg-[#EA580C] text-white rounded px-0.5">당일</span>{o.name}
                {!ro && <button onClick={() => removeDayRider(dir, o.student_id, o.name)} title="당일 탑승 취소" className="text-[#EA580C] hover:text-[#EF4444] leading-none">×</button>}
              </span>
            ))}
            {r.students.length === 0 && adds.length === 0 && <span className="text-[10px] text-[#CBD5E1]">탑승 없음</span>}
          </div>
        </div>

        {/* 시간/장소 편집행 (넓은 입력 + 저장·취소, 자동저장 없음) */}
        {editing && (
          <div className="px-2 py-1.5 bg-[#FFFBEB] border-t border-[#FDE68A] flex items-center gap-2">
            {cellEdit!.field === 'time' ? (
              <>
                <span className="text-[11px] font-bold text-[#92400E]">시간</span>
                <input type="time" autoFocus value={cellVal} onChange={e => setCellVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitCell(dir, bus, r); else if (e.key === 'Escape') setCellEdit(null) }}
                  className="w-36 border border-[#E2E8F0] rounded px-2 py-1 text-[13px]" />
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold text-[#92400E]">정류장명</span>
                <input autoFocus value={cellVal} onChange={e => setCellVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitCell(dir, bus, r); else if (e.key === 'Escape') setCellEdit(null) }}
                  className="w-60 border border-[#E2E8F0] rounded px-2 py-1 text-[13px]" />
              </>
            )}
            <button onClick={() => commitCell(dir, bus, r)} disabled={busy}
              className="text-[12px] bg-[#004EA2] text-white font-bold px-3 py-1 rounded disabled:opacity-40">{busy ? '저장…' : '저장'}</button>
            <button onClick={() => setCellEdit(null)}
              className="text-[12px] border border-[#E2E8F0] text-[#64748B] font-semibold px-3 py-1 rounded">취소</button>
          </div>
        )}

        {/* 학생 추가 검색 (개설반) */}
        {adding && (
          <div className="relative px-2 py-1 bg-[#F0FDF4] border-t border-[#DCFCE7]">
            <input autoFocus value={riderQ}
              onChange={e => { const v = e.target.value; setRiderQ(v); if (!composing.current) searchRiders(v) }}
              onCompositionStart={() => { composing.current = true }}
              onCompositionEnd={e => { composing.current = false; searchRiders(e.currentTarget.value) }}
              placeholder="개설반 학생 이름 검색" className={`w-64 max-w-full ${inputCls}`} />
            {riderResults.length > 0 && (
              <div className="absolute z-20 left-2 mt-0.5 w-64 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-48 overflow-auto">
                {riderResults.map(s => (
                  <button key={s.id} onClick={() => addRider(dir, bus, r, s, flt)} className="w-full text-left px-2 py-1.5 hover:bg-[#EAF2FB] text-[12px]">
                    {s.name}{s.english_name ? <span className="text-[#94A3B8]"> ({s.english_name})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 당일만 탑승 검색 (개설반, 그 날짜 1회) */}
        {dayAdding && (
          <div className="relative px-2 py-1 bg-[#FFF7ED] border-t border-[#FED7AA]">
            <span className="text-[10px] font-bold text-[#9A3412] mr-1">{selDate} 당일 추가:</span>
            <input autoFocus value={riderQ}
              onChange={e => { const v = e.target.value; setRiderQ(v); if (!composing.current) searchRiders(v) }}
              onCompositionStart={() => { composing.current = true }}
              onCompositionEnd={e => { composing.current = false; searchRiders(e.currentTarget.value) }}
              placeholder="개설반 학생 이름 검색" className={`w-56 max-w-full ${inputCls}`} />
            {riderResults.length > 0 && (
              <div className="absolute z-20 left-2 mt-0.5 w-64 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-48 overflow-auto">
                {riderResults.map(s => (
                  <button key={s.id} onClick={() => addDayRider(dir, bus, r, s)} className="w-full text-left px-2 py-1.5 hover:bg-[#FFF7ED] text-[12px]">
                    {s.name}{s.english_name ? <span className="text-[#94A3B8]"> ({s.english_name})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 좌표 팝오버: 주소검색 → 결과 클릭 → 지도에 핀 → 드래그로 정확히 → 저장 */}
        {coording && (
          <div className="px-2 py-1.5 bg-[#F8FAFC] border-t border-[#EEF2F7] space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#64748B]">① 주소검색</span>
              <input autoFocus value={coordDraft.addr} onChange={e => setCoordDraft(d => ({ ...d, addr: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') geocode() }} placeholder="주소·건물명·아파트" className={`w-56 ${inputCls}`} />
              <button onClick={geocode} disabled={geoBusy || !coordDraft.addr.trim()} className="text-[11px] font-bold text-white bg-[#004EA2] rounded px-2 py-1 disabled:opacity-40">{geoBusy ? '…' : '검색'}</button>
              {onLocateStop && <button onClick={() => { onLocateStop(r.stop, bus); setCoordKey(null); setGeoResults([]) }}
                className="text-[10px] font-bold text-[#004EA2] border border-[#004EA2] rounded px-2 py-1">주소없이 지도에서 직접</button>}
            </div>
            {geoResults.length > 0 && (
              <div className="border border-[#E2E8F0] rounded-lg bg-white max-h-44 overflow-auto divide-y divide-[#F1F5F9]">
                <div className="px-2 py-1 text-[10px] font-bold text-[#64748B] bg-[#F8FAFC]">② 정확한 위치 클릭 → 지도에 핀이 찍힘 (끌어 조정 후 저장)</div>
                {geoResults.map((g, gi) => (
                  <button key={gi} onClick={() => { onLocateStop?.(r.stop, bus, { lat: g.lat, lng: g.lng }); setCoordKey(null); setGeoResults([]) }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[#EAF2FB]">
                    <div className="text-[12px] font-bold text-[#1E293B]">{g.name}</div>
                    {g.address && <div className="text-[10px] text-[#94A3B8]">{g.address}</div>}
                  </button>
                ))}
              </div>
            )}
            <div className="text-[10px] text-[#94A3B8]">주소검색 → 결과 클릭하면 지도에 핀이 찍힘 → 핀을 끌어 정확히 맞추고 저장</div>
          </div>
        )}
      </div>
    )
  }

  // 세션 섹션 안의 방향 표 (등원/하원)
  const DirTable = ({ dir, bus, flt }: { dir: Dir; bus: string; flt: string }) => {
    const all = rowsOf(flt, dir, bus)
    const rows = q ? all.filter(r => r.stop.toLowerCase().includes(q)) : all
    if (q && rows.length === 0) return null
    const color = dirColor(dir)
    const bk = `${dir}|${bus}|${flt}`
    const studentN = rows.reduce((n, r) => n + dayCount(r, dir, bus), 0)
    const add = addStop[bk] ?? { stop: '', time: '' }
    return (
      <div>
        <div className="flex items-center gap-2 mb-0.5 pb-0.5" style={{ borderBottom: `2px solid ${color}` }}>
          <span className="text-[13px] font-extrabold" style={{ color }}>{dirLabel(dir)}</span>
          <span className="text-[11px] font-bold text-white rounded px-1.5 py-0.5" style={{ background: color }}>정류장 {rows.length}</span>
          <span className="text-[11px] font-bold rounded px-1.5 py-0.5" style={{ background: color + '22', color }}>탑승 {studentN}명</span>
        </div>
        <div className="border border-[#E2E8F0] rounded-md overflow-hidden">
          <div className={`${GRID} text-[10px] font-bold text-[#64748B] bg-[#F1F5F9] border-b border-[#E2E8F0]`}>
            <div className="px-0.5 py-0.5 text-center border-r border-[#E2E8F0]">시간</div>
            <div className="px-1 py-0.5 text-center border-r border-[#E2E8F0]">장소</div>
            <div className="px-0.5 py-0.5 text-center border-r border-[#E2E8F0]">인원</div>
            <div className="px-1 py-0.5 text-center border-r border-[#E2E8F0]">작업</div>
            <div className="px-1 py-0.5 text-center">탑승자 명단</div>
          </div>
          {rows.map((r, i) => <Fragment key={r.stop}>{StopRow({ dir, bus, r, i, flt })}</Fragment>)}
          {rows.length === 0 && <div className="text-[10px] text-[#CBD5E1] py-2 px-2">정류장 없음</div>}
          {!q && !ro && (
            <div className="flex items-center gap-1 px-2 py-1 border-t border-[#EEF2F7] bg-[#FAFBFC]">
              <span className="text-[10px] font-bold text-[#94A3B8]">+ 새 정류장</span>
              <input type="time" value={add.time} onChange={e => setAddStop(prev => ({ ...prev, [bk]: { ...add, time: e.target.value } }))} className={`w-24 ${inputCls}`} />
              <input value={add.stop} onChange={e => setAddStop(prev => ({ ...prev, [bk]: { ...add, stop: e.target.value } }))} placeholder="정류장명(장소)" className={`w-52 ${inputCls}`} />
              <button onClick={() => addNewStop(dir, bus, flt)} disabled={savingKey === 'addstop|' + bk || !add.stop.trim()}
                className="text-[10px] font-bold border px-2 py-1 rounded disabled:opacity-40" style={{ color, borderColor: color }}>추가</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const bus = selectedBus

  // ── 호차 히어로(얇은 1줄): 기사·정원·안전선생님·해당일 총탑승 + 설정편집 ──
  const BusHero = ({ b }: { b: Bus }) => {
    const cap = b.capacity ?? 0
    const M = ({ label, val, sub }: { label: string; val?: string | null; sub?: string | null }) => (
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-[10px] text-[#94A3B8]">{label}</span>
        <span className="text-[12px] font-bold text-[#1E293B]">{val || '–'}</span>
        {sub ? <span className="text-[12px] font-extrabold text-[#0369A1] bg-[#E0F2FE] rounded px-1 tabular-nums">{sub}</span> : null}
      </span>
    )
    return (
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 mb-2">
        <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap">
          <span className="text-[15px] font-extrabold text-[#004EA2]">{b.name}</span>
          <M label="기사" val={b.driver} sub={b.driver_phone} />
          <M label="정원" val={cap ? `${cap}석` : null} />
          <M label="안전선생님" val={b.safety} sub={b.safety_phone} />
          {!ro && <button onClick={() => { if (busEditOpen) { setBusEditOpen(false); return } setBusEdit({ driver: b.driver ?? '', driver_phone: b.driver_phone ?? '', safety: b.safety ?? '', safety_phone: b.safety_phone ?? '', capacity: b.capacity ? String(b.capacity) : '' }); setBusEditOpen(true) }}
            className={`ml-auto text-[11px] font-bold border rounded px-2 py-0.5 ${busEditOpen ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'text-[#004EA2] border-[#004EA2]'}`}>{busEditOpen ? '닫기' : '수정'}</button>}
        </div>
        {busEditOpen && (
          <div className="mt-1 pt-1 border-t border-[#E2E8F0] flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-[#94A3B8]">기사
              <input value={busEdit.driver} onChange={e => setBusEdit(v => ({ ...v, driver: e.target.value }))} placeholder="이름" className={`w-20 ${inputCls}`} />
              <input value={busEdit.driver_phone} onChange={e => setBusEdit(v => ({ ...v, driver_phone: e.target.value }))} placeholder="전화" className={`w-28 ${inputCls}`} /></label>
            <label className="flex items-center gap-1 text-[10px] text-[#94A3B8]">안전선생님
              <input value={busEdit.safety} onChange={e => setBusEdit(v => ({ ...v, safety: e.target.value }))} placeholder="이름" className={`w-20 ${inputCls}`} />
              <input value={busEdit.safety_phone} onChange={e => setBusEdit(v => ({ ...v, safety_phone: e.target.value }))} placeholder="전화" className={`w-28 ${inputCls}`} /></label>
            <label className="flex items-center gap-1 text-[10px] text-[#94A3B8]">정원
              <input value={busEdit.capacity} onChange={e => setBusEdit(v => ({ ...v, capacity: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="석" className={`w-14 ${inputCls}`} /></label>
            <button onClick={() => saveBus(b)} disabled={savingKey === 'bus|' + b.id} className="text-[12px] bg-[#004EA2] text-white font-bold px-3 py-1 rounded disabled:opacity-40">{savingKey === 'bus|' + b.id ? '저장…' : '저장'}</button>
            <button onClick={() => setBusEditOpen(false)} className="text-[12px] border border-[#E2E8F0] text-[#64748B] font-semibold px-3 py-1 rounded">취소</button>
          </div>
        )}
      </div>
    )
  }
  const busObj = buses.find(b => b.name === bus)

  // ── 모바일 정류장 카드 (지도·좌표 없음, 터치 큼) ──
  const MobileStopCard = ({ dir, bus, r, flt }: { dir: Dir; bus: string; r: Row; flt: string }) => {
    const k = dkey(dir, bus, r.stop)
    const busy = savingKey === k
    const editing = cellEdit?.key === k
    const adding = addRiderKey === k
    const dayAdding = addDayKey === k
    const color = dirColor(dir)
    const hasCoord = !!coords[r.stop]
    const adds = ovAdds(dir, bus, r.stop, r.students)
    const cnt = dayCount(r, dir, bus)
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white mb-2 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderLeft: `5px solid ${color}` }}>
          <button onClick={() => { if (ro) return; startCell(k, 'time', r.time) }} className="text-[16px] font-bold tabular-nums" style={{ color }}>{r.time || '–'}</button>
          <button onClick={() => { if (ro) return; startCell(k, 'name', r.stop) }} className="flex-1 text-left text-[15px] font-bold text-[#1E293B] truncate">{r.stop}{!hasCoord && <span className="text-[#F59E0B]"> *</span>}</button>
          <span className="text-[18px] font-extrabold tabular-nums" style={{ color }}>{cnt}<span className="text-[11px] text-[#94A3B8] font-normal">명</span></span>
        </div>
        {editing && (
          <div className="px-2.5 py-2 bg-[#FFFBEB] border-t border-[#FDE68A] flex items-center gap-2">
            <input type={cellEdit!.field === 'time' ? 'time' : 'text'} autoFocus value={cellVal} onChange={e => setCellVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitCell(dir, bus, r); else if (e.key === 'Escape') setCellEdit(null) }}
              className="flex-1 border border-[#E2E8F0] rounded px-2 py-1.5 text-[15px]" />
            <button onClick={() => commitCell(dir, bus, r)} disabled={busy} className="text-[13px] bg-[#004EA2] text-white font-bold px-3 py-1.5 rounded">저장</button>
            <button onClick={() => setCellEdit(null)} className="text-[13px] border border-[#E2E8F0] text-[#64748B] px-3 py-1.5 rounded">취소</button>
          </div>
        )}
        <div className="px-2.5 py-2 flex flex-wrap gap-1.5">
          {r.students.map((s, si) => {
            const sd = s.days.length ? s.days : r.days
            const rides = ridesHere(s, r, dir, bus)
            return (
              <span key={s.id} className="inline-flex flex-col gap-0.5 bg-[#F1F5F9] rounded-lg px-1.5 py-1" style={{ opacity: rides ? 1 : 0.4 }}>
                <span className="flex items-center gap-1 text-[13px] text-[#334155]">
                  <span className="text-[9px] text-[#94A3B8]">{si + 1}</span><span className={`font-bold ${rides ? '' : 'line-through'}`}>{s.name}</span>
                  {!ro && <button onClick={() => removeRider(dir, bus, r.stop, s)} className="text-[#B6C0CC] hover:text-[#EF4444] text-[13px] leading-none">×</button>}
                </span>
                {!ro && <span className="flex gap-0.5">
                  {DAYS.map(day => { const on = sd.includes(day); return (
                    <button key={day} onClick={() => toggleRiderDay(dir, bus, r, s, day, on)} disabled={savingKey === 'sday|' + s.id + day}
                      className="text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center"
                      style={on ? { background: color, color: '#fff' } : { background: '#E2E8F0', color: '#94A3B8' }}>{day}</button>
                  ) })}
                </span>}
              </span>
            )
          })}
          {adds.map(o => (
            <span key={'ov' + o.student_id} className="inline-flex items-center gap-1 bg-[#FFEDD5] border border-[#FED7AA] rounded-lg px-1.5 py-1 text-[13px] text-[#9A3412]">
              <span className="text-[8px] font-bold bg-[#EA580C] text-white rounded px-0.5">당일</span>{o.name}
              {!ro && <button onClick={() => removeDayRider(dir, o.student_id, o.name)} className="text-[#EA580C] text-[13px] leading-none">×</button>}
            </span>
          ))}
          {r.students.length === 0 && adds.length === 0 && <span className="text-[12px] text-[#CBD5E1]">탑승 없음</span>}
        </div>
        <div className="px-2.5 py-2 border-t border-[#EEF2F7] flex gap-1.5 bg-[#FCFCFD]">
          <button onClick={() => { setAddRiderKey(a => a === k ? null : k); setAddDayKey(null); setRiderQ(''); setRiderResults([]) }}
            className={`text-[13px] font-bold border rounded-lg px-3 py-1.5 ${adding ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'text-[#16A34A] border-[#16A34A]'}`}>{ro ? '학생추가 신청' : '학생+'}</button>
          {!ro && <button onClick={() => { setAddDayKey(a => a === k ? null : k); setAddRiderKey(null); setRiderQ(''); setRiderResults([]) }}
            className={`text-[13px] font-bold border rounded-lg px-3 py-1.5 ${dayAdding ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'text-[#EA580C] border-[#EA580C]'}`}>당일+</button>}
        </div>
        {(adding || dayAdding) && (
          <div className="relative px-2.5 py-2 border-t border-[#EEF2F7]" style={{ background: dayAdding ? '#FFF7ED' : '#F0FDF4' }}>
            {dayAdding && <span className="text-[11px] font-bold text-[#9A3412]">{selDate} 당일 추가:</span>}
            <input autoFocus value={riderQ}
              onChange={e => { const v = e.target.value; setRiderQ(v); if (!composing.current) searchRiders(v) }}
              onCompositionStart={() => { composing.current = true }}
              onCompositionEnd={e => { composing.current = false; searchRiders(e.currentTarget.value) }}
              placeholder="개설반 학생 이름 검색" className="w-full border border-[#E2E8F0] rounded px-2 py-1.5 text-[14px] mt-0.5" />
            {riderResults.length > 0 && (
              <div className="absolute z-20 left-2.5 right-2.5 mt-0.5 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-52 overflow-auto">
                {riderResults.map(s => (
                  <button key={s.id} onClick={() => (dayAdding ? addDayRider : addRider)(dir, bus, r, s, flt)} className="w-full text-left px-3 py-2 hover:bg-[#EAF2FB] text-[14px]">
                    {s.name}{s.english_name ? <span className="text-[#94A3B8]"> ({s.english_name})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── 모바일: 세션×방향 슬라이드(한 장씩 스와이프) ──
  if (isMobile) {
    const slides: { f: string; dir: Dir; rows: Row[] }[] = []
    for (const f of sessions) for (const dd of (['arr', 'dep'] as Dir[])) { const rows = rowsOf(f, dd, bus); if (rows.length) slides.push({ f, dir: dd, rows }) }
    const idx = Math.min(slideIdx, Math.max(0, slides.length - 1))
    const cur = slides[idx]
    return (
      <div className="pb-16">
        {msg && <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">{msg}</div>}
        {/* 호차 탭 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
          {buses.map(b => (
            <button key={b.id} onClick={() => { setSelectedBus(b.name); setSlideIdx(0); slideRef.current?.scrollTo({ left: 0 }) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-bold ${bus === b.name ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>{b.name}</button>
          ))}
        </div>
        {/* 기준일 + 인쇄 */}
        <div className="flex items-center gap-2 mb-2">
          <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} className="border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-[12px] font-bold text-[#004EA2] w-6">{selDay || '주말'}</span>
          <button onClick={() => printBuses([bus])} disabled={!bus} className="ml-auto text-sm font-semibold border border-[#004EA2] text-[#004EA2] rounded-lg px-3 py-1.5 disabled:opacity-40">인쇄</button>
        </div>
        {/* 모바일 히어로: 당일 총 탑승인원만 */}
        {bus && (
          <div className="rounded-lg bg-[#EAF2FB] px-3 py-1.5 mb-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[#004EA2]">{bus} 당일 탑승</span>
            <span className="text-[14px] font-extrabold"><span style={{ color: ARR }}>등 {busTotalFor(bus, 'arr')}</span> · <span style={{ color: DEP }}>하 {busTotalFor(bus, 'dep')}</span></span>
          </div>
        )}
        {slides.length === 0 ? (
          <div className="text-center text-[#CBD5E1] py-16 text-sm">{bus ? `${bus} 정류장 데이터 없음` : '호차 없음'}</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[15px] font-extrabold" style={{ color: dirColor(cur.dir) }}>{bus} · {cur.f} · {dirLabel(cur.dir)}</span>
              <span className="text-[11px] text-[#94A3B8]">{idx + 1}/{slides.length}</span>
            </div>
            <div className="flex justify-center gap-1 mb-2">
              {slides.map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === idx ? '#004EA2' : '#CBD5E1' }} />)}
            </div>
            <div ref={slideRef} onScroll={e => { const el = e.currentTarget; setSlideIdx(Math.round(el.scrollLeft / el.clientWidth)) }}
              className="flex overflow-x-auto -mx-1" style={{ scrollSnapType: 'x mandatory' }}>
              {slides.map((sl, i) => (
                <div key={i} className="min-w-full px-1" style={{ scrollSnapAlign: 'center' }}>
                  <div className="mb-1.5 pb-0.5 text-[13px] font-bold flex items-center gap-2" style={{ borderBottom: `2px solid ${dirColor(sl.dir)}`, color: dirColor(sl.dir) }}>
                    {sl.f} · {dirLabel(sl.dir)}
                    <span className="text-[10px] text-[#94A3B8] font-normal">정류장 {sl.rows.length} · 탑승 {sl.rows.reduce((n, r) => n + dayCount(r, sl.dir, bus), 0)}명</span>
                  </div>
                  {sl.rows.map(r => <Fragment key={r.stop}>{MobileStopCard({ dir: sl.dir, bus, r, flt: sl.f })}</Fragment>)}
                </div>
              ))}
            </div>
            <p className="text-center text-[11px] text-[#CBD5E1] mt-2">← 좌우로 밀어 세션·방향 이동 →</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">{msg}</div>
      )}

      {/* 호차 선택 탭 + 검색 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {buses.map(b => (
            <button key={b.id} onClick={() => setSelectedBus(b.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                bus === b.name ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
              {b.name}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-[#64748B]" title="이 날짜(요일) 기준 탑승인원 계산 · 당일 탑승 표시">
          기준일
          <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
            className="border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
          <span className="text-[11px] text-[#004EA2] font-bold w-6">{selDay || '주말'}</span>
        </label>
        <button onClick={() => printBuses([selectedBus])} disabled={!selectedBus} title="선택 호차 배차표 인쇄(A4 1페이지)"
          className="text-sm font-semibold border border-[#004EA2] text-[#004EA2] rounded-lg px-3 py-1.5 hover:bg-[#EAF2FB] disabled:opacity-40">인쇄</button>
        <button onClick={() => printBuses(buses.map(b => b.name))} disabled={!buses.length} title="전체 호차 배차표 인쇄(호차당 1페이지)"
          className="text-sm font-semibold bg-[#004EA2] text-white rounded-lg px-3 py-1.5 hover:bg-[#003E82] disabled:opacity-40">전체 인쇄</button>
        {!ro && <button onClick={() => { setBackupOpen(true); loadBackups() }} title="차량 스케줄 백업/복원"
          className="text-sm font-semibold border border-[#E2E8F0] text-[#64748B] rounded-lg px-3 py-1.5 hover:bg-[#F7F8FA]">백업</button>}
        <div className="relative w-[220px] max-w-full">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="정류장명 검색"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#1E293B] text-sm">✕</button>}
        </div>
      </div>

      {/* 호차 히어로(얇게) */}
      {!q && busObj && BusHero({ b: busObj })}

      {/* 검색 중 = 전 호차 × 전 세션 매칭 정류장 (호차별 그룹) */}
      {q ? (
        <div className="space-y-4">
          {buses.map(b => {
            const hit = sessions.some(f => (['arr', 'dep'] as Dir[]).some(dir => rowsOf(f, dir, b.name).some(r => r.stop.toLowerCase().includes(q))))
            if (!hit) return null
            return (
              <div key={b.id}>
                <div className="text-[13px] font-extrabold text-[#004EA2] mb-1 pb-0.5 border-b-2 border-[#004EA2]">{b.name}</div>
                {sessions.map(f => (
                  <Fragment key={f}>
                    {DirTable({ dir: 'arr', bus: b.name, flt: f })}
                    {DirTable({ dir: 'dep', bus: b.name, flt: f })}
                  </Fragment>
                ))}
              </div>
            )
          })}
          {buses.every(b => !sessions.some(f => (['arr', 'dep'] as Dir[]).some(dir => rowsOf(f, dir, b.name).some(r => r.stop.toLowerCase().includes(q))))) && (
            <div className="text-center text-[#CBD5E1] text-sm py-10">&lsquo;{search}&rsquo; 정류장 없음 (전 호차 검색)</div>
          )}
        </div>
      ) : (() => {
        const avail = sessions.filter(f => rowsOf(f, 'arr', bus).length || rowsOf(f, 'dep', bus).length)
        if (!avail.length) return <div className="text-center text-[#CBD5E1] text-sm py-10">{bus ? `${bus} 정류장 데이터 없음` : '호차 없음'}</div>
        const active = avail.includes(selSession) ? selSession : avail[0]
        return (
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {avail.map(f => (
                <button key={f} onClick={() => setSelSession(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${active === f ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {DirTable({ dir: 'arr', bus, flt: active })}
              {DirTable({ dir: 'dep', bus, flt: active })}
            </div>
          </div>
        )
      })()}

      {/* 백업/복원 모달 */}
      {backupOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300] px-4" onClick={() => setBackupOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-extrabold text-[#1E293B]">차량 스케줄 백업/복원</h3>
              <button onClick={() => setBackupOpen(false)} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none">✕</button>
            </div>
            <button onClick={createBackup} disabled={backupBusy === 'save'}
              className="w-full mb-3 text-sm font-bold text-white bg-[#004EA2] rounded-lg py-2 disabled:opacity-40">{backupBusy === 'save' ? '저장 중…' : '＋ 현재 상태 백업'}</button>
            <div className="space-y-1.5">
              {backups.length === 0 && <p className="text-center text-[#CBD5E1] text-sm py-6">백업 없음</p>}
              {backups.map(b => (
                <div key={b.id} className="flex items-center gap-2 border border-[#E2E8F0] rounded-lg px-3 py-2">
                  <span className="flex-1 text-[13px] font-semibold text-[#334155] truncate">{b.label}</span>
                  <button onClick={() => restoreBackup(b.id, b.label)} disabled={!!backupBusy}
                    className="text-[12px] font-bold text-[#004EA2] border border-[#004EA2] rounded px-2 py-1 disabled:opacity-40">{backupBusy === 'restore|' + b.id ? '복원…' : '복원'}</button>
                  <button onClick={() => deleteBackup(b.id)} disabled={!!backupBusy}
                    className="text-[12px] text-[#EF4444] border border-[#FCA5A5] rounded px-2 py-1 disabled:opacity-40">삭제</button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-3">복원 시 현재 차량 스케줄이 백업 시점으로 덮어써집니다.</p>
          </div>
        </div>
      )}
    </div>
  )
}
