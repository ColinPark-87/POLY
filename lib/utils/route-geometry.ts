// 차량 노선 폴리라인(도로 경로) 후처리 순수 함수들.
//
// 배경: TMAP routes API에 정류장을 순서대로 넘기면(2026-06-05 chunkStops 수정 이후
// 5개 초과 경유지도 정상 전달됨) 모든 정류장을 순서대로 지나는 '정확한' 도로 경로가
// 돌아온다. 과거 passList 잘림으로 경로가 직행하던 시절의 잔재로, 화면 렌더 직전에
// 두 가지 휴리스틱 후처리를 적용해 왔다:
//   - trimRouteToDestination: 도착지 이후로 살짝 더 진행한 꼬리 정리
//   - removeRouteLoops: 블록을 돌아 네모처럼 보이는 '루프' 접기
//
// 문제: removeRouteLoops가 "어떤 지점 근처(≈30m)로 되돌아오면 그 사이를 통째로
// 접는다"는 규칙이라, 차량이 하차를 위해 큰길에서 빠졌다가 다시 큰길로 합류하는
// '정당한 하차 진입/회차'까지 루프로 보고 접어버렸다. 그 결과 도로 경로가 해당
// 정류장을 "통과하지 않고" 직행하는 것처럼 그려졌다(마커 번호는 정류장 좌표에서
// 따로 찍으므로 정상으로 남음 → "마커는 2번인데 경로가 안 지나감" 증상).
//
// 해결: 루프 접기를 '정류장 인접 보호(stop-aware)'로 바꿔, 접을 구간에 실제 정류장이
// 포함되면 접지 않는다. 트림도 경로 중간이 우연히 도착지 근처를 지날 때 거기서 잘려
// 경로가 사라지는 일이 없도록, 배열 뒤쪽(꼬리)에서만 자르도록 가드를 둔다.

export type LatLng = [number, number] // [lat, lng]

// 두 좌표의 근사 거리(도 단위, 경도는 위도로 보정). 1도 ≈ 111km.
// 0.0003 ≈ 30m, 0.00045 ≈ 50m.
function approxDeg(a: LatLng, b: LatLng): number {
  const dLat = a[0] - b[0]
  const dLng = (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

// 도착지(마지막 정류장) 이후로 경로가 살짝 더 진행한 '꼬리'만 잘라낸다.
// 과거 버전은 전체 경로에서 도착지에 가장 가까운 점을 찾아 그 뒤를 모두 잘랐는데,
// 경로 중간이 우연히 도착지 좌표 근처를 지나면 거기서 잘려 경로 후반이 통째로
// 사라질 수 있었다. 이를 막기 위해 '뒤쪽 일부(tailRatio)' 안에서만 자를 지점을 찾는다.
export function trimRouteToDestination(
  pts: LatLng[],
  dest: LatLng,
  tailRatio = 0.85,
): LatLng[] {
  if (pts.length < 2) return pts
  const tailStart = Math.max(1, Math.floor(pts.length * tailRatio))
  let minDist = Infinity
  let minIdx = pts.length - 1
  for (let i = tailStart; i < pts.length; i++) {
    const d = approxDeg(pts[i], dest)
    if (d <= minDist) {
      minDist = d
      minIdx = i
    } // 동률이면 더 뒤(실제 도착점)를 택함
  }
  return pts.slice(0, minIdx + 1)
}

// 경로의 '루프(되돌아오는 구간)'를 접되, 그 구간이 실제 정류장을 지나면 접지 않는다.
// - 지점 i 이후에 i 근처(loopEps)로 되돌아오는 가장 먼 지점 j를 찾으면 i+1..j 가 루프 후보.
// - 그 루프 후보 구간 안에 실제 정류장(stopEps 이내)이 있으면 = 정당한 하차 진입 → 보존.
// - 정류장이 없으면(예: 고가/인터체인지로 도는 군더더기) → 접어서 깔끔하게.
export function foldSpuriousLoops(
  pts: LatLng[],
  stopCoords: LatLng[] = [],
  opts: { loopEps?: number; stopEps?: number } = {},
): LatLng[] {
  if (pts.length < 4) return pts
  const loopEps = opts.loopEps ?? 0.0003 // ≈30m: 이 안으로 되돌아오면 루프 후보
  const stopEps = opts.stopEps ?? 0.00045 // ≈50m: 정류장 보호 반경 (loopEps보다 넉넉히)
  const result = [...pts]
  let i = 0
  while (i < result.length - 2) {
    let jFar = -1
    for (let j = result.length - 1; j >= i + 2; j--) {
      if (approxDeg(result[i], result[j]) < loopEps) {
        jFar = j
        break
      }
    }
    if (jFar >= i + 2) {
      // 접을 구간(i+1..jFar)에 실제 정류장이 포함되면 보호 — 접지 않고 다음으로.
      const passesStop =
        stopCoords.length > 0 &&
        result
          .slice(i + 1, jFar + 1)
          .some(p => stopCoords.some(s => approxDeg(p, s) < stopEps))
      if (passesStop) {
        i++
        continue
      }
      result.splice(i + 1, jFar - i) // i+1..jFar 제거 (루프 접기)
    } else {
      i++
    }
  }
  return result
}

// 렌더 직전 표준 후처리: 꼬리 트림 → 정류장 보호 루프 접기.
export function cleanRoutePolyline(
  pts: LatLng[],
  dest: LatLng,
  stopCoords: LatLng[] = [],
): LatLng[] {
  return foldSpuriousLoops(trimRouteToDestination(pts, dest), stopCoords)
}
