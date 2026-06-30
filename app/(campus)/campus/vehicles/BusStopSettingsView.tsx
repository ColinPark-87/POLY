'use client'

// 호차별 정류장 세팅 (중계 전용) — 대전 차량배차표 양식처럼 호차별 정류장 + 승차(등원)/하차(하원) 시간 표.
// 세션(유치부/초등 5일·3일·2일)별로 나눠 보고, 시간은 기존 학생 운행시간에서 시드한다.
// 저장 시: 학생 실제 스케줄 시간 변경(bulk_update_location_time, 세션별 정확 매칭) + (전체 탭) registered_stops 기본값.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sameStop } from '@/lib/utils/stop-name'

interface Bus { id: string; name: string; sort_order: number }
interface Student {
  location: string | null; pickup_time: string | null
  dayLocs?: Record<string, string>   // 요일별 탑승 장소
  dayTimes?: Record<string, string>  // 요일별 탑승 시간
}
interface TimeGroup { session_name: string; busMap: Record<string, Student[]> }
interface RegStop { stop_name: string; bus_name: string; direction: string; default_time: string | null }
interface MasterResp {
  buses: Bus[]
  timeGroups: TimeGroup[]
  registeredStops: RegStop[]
  registeredStopTimes: Record<string, string>
}

type Filter = '전체' | '유치부' | '초등부' | '5일' | '3일' | '2일'
const FILTERS: Filter[] = ['전체', '유치부', '초등부', '5일', '3일', '2일']
const FILTER_LABEL: Record<Filter, string> = {
  '전체': '전체', '유치부': '유치부', '초등부': '초등부(5·3·2일)', '5일': '5일(매일반)', '3일': '3일(월수금)', '2일': '2일(화목)',
}

// 세션명이 선택 필터에 속하는지 — page.tsx sessMatchesFilter 로직 기반 + 초등부 추가
function sessMatch(name: string, filter: Filter, dir: 'arr' | 'dep'): boolean {
  if (filter === '전체') return true
  if (name.includes('방과후')) {
    if (name.includes('유치부')) return filter === '유치부'
    // 초등 방과후: 하원→매일반(5일·초등), 등원→유치부 취급
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

function normalizeTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  if (h < 8) h += 12   // 새벽 표기(02:30)는 오후 운행(14:30)
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// 학생 한 명이 이 호차에서 갖는 (정류장, 시간) 쌍들 — 단일 location + 요일별 dayLocs/dayTimes
function stopTimePairs(s: Student): [string, string][] {
  const out: [string, string][] = []
  if (s.location) out.push([s.location.trim(), normalizeTime(s.pickup_time)])
  for (const [day, loc] of Object.entries(s.dayLocs ?? {})) {
    if (loc) out.push([loc.trim(), normalizeTime(s.dayTimes?.[day] ?? s.pickup_time)])
  }
  return out
}

interface Cell {
  stop: string
  arrCounts: Record<string, number>; depCounts: Record<string, number>
  arrSess: Set<string>; depSess: Set<string>
  hasStudents: boolean
}
interface Row {
  stop: string
  arr: string; dep: string       // 표시(시드)값
  arrSess: string[]; depSess: string[]
  hasStudents: boolean
}

function mostCommon(counts: Record<string, number>): string {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return e ? e[0] : ''
}

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState<{ arr: MasterResp; dep: MasterResp } | null>(null)
  const [filter, setFilter] = useState<Filter>('전체')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // 사용자 편집 오버레이 — `${filter}|${bus}|${stop}|${dir}` → 시간. 필터 전환에도 보존.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [addStop, setAddStop] = useState<Record<string, { stop: string; arr: string; dep: string }>>({})

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

  // 선택 필터 기준 호차별 정류장 시드값(기존 학생 시간 기반)
  const baseRowsByBus: Record<string, Row[]> = useMemo(() => {
    if (!raw) return {}
    const cellByBus: Record<string, Record<string, Cell>> = {}
    const ensure = (bus: string, stop: string): Cell => {
      cellByBus[bus] ??= {}
      cellByBus[bus][stop] ??= { stop, arrCounts: {}, depCounts: {}, arrSess: new Set(), depSess: new Set(), hasStudents: false }
      return cellByBus[bus][stop]
    }
    for (const dir of ['arr', 'dep'] as const) {
      const resp = raw[dir]
      for (const tg of resp.timeGroups ?? []) {
        if (!sessMatch(tg.session_name, filter, dir)) continue
        for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
          for (const s of students) {
            for (const [stop, t] of stopTimePairs(s)) {
              if (!stop) continue
              const c = ensure(bus, stop)
              c.hasStudents = true
              ;(dir === 'arr' ? c.arrSess : c.depSess).add(tg.session_name)
              if (t) {
                const counts = dir === 'arr' ? c.arrCounts : c.depCounts
                counts[t] = (counts[t] ?? 0) + 1
              }
            }
          }
        }
      }
    }
    // 전체 탭: 학생 0명 등록 정류장(registered)도 노출 (세션 무관 기본값)
    if (filter === '전체') {
      for (const dir of ['arr', 'dep'] as const) {
        for (const rs of raw[dir].registeredStops ?? []) {
          const c = ensure(rs.bus_name, rs.stop_name.trim())
          const counts = dir === 'arr' ? c.arrCounts : c.depCounts
          const t = normalizeTime(rs.default_time)
          if (t && !mostCommon(counts)) counts[t] = (counts[t] ?? 0) + 1
        }
      }
    }
    const out: Record<string, Row[]> = {}
    for (const bus of buses.map(b => b.name)) {
      const cells = cellByBus[bus] ?? {}
      out[bus] = Object.values(cells)
        .map(c => ({
          stop: c.stop,
          arr: mostCommon(c.arrCounts),
          dep: mostCommon(c.depCounts),
          arrSess: [...c.arrSess], depSess: [...c.depSess],
          hasStudents: c.hasStudents,
        }))
        .sort((a, b) => (a.arr || a.dep || 'zz').localeCompare(b.arr || b.dep || 'zz'))
    }
    return out
  }, [raw, filter, buses])

  const editKey = (bus: string, stop: string, dir: 'arr' | 'dep') => `${filter}|${bus}|${stop}|${dir}`
  const val = (bus: string, r: Row, dir: 'arr' | 'dep') => edits[editKey(bus, r.stop, dir)] ?? (dir === 'arr' ? r.arr : r.dep)
  const isDirty = (bus: string, r: Row, dir: 'arr' | 'dep') => {
    const k = editKey(bus, r.stop, dir)
    return k in edits && edits[k] !== (dir === 'arr' ? r.arr : r.dep)
  }
  const dirtyCount = useMemo(() => {
    let n = 0
    for (const bus of buses.map(b => b.name)) for (const r of baseRowsByBus[bus] ?? []) for (const d of ['arr', 'dep'] as const) if (isDirty(bus, r, d)) n++
    return n
  }, [edits, baseRowsByBus, buses])

  function setTime(bus: string, stop: string, dir: 'arr' | 'dep', v: string) {
    setEdits(prev => ({ ...prev, [`${filter}|${bus}|${stop}|${dir}`]: v }))
  }

  function switchFilter(f: Filter) {
    if (dirtyCount > 0 && !confirm(`저장하지 않은 변경 ${dirtyCount}건이 있습니다. 버리고 이동할까요?`)) return
    setFilter(f)
  }

  async function postRegistered(bus: string, stop: string, dir: 'arr' | 'dep', time: string) {
    const res = await fetch('/api/campus/registered-stops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir, default_time: time || null }),
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `${res.status}`) }
  }

  // 정확 세션명으로 그 정류장 학생 시간 실제 변경 (반영 학생 수 반환)
  async function pushTime(bus: string, stop: string, dir: 'arr' | 'dep', sessionName: string, time: string): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_update_location_time', bus_name: bus, location: stop, direction: dir, session_name: sessionName, new_time: time }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? `${res.status}`)
    return d.updated ?? 0
  }

  // 변경된 셀만 저장: 학생 시간 푸시(세션별) + 전체탭이면 registered 기본값
  async function persist(bus: string, r: Row): Promise<number> {
    let pushed = 0
    for (const dir of ['arr', 'dep'] as const) {
      if (!isDirty(bus, r, dir)) continue
      const cur = val(bus, r, dir)
      const sessions = dir === 'arr' ? r.arrSess : r.depSess
      if (filter === '전체') {
        await postRegistered(bus, r.stop, dir, cur)
        if (cur) pushed += await pushTime(bus, r.stop, dir, '', cur)  // 전 세션 일괄
      } else if (cur) {
        for (const sess of sessions) pushed += await pushTime(bus, r.stop, dir, sess, cur)
      }
    }
    return pushed
  }

  async function saveBus(bus: string) {
    setSaving(true)
    try {
      let pushed = 0
      for (const r of baseRowsByBus[bus] ?? []) pushed += await persist(bus, r)
      flash(`${bus} 저장됨 · 학생 ${pushed}명 시간 반영`)
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  async function saveAll() {
    setSaving(true)
    try {
      let pushed = 0
      for (const bus of buses.map(b => b.name)) for (const r of baseRowsByBus[bus] ?? []) pushed += await persist(bus, r)
      flash(`전체 저장됨 · 학생 ${pushed}명 시간 반영`)
      load()
    } catch (e) { alert(`저장 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  async function addNewStop(bus: string) {
    const a = addStop[bus]; const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSaving(true)
    try {
      await postRegistered(bus, stop, 'arr', a.arr || '')
      await postRegistered(bus, stop, 'dep', a.dep || '')
      setAddStop(prev => ({ ...prev, [bus]: { stop: '', arr: '', dep: '' } }))
      flash(`${bus} '${stop}' 정류장 추가됨`)
      load()
    } catch (e) { alert(`추가 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  // 학생 0명(등록 전용) 정류장만 삭제 — 학생 배정 정류장은 '학생 설정' 탭에서
  async function deleteStop(bus: string, stop: string) {
    if (!confirm(`${bus} '${stop}' 정류장을 세팅에서 삭제할까요?`)) return
    setSaving(true)
    try {
      for (const dir of ['arr', 'dep'] as const) {
        await fetch('/api/campus/registered-stops', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir }),
        })
      }
      flash(`${bus} '${stop}' 삭제됨`)
      load()
    } catch (e) { alert(`삭제 실패: ${(e as Error).message}`) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">✓ {msg}</div>
      )}

      {/* 세션 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => switchFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              filter === f ? 'bg-[#004EA2] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#94A3B8]'}`}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-[#64748B]">
          <b className="text-[#3B82F6]">승차(등원)</b>·<b className="text-[#DC2626]">하차(하원)</b> 시간은 현재 운행 시간에서 가져왔습니다.
          {filter === '전체'
            ? ' 저장하면 그 정류장 전 세션 학생 시간이 바뀝니다.'
            : ` 저장하면 '${FILTER_LABEL[filter]}' 세션 학생 시간만 바뀝니다.`}
        </p>
        <button onClick={saveAll} disabled={saving || dirtyCount === 0}
          className="text-xs font-bold text-white bg-[#004EA2] hover:bg-[#003E83] rounded-lg px-3 py-2 disabled:opacity-40 whitespace-nowrap">
          {saving ? '저장 중…' : `변경분 전체 저장${dirtyCount ? ` (${dirtyCount})` : ''}`}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {buses.map(bus => {
          const rows = baseRowsByBus[bus.name] ?? []
          const add = addStop[bus.name] ?? { stop: '', arr: '', dep: '' }
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
                    <th className="text-left py-1.5 font-medium">정류장 (승하차 장소)</th>
                    <th className="w-20 py-1.5 font-medium text-[#3B82F6]">승차</th>
                    <th className="w-20 py-1.5 font-medium text-[#DC2626]">하차</th>
                    <th className="w-7"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-[#94A3B8] text-xs py-4">해당 세션 정류장 없음</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.stop} className="border-b border-[#F4F6F9]">
                      <td className="text-center text-[11px] text-[#94A3B8]">{i + 1}</td>
                      <td className="py-1 pr-1">
                        <span className="text-[13px] text-[#1E293B]">{r.stop}</span>
                        {!r.hasStudents && <span className="ml-1 text-[9px] text-[#94A3B8] align-middle">(빈 정류장)</span>}
                      </td>
                      {(['arr', 'dep'] as const).map(dir => (
                        <td key={dir} className="py-1">
                          <input type="time" value={val(bus.name, r, dir)} onChange={e => setTime(bus.name, r.stop, dir, e.target.value)}
                            className={`w-[72px] border rounded px-1 py-0.5 text-[12px] focus:outline-none focus:ring-1 ${
                              isDirty(bus.name, r, dir) ? 'border-[#F59E0B] bg-[#FFFBEB] ring-1 ring-[#F59E0B]' : 'border-[#E2E8F0]'} ${dir === 'arr' ? 'focus:ring-[#3B82F6]' : 'focus:ring-[#DC2626]'}`} />
                        </td>
                      ))}
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
                    placeholder="새 정류장명" className="flex-1 min-w-0 border border-[#E2E8F0] rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                  <input type="time" value={add.arr} onChange={e => setAddStop(prev => ({ ...prev, [bus.name]: { ...add, arr: e.target.value } }))}
                    className="w-[72px] border border-[#E2E8F0] rounded px-1 py-1 text-[12px]" />
                  <input type="time" value={add.dep} onChange={e => setAddStop(prev => ({ ...prev, [bus.name]: { ...add, dep: e.target.value } }))}
                    className="w-[72px] border border-[#E2E8F0] rounded px-1 py-1 text-[12px]" />
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
