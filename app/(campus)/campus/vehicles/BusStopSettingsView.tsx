'use client'

// 호차별 정류장 세팅 (중계 전용) — 호차 카드 안에 등원(승차)·하원(하차) 정류장을 나란히.
// 정류장마다 [수정] → 이름·시간·운행요일(끄기)·주소(좌표)·좌표를 한 번에 편집하고 정류장별로 저장.
// 시간 시드 = 기존 학생 운행시간의 '가장 이른 시간'(시스템 탭과 동일).
// 저장: bulk_update_location_time(세션별)로 학생 시간 변경 / remove_stop_days로 요일 제거 /
//       stop-coords PATCH로 이름·좌표(시스템 지도 핀) / registered_stops 기본값.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface Bus { id: string; name: string; sort_order: number }
interface Student {
  location: string | null; pickup_time: string | null
  days?: string[]
  dayLocs?: Record<string, string>
  dayTimes?: Record<string, string>
}
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

interface Row { stop: string; time: string; sess: string[]; days: string[]; hasStudents: boolean }
type Dir = 'arr' | 'dep'

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  void campusName
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [filter, setFilter] = useState<Filter>('유치부')
  const [msg, setMsg] = useState('')
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})
  const [addSaving, setAddSaving] = useState(false)

  // 정류장 수정 모달
  const [editModal, setEditModal] = useState<{ dir: Dir; bus: string; row: Row } | null>(null)
  const [edName, setEdName] = useState('')
  const [edTime, setEdTime] = useState('')
  const [edDays, setEdDays] = useState<string[]>([])
  const [edAddr, setEdAddr] = useState('')
  const [edLat, setEdLat] = useState('')
  const [edLng, setEdLng] = useState('')
  const [geoResults, setGeoResults] = useState<{ name: string; address: string; lat: number; lng: number }[]>([])
  const [geoLoading, setGeoLoading] = useState(false)
  const [edSaving, setEdSaving] = useState(false)

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

  const buildDir = useCallback((dir: Dir): Record<string, Row[]> => {
    if (!raw) return {}
    const resp = raw[dir]
    const cellByBus: Record<string, Record<string, { times: string[]; sess: Set<string>; days: Set<string>; hasStudents: boolean }>> = {}
    const ensure = (bus: string, stop: string) => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { times: [], sess: new Set(), days: new Set(), hasStudents: false }
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
            if (day) c.days.add(day)
            if (t) c.times.push(t)
          }
        }
      }
    }
    for (const rs of resp.registeredStops ?? []) {  // 학생 0명 등록 정류장도 후보로
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
          days: DAYS.filter(d => c.days.has(d)), hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, filter, buses])

  const arrRows = useMemo(() => buildDir('arr'), [buildDir])
  const depRows = useMemo(() => buildDir('dep'), [buildDir])
  const rowsOf = (dir: Dir, bus: string) => (dir === 'arr' ? arrRows : depRows)[bus] ?? []

  // ── 저장 헬퍼 (모두 await, 실패 시 throw → 빠짐없이 저장) ──
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
  async function removeDays(bus: string, stop: string, dir: Dir, sessionName: string, days: string[]): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_stop_days', bus_name: bus, location: stop, direction: dir, session_name: sessionName, days }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`요일:${d.error ?? res.status}`)
    return d.updated ?? 0
  }

  async function addNewStop(dir: Dir, bus: string) {
    const k = `${dir}|${bus}`; const a = addStop[k]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setAddSaving(true)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [k]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨 (${dir === 'arr' ? '등원' : '하원'})`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setAddSaving(false) }
  }
  async function deleteStop(dir: Dir, bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' (${dir === 'arr' ? '등원' : '하원'}) 정류장을 삭제할까요?`)) return
    setAddSaving(true)
    try {
      await fetch('/api/campus/registered-stops', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir }),
      })
      flash(`${bus} '${stop}' 삭제됨`); load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setAddSaving(false) }
  }

  // ── 정류장 수정 모달 ──
  function openEdit(dir: Dir, bus: string, row: Row) {
    setEditModal({ dir, bus, row })
    setEdName(row.stop); setEdTime(row.time); setEdDays([...row.days])
    setEdAddr(''); setGeoResults([])
    const c = coords[row.stop]
    setEdLat(c ? String(c.lat) : ''); setEdLng(c ? String(c.lng) : '')
  }
  function toggleDay(d: string, active: boolean) {
    if (!active) return  // 미운행 요일은 이 탭에서 켤 수 없음(학생설정에서)
    setEdDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
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
    setEdLat(String(r.lat)); setEdLng(String(r.lng)); setGeoResults([])
  }
  async function saveEdit() {
    if (!editModal) return
    const { dir, bus, row } = editModal
    const oldName = row.stop, newName = edName.trim()
    if (!newName) { alert('정류장 이름을 입력하세요.'); return }
    const lat = parseFloat(edLat), lng = parseFloat(edLng)
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng)
    const cOld = coords[oldName]
    const coordChanged = hasCoord && (!cOld || cOld.lat !== lat || cOld.lng !== lng)
    const nameChanged = newName !== oldName
    const timeChanged = edTime !== row.time
    const removed = row.days.filter(d => !edDays.includes(d))
    setEdSaving(true)
    try {
      // 1) 이름/좌표 (학생명단·등록정류장·오버라이드까지 일괄 반영) — 먼저 해서 이후 이름 기준 통일
      if (nameChanged || coordChanged) {
        const res = await fetch('/api/campus/stop-coords', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName, newName, ...(hasCoord ? { lat, lng } : {}), force: true }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.ok === false) throw new Error(`이름/좌표:${d.error ?? res.status}`)
      }
      const effName = newName
      let timeCnt = 0, dayCnt = 0
      // 2) 시간 변경 → 학생 실제 시간 반영 + 기본값
      if (timeChanged) {
        await postRegistered(bus, effName, dir, edTime)
        if (edTime) for (const sess of row.sess) timeCnt += await pushTime(bus, effName, dir, sess, edTime)
      }
      // 3) 요일 끄기 → 그날 그 정류장 탑승 제거
      if (removed.length) for (const sess of row.sess) dayCnt += await removeDays(bus, effName, dir, sess, removed)
      setEditModal(null)
      const parts = []
      if (nameChanged) parts.push('이름')
      if (coordChanged) parts.push('좌표(핀)')
      if (timeChanged) parts.push(`시간(학생 ${timeCnt}명)`)
      if (removed.length) parts.push(`요일제거 ${removed.join('·')}(학생 ${dayCnt}명)`)
      flash(`'${effName}' 저장됨${parts.length ? ' · ' + parts.join(' · ') : ''}`)
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setEdSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

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
                <td className="w-5 text-center text-[10px] text-[#94A3B8] align-top pt-1.5">{i + 1}</td>
                <td className="py-1 pr-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-[#1E293B] leading-tight">{r.stop}</span>
                    {coords[r.stop]
                      ? <span className="text-[9px] text-[#16A34A]" title={`좌표 ${coords[r.stop].lat.toFixed(5)}, ${coords[r.stop].lng.toFixed(5)}`}>📍</span>
                      : <span className="text-[9px] text-[#CBD5E1]" title="좌표 없음">📍</span>}
                    {!r.hasStudents && <span className="text-[9px] text-[#94A3B8]">(빈)</span>}
                  </div>
                  {/* 운행 요일 점 */}
                  <div className="flex gap-0.5 mt-0.5">
                    {DAYS.map(d => (
                      <span key={d} className="w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center"
                        style={r.days.includes(d) ? { background: color, color: '#fff' } : { background: '#F1F5F9', color: '#CBD5E1' }}>{d}</span>
                    ))}
                  </div>
                </td>
                <td className="py-1 w-[58px] text-[13px] text-[#334155] tabular-nums align-top pt-1.5">{r.time || '–'}</td>
                <td className="w-12 text-center whitespace-nowrap align-top pt-1">
                  <button onClick={() => openEdit(dir, bus, r)} className="text-[11px] font-bold text-[#004EA2] border border-[#004EA2] rounded px-1.5 py-0.5 hover:bg-[#EAF2FB]">수정</button>
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
          <button onClick={() => addNewStop(dir, bus)} disabled={addSaving || !add.stop.trim()}
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

      <div className="flex flex-wrap gap-1.5 mb-2 items-center">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              filter === f ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#64748B] mb-3">
        호차별 <b className="text-[#3B82F6]">등원</b>·<b className="text-[#DC2626]">하원</b> 정류장. 시간은 현재 운행시간(가장 이른)에서 가져왔습니다.
        정류장 <b>[수정]</b>에서 이름·시간·운행요일(끄기)·주소·좌표를 바꾸고 정류장별로 저장합니다.
        {` ('${FILTER_LABEL[filter]}' 세션 학생에 반영)`}
      </p>

      <div className="grid gap-4">
        {buses.map(bus => (
          <div key={bus.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
            <div className="flex items-center justify-between px-3 py-2 bg-[#F1F5F9] border-b border-[#E2E8F0]">
              <span className="font-bold text-sm text-[#1E293B]">{bus.name}
                <span className="text-[#94A3B8] font-normal"> (등원 {rowsOf('arr', bus.name).length} · 하원 {rowsOf('dep', bus.name).length})</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-[#EEF2F7]">
              <DirList dir="arr" bus={bus.name} />
              <DirList dir="dep" bus={bus.name} />
            </div>
          </div>
        ))}
      </div>

      {/* 정류장 수정 모달 */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] px-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] text-base mb-1">정류장 수정</h3>
            <p className="text-[11px] text-[#64748B] mb-4">{editModal.bus} · {editModal.dir === 'arr' ? '등원' : '하원'} · 「{editModal.row.stop}」</p>

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">정류장 이름</label>
            <input value={edName} onChange={e => setEdName(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">{editModal.dir === 'arr' ? '승차' : '하차'} 시간</label>
            <input type="time" value={edTime} onChange={e => setEdTime(e.target.value)}
              className="w-[130px] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">운행 요일 <span className="font-normal text-[#94A3B8]">(끄면 그날 이 정류장 탑승 제거 · 켜기는 학생설정)</span></label>
            <div className="flex gap-1.5 mb-3">
              {DAYS.map(d => {
                const wasActive = editModal.row.days.includes(d)
                const on = edDays.includes(d)
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d, wasActive)} disabled={!wasActive}
                    className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${
                      on ? 'bg-[#004EA2] text-white border-[#004EA2]'
                        : wasActive ? 'bg-white text-[#DC2626] border-[#DC2626] line-through'
                        : 'bg-[#F8FAFC] text-[#CBD5E1] border-[#E2E8F0] cursor-not-allowed'}`}>
                    {d}
                  </button>
                )
              })}
            </div>

            <label className="block text-xs font-semibold text-[#1E293B] mb-1">주소·장소 검색 (Kakao)</label>
            <div className="flex gap-1.5 mb-2">
              <input value={edAddr} onChange={e => setEdAddr(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doGeocode() }}
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" placeholder="예: 중계동 청구3차" />
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
            <div className="flex gap-1.5 mb-1">
              <input value={edLat} onChange={e => setEdLat(e.target.value)} placeholder="위도(lat)"
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
              <input value={edLng} onChange={e => setEdLng(e.target.value)} placeholder="경도(lng)"
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]" />
            </div>
            <p className="text-[11px] text-[#94A3B8] mb-4">좌표 저장 시 시스템 지도에 핀 표시 · 거기서 핀을 끌어 미세조정.</p>

            <div className="flex gap-2">
              <button onClick={() => setEditModal(null)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
              <button onClick={saveEdit} disabled={edSaving} className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{edSaving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
