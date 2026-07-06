import { describe, it, expect } from 'vitest'
import { haversineKm, pickReductionCandidate, planReduction, type RBus } from '@/lib/utils/vehicle-reduction'

describe('haversineKm', () => {
  it('같은 점=0, 대략 거리', () => {
    expect(haversineKm(37.65, 127.06, 37.65, 127.06)).toBe(0)
    const d = haversineKm(37.65, 127.06, 37.66, 127.06)
    expect(d).toBeGreaterThan(1) // ~1.1km
    expect(d).toBeLessThan(1.3)
  })
})

const buses: RBus[] = [
  { bus: '1호차', stops: [{ name: 'A', count: 10, lat: 37.650, lng: 127.060 }, { name: 'B', count: 8, lat: 37.652, lng: 127.062 }] },
  { bus: '2호차', stops: [{ name: 'C', count: 3, lat: 37.6505, lng: 127.0605 }] }, // 적은 인원 → 감차 후보
  { bus: '3호차', yuchi: true, stops: [{ name: 'Y', count: 4, lat: 37.70, lng: 127.10 }] }, // 유치부 전용
]

describe('pickReductionCandidate', () => {
  it('유치부 제외, 인원 최소 초등부 호차 선택', () => {
    expect(pickReductionCandidate(buses)).toBe('2호차') // 3명으로 최소
  })
})

describe('planReduction', () => {
  it('2호차 감차 → C를 최근접(A)로 편입, 인원 이동', () => {
    const p = planReduction(buses, '2호차')
    expect(p.moves).toHaveLength(1)
    expect(p.moves[0].stop).toBe('C')
    expect(p.moves[0].toBus).toBe('1호차')
    expect(p.moves[0].reroute).toBe(false)   // C는 A와 매우 가까움(<0.6km)
    expect(p.totalMovedRiders).toBe(3)
    // afterBuses에 2호차 없음, 1호차 A 인원 10+3=13
    expect(p.afterBuses.find(b => b.bus === '2호차')).toBeUndefined()
    const a = p.afterBuses.find(b => b.bus === '1호차')!.stops.find(s => s.name === 'A')!
    expect(a.count).toBe(13)
  })
  it('좌표 없는 정류장은 infeasible', () => {
    const b2: RBus[] = [{ bus: '1호차', stops: [{ name: 'A', count: 5, lat: 37.65, lng: 127.06 }] }, { bus: '2호차', stops: [{ name: 'X', count: 2 }] }]
    const p = planReduction(b2, '2호차')
    expect(p.infeasible).toContain('X')
    expect(p.moves).toHaveLength(0)
  })
  it('먼 정류장은 reroute=true(노선변경)', () => {
    const b3: RBus[] = [{ bus: '1호차', stops: [{ name: 'A', count: 5, lat: 37.65, lng: 127.06 }] }, { bus: '2호차', stops: [{ name: 'Far', count: 2, lat: 37.72, lng: 127.12 }] }]
    const p = planReduction(b3, '2호차')
    expect(p.moves[0].reroute).toBe(true)
    expect(p.moves[0].toStop).toBe('Far') // 재라우팅=그 정류장 유지
  })
})
