import { describe, it, expect } from 'vitest'
import { chunkStops, type TmapStop } from '@/lib/utils/tmap-chunk'

function makeStops(n: number): TmapStop[] {
  return Array.from({ length: n }, (_, i) => ({ name: `s${i}`, lat: i, lng: i }))
}

// 모든 정류장이 순서대로, 누락 없이 구간에 포함되는지 검증하는 헬퍼
function assertFullCoverageInOrder(stops: TmapStop[], chunks: TmapStop[][]) {
  const flat: string[] = []
  for (const c of chunks) {
    // 각 구간은 TMAP 호출 조건(정류장 ≥2, 경유지 ≤5)을 만족해야 한다
    expect(c.length).toBeGreaterThanOrEqual(2)
    expect(c.length).toBeLessThanOrEqual(7)
    for (const s of c) {
      // 경계 공유점 중복은 허용하되, 새 정류장은 순서대로 등장해야 한다
      if (flat[flat.length - 1] !== s.name) flat.push(s.name)
    }
  }
  expect(flat).toEqual(stops.map(s => s.name))
}

describe('chunkStops', () => {
  it('정류장 7개 이하면 한 구간 그대로 반환', () => {
    for (const n of [2, 5, 7]) {
      const stops = makeStops(n)
      expect(chunkStops(stops)).toEqual([stops])
    }
  })

  it('8개 이상이면 경유지 5개 이하 구간으로 분할', () => {
    const stops = makeStops(8)
    const chunks = chunkStops(stops)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.slice(1, -1).length).toBeLessThanOrEqual(5)
  })

  it('인접 구간은 경계 정류장을 공유한다', () => {
    const chunks = chunkStops(makeStops(13))
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1][chunks[i - 1].length - 1]
      const curStart = chunks[i][0]
      expect(curStart.name).toBe(prevEnd.name)
    }
  })

  it('다양한 길이에서 모든 정류장을 순서대로 누락 없이 포함', () => {
    for (const n of [8, 10, 12, 13, 14, 20, 25]) {
      const stops = makeStops(n)
      assertFullCoverageInOrder(stops, chunkStops(stops))
    }
  })

  it('단일 정류장만 남는 구간(꼬리)을 만들지 않는다', () => {
    for (const n of [8, 9, 13, 14, 19, 20]) {
      const chunks = chunkStops(makeStops(n))
      for (const c of chunks) expect(c.length).toBeGreaterThanOrEqual(2)
    }
  })
})
