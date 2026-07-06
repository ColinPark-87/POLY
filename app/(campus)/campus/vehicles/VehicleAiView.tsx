'use client'
import { useState, useRef, useEffect } from 'react'
import Script from 'next/script'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sdkReady, setSdkReady] = useState(typeof window !== 'undefined' && !!(window as any).kakao?.maps)

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
      <Script src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`} strategy="afterInteractive" onLoad={() => setSdkReady(true)} />
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

          {/* 변경되는 호차만 지도에 표시(감차 대상 + 정류장 편입받는 호차). 나머지 호차는 안 그림 → 깔끔·의미. */}
          {(() => {
            const affected = new Set<string>([removeBus, ...plan.moves.map(m => m.toBus)])
            const before = buses.filter(b => affected.has(b.bus))
            const after = afterBuses.filter(b => affected.has(b.bus))
            const recvNames = [...new Set(plan.moves.map(m => m.toBus))]
            return (
              <>
                <p className="text-[10px] text-[#64748B] mb-1">지도에는 <b className="text-[#DC2626]">{removeBus}(감차)</b> + 정류장 편입받는 <b>{recvNames.join(', ') || '없음'}</b>만 표시</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <KakaoRouteMap title={`현행 · 관련 호차 ${before.length}대`} buses={before} highlight={removeBus} movedStops={[]} sdkReady={sdkReady} />
                  <KakaoRouteMap title={`${removeBus} 감차 후 · ${after.length}대`} buses={after} highlight={''} movedStops={plan.moves.map(m => m.stop)} sdkReady={sdkReady} />
                </div>
              </>
            )
          })()}

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

// 실제 Kakao 지도에 호차별 노선(정류장 잇는 선)+마커 렌더
/* eslint-disable @typescript-eslint/no-explicit-any */
function KakaoRouteMap({ title, buses, highlight, movedStops = [], sdkReady }: { title: string; buses: RBus[]; highlight: string; movedStops?: string[]; sdkReady: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const hasCoord = buses.some(b => b.stops.some(s => s.lat != null && s.lng != null))
  useEffect(() => {
    const kakao = (window as any).kakao
    if (!ref.current || !kakao?.maps || !hasCoord) return
    const draw = () => {
      if (!ref.current) return
      if (!mapRef.current) mapRef.current = new kakao.maps.Map(ref.current, { center: new kakao.maps.LatLng(37.6556, 127.0686), level: 6 })
      const map = mapRef.current
      overlaysRef.current.forEach(o => { try { o.setMap(null) } catch {} })
      overlaysRef.current = []
      const movedSet = new Set(movedStops)
      const bounds = new kakao.maps.LatLngBounds()
      buses.forEach((b, i) => {
        const color = highlight === b.bus ? '#DC2626' : BUS_COLORS[i % BUS_COLORS.length]
        const sp = b.stops.filter(s => s.lat != null && s.lng != null)
        const path = sp.map(s => new kakao.maps.LatLng(s.lat, s.lng))
        path.forEach((p: any) => bounds.extend(p))
        if (path.length > 1) {
          const pl = new kakao.maps.Polyline({ map, path, strokeWeight: highlight === b.bus ? 5 : 3, strokeColor: color, strokeOpacity: 0.85, strokeStyle: highlight === b.bus ? 'dashed' : 'solid' })
          overlaysRef.current.push(pl)
        }
        sp.forEach(s => {
          const moved = movedSet.has(s.name)
          const ov = new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(s.lat, s.lng), yAnchor: 0.5, zIndex: moved ? 5 : 3,
            content: `<div title="${b.bus} · ${s.name} (${s.count})" style="width:${moved ? 12 : 9}px;height:${moved ? 12 : 9}px;border-radius:50%;background:${moved ? '#DC2626' : color};border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>` })
          overlaysRef.current.push(ov)
        })
      })
      if (!bounds.isEmpty()) map.setBounds(bounds)
    }
    if (typeof kakao.maps.Map === 'function') draw(); else kakao.maps.load(draw)
  }, [buses, highlight, movedStops, sdkReady, hasCoord])
  return (
    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
      <div className="text-[11px] font-bold text-[#334155] px-2 py-1 bg-[#F8FAFC] border-b border-[#E2E8F0]">{title}</div>
      {hasCoord ? <div ref={ref} style={{ width: '100%', height: 240 }} /> : <div className="p-3 text-[11px] text-[#94A3B8]">좌표 데이터 없음</div>}
    </div>
  )
}
