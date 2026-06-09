import { describe, it, expect } from 'vitest'
import {
  trimRouteToDestination,
  foldSpuriousLoops,
  cleanRoutePolyline,
  type LatLng,
} from '@/lib/utils/route-geometry'

// 노원구 인근 좌표 스케일(위도 37.65, 경도 127.07)에서 검증.
// 0.0003도 ≈ 30m, 0.00045도 ≈ 50m.
const BASE: LatLng = [37.655, 127.068]
const off = (dLat: number, dLng: number): LatLng => [BASE[0] + dLat, BASE[1] + dLng]

describe('foldSpuriousLoops', () => {
  it('짧은 경로(<4점)는 그대로 반환', () => {
    const pts: LatLng[] = [off(0, 0), off(0.001, 0.001)]
    expect(foldSpuriousLoops(pts)).toEqual(pts)
  })

  it('정류장 정보가 없으면 기존처럼 루프를 접는다(하위호환)', () => {
    // 큰길 → 옆으로 빠짐 → 출발점 근처로 복귀(루프) → 계속
    const pts: LatLng[] = [
      off(0, 0),
      off(0.002, 0.002), // 멀리 빠짐
      off(0.0001, 0.0001), // off(0,0) 근처(≈15m)로 복귀 = 루프
      off(0, 0.004),
    ]
    const folded = foldSpuriousLoops(pts, [])
    expect(folded.length).toBeLessThan(pts.length)
  })

  it('회귀: 하차 정류장을 지나는 진입 구간(루프)은 접지 않는다', () => {
    // 차량이 큰길에서 빠져 우리은행(정류장)에 하차하고 큰길로 복귀하는 경로.
    // 복귀점이 진입점 근처(≈15m)라 과거 removeRouteLoops는 우리은행을 접어버렸다.
    const woori: LatLng = off(0.002, 0.0005) // 우리은행 = 실제 하차 정류장
    const pts: LatLng[] = [
      off(0, 0), // 큰길에서 빠지는 지점
      woori, // 우리은행 진입(하차)
      off(0.0001, 0.0001), // 큰길로 복귀(진입점 근처 ≈15m) → 과거엔 루프로 접힘
      off(0, 0.004), // 다음 정류장으로 진행
    ]
    const folded = foldSpuriousLoops(pts, [woori])
    // 우리은행 좌표가 결과 경로에 살아 있어야 한다(접히지 않음)
    const keepsWoori = folded.some(
      p => Math.abs(p[0] - woori[0]) < 1e-9 && Math.abs(p[1] - woori[1]) < 1e-9,
    )
    expect(keepsWoori).toBe(true)
  })

  it('정류장이 없는 순수 군더더기 루프는 정류장 보호와 무관하게 접는다', () => {
    const farStop: LatLng = off(0, 0.01) // 루프와 멀리 떨어진 정류장
    const pts: LatLng[] = [
      off(0, 0),
      off(0.002, 0.002),
      off(0.0001, 0.0001), // 루프(정류장 없음)
      off(0, 0.004),
    ]
    const folded = foldSpuriousLoops(pts, [farStop])
    expect(folded.length).toBeLessThan(pts.length)
  })
})

describe('trimRouteToDestination', () => {
  it('짧은 경로(<2점)는 그대로 반환', () => {
    const pts: LatLng[] = [off(0, 0)]
    expect(trimRouteToDestination(pts, off(0, 0))).toEqual(pts)
  })

  it('도착지 이후 꼬리(overshoot)를 잘라낸다', () => {
    // 실제 TMAP 경로처럼 점이 많은 경우: 도착지까지 18점 + 도착지 지나친 꼬리 2점.
    const dest: LatLng = off(0.005, 0.005)
    const approach: LatLng[] = Array.from({ length: 18 }, (_, i) =>
      off((0.005 * i) / 17, (0.005 * i) / 17),
    ) // approach[17] === dest
    const pts: LatLng[] = [...approach, off(0.0055, 0.0055), off(0.006, 0.006)]
    const trimmed = trimRouteToDestination(pts, dest)
    const last = trimmed[trimmed.length - 1]
    expect(last[0]).toBeCloseTo(dest[0], 9)
    expect(last[1]).toBeCloseTo(dest[1], 9)
  })

  it('TMAP passList 군더더기 꼬리(도착지 뒤 경유지로 점프하는 직선들)를 제거한다', () => {
    // 실제 버그: 도로 경로가 도착지(dest)에 도달한 뒤, TMAP이 경유지 좌표들로 점프하는
    // 직선 꼬리를 붙임 → 구간 이어붙이면 정류장 가로지르는 가짜 직선("6→1선")이 됨.
    const dest: LatLng = off(0.005, 0.005)
    // 실제 비율: 촘촘한 도로 점(30) + 도착 뒤 경유지로 점프하는 작은 군더더기 꼬리(3)
    const approach: LatLng[] = Array.from({ length: 30 }, (_, i) =>
      off((0.005 * i) / 29, (0.005 * i) / 29),
    ) // approach[29] === dest
    const pts: LatLng[] = [...approach, off(0, 0), off(0.003, 0.001), off(0.001, 0.004)] // 꼬리=경유지 직선 점프
    const trimmed = trimRouteToDestination(pts, dest)
    // 도착지에서 끝나야 하고, 군더더기 꼬리(멀리 점프)는 사라져야 한다
    const last = trimmed[trimmed.length - 1]
    expect(last[0]).toBeCloseTo(dest[0], 9)
    expect(last[1]).toBeCloseTo(dest[1], 9)
    expect(trimmed.length).toBe(approach.length) // 꼬리 3점 제거됨
  })

  it('회귀: 경로 중간이 도착지 근처를 지나도 거기서 자르지 않는다', () => {
    // 도착지 좌표가 경로 초반(인덱스 1)에 우연히 근접 → 과거엔 거기서 잘려 경로가 사라짐.
    const dest: LatLng = off(0.005, 0.005)
    const pts: LatLng[] = [
      off(0, 0),
      off(0.0051, 0.0051), // 도착지 근처를 우연히 스침(초반)
      off(0.001, 0.001),
      off(0.003, 0.003),
      dest, // 실제 도착(맨 뒤)
    ]
    const trimmed = trimRouteToDestination(pts, dest)
    // 초반에서 잘리지 않고 대부분 보존되어야 한다
    expect(trimmed.length).toBeGreaterThan(2)
    const last = trimmed[trimmed.length - 1]
    expect(last[0]).toBeCloseTo(dest[0], 9)
  })
})

describe('cleanRoutePolyline', () => {
  it('트림+정류장보호 접기를 함께 적용해도 정류장을 보존한다', () => {
    const woori: LatLng = off(0.002, 0.0005)
    const dest: LatLng = off(0, 0.004)
    const pts: LatLng[] = [
      off(0, 0),
      woori,
      off(0.0001, 0.0001),
      dest,
    ]
    const cleaned = cleanRoutePolyline(pts, dest, [woori, dest])
    const keepsWoori = cleaned.some(
      p => Math.abs(p[0] - woori[0]) < 1e-9 && Math.abs(p[1] - woori[1]) < 1e-9,
    )
    expect(keepsWoori).toBe(true)
  })
})
