'use client'
import { useState } from 'react'
import { pickReductionCandidate, planReduction, type RBus, type ReductionPlan } from '@/lib/utils/vehicle-reduction'

// AI 차량 분석(증차/감차/쪽차). 호차=등하원 한 차이므로 방향 안 나누고 호차 단위로 합쳐 분석.
// 감차: 그 호차의 모든 정류장(등원+하원)을 다른 호차의 최근접 정류장으로 편입(가까우면 흡수·멀면 노선변경).
// 세션 다 합쳐 계산. 유치부 전용은 감차 불가(초등부만 도는 차=쪽차).

interface AiResult { summary?: string; actions?: { type: string; bus: string; session?: string; reason?: string }[] }
const BUS_COLORS = ['#2563EB', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5']
const cqsOf = (c?: string) => (c ? `&campus_id=${c}` : '')

export default function VehicleAiView({ campusId }: { campusId?: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [buses, setBuses] = useState<RBus[]>([])
  const [plan, setPlan] = useState<ReductionPlan | null>(null)
  const [removeBus, setRemoveBus] = useState<string>('')
  const [ai, setAi] = useState<AiResult | null>(null)

  async function run() {
    setLoading(true); setErr(''); setAi(null); setPlan(null)
    try {
      const cqs = cqsOf(campusId)
      const [arrR, depR, coordR] = await Promise.all([
        fetch(`/api/campus/vehicles?direction=arr&master=true${cqs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/campus/vehicles?direction=dep&master=true${cqs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`).then(r => r.ok ? r.json() : null),
      ])
      const coords: Record<string, { lat: number; lng: number }> = coordR?.coords ?? coordR ?? {}
      const combined = buildBuses([arrR, depR], coords)  // 등원+하원 합쳐 호차 단위
      setBuses(combined)
      if (combined.length === 0) { setErr('분석할 호차 데이터가 없습니다.'); return }
      const cand = pickReductionCandidate(combined)
      if (cand) { setRemoveBus(cand); setPlan(planReduction(combined, cand)) }
      const res = await fetch(`/api/campus/vehicle-analysis${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: combined.map(b => ({ bus: b.bus, yuchi: b.yuchi, total: b.stops.reduce((n, s) => n + s.count, 0), stops: b.stops.map(s => ({ name: s.name, count: s.count })) })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setAi(d.result ?? null)
      else if (d?.needKey) setErr('GROQ_API_KEY 미설정 — 근거 생성 비활성(재배정 계획은 표시됨).')
    } catch (e) { setErr(`실패: ${(e as Error).message}`) } finally { setLoading(false) }
  }

  function selectRemove(bus: string) { setRemoveBus(bus); setPlan(planReduction(buses, bus)) }
  const afterBuses = plan?.afterBuses ?? buses.filter(b => b.bus !== removeBus)

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h2 className="text-base font-black text-[#0F172A]">🤖 AI 차량 분석 <span className="text-[11px] font-medium text-[#94A3B8]">감차·쪽차 재배정 (호차 단위)</span></h2>
        <button onClick={run} disabled={loading} className="ml-auto bg-[#004EA2] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">{loading ? '분석 중…' : '분석 실행'}</button>
      </div>

      {err && <div className="text-[12px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2 mb-2">{err}</div>}

      {plan && (
        <>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[11px] font-bold text-[#64748B]">감차 대상:</span>
            {buses.map((b, i) => (
              <button key={b.bus} onClick={() => selectRemove(b.bus)} disabled={b.yuchi}
                title={b.yuchi ? '유치부 전용 — 감차 불가(쪽차 유지)' : ''}
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold disabled:opacity-40"
                style={removeBus === b.bus ? { background: '#DC2626', color: '#fff' } : { background: '#F1F5F9', color: BUS_COLORS[i % BUS_COLORS.length] }}>
                {b.bus}{b.yuchi ? '·유치' : ''}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <RouteSvg title={`현행 (${buses.length}대)`} buses={buses} highlight={removeBus} movedStops={[]} />
            <RouteSvg title={`${removeBus} 감차 후 (${afterBuses.length}대)`} buses={afterBuses} highlight={''} movedStops={plan.moves.map(m => m.stop)} />
          </div>

          <div className="border border-[#E2E8F0] rounded-xl p-3 space-y-2 bg-[#FAFBFC]">
            <p className="text-[13px] font-black text-[#0F172A]">💬 분석</p>
            {ai?.summary && <div className="bg-white rounded-lg px-3 py-2 text-[12px] text-[#1E3A8A] border border-[#E2E8F0]">💡 {ai.summary}</div>}
            <div className="bg-white rounded-lg px-3 py-2 text-[12px] text-[#334155] border border-[#E2E8F0]">
              <b className="text-[#DC2626]">{removeBus} 감차</b> 시 정류장 {plan.moves.length}곳 · 학생 {plan.totalMovedRiders}명 재배정 (최대 이동거리 {plan.maxDistKm}km)
              {plan.infeasible.length > 0 && <span className="text-[#B45309]"> · ⚠️좌표없어 재배정불가 {plan.infeasible.length}곳: {plan.infeasible.join(', ')}</span>}
            </div>
            <div className="space-y-1">
              {plan.moves.map((m, i) => (
                <div key={i} className="bg-white rounded-lg px-3 py-1.5 text-[11px] text-[#475569] border border-[#F1F5F9]">
                  <b>{m.stop}</b> ({m.count}명) → <b className="text-[#004EA2]">{m.toBus}</b>{m.reroute ? ` · 노선변경(경유 ${m.distKm}km)` : ` · ${m.toStop} 편입(${m.distKm}km)`}
                </div>
              ))}
            </div>
            {ai?.actions?.filter(a => a.type !== '감차').map((a, i) => (
              <div key={i} className="bg-white rounded-lg px-3 py-1.5 text-[11px] border border-[#F1F5F9]">
                <span className="font-black" style={{ color: a.type === '증차' ? '#16A34A' : '#7C3AED' }}>{a.type}</span> <b>{a.bus}</b> {a.session ? `· ${a.session}` : ''} — {a.reason}
              </div>
            ))}
            <button onClick={() => window.print()} className="text-[11px] font-bold border border-[#E2E8F0] text-[#334155] rounded-lg px-3 py-1">🖨 인쇄</button>
          </div>
        </>
      )}
    </div>
  )
}

// vehicle master 응답들(등원+하원) → RBus[] (호차 단위 합산, 좌표 포함, 유치부 전용 판정)
function buildBuses(responses: unknown[], coords: Record<string, { lat: number; lng: number }>): RBus[] {
  type Entry = { location?: string | null }
  type Resp = { timeGroups?: { session_name: string; busMap: Record<string, Entry[]> }[] }
  const acc: Record<string, { stops: Record<string, number>; sess: Set<string> }> = {}
  for (const R of responses) {
    for (const tg of (R as Resp | null)?.timeGroups ?? []) {
      const base = tg.session_name ?? ''
      for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
        acc[bus] ??= { stops: {}, sess: new Set() }
        acc[bus].sess.add(base)
        for (const s of students) { const loc = (s.location ?? '').trim(); if (loc) acc[bus].stops[loc] = (acc[bus].stops[loc] ?? 0) + 1 }
      }
    }
  }
  return Object.entries(acc).map(([bus, v]) => ({
    bus,
    yuchi: v.sess.size > 0 && [...v.sess].every(s => s.includes('유치부')),  // 모든 세션이 유치부 → 유치부 전용
    stops: Object.entries(v.stops).map(([name, count]) => ({ name, count, lat: coords[name]?.lat, lng: coords[name]?.lng })),
  }))
}

// 좌표를 SVG로 투영해 호차별 노선(정류장 잇는 선)+마커 렌더
function RouteSvg({ title, buses, highlight, movedStops = [] }: { title: string; buses: RBus[]; highlight: string; movedStops?: string[] }) {
  const W = 320, H = 240, PAD = 16
  const pts = buses.flatMap(b => b.stops.filter(s => s.lat != null && s.lng != null).map(s => ({ lat: s.lat!, lng: s.lng! })))
  if (pts.length === 0) return <div className="border border-[#E2E8F0] rounded-xl p-3 text-[11px] text-[#94A3B8]">{title}: 좌표 데이터 없음</div>
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng)
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs)
  const sx = (ln: number) => PAD + ((ln - minLn) / (maxLn - minLn || 1)) * (W - 2 * PAD)
  const sy = (la: number) => H - PAD - ((la - minLa) / (maxLa - minLa || 1)) * (H - 2 * PAD)
  const movedSet = new Set(movedStops)
  return (
    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
      <div className="text-[11px] font-bold text-[#334155] px-2 py-1 bg-[#F8FAFC] border-b border-[#E2E8F0]">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: '#F8FAFC' }}>
        {buses.map((b, i) => {
          const color = highlight === b.bus ? '#DC2626' : BUS_COLORS[i % BUS_COLORS.length]
          const sp = b.stops.filter(s => s.lat != null && s.lng != null)
          const path = sp.map(s => `${sx(s.lng!)},${sy(s.lat!)}`).join(' ')
          return (
            <g key={b.bus}>
              {sp.length > 1 && <polyline points={path} fill="none" stroke={color} strokeWidth={highlight === b.bus ? 2.5 : 1.6} strokeOpacity={0.75} strokeDasharray={highlight === b.bus ? '4 3' : undefined} />}
              {sp.map((s, j) => (
                <circle key={j} cx={sx(s.lng!)} cy={sy(s.lat!)} r={movedSet.has(s.name) ? 4 : 3}
                  fill={movedSet.has(s.name) ? '#DC2626' : color} stroke="#fff" strokeWidth={1}>
                  <title>{b.bus} · {s.name} ({s.count})</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
