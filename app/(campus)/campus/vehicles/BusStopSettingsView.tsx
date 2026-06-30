'use client'

// 호차별 정류장 세팅 (중계 전용) — 개설반 반편성식 컴팩트 카드.
// 호차 카드(=반 느낌) 안에 등원/하원 정류장을 경로순 번호 칩으로. 칩 누르면 상세(명단·요일·시간·좌표·주소).
// 명단수정: 칩 ×(빼기)·+학생 추가. 위치수정: 시스템 지도로 이동해 핀 드래그.
// 시간 시드 = 기존 학생 운행시간의 가장 이른 시간(시스템 탭과 동일).

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

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

function sessMatch(name: string, filter: Filter, dir: 'arr' | 'dep'): boolean {
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

// 학생이 한 호차에서 갖는 (정류장, 시간, 요일) — 요일별 장소/시간 반영
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
type Dir = 'arr' | 'dep'
interface Draft { name: string; time: string; lat: string; lng: string; addr: string }

export default function BusStopSettingsView({ campusName, onLocateStop }: { campusName?: string; onLocateStop?: (stop: string, bus: string) => void }) {
  void campusName
  const today = new Date()
  const todayStr = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')

  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [filter, setFilter] = useState<Filter>('유치부')
  const [msg, setMsg] = useState('')
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [editKey, setEditKey] = useState<string | null>(null)   // 이름·시간·좌표 편집모드 카드
  const [addRiderKey, setAddRiderKey] = useState<string | null>(null)  // +학생 검색 열린 카드
  const [coordOpen, setCoordOpen] = useState(false)
  const [geoKey, setGeoKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  // 명단 추가용 학생 검색
  const [riderQ, setRiderQ] = useState('')
  const [riderResults, setRiderResults] = useState<{ id: string; name: string; english_name: string | null }[]>([])

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
    setDrafts({})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const buses: Bus[] = useMemo(() => (raw ? (raw.arr.buses?.length ? raw.arr.buses : raw.dep.buses) ?? [] : []), [raw])

  const buildDir = useCallback((dir: Dir): Record<string, Row[]> => {
    if (!raw) return {}
    const resp = raw[dir]
    const cellByBus: Record<string, Record<string, { times: string[]; sess: Set<string>; days: Set<string>; stu: Map<string, StuRef>; hasStudents: boolean }>> = {}
    const ensure = (bus: string, stop: string) => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { times: [], sess: new Set(), days: new Set(), stu: new Map(), hasStudents: false }
      return cellByBus[bus][stop]
    }
    for (const tg of resp.timeGroups ?? []) {
      if (!sessMatch(tg.session_name, filter, dir)) continue
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
  }, [raw, filter, buses])

  const arrRows = useMemo(() => buildDir('arr'), [buildDir])
  const depRows = useMemo(() => buildDir('dep'), [buildDir])
  const rowsOf = (dir: Dir, bus: string) => (dir === 'arr' ? arrRows : depRows)[bus] ?? []

  const dkey = (dir: Dir, bus: string, stop: string) => `${dir}|${bus}|${stop}`
  const seedDraft = (r: Row): Draft => {
    const c = coords[r.stop]
    return { name: r.stop, time: r.time, lat: c ? String(c.lat) : '', lng: c ? String(c.lng) : '', addr: '' }
  }
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

  function dForKey(k2: string, r: Row): Draft { return drafts[k2] ?? seedDraft(r) }
  function setDraftK(k2: string, r: Row, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [k2]: { ...(prev[k2] ?? seedDraft(r)), ...patch } }))
  }
  function isDirtyK(k2: string, r: Row): boolean {
    const d = drafts[k2]; if (!d) return false
    const c = coords[r.stop]; const bl = c ? String(c.lat) : '', bg = c ? String(c.lng) : ''
    return d.name !== r.stop || d.time !== r.time || d.lat !== bl || d.lng !== bg
  }

  async function geocodeRow(k2: string, r: Row) {
    const d = dForKey(k2, r)
    if (!d.addr.trim()) return
    setGeoKey(k2)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(d.addr.trim())}`)
      const j = await res.json().catch(() => ({}))
      const first = (j.results ?? [])[0]
      if (!first) { flash('검색 결과 없음'); return }
      setDraftK(k2, r, { lat: String(first.lat), lng: String(first.lng) })
      flash(`📍 ${first.name} 좌표 적용 (저장 눌러 반영)`)
    } finally { setGeoKey(null) }
  }

  async function saveRow(dir: Dir, bus: string, r: Row) {
    const k2 = dkey(dir, bus, r.stop)
    const d = dForKey(k2, r)
    const oldName = r.stop, newName = d.name.trim()
    if (!newName) { alert('정류장 이름을 입력하세요.'); return }
    const lat = parseFloat(d.lat), lng = parseFloat(d.lng)
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng)
    const cOld = coords[oldName]
    const coordChanged = hasCoord && (!cOld || cOld.lat !== lat || cOld.lng !== lng)
    const nameChanged = newName !== oldName
    const timeChanged = d.time !== r.time
    if (!nameChanged && !coordChanged && !timeChanged) { flash('변경 없음'); return }
    setSavingKey(k2)
    try {
      if (nameChanged || coordChanged) {
        const res = await fetch('/api/campus/stop-coords', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName, newName, ...(hasCoord ? { lat, lng } : {}), force: true }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j.ok === false) throw new Error(`이름/좌표:${j.error ?? res.status}`)
      }
      const eff = newName
      let tc = 0
      if (timeChanged) {
        await postRegistered(bus, eff, dir, d.time)
        if (d.time) for (const sess of r.sess) tc += await pushTime(bus, eff, dir, sess, d.time)
      }
      const parts: string[] = []
      if (nameChanged) parts.push('이름'); if (coordChanged) parts.push('좌표(핀)'); if (timeChanged) parts.push(`시간(학생 ${tc}명)`)
      flash(`'${eff}' 저장됨 · ${parts.join(' · ')}`)
      setDrafts(prev => { const n = { ...prev }; delete n[k2]; return n })
      setEditKey(null)
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function removeDay(dir: Dir, bus: string, r: Row, day: string) {
    if (!confirm(`${bus} '${r.stop}' ${day}요일 탑승을 제거할까요? (${FILTER_LABEL[filter]} 세션 학생)`)) return
    const k2 = dkey(dir, bus, r.stop)
    setSavingKey(k2)
    try {
      let n = 0
      for (const sess of r.sess) n += await removeDayApi(bus, r.stop, dir, sess, [day])
      flash(`${day}요일 제거됨 · 학생 ${n}명`); load()
    } catch (e) { alert(`요일 제거 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  // 명단: 학생 빼기
  async function removeRider(dir: Dir, bus: string, stop: string, stu: StuRef) {
    if (!stu.class_id) { alert('학생 반 정보 없음 — 새로고침'); return }
    if (!confirm(`'${stu.name}' 학생을 ${bus} ${dir === 'arr' ? '등원' : '하원'}에서 뺄까요?`)) return
    setSavingKey('rm|' + stu.id)
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
  // 명단: 학생 검색
  async function searchRiders(qstr: string) {
    setRiderQ(qstr)
    if (!qstr.trim()) { setRiderResults([]); return }
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search_students', query: qstr.trim() }),
    })
    const d = await res.json().catch(() => ({}))
    setRiderResults((d.students ?? []).slice(0, 12))
  }
  // 명단: 학생 추가 (이 정류장·호차·세션, 운행요일에)
  async function addRider(dir: Dir, bus: string, r: Row, stu: { id: string; name: string }) {
    setSavingKey('add-rider|' + stu.id)
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

  async function addNewStop(dir: Dir, bus: string) {
    const k = `${dir}|${bus}`; const a = addStop[k]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSavingKey('addstop|' + k)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [k]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }
  async function deleteStop(dir: Dir, bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' (${dir === 'arr' ? '등원' : '하원'}) 정류장을 삭제할까요?`)) return
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
  const matchRows = (dir: Dir, bus: string) => q ? rowsOf(dir, bus).filter(r => r.stop.toLowerCase().includes(q)) : rowsOf(dir, bus)

  // 정류장 카드 (택배 양식: 정류장명·탑승시간 헤더 + 탑승명단 + 인원/+학생 푸터)
  const StopCard = ({ dir, bus, r, i }: { dir: Dir; bus: string; r: Row; i: number }) => {
    const k2 = dkey(dir, bus, r.stop)
    const d = dForKey(k2, r)
    const busy = savingKey === k2
    const editing = editKey === k2
    const adding = addRiderKey === k2
    const hasCoord = !!coords[r.stop]
    const color = dir === 'arr' ? '#3B82F6' : '#DC2626'
    return (
      <div className="flex-shrink-0 w-[184px] rounded-lg border border-[#E2E8F0] bg-white flex flex-col self-stretch">
        {/* 헤더: 정류장명 · 탑승시간 (좌측 색 액센트) */}
        <div className="border-b border-[#EEF2F7] p-1.5" style={{ borderLeft: `3px solid ${color}` }}>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: color }}>{i + 1}</span>
            {editing
              ? <input value={d.name} onChange={e => setDraftK(k2, r, { name: e.target.value })} className={`flex-1 min-w-0 ${inputCls}`} />
              : <span className="text-[12px] font-bold text-[#1E293B] truncate" title={r.stop}>{r.stop}</span>}
            <span className="text-[10px] flex-shrink-0" style={{ color: hasCoord ? '#16A34A' : '#CBD5E1' }} title={hasCoord ? '좌표 있음' : '좌표 없음'}>📍</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-[#94A3B8]">탑승시간</span>
            {editing
              ? <input type="time" value={d.time} onChange={e => setDraftK(k2, r, { time: e.target.value })} className={`w-[110px] ${inputCls}`} />
              : <span className="text-[12px] font-semibold text-[#334155] tabular-nums">{r.time || '–'}</span>}
          </div>
          {/* 운행요일 (끄기) */}
          <div className="flex gap-0.5 mt-1">
            {DAYS.map(day => {
              const on = r.days.includes(day)
              return (
                <button key={day} type="button" disabled={!on || busy} onClick={() => removeDay(dir, bus, r, day)}
                  title={on ? `${day}요일 운행 — 누르면 제거` : `${day}요일 미운행`}
                  className="w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center disabled:cursor-default"
                  style={on ? { background: color, color: '#fff' } : { background: '#F1F5F9', color: '#CBD5E1' }}>{day}</button>
              )
            })}
          </div>
        </div>

        {/* 본문: 탑승명단 */}
        <div className="flex-1 p-1.5 overflow-y-auto min-h-[90px] max-h-[240px]">
          <div className="text-[10px] font-bold text-[#94A3B8] mb-1">탑승명단</div>
          <div className="flex flex-col gap-0.5">
            {r.students.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[12px] text-[#334155]">
                <span className="truncate">{s.name}</span>
                <button onClick={() => removeRider(dir, bus, r.stop, s)} title="빼기" className="text-[#CBD5E1] hover:text-[#EF4444] leading-none flex-shrink-0">×</button>
              </div>
            ))}
            {r.students.length === 0 && <span className="text-[10px] text-[#CBD5E1]">없음</span>}
          </div>
          {adding && (
            <div className="relative mt-1">
              <input autoFocus value={riderQ} onChange={e => searchRiders(e.target.value)} placeholder="학생 이름 검색" className={`w-full ${inputCls}`} />
              {riderResults.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-0.5 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-40 overflow-auto">
                  {riderResults.map(s => (
                    <button key={s.id} onClick={() => addRider(dir, bus, r, s)} className="w-full text-left px-2 py-1.5 hover:bg-[#EAF2FB] text-[12px]">
                      {s.name}{s.english_name ? <span className="text-[#94A3B8]"> ({s.english_name})</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 편집 펼침: 좌표·주소 */}
        {editing && (
          <div className="px-1.5 pb-1.5 space-y-1.5 border-t border-[#EEF2F7] pt-1.5">
            <button type="button" onClick={() => setCoordOpen(o => !o)} className="text-[11px] font-semibold text-[#004EA2]">
              {coordOpen ? '▾' : '▸'} 좌표·주소 {hasCoord ? '(설정됨)' : '(없음)'}
            </button>
            {coordOpen && (
              <>
                <div className="flex gap-1">
                  <input value={d.addr} onChange={e => setDraftK(k2, r, { addr: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') geocodeRow(k2, r) }} placeholder="주소검색" className={`flex-1 min-w-0 ${inputCls}`} />
                  <button onClick={() => geocodeRow(k2, r)} disabled={geoKey === k2 || !d.addr.trim()}
                    className="text-[11px] font-bold text-white bg-[#004EA2] rounded px-2 disabled:opacity-40">{geoKey === k2 ? '…' : '검색'}</button>
                </div>
                <div className="flex gap-1">
                  <input value={d.lat} onChange={e => setDraftK(k2, r, { lat: e.target.value })} placeholder="위도" className={`flex-1 min-w-0 ${inputCls}`} />
                  <input value={d.lng} onChange={e => setDraftK(k2, r, { lng: e.target.value })} placeholder="경도" className={`flex-1 min-w-0 ${inputCls}`} />
                </div>
              </>
            )}
            <div className="flex gap-1 justify-end">
              <button onClick={() => { setDrafts(prev => { const n = { ...prev }; delete n[k2]; return n }); setEditKey(null) }}
                className="text-[11px] border border-[#E2E8F0] text-[#64748B] font-semibold px-2 py-1 rounded">취소</button>
              <button onClick={() => saveRow(dir, bus, r)} disabled={busy || !isDirtyK(k2, r)}
                className="text-[11px] bg-[#004EA2] text-white font-bold px-3 py-1 rounded disabled:opacity-30">{busy ? '저장…' : '저장'}</button>
            </div>
          </div>
        )}

        {/* 푸터: 인원 · +학생 · 수정 · 위치 */}
        <div className="border-t border-[#EEF2F7] p-1 flex items-center gap-1 text-[10px] bg-[#FCFCFD]">
          <span className="text-[#94A3B8]">인원 {r.students.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => { setAddRiderKey(a => a === k2 ? null : k2); setRiderQ(''); setRiderResults([]) }}
              className={`font-bold border rounded px-1.5 py-0.5 ${adding ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'text-[#16A34A] border-[#16A34A]'}`}>+학생</button>
            <button onClick={() => { if (editing) setEditKey(null); else { setEditKey(k2); setCoordOpen(false); setDraftK(k2, r, {}) } }}
              className={`font-bold border rounded px-1.5 py-0.5 ${editing ? 'bg-[#004EA2] text-white border-[#004EA2]' : 'text-[#004EA2] border-[#004EA2]'}`}>수정</button>
            {onLocateStop && <button onClick={() => onLocateStop(r.stop, bus)} title="시스템 지도에서 위치수정" className="text-[#004EA2] border border-[#004EA2] rounded px-1 py-0.5">🗺️</button>}
            {!r.hasStudents && <button onClick={() => deleteStop(dir, bus, r.stop)} title="정류장 삭제" className="text-[#CBD5E1] hover:text-[#EF4444] text-xs">×</button>}
          </div>
        </div>
      </div>
    )
  }

  // 한 방향: 호차 헤더 + 가로 정류장 카드 경로(→) + 새 정류장 추가
  const DirRow = ({ dir, bus }: { dir: Dir; bus: string }) => {
    const rows = matchRows(dir, bus)
    const color = dir === 'arr' ? '#3B82F6' : '#DC2626'
    const k = `${dir}|${bus}`
    const add = addStop[k] ?? { stop: '', time: '' }
    const Arrow = () => <div className="flex items-center flex-shrink-0 px-0.5"><span className="text-xl font-bold" style={{ color }}>→</span></div>
    const School = () => (
      <div className="flex-shrink-0 self-center flex flex-col items-center justify-center w-[56px] rounded-lg px-1 py-2 text-white" style={{ background: color }}>
        <span className="text-lg leading-none">🏫</span><span className="text-[9px] font-bold mt-0.5">{dir === 'arr' ? '도착' : '출발'}</span>
      </div>
    )
    return (
      <div className="px-2 py-2 border-b border-[#EEF2F7]">
        <div className="flex items-center gap-2 mb-1.5 pb-1" style={{ borderBottom: `2px solid ${color}` }}>
          <span className="text-[13px] font-bold" style={{ color }}>{bus} {dir === 'arr' ? '등원' : '하원'}</span>
          <span className="text-[11px] text-[#94A3B8]">정류장 {rows.length}</span>
        </div>
        <div className="flex items-stretch gap-0.5 overflow-x-auto pb-1.5">
          {rows.length === 0 && <span className="text-[11px] text-[#94A3B8] py-4">정류장 없음</span>}
          {dir === 'dep' && rows.length > 0 && <><School /><Arrow /></>}
          {rows.map((r, i) => (
            <Fragment key={r.stop}>
              {i > 0 && <Arrow />}
              <StopCard dir={dir} bus={bus} r={r} i={i} />
            </Fragment>
          ))}
          {dir === 'arr' && rows.length > 0 && <><Arrow /><School /></>}
          {/* 새 정류장 추가 카드 */}
          {!q && (
            <>
              {rows.length > 0 && <Arrow />}
              <div className="flex-shrink-0 w-[150px] rounded-lg border border-dashed border-[#CBD5E1] bg-[#FAFBFC] p-2 flex flex-col gap-1 self-stretch justify-center">
                <div className="text-[10px] font-bold text-[#94A3B8]">+ 새 정류장</div>
                <input value={add.stop} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, stop: e.target.value } }))} placeholder="정류장명" className={`w-full ${inputCls}`} />
                <input type="time" value={add.time} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, time: e.target.value } }))} className={`w-full ${inputCls}`} />
                <button onClick={() => addNewStop(dir, bus)} disabled={savingKey === 'addstop|' + k || !add.stop.trim()}
                  className="text-[11px] font-bold text-white bg-[#16A34A] rounded px-2 py-1 disabled:opacity-40">추가</button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">✓ {msg}</div>
      )}

      {/* 필터 + 우측상단 검색 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filter === f ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-[220px] max-w-full">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 정류장명 검색"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#1E293B] text-sm">✕</button>}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {buses.map(bus => {
          const matchN = matchRows('arr', bus.name).length + matchRows('dep', bus.name).length
          if (q && matchN === 0) return null
          const open = q ? true : !collapsed.has(bus.name)
          return (
            <div key={bus.id} className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(bus.name) ? n.delete(bus.name) : n.add(bus.name); return n })}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#F1F5F9] border-b border-[#E2E8F0] text-left hover:bg-[#E9EEF5]">
                <span className="font-bold text-sm text-[#1E293B]">{bus.name}
                  <span className="text-[#94A3B8] font-normal text-[11px]"> (등 {rowsOf('arr', bus.name).length}·하 {rowsOf('dep', bus.name).length})</span>
                </span>
                <span className="text-[#94A3B8] text-xs">{open ? '▾ 접기' : '▸ 펴기'}</span>
              </button>
              {open && (
                <div>
                  <DirRow dir="arr" bus={bus.name} />
                  <DirRow dir="dep" bus={bus.name} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
