'use client'

// 호차별 정류장 세팅 (중계 전용) — 엑셀 배차표식.
// 상단 = 호차 선택 탭(호차별 정리). 호차 안에 세션별 섹션(유치부/매일반/3일반/화목반), 각 섹션 등원·하원 표.
// 표 = 시간 | 장소 | 탑승자 명단 | 작업 (정류장별 그룹 1행, 시간순).
//   시간·장소 = 셀 클릭 인라인 개별 수정(일괄 폼 없음). 좌표 = [좌표] 팝오버(주소검색/핀) 또는 [지도] 드래그.
//   학생 추가 검색 = 개설반 현황(enrolled) 소스. 학생명 = 분리 칩.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface Bus { id: string; name: string; sort_order: number }
interface Student {
  student_id?: string
  class_id?: string
  name?: string
  location: string | null; pickup_time: string | null
  days?: string[]
  dayLocs?: Record<string, string>
  dayTimes?: Record<string, string>
}
interface StuRef { id: string; name: string; class_id: string }
const DAYS = ['월', '화', '수', '목', '금'] as const
interface TimeGroup { session_name: string; busMap: Record<string, Student[]> }
interface RegStop { stop_name: string; bus_name: string; direction: string; default_time: string | null }
interface MasterResp { buses: Bus[]; timeGroups: TimeGroup[]; registeredStops: RegStop[] }

type Filter = '유치부' | '매일반' | '3일반' | '화목반'
const FILTERS: Filter[] = ['유치부', '매일반', '3일반', '화목반']
const FILTER_LABEL: Record<Filter, string> = {
  '유치부': '유치부', '매일반': '매일반(5일)', '3일반': '3일반(월수금)', '화목반': '화목반(화목)',
}
type Dir = 'arr' | 'dep'
const ARR = '#3B82F6', DEP = '#DC2626'
const dirColor = (d: Dir) => (d === 'arr' ? ARR : DEP)
const dirLabel = (d: Dir) => (d === 'arr' ? '등원' : '하원')

function sessMatch(name: string, filter: Filter, dir: Dir): boolean {
  if (name.includes('방과후')) {
    if (name.includes('유치부')) return filter === '유치부'
    if (dir === 'dep') return filter === '매일반'
    return filter === '유치부'
  }
  if (filter === '유치부') return name.includes('유치부')
  if (filter === '매일반') return name.includes('매일반') || name.includes('5일')
  if (filter === '3일반') return name.includes('월수금') || name.includes('3일')
  if (filter === '화목반') return name.includes('화목') || name.includes('2일')
  return false
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
const GRID = 'grid grid-cols-[56px_190px_1fr_120px]'

export default function BusStopSettingsView({ campusName, onLocateStop }: { campusName?: string; onLocateStop?: (stop: string, bus: string) => void }) {
  void campusName
  const today = new Date()
  const todayStr = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')

  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [selectedBus, setSelectedBus] = useState('')
  const [msg, setMsg] = useState('')
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())  // `${bus}|${filter}`
  // 인라인 셀 편집
  const [cellEdit, setCellEdit] = useState<{ key: string; field: 'time' | 'name' } | null>(null)
  const [cellVal, setCellVal] = useState('')
  // 좌표 팝오버
  const [coordKey, setCoordKey] = useState<string | null>(null)
  const [coordDraft, setCoordDraft] = useState<{ lat: string; lng: string; addr: string }>({ lat: '', lng: '', addr: '' })
  const [geoBusy, setGeoBusy] = useState(false)
  // 학생 추가
  const [addRiderKey, setAddRiderKey] = useState<string | null>(null)
  const [riderQ, setRiderQ] = useState('')
  const [riderResults, setRiderResults] = useState<{ id: string; name: string; english_name: string | null }[]>([])
  // 새 정류장
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})

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

  const buses: Bus[] = useMemo(() => (raw ? (raw.arr.buses?.length ? raw.arr.buses : raw.dep.buses) ?? [] : []), [raw])
  useEffect(() => { if (buses.length && !buses.some(b => b.name === selectedBus)) setSelectedBus(buses[0].name) }, [buses, selectedBus])

  const buildDir = useCallback((flt: Filter, dir: Dir): Record<string, Row[]> => {
    if (!raw) return {}
    const resp = raw[dir]
    const cellByBus: Record<string, Record<string, { times: string[]; sess: Set<string>; days: Set<string>; stu: Map<string, StuRef>; hasStudents: boolean }>> = {}
    const ensure = (bus: string, stop: string) => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { times: [], sess: new Set(), days: new Set(), stu: new Map(), hasStudents: false }
      return cellByBus[bus][stop]
    }
    for (const tg of resp.timeGroups ?? []) {
      if (!sessMatch(tg.session_name, flt, dir)) continue
      for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
        for (const s of students) {
          for (const [stop, t, day] of stopDayTriples(s)) {
            if (!stop) continue
            const c = ensure(bus, stop)
            c.hasStudents = true
            c.sess.add(tg.session_name)
            if (s.name && s.student_id) c.stu.set(s.student_id, { id: s.student_id, name: s.name, class_id: s.class_id ?? '' })
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
          students: [...c.stu.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
          hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, buses])

  const built = useMemo(() => {
    const res = {} as Record<Filter, { arr: Record<string, Row[]>; dep: Record<string, Row[]> }>
    for (const f of FILTERS) res[f] = { arr: buildDir(f, 'arr'), dep: buildDir(f, 'dep') }
    return res
  }, [buildDir])
  const rowsOf = (flt: Filter, dir: Dir, bus: string) => built[flt]?.[dir]?.[bus] ?? []

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
    if (!nm || nm === r.stop) return
    const k = dkey(dir, bus, r.stop); setSavingKey(k)
    try {
      await renameApi(r.stop, nm)
      flash(`정류장명 '${r.stop}' → '${nm}' 변경됨`); load()
    } catch (e) { alert(`이름 변경 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function saveCoord(dir: Dir, bus: string, r: Row) {
    const lat = parseFloat(coordDraft.lat), lng = parseFloat(coordDraft.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { alert('위도·경도를 확인하세요.'); return }
    const k = dkey(dir, bus, r.stop); setSavingKey(k)
    try {
      await renameApi(r.stop, r.stop, { lat, lng })
      setCoordKey(null); flash(`'${r.stop}' 좌표(핀) 저장됨`); load()
    } catch (e) { alert(`좌표 저장 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function geocode() {
    if (!coordDraft.addr.trim()) return
    setGeoBusy(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(coordDraft.addr.trim())}`)
      const j = await res.json().catch(() => ({}))
      const first = (j.results ?? [])[0]
      if (!first) { flash('검색 결과 없음'); return }
      setCoordDraft(d => ({ ...d, lat: String(first.lat), lng: String(first.lng) }))
      flash(`${first.name} 좌표 적용 (저장 눌러 반영)`)
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
    setRiderQ(qstr)
    if (!qstr.trim()) { setRiderResults([]); return }
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search_students', query: qstr.trim(), source: 'roster' }),
    })
    const d = await res.json().catch(() => ({}))
    setRiderResults((d.students ?? []).slice(0, 12))
  }
  async function addRider(dir: Dir, bus: string, r: Row, stu: { id: string; name: string }) {
    setSavingKey('add-rider|' + dir + stu.id)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_rider', student_id: stu.id, date: todayStr, direction: dir,
          bus_name: bus, pickup_location: r.stop, pickup_time: r.time || undefined,
          days: r.days.length ? r.days : [...DAYS], session_name: r.sess[0] ?? undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) throw new Error(d.error ?? `${res.status}`)
      setRiderQ(''); setRiderResults([])
      flash(`'${stu.name}' 추가됨`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function addNewStop(dir: Dir, bus: string, flt: Filter) {
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

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  const inputCls = 'border border-[#E2E8F0] rounded px-1.5 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]'
  const q = search.trim().toLowerCase()

  const startCell = (k: string, field: 'time' | 'name', cur: string) => { setCellEdit({ key: k, field }); setCellVal(cur) }
  const commitCell = (dir: Dir, bus: string, r: Row) => {
    if (!cellEdit) return
    const { field } = cellEdit; const val = cellVal
    setCellEdit(null)
    if (field === 'time') saveTime(dir, bus, r, val)
    else saveName(dir, bus, r, val)
  }

  // 엑셀 배차표 표 행 (정류장 그룹)
  const StopRow = ({ dir, bus, r, i }: { dir: Dir; bus: string; r: Row; i: number }) => {
    const k = dkey(dir, bus, r.stop)
    const busy = savingKey === k
    const editing = cellEdit?.key === k
    const adding = addRiderKey === k
    const coording = coordKey === k
    const hasCoord = !!coords[r.stop]
    const color = dirColor(dir)
    return (
      <div className="border-b border-[#EEF2F7] last:border-0" style={{ borderLeft: `3px solid ${color}` }}>
        <div className={`${GRID} items-center text-[11px] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-[#F5F8FC]`}>
          {/* 시간 (클릭 인라인) */}
          <div className="px-1 py-1 border-r border-[#F1F5F9] text-center">
            {editing && cellEdit!.field === 'time'
              ? <input type="time" autoFocus value={cellVal} onChange={e => setCellVal(e.target.value)}
                  onBlur={() => commitCell(dir, bus, r)} onKeyDown={e => { if (e.key === 'Enter') commitCell(dir, bus, r); else if (e.key === 'Escape') setCellEdit(null) }}
                  className="w-full border border-[#004EA2] rounded px-0.5 py-px text-[11px]" />
              : <button onClick={() => startCell(k, 'time', r.time)} title="클릭해 시간 변경" className="font-bold tabular-nums hover:underline" style={{ color }}>{r.time || '–'}</button>}
          </div>
          {/* 장소 (클릭 인라인 이름변경) + 요일 */}
          <div className="px-1.5 py-1 border-r border-[#F1F5F9] min-w-0">
            {editing && cellEdit!.field === 'name'
              ? <input autoFocus value={cellVal} onChange={e => setCellVal(e.target.value)}
                  onBlur={() => commitCell(dir, bus, r)} onKeyDown={e => { if (e.key === 'Enter') commitCell(dir, bus, r); else if (e.key === 'Escape') setCellEdit(null) }}
                  className="w-full border border-[#004EA2] rounded px-1 py-px text-[11px]" />
              : <button onClick={() => startCell(k, 'name', r.stop)} title="클릭해 정류장명 변경" className="font-semibold text-[#1E293B] truncate hover:underline block w-full text-left">
                  {r.stop}{!hasCoord && <span className="text-[#F59E0B] font-normal"> *</span>}</button>}
            {r.days.length > 0 && r.days.length < 5 && (
              <div className="flex gap-0.5 mt-0.5">
                {r.days.map(day => (
                  <button key={day} onClick={() => removeDay(dir, bus, r, day)} disabled={busy} title={`${day}요일 — 누르면 제거`}
                    className="text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center" style={{ background: color, color: '#fff' }}>{day}</button>
                ))}
              </div>
            )}
          </div>
          {/* 탑승자 명단 (칩) */}
          <div className="px-1.5 py-1 flex flex-wrap gap-1 items-center min-w-0">
            {r.students.map((s, si) => (
              <span key={s.id} className="inline-flex items-center gap-0.5 bg-[#F1F5F9] rounded px-1 py-px text-[11px] text-[#334155] whitespace-nowrap">
                <span className="text-[8px] text-[#94A3B8]">{si + 1}</span>{s.name}
                <button onClick={() => removeRider(dir, bus, r.stop, s)} title="빼기" className="text-[#B6C0CC] hover:text-[#EF4444] leading-none">×</button>
              </span>
            ))}
            {r.students.length === 0 && <span className="text-[10px] text-[#CBD5E1]">탑승 없음</span>}
            <span className="text-[9px] font-bold text-[#94A3B8]">({r.students.length})</span>
          </div>
          {/* 작업 */}
          <div className="px-1 py-0.5 flex items-center gap-0.5 justify-end text-[9px]">
            <button onClick={() => { setAddRiderKey(a => a === k ? null : k); setRiderQ(''); setRiderResults([]) }}
              className={`font-bold border rounded px-1 py-px ${adding ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'text-[#16A34A] border-[#16A34A]'}`}>학생+</button>
            <button onClick={() => { if (coording) setCoordKey(null); else { setCoordKey(k); const c = coords[r.stop]; setCoordDraft({ lat: c ? String(c.lat) : '', lng: c ? String(c.lng) : '', addr: '' }) } }}
              className={`font-bold border rounded px-1 py-px ${coording ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'text-[#004EA2] border-[#004EA2]'}`}>좌표</button>
            {onLocateStop && <button onClick={() => onLocateStop(r.stop, bus)} title="시스템 지도에서 핀 드래그" className="font-bold text-[#004EA2] border border-[#004EA2] rounded px-1 py-px">지도</button>}
            {!r.hasStudents && <button onClick={() => deleteStop(dir, bus, r.stop)} title="정류장 삭제" className="text-[#CBD5E1] hover:text-[#EF4444] font-bold px-0.5">×</button>}
          </div>
        </div>

        {/* 학생 추가 검색 (개설반) */}
        {adding && (
          <div className="relative px-2 py-1 bg-[#F0FDF4] border-t border-[#DCFCE7]">
            <input autoFocus value={riderQ} onChange={e => searchRiders(e.target.value)} placeholder="개설반 학생 이름 검색" className={`w-64 max-w-full ${inputCls}`} />
            {riderResults.length > 0 && (
              <div className="absolute z-20 left-2 mt-0.5 w-64 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-48 overflow-auto">
                {riderResults.map(s => (
                  <button key={s.id} onClick={() => addRider(dir, bus, r, s)} className="w-full text-left px-2 py-1.5 hover:bg-[#EAF2FB] text-[12px]">
                    {s.name}{s.english_name ? <span className="text-[#94A3B8]"> ({s.english_name})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 좌표 팝오버 */}
        {coording && (
          <div className="px-2 py-1.5 bg-[#F8FAFC] border-t border-[#EEF2F7] flex flex-wrap items-center gap-1.5">
            <input value={coordDraft.addr} onChange={e => setCoordDraft(d => ({ ...d, addr: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') geocode() }} placeholder="주소검색" className={`w-52 ${inputCls}`} />
            <button onClick={geocode} disabled={geoBusy || !coordDraft.addr.trim()} className="text-[11px] font-bold text-white bg-[#004EA2] rounded px-2 py-1 disabled:opacity-40">{geoBusy ? '…' : '검색'}</button>
            <input value={coordDraft.lat} onChange={e => setCoordDraft(d => ({ ...d, lat: e.target.value }))} placeholder="위도" className={`w-28 ${inputCls}`} />
            <input value={coordDraft.lng} onChange={e => setCoordDraft(d => ({ ...d, lng: e.target.value }))} placeholder="경도" className={`w-28 ${inputCls}`} />
            <button onClick={() => saveCoord(dir, bus, r)} disabled={busy} className="text-[11px] bg-[#004EA2] text-white font-bold px-3 py-1 rounded disabled:opacity-30">저장</button>
            <span className="text-[10px] text-[#94A3B8]">또는 [지도]에서 핀 드래그</span>
          </div>
        )}
      </div>
    )
  }

  // 세션 섹션 안의 방향 표 (등원/하원)
  const DirTable = ({ dir, bus, flt }: { dir: Dir; bus: string; flt: Filter }) => {
    const all = rowsOf(flt, dir, bus)
    const rows = q ? all.filter(r => r.stop.toLowerCase().includes(q)) : all
    if (q && rows.length === 0) return null
    const color = dirColor(dir)
    const bk = `${dir}|${bus}|${flt}`
    const studentN = rows.reduce((n, r) => n + r.students.length, 0)
    const add = addStop[bk] ?? { stop: '', time: '' }
    return (
      <div>
        <div className="flex items-center gap-2 mb-1 mt-1.5 pb-0.5" style={{ borderBottom: `2px solid ${color}` }}>
          <span className="text-[12px] font-extrabold" style={{ color }}>{dirLabel(dir)}</span>
          <span className="text-[10px] text-[#94A3B8]">정류장 {rows.length} · 학생 {studentN}명</span>
        </div>
        <div className="border border-[#E2E8F0] rounded-md overflow-hidden">
          <div className={`${GRID} text-[10px] font-bold text-[#64748B] bg-[#F1F5F9] border-b border-[#E2E8F0]`}>
            <div className="px-1 py-1 text-center border-r border-[#E2E8F0]">시간</div>
            <div className="px-1.5 py-1 border-r border-[#E2E8F0]">장소</div>
            <div className="px-1.5 py-1">탑승자 명단</div>
            <div className="px-1 py-1 text-right">작업</div>
          </div>
          {rows.map((r, i) => <StopRow key={r.stop} dir={dir} bus={bus} r={r} i={i} />)}
          {rows.length === 0 && <div className="text-[10px] text-[#CBD5E1] py-2 px-2">정류장 없음</div>}
          {!q && (
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
        <div className="relative ml-auto w-[220px] max-w-full">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="정류장명 검색"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#1E293B] text-sm">✕</button>}
        </div>
      </div>

      {/* 선택 호차의 세션별 섹션 */}
      <div className="space-y-3">
        {FILTERS.map(f => {
          const arrN = rowsOf(f, 'arr', bus).length, depN = rowsOf(f, 'dep', bus).length
          if (arrN === 0 && depN === 0) return null
          const ck = `${bus}|${f}`
          const open = q ? true : !collapsed.has(ck)
          return (
            <div key={f} className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(ck) ? n.delete(ck) : n.add(ck); return n })}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-[#F1F5F9] border-b border-[#E2E8F0] text-left hover:bg-[#E9EEF5]">
                <span className="font-bold text-[13px] text-[#1E293B]">{FILTER_LABEL[f]}
                  <span className="text-[#94A3B8] font-normal text-[11px]"> (등 {arrN} · 하 {depN})</span>
                </span>
                <span className="text-[#94A3B8] text-xs">{open ? '▾ 접기' : '▸ 펴기'}</span>
              </button>
              {open && (
                <div className="px-2 pb-2">
                  <DirTable dir="arr" bus={bus} flt={f} />
                  <DirTable dir="dep" bus={bus} flt={f} />
                </div>
              )}
            </div>
          )
        })}
        {FILTERS.every(f => rowsOf(f, 'arr', bus).length === 0 && rowsOf(f, 'dep', bus).length === 0) && (
          <div className="text-center text-[#CBD5E1] text-sm py-10">{bus ? `${bus} 정류장 데이터 없음` : '호차 없음'}</div>
        )}
      </div>
    </div>
  )
}
