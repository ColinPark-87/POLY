'use client'

// 호차별 정류장 세팅 (중계 전용) — 평면 인라인 편집표.
// 호차별 [등원/하원] 표에서 정류장마다 한 행: 정류장명 · 시간 · 좌표 · 주소검색 · 저장.
// 모두 그 자리에서 편집(팝업 없음), 정류장별로 [저장]. 운행요일 점은 끄기(그날 탑승 제거) 클릭.
// 시간 시드 = 기존 학생 운행시간의 가장 이른 시간(시스템 탭과 동일).
// 저장: stop-coords PATCH(이름·좌표→시스템 지도 핀) / bulk_update_location_time(학생 시간) / registered_stops(기본값) / remove_stop_days(요일 끄기).

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
interface Draft { name: string; time: string; lat: string; lng: string; addr: string }

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  void campusName
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [filter, setFilter] = useState<Filter>('유치부')
  const [msg, setMsg] = useState('')
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number }>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [geoKey, setGeoKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
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
    setDrafts({})
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
          days: DAYS.filter(d => c.days.has(d)), hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, filter, buses])

  const arrRows = useMemo(() => buildDir('arr'), [buildDir])
  const depRows = useMemo(() => buildDir('dep'), [buildDir])
  const rowsOf = (dir: Dir, bus: string) => (dir === 'arr' ? arrRows : depRows)[bus] ?? []

  const dkey = (dir: Dir, bus: string, stop: string) => `${dir}|${bus}|${stop}`
  const seedDraft = (dir: Dir, bus: string, r: Row): Draft => {
    const c = coords[r.stop]
    return { name: r.stop, time: r.time, lat: c ? String(c.lat) : '', lng: c ? String(c.lng) : '', addr: '' }
  }
  const getDraft = (dir: Dir, bus: string, r: Row): Draft => drafts[dkey(dir, bus, r.stop)] ?? seedDraft(dir, bus, r)
  const setDraft = (dir: Dir, bus: string, r: Row, patch: Partial<Draft>) => {
    const k = dkey(dir, bus, r.stop)
    setDrafts(prev => ({ ...prev, [k]: { ...(prev[k] ?? seedDraft(dir, bus, r)), ...patch } }))
  }
  const isDirty = (dir: Dir, bus: string, r: Row): boolean => {
    const d = drafts[dkey(dir, bus, r.stop)]
    if (!d) return false
    const c = coords[r.stop]
    const baseLat = c ? String(c.lat) : '', baseLng = c ? String(c.lng) : ''
    return d.name !== r.stop || d.time !== r.time || d.lat !== baseLat || d.lng !== baseLng
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

  async function geocodeRow(dir: Dir, bus: string, r: Row) {
    const d = getDraft(dir, bus, r)
    if (!d.addr.trim()) return
    const k = dkey(dir, bus, r.stop)
    setGeoKey(k)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(d.addr.trim())}`)
      const j = await res.json().catch(() => ({}))
      const first = (j.results ?? [])[0]
      if (!first) { flash('검색 결과 없음'); return }
      setDraft(dir, bus, r, { lat: String(first.lat), lng: String(first.lng) })
      flash(`📍 ${first.name} 좌표 적용 (저장 눌러 반영)`)
    } finally { setGeoKey(null) }
  }

  async function saveRow(dir: Dir, bus: string, r: Row) {
    const d = getDraft(dir, bus, r)
    const oldName = r.stop, newName = d.name.trim()
    if (!newName) { alert('정류장 이름을 입력하세요.'); return }
    const lat = parseFloat(d.lat), lng = parseFloat(d.lng)
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng)
    const cOld = coords[oldName]
    const coordChanged = hasCoord && (!cOld || cOld.lat !== lat || cOld.lng !== lng)
    const nameChanged = newName !== oldName
    const timeChanged = d.time !== r.time
    if (!nameChanged && !coordChanged && !timeChanged) { flash('변경 없음'); return }
    const k = dkey(dir, bus, r.stop)
    setSavingKey(k)
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
      if (nameChanged) parts.push('이름')
      if (coordChanged) parts.push('좌표(핀)')
      if (timeChanged) parts.push(`시간(학생 ${tc}명)`)
      flash(`'${eff}' 저장됨 · ${parts.join(' · ')}`)
      setDrafts(prev => { const n = { ...prev }; delete n[k]; return n })
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function removeDay(dir: Dir, bus: string, r: Row, day: string) {
    if (!confirm(`${bus} '${r.stop}' ${day}요일 탑승을 제거할까요? (${FILTER_LABEL[filter]} 세션 학생)`)) return
    const k = dkey(dir, bus, r.stop)
    setSavingKey(k)
    try {
      let n = 0
      for (const sess of r.sess) n += await removeDayApi(bus, r.stop, dir, sess, [day])
      flash(`${day}요일 제거됨 · 학생 ${n}명`); load()
    } catch (e) { alert(`요일 제거 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  async function addNewStop(dir: Dir, bus: string) {
    const k = `${dir}|${bus}`; const a = addStop[k]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSavingKey('add|' + k)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [k]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨 (${dir === 'arr' ? '등원' : '하원'})`); load()
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
      flash(`${bus} '${stop}' 삭제됨`); load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setSavingKey(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  const inputCls = 'border border-[#E2E8F0] rounded px-1.5 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]'

  const DirTable = ({ dir, bus }: { dir: Dir; bus: string }) => {
    const rows = rowsOf(dir, bus)
    const color = dir === 'arr' ? '#3B82F6' : '#DC2626'
    const label = dir === 'arr' ? '등원(승차)' : '하원(하차)'
    const k = `${dir}|${bus}`
    const add = addStop[k] ?? { stop: '', time: '' }
    return (
      <div className="overflow-x-auto">
        <div className="text-[12px] font-bold px-2 py-1.5" style={{ color }}>{label} · {rows.length}</div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] text-[#64748B] bg-[#F8FAFC] border-y border-[#EEF2F7]">
              <th className="w-5 py-1.5"></th>
              <th className="text-left py-1.5 font-medium px-1">정류장명 · 운행요일</th>
              <th className="w-[96px] py-1.5 font-medium">시간</th>
              <th className="w-[200px] py-1.5 font-medium">좌표 (위도/경도)</th>
              <th className="text-left py-1.5 font-medium px-1">주소·장소 검색</th>
              <th className="w-[88px] py-1.5 font-medium">저장</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-[#94A3B8] text-xs py-3">없음</td></tr>}
            {rows.map((r, i) => {
              const d = getDraft(dir, bus, r)
              const k2 = dkey(dir, bus, r.stop)
              const busy = savingKey === k2
              const hasCoord = !!coords[r.stop]
              return (
                <tr key={r.stop} className={`border-b border-[#F4F6F9] ${isDirty(dir, bus, r) ? 'bg-[#FFFBEB]' : ''}`}>
                  <td className="text-center text-[10px] text-[#94A3B8] align-top pt-2">{i + 1}</td>
                  <td className="py-1 px-1 align-top">
                    <input value={d.name} onChange={e => setDraft(dir, bus, r, { name: e.target.value })} className={`w-full ${inputCls}`} />
                    <div className="flex gap-0.5 mt-1">
                      {DAYS.map(day => {
                        const on = r.days.includes(day)
                        return (
                          <button key={day} type="button" disabled={!on || busy}
                            onClick={() => removeDay(dir, bus, r, day)}
                            title={on ? `${day}요일 운행 — 누르면 제거` : `${day}요일 미운행`}
                            className="w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center disabled:cursor-default"
                            style={on ? { background: color, color: '#fff' } : { background: '#F1F5F9', color: '#CBD5E1' }}>{day}</button>
                        )
                      })}
                    </div>
                  </td>
                  <td className="py-1 align-top">
                    <input type="time" value={d.time} onChange={e => setDraft(dir, bus, r, { time: e.target.value })} className={`w-[88px] ${inputCls}`} />
                  </td>
                  <td className="py-1 align-top">
                    <div className="flex gap-1 items-center">
                      <input value={d.lat} onChange={e => setDraft(dir, bus, r, { lat: e.target.value })} placeholder="위도" className={`w-[92px] ${inputCls}`} />
                      <input value={d.lng} onChange={e => setDraft(dir, bus, r, { lng: e.target.value })} placeholder="경도" className={`w-[92px] ${inputCls}`} />
                      <span className="text-[10px]" style={{ color: hasCoord ? '#16A34A' : '#CBD5E1' }} title={hasCoord ? '시스템 지도에 핀 있음' : '좌표 없음'}>📍</span>
                    </div>
                  </td>
                  <td className="py-1 px-1 align-top">
                    <div className="flex gap-1">
                      <input value={d.addr} onChange={e => setDraft(dir, bus, r, { addr: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') geocodeRow(dir, bus, r) }}
                        placeholder="주소·장소 입력 후 검색" className={`flex-1 min-w-[120px] ${inputCls}`} />
                      <button onClick={() => geocodeRow(dir, bus, r)} disabled={geoKey === k2 || !d.addr.trim()}
                        className="text-[11px] font-bold text-[#004EA2] border border-[#004EA2] rounded px-2 disabled:opacity-40 whitespace-nowrap">{geoKey === k2 ? '검색…' : '검색'}</button>
                    </div>
                  </td>
                  <td className="py-1 text-center align-top whitespace-nowrap">
                    <button onClick={() => saveRow(dir, bus, r)} disabled={busy || !isDirty(dir, bus, r)}
                      className="text-[11px] font-bold text-white bg-[#004EA2] rounded px-2.5 py-1 disabled:opacity-30">{busy ? '…' : '저장'}</button>
                    {!r.hasStudents && (
                      <button onClick={() => deleteStop(dir, bus, r.stop)} title="삭제" className="ml-1 text-[#CBD5E1] hover:text-[#EF4444] text-sm leading-none">×</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {/* 새 정류장 추가 */}
            <tr className="bg-[#FAFBFC]">
              <td></td>
              <td className="px-1 py-1.5">
                <input value={add.stop} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, stop: e.target.value } }))}
                  placeholder="새 정류장명" className={`w-full ${inputCls}`} />
              </td>
              <td className="py-1.5">
                <input type="time" value={add.time} onChange={e => setAddStop(prev => ({ ...prev, [k]: { ...add, time: e.target.value } }))} className={`w-[88px] ${inputCls}`} />
              </td>
              <td colSpan={2} className="text-[10px] text-[#94A3B8] px-1">추가 후 행에서 좌표·주소 설정</td>
              <td className="text-center py-1.5">
                <button onClick={() => addNewStop(dir, bus)} disabled={savingKey === 'add|' + k || !add.stop.trim()}
                  className="text-[11px] font-bold text-white bg-[#16A34A] rounded px-2.5 py-1 disabled:opacity-40">추가</button>
              </td>
            </tr>
          </tbody>
        </table>
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
        정류장마다 이름·시간·좌표·주소를 그 자리에서 고치고 <b>[저장]</b>. 좌표 저장 시 시스템 지도에 핀 표시(거기서 드래그 미세조정).
        운행요일 점을 누르면 그날 탑승 제거. <b>(&apos;{FILTER_LABEL[filter]}&apos; 세션 학생에 반영)</b>
      </p>

      <div className="grid gap-5">
        {buses.map(bus => (
          <div key={bus.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
            <div className="px-3 py-2 bg-[#F1F5F9] border-b border-[#E2E8F0]">
              <span className="font-bold text-sm text-[#1E293B]">{bus.name}
                <span className="text-[#94A3B8] font-normal"> (등원 {rowsOf('arr', bus.name).length} · 하원 {rowsOf('dep', bus.name).length})</span>
              </span>
            </div>
            <div className="divide-y divide-[#E2E8F0]">
              <DirTable dir="arr" bus={bus.name} />
              <DirTable dir="dep" bus={bus.name} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
