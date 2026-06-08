// TMAP routes API의 passList(경유지)는 최대 5개만 지원한다.
// 정류장이 7개(시작1 + 경유5 + 도착1)를 초과하는 노선은 한 번의 호출로
// 모든 정류장을 거치는 경로를 그릴 수 없어, 6번째 이후 정류장이 조용히 누락되고
// 도로 경로가 정류장을 "지나치지 않고" 도착지로 직행하는 문제가 발생한다.
//
// 해결: 정류장 목록을 7개 단위(경유 5개)로 나누되, 인접 구간이 경계 정류장 1개를
// 공유(overlap)하도록 잘라 각 구간을 따로 TMAP에 요청한 뒤 좌표를 이어붙인다.
// 이렇게 하면 경로가 끊기지 않고 모든 정류장을 순서대로 통과한다.

export type TmapStop = { name: string; lat: number; lng: number }

const MAX_PER_SEGMENT = 7 // 시작 1 + 경유 5 + 도착 1

export function chunkStops(stops: TmapStop[]): TmapStop[][] {
  if (stops.length <= MAX_PER_SEGMENT) return [stops]
  const chunks: TmapStop[][] = []
  let i = 0
  while (i < stops.length - 1) {
    chunks.push(stops.slice(i, i + MAX_PER_SEGMENT))
    if (i + MAX_PER_SEGMENT >= stops.length) break
    i += MAX_PER_SEGMENT - 1 // 마지막 정류장을 다음 구간의 시작점으로 공유
  }
  return chunks
}
