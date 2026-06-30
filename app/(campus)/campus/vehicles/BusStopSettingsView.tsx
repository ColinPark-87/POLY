'use client'

// 호차별 정류장 세팅 (중계 전용) — 시스템 탭과 동일하게 [방향(등원/하원)] × [세션] 별로
// 호차별 정류장 + 시간을 보여주고 편집한다. 시간 시드는 기존 학생 운행시간의 '가장 이른 시간'(시스템 탭과 동일).
// 저장 = bulk_update_location_time(세션별 정확 매칭)로 학생 실제 스케줄 시간 변경 + (전체 탭) registered_stops 기본값.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface Bus { id: string; name: string; sort_order: number }
interface Student {
  location: string | null; pickup_time: string | null
  days?: string[]
  dayLocs?: Record<string, string>
  dayTimes?: Record<string, string>
}
interface TimeGroup { session_name: string; busMap: Record<string, Student[]> }
interface RegStop { stop_name: string; bus_name: string; direction: string; default_time: string | null }
interface MasterResp { buses: Bus[]; timeGroups: TimeGroup[]; registeredStops: RegStop[] }

type Filter = '전체' | '유치부' | '초등부' | '5일' | '3일' | '2일'
const FILTERS: Filter[] = ['전체', '유치부', '초등부', '5일', '3일', '2일']
const FILTER_LABEL: Record<Filter, string> = {
  '전체': '전체', '유치부': '유치부', '초등부': '초등부(5·3·2일)', '5일': '5일(매일반)', '3일': '3일(월수금)', '2일': '2일(화목)',
}

function sessMatch(name: string, filter: Filter, dir: 'arr' | 'dep'): boolean {
  if (filter === '전체') return true
  if (name.includes('방과후')) {
    if (name.includes('유치부')) return filter === '유치부'
    if (dir === 'dep') return filter === '5일' || filter === '초등부'
    return filter === '유치부'
  }
  if (filter === '유치부') return name.includes('유치부')
  if (filter === '초등부') return !name.includes('유치부')
  if (filter === '5일') return name.includes('매일반') || name.includes('5일')
  if (filter === '3일') return name.includes('월수금') || name.includes('3일')
  if (filter === '2일') return name.includes('화목') || name.includes('2일')
  return true
}

// "HH:MM" 24시 정규화 (8시 미만은 오후 +12). 비교/표시 공통.
function normalizeTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// 학생이 한 호차에서 갖는 (정류장, 시간) 쌍 — 단일 location + 요일별 dayLocs/dayTimes
function stopTimePairs(s: Student): [string, string][] {
  const out: [string, string][] = []
  if (s.location) out.push([s.location.trim(), normalizeTime(s.pickup_time)])
  for (const [day, loc] of Object.entries(s.dayLocs ?? {})) {
    if (loc) out.push([loc.trim(), normalizeTime(s.dayTimes?.[day] ?? s.pickup_time)])
  }
  return out
}

interface Row { stop: string; time: string; sess: string[]; hasStudents: boolean }

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [dir, setDir] = useState<'arr' | 'dep'>('dep')
  const [filter, setFilter] = useState<Filter>('전체')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // 편집 오버레이 `${dir}|${filter}|${bus}|${stop}` → 시간
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [addStop, setAddStop] = useState<Record<string, { stop: string; time: string }>>({})

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    const [arr, dep] = await Promise.all([
      fetch('/api/campus/vehicles?direction=arr&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/vehicles?direction=dep&master=true').then(r => r.json()).catch(() => ({})),
    ]) as [MasterResp, MasterResp]
    setRaw({ arr, dep })
    setEdits({})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const buses: Bus[] = useMemo(() => (raw ? (raw.arr.buses?.length ? raw.arr.buses : raw.dep.buses) ?? [] : []), [raw])

  // 선택 방향+필터의 호차별 정류장. 시간 = 학생 시간 중 가장 이른 값(시스템 탭과 동일).
  const baseRowsByBus: Record<string, Row[]> = useMemo(() => {
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
    if (filter === '전체') {
      for (const rs of resp.registeredStops ?? []) {
        const c = ensure(rs.bus_name, rs.stop_name.trim())
        const t = normalizeTime(rs.default_time)
        if (t && c.times.length === 0) c.times.push(t)
      }
    }
    const out: Record<string, Row[]> = {}
    for (const bus of buses.map(b => b.name)) {
      const cells = cellByBus[bus] ?? {}
      out[bus] = Object.entries(cells)
        .map(([stop, c]) => ({
          stop,
          time: c.times.length ? c.times.slice().sort()[0] : '',  // 가장 이른 시간
          sess: [...c.sess],
          hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || a.stop.localeCompare(b.stop, 'ko'))
    }
    return out
  }, [raw, dir, filter, buses])

  const eKey = (bus: string, stop: string) => `${dir}|${filter}|${bus}|${stop}`
  const val = (bus: string, r: Row) => edits[eKey(bus, r.stop)] ?? r.time
  const dirtyOf = (bus: string, r: Row) => { const k = eKey(bus, r.stop); return k in edits && edits[k] !== r.time }
  const dirtyCount = useMemo(() => {
    let n = 0
    for (const bus of buses.map(b => b.name)) for (const r of baseRowsByBus[bus] ?? []) if (dirtyOf(bus, r)) n++
    return n
  }, [edits, baseRowsByBus, buses])

  function setTime(bus: string, stop: string, v: string) { setEdits(prev => ({ ...prev, [eKey(bus, stop)]: v })) }
  function guardSwitch(fn: () => void) {
    if (dirtyCount > 0 && !confirm(`저장하지 않은 변경 ${dirtyCount}건이 있습니다. 버리고 이동할까요?`)) return
    fn()
  }

  async function postRegistered(bus: string, stop: string, d: 'arr' | 'dep', time: string) {
    const res = await fetch('/api/campus/registered-stops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: d, default_time: time || null }),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `${res.status}`) }
  }
  async function pushTime(bus: string, stop: string, sessionName: string, time: string): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_update_location_time', bus_name: bus, location: stop, direction: dir, session_name: sessionName, new_time: time }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? `${res.status}`)
    return d.updated ?? 0
  }
  async function persist(bus: string, r: Row): Promise<number> {
    if (!dirtyOf(bus, r)) return 0
    const cur = val(bus, r)
    if (filter === '전체') {
      await postRegistered(bus, r.stop, dir, cur)
      return cur ? await pushTime(bus, r.stop, '', cur) : 0
    }
    let pushed = 0
    if (cur) for (const sess of r.sess) pushed += await pushTime(bus, r.stop, sess, cur)
    return pushed
  }

  async function saveBus(bus: string) {
    setSaving(true)
    try {
      let pushed = 0
      for (const r of baseRowsByBus[bus] ?? []) pushed += await persist(bus, r)
      flash(`${bus} 저장됨 · 학생 ${pushed}명 시간 반영`); load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function saveAll() {
    setSaving(true)
    try {
      let pushed = 0
      for (const bus of buses.map(b => b.name)) for (const r of baseRowsByBus[bus] ?? []) pushed += await persist(bus, r)
      flash(`전체 저장됨 · 학생 ${pushed}명 시간 반영`); load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function addNewStop(bus: string) {
    const a = addStop[bus]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSaving(true)
    try {
      await postRegistered(bus, stop, dir, a.time || '')
      setAddStop(prev => ({ ...prev, [bus]: { stop: '', time: '' } }))
      flash(`${bus} '${stop}' 추가됨 (${dir === 'arr' ? '등원' : '하원'})`); load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }
  async function deleteStop(bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' 정류장을 세팅에서 삭제할까요?`)) return
    setSaving(true)
    try {
      await fetch('/api/campus/registered-stops', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir }),
      })
      flash(`${bus} '${stop}' 삭제됨`); load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  const dirColor = dir === 'arr' ? '#3B82F6' : '#DC2626'

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">✓ {msg}</div>
      )}

      {/* 방향 + 세션 */}
      <div className="flex flex-wrap gap-1.5 mb-2 items-center">
        {(['arr', 'dep'] as const).map(d => (
          <button key={d} onClick={() => guardSwitch(() => setDir(d))}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
              dir === d ? (d === 'arr' ? 'bg-[#3B82F6] text-white' : 'bg-[#DC2626] text-white') : 'bg-white border border-[#E2E8F0] text-[#64748B]'}`}>
            {d === 'arr' ? '🚌 등원' : '🏠 하원'}
          </button>
        ))}
        <div className="w-px h-5 bg-[#E2E8F0] mx-1" />
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
          <b style={{ color: dirColor }}>{dir === 'arr' ? '등원(승차)' : '하원(하차)'}</b> 정류장·시간 — 현재 운행 시간(가장 이른 시간)에서 가져왔습니다.
          {filter === '전체' ? ' 저장 시 그 정류장 전 세션 학생 시간이 바뀝니다.' : ` 저장 시 '${FILTER_LABEL[filter]}' 세션 학생 시간만 바뀝니다.`}
        </p>
        <button onClick={saveAll} disabled={saving || dirtyCount === 0}
          className="text-xs font-bold text-white bg-[#004EA2] hover:bg-[#003E83] rounded-lg px-3 py-2 disabled:opacity-40 whitespace-nowrap">
          {saving ? '저장 중…' : `변경분 전체 저장${dirtyCount ? ` (${dirtyCount})` : ''}`}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {buses.map(bus => {
          const rows = baseRowsByBus[bus.name] ?? []
          const add = addStop[bus.name] ?? { stop: '', time: '' }
          return (
            <div key={bus.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
              <div className="flex items-center justify-between px-3 py-2 bg-[#F1F5F9] border-b border-[#E2E8F0]">
                <span className="font-bold text-sm text-[#1E293B]">{bus.name} <span className="text-[#94A3B8] font-normal">({rows.length}개 정류장)</span></span>
                <button onClick={() => saveBus(bus.name)} disabled={saving}
                  className="text-[11px] font-bold text-[#004EA2] border border-[#004EA2] rounded-md px-2 py-1 hover:bg-[#EAF2FB] disabled:opacity-50">저장</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-[#64748B] bg-white border-b border-[#EEF2F7]">
                    <th className="w-7 py-1.5 font-medium">#</th>
                    <th className="text-left py-1.5 font-medium">정류장 ({dir === 'arr' ? '승차' : '하차'} 장소)</th>
                    <th className="w-24 py-1.5 font-medium" style={{ color: dirColor }}>{dir === 'arr' ? '승차시간' : '하차시간'}</th>
                    <th className="w-7"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-[#94A3B8] text-xs py-4">정류장 없음</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.stop} className="border-b border-[#F4F6F9]">
                      <td className="text-center text-[11px] text-[#94A3B8]">{i + 1}</td>
                      <td className="py-1 pr-1">
                        <span className="text-[13px] text-[#1E293B]">{r.stop}</span>
                        {!r.hasStudents && <span className="ml-1 text-[9px] text-[#94A3B8] align-middle">(빈 정류장)</span>}
                      </td>
                      <td className="py-1">
                        <input type="time" value={val(bus.name, r)} onChange={e => setTime(bus.name, r.stop, e.target.value)}
                          className={`w-[84px] border rounded px-1.5 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#004EA2] ${
                            dirtyOf(bus.name, r) ? 'border-[#F59E0B] bg-[#FFFBEB] ring-1 ring-[#F59E0B]' : 'border-[#E2E8F0]'}`} />
                      </td>
                      <td className="text-center">
                        {filter === '전체' && !r.hasStudents && (
                          <button onClick={() => deleteStop(bus.name, r.stop)} title="삭제"
                            className="text-[#CBD5E1] hover:text-[#EF4444] text-sm leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filter === '전체' && (
                <div className="flex items-center gap-1 px-2 py-2 bg-[#FAFBFC] border-t border-[#EEF2F7]">
                  <input value={add.stop} onChange={e => setAddStop(prev => ({ ...prev, [bus.name]: { ...add, stop: e.target.value } }))}
                    placeholder={`새 ${dir === 'arr' ? '승차' : '하차'} 정류장명`} className="flex-1 min-w-0 border border-[#E2E8F0] rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                  <input type="time" value={add.time} onChange={e => setAddStop(prev => ({ ...prev, [bus.name]: { ...add, time: e.target.value } }))}
                    className="w-[84px] border border-[#E2E8F0] rounded px-1.5 py-1 text-[12px]" />
                  <button onClick={() => addNewStop(bus.name)} disabled={saving || !add.stop.trim()}
                    className="text-[11px] font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded px-2 py-1.5 disabled:opacity-40 whitespace-nowrap">추가</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
