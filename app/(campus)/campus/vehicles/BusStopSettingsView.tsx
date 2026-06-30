'use client'

// 호차별 정류장 세팅 (중계 전용) — 대전 차량배차표 양식처럼 호차별 정류장 + 승차(등원)/하차(하원) 시간 표.
// 현재 상태(학생 배정·등록 정류장)에서 시드해 보여주고, 시간·정류장을 campus_registered_stops 에 저장한다.
// ponytail: 정류장의 "기본 시간" 마스터만 설정(비파괴). 기존 학생 개별시간 일괄 변경은 '학생 설정' 탭/지도 탭 사용.

import { useCallback, useEffect, useState } from 'react'
import { sameStop } from '@/lib/utils/stop-name'

interface Bus { id: string; name: string; sort_order: number }
interface Student { location: string | null; pickup_time: string | null }
interface MasterResp {
  buses: Bus[]
  busLocationMap: Record<string, string[]>
  registeredStopTimes: Record<string, string>   // `${bus}|${stop}` → time
  busMap: Record<string, Student[]>
}

interface Row { stop: string; arr: string; dep: string; origArr: string; origDep: string; hasStudents: boolean }

function normalizeTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  if (h < 8) h += 12   // 새벽 시간 표기(02:30)는 오후(14:30)로 — 등하원은 오후 운행
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// 한 방향(arr/dep) 응답에서 `${bus}|${stop}` → 시간 맵 (등록시간 우선, 없으면 학생 최빈 시간)
function timesFromResp(d: MasterResp): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [bus, stops] of Object.entries(d.busLocationMap ?? {})) {
    for (const stop of stops) {
      const reg = d.registeredStopTimes?.[`${bus}|${stop}`]
      if (reg) { out[`${bus}|${stop}`] = normalizeTime(reg); continue }
      // 학생 시간 최빈값
      const counts: Record<string, number> = {}
      for (const s of d.busMap?.[bus] ?? []) {
        if (sameStop(s.location, stop) && s.pickup_time) {
          const t = normalizeTime(s.pickup_time)
          if (t) counts[t] = (counts[t] ?? 0) + 1
        }
      }
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      if (best) out[`${bus}|${stop}`] = best[0]
    }
  }
  return out
}

function studentStops(d: MasterResp): Set<string> {
  const set = new Set<string>()
  for (const [bus, students] of Object.entries(d.busMap ?? {})) {
    for (const s of students) if (s.location) set.add(`${bus}|${s.location.trim()}`)
  }
  return set
}

export default function BusStopSettingsView({ campusName }: { campusName?: string }) {
  const [loading, setLoading] = useState(true)
  const [buses, setBuses] = useState<Bus[]>([])
  const [rowsByBus, setRowsByBus] = useState<Record<string, Row[]>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // 새 정류장 추가 입력 (호차별)
  const [addStop, setAddStop] = useState<Record<string, { stop: string; arr: string; dep: string }>>({})

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }

  const load = useCallback(async () => {
    setLoading(true)
    const [ar, dr] = await Promise.all([
      fetch('/api/campus/vehicles?direction=arr&master=true').then(r => r.json()).catch(() => ({})),
      fetch('/api/campus/vehicles?direction=dep&master=true').then(r => r.json()).catch(() => ({})),
    ]) as [MasterResp, MasterResp]

    const arrTimes = timesFromResp(ar), depTimes = timesFromResp(dr)
    const arrStu = studentStops(ar), depStu = studentStops(dr)

    const busList = (ar.buses?.length ? ar.buses : dr.buses) ?? []
    const byBus: Record<string, Row[]> = {}
    for (const bus of busList.map(b => b.name)) {
      const stops = [...new Set([...(ar.busLocationMap?.[bus] ?? []), ...(dr.busLocationMap?.[bus] ?? [])])]
      byBus[bus] = stops
        .map(stop => {
          const arr = arrTimes[`${bus}|${stop}`] ?? ''
          const dep = depTimes[`${bus}|${stop}`] ?? ''
          return {
            stop, arr, dep, origArr: arr, origDep: dep,
            hasStudents: arrStu.has(`${bus}|${stop}`) || depStu.has(`${bus}|${stop}`),
          }
        })
        .sort((a, b) => (a.arr || a.dep || 'zz').localeCompare(b.arr || b.dep || 'zz'))
    }
    setBuses(busList)
    setRowsByBus(byBus)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function setTime(bus: string, stop: string, dir: 'arr' | 'dep', val: string) {
    setRowsByBus(prev => ({
      ...prev,
      [bus]: prev[bus].map(r => r.stop === stop ? { ...r, [dir]: val } : r),
    }))
  }

  // 정류장 기본시간 마스터 기록 (campus_registered_stops)
  async function postStop(bus: string, stop: string, dir: 'arr' | 'dep', time: string) {
    const res = await fetch('/api/campus/registered-stops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_name: bus, stop_name: stop, direction: dir, default_time: time || null }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error ?? `${res.status}`)
    }
  }

  // 해당 호차·정류장·방향의 모든 학생 시간 실제 변경 (전 세션 매칭). 반영 학생 수 반환.
  async function pushStudentTime(bus: string, stop: string, dir: 'arr' | 'dep', time: string): Promise<number> {
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bulk_update_location_time',
        bus_name: bus, location: stop, direction: dir, session_name: '', new_time: time,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? `${res.status}`)
    return d.updated ?? 0
  }

  // 한 정류장 행의 변경된 방향만 저장: 기본시간 마스터 + 학생 시간 실제 푸시(비어있으면 마스터만 비움)
  async function persistRow(bus: string, r: Row): Promise<number> {
    let pushed = 0
    for (const dir of ['arr', 'dep'] as const) {
      const cur = r[dir], orig = dir === 'arr' ? r.origArr : r.origDep
      if (cur === orig) continue
      await postStop(bus, r.stop, dir, cur)
      if (cur) pushed += await pushStudentTime(bus, r.stop, dir, cur)
    }
    return pushed
  }

  async function saveBus(bus: string) {
    setSaving(true)
    try {
      let pushed = 0
      for (const r of rowsByBus[bus] ?? []) pushed += await persistRow(bus, r)
      flash(`${bus} 저장됨 · 학생 ${pushed}명 시간 반영`)
      load()
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`)
    } finally { setSaving(false) }
  }

  async function saveAll() {
    setSaving(true)
    try {
      let pushed = 0
      for (const bus of buses.map(b => b.name))
        for (const r of rowsByBus[bus] ?? []) pushed += await persistRow(bus, r)
      flash(`전체 저장됨 · 학생 ${pushed}명 시간 반영`)
      load()
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`)
    } finally { setSaving(false) }
  }

  async function addNewStop(bus: string) {
    const a = addStop[bus]
    const stop = (a?.stop ?? '').trim()
    if (!stop) return
    setSaving(true)
    try {
      if (a.arr) await postStop(bus, stop, 'arr', a.arr)
      if (a.dep) await postStop(bus, stop, 'dep', a.dep)
      if (!a.arr && !a.dep) await postStop(bus, stop, 'dep', '')  // 시간 없이 정류장만 등록
      setAddStop(prev => ({ ...prev, [bus]: { stop: '', arr: '', dep: '' } }))
      flash(`${bus} '${stop}' 정류장 추가됨`)
      load()
    } catch (e) {
      alert(`추가 실패: ${(e as Error).message}`)
    } finally { setSaving(false) }
  }

  // 학생 0명(등록 전용) 정류장만 삭제 허용 — 학생 배정된 정류장은 '학생 설정' 탭에서 처리
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
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message}`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="pb-12">
      {msg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full bg-[#16A34A] text-white text-[13px] font-extrabold shadow-xl pointer-events-none">✓ {msg}</div>
      )}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-[#64748B]">
          호차별 정류장과 <b className="text-[#3B82F6]">승차(등원)</b>·<b className="text-[#DC2626]">하차(하원)</b> 시간을 설정합니다.
          현재 {campusName ?? ''} 운행 상태로 채워져 있고, <b className="text-[#1E293B]">저장하면 해당 정류장 학생들의 실제 등하원 시간이 바뀝니다.</b>
        </p>
        <button onClick={saveAll} disabled={saving}
          className="text-xs font-bold text-white bg-[#004EA2] hover:bg-[#003E83] rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap">
          {saving ? '저장 중…' : '변경분 전체 저장'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {buses.map(bus => {
          const rows = rowsByBus[bus.name] ?? []
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
                    <tr><td colSpan={5} className="text-center text-[#94A3B8] text-xs py-4">정류장 없음 — 아래에서 추가하세요</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.stop} className="border-b border-[#F4F6F9]">
                      <td className="text-center text-[11px] text-[#94A3B8]">{i + 1}</td>
                      <td className="py-1 pr-1">
                        <span className="text-[13px] text-[#1E293B]">{r.stop}</span>
                        {!r.hasStudents && <span className="ml-1 text-[9px] text-[#94A3B8] align-middle">(빈 정류장)</span>}
                      </td>
                      <td className="py-1">
                        <input type="time" value={r.arr} onChange={e => setTime(bus.name, r.stop, 'arr', e.target.value)}
                          className="w-[72px] border border-[#E2E8F0] rounded px-1 py-0.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]" />
                      </td>
                      <td className="py-1">
                        <input type="time" value={r.dep} onChange={e => setTime(bus.name, r.stop, 'dep', e.target.value)}
                          className="w-[72px] border border-[#E2E8F0] rounded px-1 py-0.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#DC2626]" />
                      </td>
                      <td className="text-center">
                        {!r.hasStudents && (
                          <button onClick={() => deleteStop(bus.name, r.stop)} title="삭제"
                            className="text-[#CBD5E1] hover:text-[#EF4444] text-sm leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 정류장 추가 */}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
