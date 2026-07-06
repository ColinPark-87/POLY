// AI 차량 감차 재배정 알고리즘 (결정적).
// 한 호차를 빼면, 그 호차의 모든 정류장을 다른 호차의 '지리적으로 가장 가까운 정류장'으로 편입한다.
// (근처 정류장이 있으면 그리로, 없으면 그 호차가 그 정류장을 경유하도록 노선 변경 = 재라우팅)
// 세션은 이미 호차 단위로 합쳐진 상태로 들어온다고 가정(방향별 호출).

export interface RStop { name: string; count: number; lat?: number; lng?: number }
export interface RBus { bus: string; stops: RStop[]; yuchi?: boolean }  // yuchi=유치부 전용(감차 불가 후보)

export interface Move { stop: string; count: number; toBus: string; toStop: string; distKm: number; reroute: boolean }
export interface ReductionPlan {
  removeBus: string
  moves: Move[]
  infeasible: string[]          // 좌표 없어 재배정 못한 정류장
  afterBuses: RBus[]            // 감차 후 각 호차(편입 정류장 포함)
  totalMovedRiders: number
  maxDistKm: number
}

export function haversineKm(la1: number, ln1: number, la2: number, ln2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLa = toRad(la2 - la1), dLn = toRad(ln2 - ln1)
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLn / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// 감차 후보(초등부 차) 중 재배정 부담이 가장 적은 1대를 고른다: 탑승 인원 최소.
// 유치부 전용 호차는 제외(유치부는 보통 감차 불가).
export function pickReductionCandidate(buses: RBus[]): string | null {
  const cands = buses.filter(b => !b.yuchi && b.stops.length > 0)
  if (cands.length < 1 || buses.length < 2) return null
  const riders = (b: RBus) => b.stops.reduce((n, s) => n + (s.count || 0), 0)
  return cands.slice().sort((a, b) => riders(a) - riders(b))[0].bus
}

// 최적 감차: 후보(비유치부)를 하나씩 빼보고 재배정 비용이 가장 적은 1대를 고른다.
// 비용 = 재배정 불가 정류장 큰 페널티 + 총 이동거리(멀리 옮길수록 나쁨). "아무거나"가 아니라 최선.
export function pickOptimalReduction(buses: RBus[]): { bus: string; plan: ReductionPlan; cost: number } | null {
  const cands = buses.filter(b => !b.yuchi && b.stops.length > 0)
  if (cands.length < 1 || buses.length < 2) return null
  let best: { bus: string; plan: ReductionPlan; cost: number } | null = null
  for (const c of cands) {
    const plan = planReduction(buses, c.bus)
    const cost = plan.infeasible.length * 1000 + plan.moves.reduce((s, m) => s + m.distKm, 0)
    if (!best || cost < best.cost) best = { bus: c.bus, plan, cost }
  }
  return best
}

// 감차 재배정 계획. REROUTE_KM 초과면 '노선 변경(재라우팅)'으로 표시.
const REROUTE_KM = 0.6
export function planReduction(buses: RBus[], removeBus: string): ReductionPlan {
  const remove = buses.find(b => b.bus === removeBus)
  const others = buses.filter(b => b.bus !== removeBus)
  const moves: Move[] = []
  const infeasible: string[] = []
  // afterBuses: 남은 호차 복제(편입 정류장 누적)
  const after: Record<string, RBus> = {}
  for (const b of others) after[b.bus] = { bus: b.bus, stops: b.stops.map(s => ({ ...s })), yuchi: b.yuchi }

  for (const s of remove?.stops ?? []) {
    if (s.lat == null || s.lng == null) { infeasible.push(s.name); continue }
    // 다른 호차의 좌표 있는 정류장 중 최근접
    let best: { bus: string; stop: string; dist: number } | null = null
    for (const b of others) for (const t of b.stops) {
      if (t.lat == null || t.lng == null) continue
      const d = haversineKm(s.lat, s.lng, t.lat, t.lng)
      if (!best || d < best.dist) best = { bus: b.bus, stop: t.name, dist: d }
    }
    if (!best) { infeasible.push(s.name); continue }
    const reroute = best.dist > REROUTE_KM
    moves.push({ stop: s.name, count: s.count, toBus: best.bus, toStop: reroute ? s.name : best.stop, distKm: Math.round(best.dist * 100) / 100, reroute })
    // afterBuses 반영: 재라우팅이면 그 정류장 자체를 그 호차에 추가, 아니면 최근접 정류장 인원 증가
    const tb = after[best.bus]
    if (reroute) tb.stops.push({ name: s.name, count: s.count, lat: s.lat, lng: s.lng })
    else { const ex = tb.stops.find(x => x.name === best!.stop); if (ex) ex.count += s.count; else tb.stops.push({ name: best.stop, count: s.count }) }
  }
  return {
    removeBus,
    moves,
    infeasible,
    afterBuses: Object.values(after),
    totalMovedRiders: moves.reduce((n, m) => n + m.count, 0),
    maxDistKm: moves.reduce((mx, m) => Math.max(mx, m.distKm), 0),
  }
}
