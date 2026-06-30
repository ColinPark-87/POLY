'use client'

// 호차별 정류장 세팅 (중계 전용) — 호차 카드 안에 등원(승차)·하원(하차) 정류장+시간을 나란히.
// (등원/하원 정류장명이 달라 한 행 병합은 안 함 — 대전 배차표처럼 좌/우 두 리스트로 표시.)
// 시간 시드 = 기존 학생 운행시간의 '가장 이른 시간'(시스템 탭과 동일).
// 저장 = bulk_update_location_time(세션별 정확 매칭)로 학생 실제 시간 변경 + (전체 탭) registered_stops 기본값.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface Bus { id: string; name: string; sort_order: number }
interface Student {
  location: string | null; pickup_time: string | null
  dayLocs?: Record<string, string>
  dayTimes?: Record<string, string>
}
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
    if (dir === 'dep') return filter === '매일반'  // 초등 방과후 하원 → 매일반
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

function stopTimePairs(s: Student): [string, string][] {
  const out: [string, string][] = []
  if (s.location) out.push([s.location.trim(), normalizeTime(s.pickup_time)])
  for (const [day, loc] of Object.entries(s.dayLocs ?? {})) {
    if (loc) out.push([loc.trim(), normalizeTime(s.dayTimes?.[day] ?? s.pickup_time)])
  }
  return out
}

interface Row { stop: string; time: string; sess: string[]; hasStudents: boolean }
type Dir = 'arr' | 'dep'

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  void campusName
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [filter, setFilter] = useState<Filter>('유치부')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // 편집 오버레이 `${dir}|${filter}|${bus}|${stop}` → 시간
  const [edits, setEdits] = useState<Record<string, string>>({})
  // 새 정류장 입력 `${dir}|${bus}` → {stop,time}
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})
  // 좌표 (campus_stop_coords) stopName → {lat,lng}
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  // 정류장 편집 모달 (이름·주소·좌표)
  const [editModal, setEditModal] = useState<{ dir: Dir; bus: string; stop: string } | null>(null)
  const [edName, setEdName] = useState('')
  const [edAddr, setEdAddr] = useState('')
  const [edLat, setEdLat] = useState('')
  const [edLng, setEdLng] = useState('')
  const [geoResults, setGeoResults] = useState<{ name: string; address: string; lat: number; lng: number }[]>([])
  const [geoLoading, setGeoLoading] = useState(false)
  const [edSaving, setEdSaving] = useState(false)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    const [arr, dep, cd] = await Promise.all([
      fetch('/api/campus/vehicles?direction=arr&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/vehicles?direction=dep&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/stop-coords').then(r => r.json()).catch(() => ({})),
    ]) as [MasterResp, MasterResp, { coords?: Record<string, { lat: number; lng: number }> }]
    setRaw({ arr, dep })
    setCoords(cd.coords ?? {})
    setEdits({})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const buses: Bus[] = useMemo(() => (raw ? (raw.arr.buses?.length ? raw.arr.buses : raw.dep.buses) ?? [] : []), [raw])

  // 방향별 호차별 정류장. 시간 = 학생 시간 중 가장 이른 값(시스템 탭과 동일).
  const buildDir = useCallback((dir: Dir): Record<string, Row[]> => {
    if (!raw) return {}
    const resp = raw[dir]
    const cellByBus: Record<string, Record<string, { times: string[]; sess: Set<string>; hasStudents: boolean }>> = {}
    const ensure = (bus: string, stop: string) => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { times: [], sess: new Set(), hasStudents: false }
      return cellByBus[bus][stop]
    }
    for (const tg of resp.timeGroups ?? []) {
      if (!sessMatch(tg.session_name, filter, dir)) continue
      for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
        for (const s of students) {
          for (const [stop, t] of stopTimePairs(s)) {
            if (!stop) continue
            const c = ensure(bus, stop)
            c.hasStudents = true
            c.sess.add(tg.session_name)
            if (t) c.times.push(t)
          }
        }
      }
    }
    // 학생 0명 등록 정류장(registered)도 노출 — 세션 무관(후보 정류장)
    for (const rs of resp.registeredStops ?? []) {
      const c = ensure(rs.bus_name, rs.stop_name.trim())
      const t = normalizeTime(rs.default_time)
      if (t && c.times.length === 0) c.times.push(t)
    }
    const out: Record<string, Row[]> = {}
    for (const bus of buses.map(b => b.name)) {
      const cells = cellByBus[bus] ?? {}
      out[bus] = Object.entries(cells)
        .map(([stop, c]) => ({ stop, time: c.times.length ? c.times.slice().sort()[0] : '', sess: [...c.sess], hasStudents: c.hasStudents }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, filter, buses])

  const arrRows = useMemo(() => buildDir('arr'), [buildDir])
  const depRows = useMemo(() => buildDir('dep'), [buildDir])
  const rowsOf = (dir: Dir, bus: string) => (dir === 'arr' ? arrRows : depRows)[bus] ?? []

  const eKey = (dir: Dir, bus: string, stop: string) => `${dir}|${filter}|${bus}|${stop}`
  const val = (dir: Dir, bus: string, r: Row) => edits[eKey(dir, bus, r.stop)] ?? r.time
  const dirtyOf = (dir: Dir, bus: string, r: Row) => { const k = eKey(dir, bus, r.stop); return k in edits && edits[k] !== r.time }
  const dirtyCount = useMemo(() => {
    let n = 0
    for (const dir of ['arr', 'dep'] as Dir[]) for (const bus of buses.map(b => b.name)) for (const r of rowsOf(dir, bus)) if (dirtyOf(dir, bus, r)) n++
    return n
  }, [edits, arrRows, depRows, buses])

  function setTime(dir: Dir, bus: string, stop: string, v: string) { setEdits(prev => ({ ...prev, [eKey(dir, bus, stop)]: v })) }
  function guardSwitch(fn: () => void) {
    if (dirtyCount > 0 && !confirm(`저장하지 않은 변경 ${dirtyCount}건이 있습니다. 버리고 이동할까요?`)) return
    fn()
  }

  async function postRegistered(bus: string, stop: string, dir: Dir, time: string) {
    const res = await fetch('/api/campus/registered-stops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir, default_time: time || null }),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `${res.status}`) }
  }
  async function pushTime(bus: string, stop: string, dir: Dir, sessionName: string, time: string): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_update_location_time', bus_name: bus, location: stop, direction: dir, session_name: sessionName, new_time: time }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? `${res.status}`)
    return d.updated ?? 0
  }
  async function persist(dir: Dir, bus: string, r: Row): Promise<number> {
    if (!dirtyOf(dir, bus, r)) return 0
    const cur = val(dir, bus, r)
    await postRegistered(bus, r.stop, dir, cur)              // 정류장 기본 시간 항상 기록
    let pushed = 0
    if (cur) for (const sess of r.sess) pushed += await pushTime(bus, r.stop, dir, sess, cur)  // 해당 세션 학생 시간 반영
    return pushed
  }

  async function saveBus(bus: string) {
    setSaving(true)
    try {
      let pushed = 0
      for (const dir of ['arr', 'dep'] as Dir[]) for (const r of rowsOf(dir, bus)) pushed += await persist(dir, bus, r)
      flash(`${bus} 저장됨 · 학생 ${pushed}명 시간 반영`); load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function saveAll() {
    setSaving(true)
    try {
      let pushed = 0
      for (const dir of ['arr', 'dep'] as Dir[]) for (const bus of buses.map(b => b.name)) for (const r of rowsOf(dir, bus)) pushed += await persist(dir, bus, r)
      flash(`전체 저장됨 · 학생 ${pushed}명 시간 반영`); load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function addNewStop(dir: Dir, bus: string) {
    const k = `${dir}|${bus}`; const a = addStop[k]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSaving(true)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [k]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨 (${dir === 'arr' ? '등원' : '하원'})`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function deleteStop(dir: Dir, bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' (${dir === 'arr' ? '등원' : '하원'}) 정류장을 삭제할까요?`)) return
    setSaving(true)
    try {
      await fetch('/api/campus/registered-stops', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir }),
      })
      flash(`${bus} '${stop}' 삭제됨`); load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  // ── 정류장 편집(이름·주소·좌표) ──────────────────────────────
  function openEdit(dir: Dir, bus: string, stop: string) {
    setEditModal({ dir, bus, stop })
    setEdName(stop)
    setEdAddr('')
    setGeoResults([])
    const c = coords[stop]
    setEdLat(c ? String(c.lat) : '')
    setEdLng(c ? String(c.lng) : '')
  }
  async function doGeocode() {
    if (!edAddr.trim()) return
    setGeoLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(edAddr.trim())}`)
      const d = await res.json().catch(() => ({}))
      setGeoResults(d.results ?? [])
    } finally { setGeoLoading(false) }
  }
  function pickGeo(r: { name: string; address: string; lat: number; lng: number }) {
    setEdLat(String(r.lat)); setEdLng(String(r.lng))
    setGeoResults([])
  }
  async function saveEdit() {
    if (!editModal) return
    const oldName = editModal.stop
    const newName = edName.trim()
    if (!newName) { alert('정류장 이름을 입력하세요.'); return }
    const lat = parseFloat(edLat), lng = parseFloat(edLng)
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng)
    setEdSaving(true)
    try {
      const res = await fetch('/api/campus/stop-coords', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName, ...(hasCoord ? { lat, lng } : {}), force: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) throw new Error(d.error ?? `${res.status}`)
      setEditModal(null)
      flash(`'${newName}' 저장됨${hasCoord ? ' · 좌표 핀 반영(시스템 지도)' : ''}`)
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setEdSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  // 한 방향 리스트 (등원/하원) — 호차 카드 내부에서 좌/우로 나란히
  const DirList = ({ dir, bus }: { dir: Dir; bus: string }) => {
    const rows = rowsOf(dir, bus)
    const color = dir === 'arr' ? '#3B82F6' : '#DC2626'
    const label = dir === 'arr' ? '등원(승차)' : '하원(하차)'
    const k = `${dir}|${bus}`
    const add = addStop[k] ?? { stop: '', time: '' }
    return (
      <div className="min-w-0">
        <div className="text-[11px] font-bold px-2 py-1 border-b" style={{ color, borderColor: color + '55' }}>{label} · {rows.length}</div>
        <table className="w-full text-sm">
          <tbody>
            {rows.length === 0 && <tr><td className="text-center text-[#94A3B8] text-xs py-3">없음</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.stop} className="border-b border-[#F4F6F9]">
                <td className="w-5 text-center text-[10px] text-[#94A3B8]">{i + 1}</td>
                <td className="py-1 pr-1">
                  <span className="text-[12px] text-[#1E293B] leading-tight">{r.stop}</span>
                  {coords[r.stop]
                    ? <span className="ml-1 text-[9px] text-[#16A34A]" title={`좌표 ${coords[r.stop].lat.toFixed(5)}, ${coords[r.stop].lng.toFixed(5)}`}>📍</span>
                    : <span className="ml-1 text-[9px] text-[#CBD5E1]" title="좌표 없음">📍</span>}
                  {!r.hasStudents && <span className="ml-1 text-[9px] text-[#94A3B8]">(빈)</span>}
                </td>
                <td className="py-1 w-[116px]">
                  <input type="time" value={val(dir, bus, r)} onChange={e => setTime(dir, bus, r.stop, e.target.value)}
                    className={`w-[110px] border rounded px-1.5 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#004EA2] ${
                      dirtyOf(dir, bus, r) ? 'border-[#F59E0B] bg-[#FFFBEB] ring-1 ring-[#F59E0B]' : 'border-[#E2E8F0]'}`} />
                </td>
                <td className="w-10 text-center whitespace-nowrap">
                  <button onClick={() => openEdit(dir, bus, r.stop)} title="이름·주소·좌표 수정" className="text-[#94A3B8] hover:text-[#004EA2] text-xs">✎</button>
                  {!r.hasStudents && (
                    <button onClick={() => deleteStop(dir, bus, r.stop)} title="삭제" className="ml-1 text-[#CBD5E1] hover:text-[#EF4444] text-sm leading-none">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-1 px-1.5 py-1.5">
          <input value={add.stop} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, stop: e.target.value } }))}
            placeholder="새 정류장" className="flex-1 min-w-0 border border-[#E2E8F0] rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
          <input type="time" value={add.time} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, time: e.target.value } }))}
            className="w-[110px] border border-[#E2E8F0] rounded px-1.5 py-1 text-[12px]" />
          <button onClick={() => addNewStop(dir, bus)} disabled={saving || !add.stop.trim()}
            className="text-[10px] font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded px-1.5 py-1.5 disabled:opacity-40">추가</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">✓ {msg}</div>
      )}

      {/* 세션 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-2 items-center">
        {FILTERS.map(f => (
          <button key={f} onClick={() => guardSwitch(() => setFilter(f))}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              filter === f ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-[#64748B]">
          호차별 <b className="text-[#3B82F6]">등원(승차)</b>·<b className="text-[#DC2626]">하원(하차)</b> 정류장·시간 (가장 이른 시간 기준).
          {` 저장 시 '${FILTER_LABEL[filter]}' 세션 학생 시간이 바뀝니다.`}
        </p>
        <button onClick={saveAll} disabled={saving || dirtyCount === 0}
          className="text-xs font-bold text-white bg-[#004EA2] hover:bg-[#003E83] rounded-lg px-3 py-2 disabled:opacity-40 whitespace-nowrap">
          {saving ? '저장 중…' : `변경분 전체 저장${dirtyCount ? ` (${dirtyCount})` : ''}`}
        </button>
      </div>

      <div className="grid gap-4">
        {buses.map(bus => (
          <div key={bus.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
            <div className="flex items-center justify-between px-3 py-2 bg-[#F1F5F9] border-b border-[#E2E8F0]">
              <span className="font-bold text-sm text-[#1E293B]">{bus.name}
                <span className="text-[#94A3B8] font-normal"> (등원 {rowsOf('arr', bus.name).length} · 하원 {rowsOf('dep', bus.name).length})</span>
              </span>
              <button onClick={() => saveBus(bus.name)} disabled={saving}
                className="text-[11px] font-bold text-[#004EA2] border border-[#004EA2] rounded-md px-2 py-1 hover:bg-[#EAF2FB] disabled:opacity-50">저장</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-[#EEF2F7]">
              <DirList dir="arr" bus={bus.name} />
              <DirList dir="dep" bus={bus.name} />
            </div>
          </div>
        ))}
      </div>

      {/* 정류장 편집 모달: 이름·주소(좌표 자동)·좌표 */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] px-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] text-base mb-1">정류장 수정</h3>
            <p className="text-[11px] text-[#64748B] mb-4">{editModal.bus} · {editModal.dir === 'arr' ? '등원' : '하원'} · 원래 이름 「{editModal.stop}」</p>

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">정류장 이름</label>
            <input value={edName} onChange={e => setEdName(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#004EA2]" placeholder="정류장 이름" />

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">주소·장소 검색 (Kakao)</label>
            <div className="flex gap-1.5 mb-2">
              <input value={edAddr} onChange={e => setEdAddr(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doGeocode() }}
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" placeholder="예: 중계동 청구3차 아파트" />
              <button onClick={doGeocode} disabled={geoLoading || !edAddr.trim()}
                className="text-xs font-bold text-white bg-[#004EA2] rounded-lg px-3 disabled:opacity-40">{geoLoading ? '검색…' : '검색'}</button>
            </div>
            {geoResults.length > 0 && (
              <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#F1F5F9] mb-3 max-h-44 overflow-auto">
                {geoResults.map((g, i) => (
                  <button key={i} onClick={() => pickGeo(g)} className="w-full text-left px-3 py-2 hover:bg-[#EAF2FB]">
                    <div className="text-[13px] text-[#1E293B] font-medium">{g.name}</div>
                    <div className="text-[11px] text-[#64748B]">{g.address}</div>
                  </button>
                ))}
              </div>
            )}

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">좌표 (위도 / 경도)</label>
            <div className="flex gap-1.5 mb-1 items-center">
              <input value={edLat} onChange={e => setEdLat(e.target.value)} placeholder="위도(lat)"
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              <input value={edLng} onChange={e => setEdLng(e.target.value)} placeholder="경도(lng)"
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
            </div>
            <p className="text-[11px] text-[#94A3B8] mb-4">좌표를 저장하면 시스템 지도에 핀이 표시되고, 거기서 핀을 끌어 미세조정할 수 있습니다.</p>

            <div className="flex gap-2">
              <button onClick={() => setEditModal(null)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={saveEdit} disabled={edSaving} className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{edSaving ? '저장 중…' : '수정 저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
