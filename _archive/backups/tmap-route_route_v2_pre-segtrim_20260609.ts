import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chunkStops, type TmapStop } from '@/lib/utils/tmap-chunk'

// TMAP은 한국 IP만 허용 → 이 함수를 Vercel 서울 리전에서 실행 (서버간 호출이라 CORS도 없음)
export const runtime = 'nodejs'
export const preferredRegion = 'icn1'

// 한 구간(시작+경유≤5+도착)에 대한 TMAP 도로경로 + ETA 조회
async function routeSegment(
  appKey: string,
  seg: TmapStop[],
): Promise<{ coordinates: [number, number][]; time: number; distance: number }> {
  const start = seg[0]
  const end = seg[seg.length - 1]
  const waypoints = seg.slice(1, -1) // chunkStops가 구간당 ≤5개를 보장

  const body: Record<string, string> = {
    startX: String(start.lng),
    startY: String(start.lat),
    startName: start.name,
    endX: String(end.lng),
    endY: String(end.lat),
    endName: end.name,
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
    trafficInfo: 'N',
  }

  if (waypoints.length > 0) {
    // passList: "경도1,위도1_경도2,위도2"
    body.passList = waypoints.map(w => `${w.lng},${w.lat}`).join('_')
  }

  const res = await fetch(
    'https://apis.openapi.sk.com/tmap/routes?version=1&format=json',
    {
      method: 'POST',
      headers: {
        appKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    }
  )

  const text = await res.text()
  if (!res.ok) throw new Error(`tmap ${res.status}: ${text.slice(0, 200)}`)

  let data: any
  try { data = JSON.parse(text) } catch { throw new Error(`invalid json: ${text.slice(0, 200)}`) }

  // GeoJSON features에서 LineString 좌표 + ETA(첫 Point의 totalTime/Distance) 추출
  const coordinates: [number, number][] = []
  let time = 0
  let distance = 0
  for (const feature of data.features ?? []) {
    if (feature.geometry?.type === 'Point' && feature.properties?.totalTime != null && time === 0) {
      time = feature.properties.totalTime
      distance = feature.properties.totalDistance ?? 0
    }
    if (feature.geometry?.type === 'LineString') {
      for (const coord of feature.geometry.coordinates ?? []) {
        // TMAP: [lng, lat] → Kakao: [lat, lng]
        coordinates.push([coord[1], coord[0]])
      }
    }
  }
  return { coordinates, time, distance }
}

// POST /api/tmap-route
// body: { stops: [{ name, lat, lng }] }
// returns: { coordinates: [lat, lng][], time, distance } — 실제 도로 경로 좌표 + ETA
// 정류장 7개 초과 노선은 5개 경유지 제한 때문에 구간을 나눠 호출 후 좌표를 이어붙인다.
export async function POST(req: NextRequest) {
  // 익명 호출 차단 (TMAP 쿼터 보호)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 서버 전용 키가 없으면 공개 키로 폴백 (현재 운영엔 NEXT_PUBLIC_TMAP_APP_KEY만 설정됨)
  const appKey = process.env.TMAP_APP_KEY ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY
  if (!appKey) return NextResponse.json({ error: 'no tmap key' }, { status: 500 })

  const { stops } = await req.json() as { stops: TmapStop[] }
  if (!stops || stops.length < 2) return NextResponse.json({ error: 'need at least 2 stops' }, { status: 400 })

  const chunks = chunkStops(stops)
  const coordinates: [number, number][] = []
  let time = 0
  let distance = 0
  let okSegments = 0
  let lastError = ''

  // 구간을 순서대로 호출해 좌표를 이어붙임 (정류장 순서 보존)
  for (const seg of chunks) {
    try {
      const r = await routeSegment(appKey, seg)
      const pts = r.coordinates
      if (coordinates.length && pts.length) {
        // 경계 정류장(공유점) 중복 좌표 제거 후 연결
        const [plat, plng] = coordinates[coordinates.length - 1]
        const [nlat, nlng] = pts[0]
        coordinates.push(...(plat === nlat && plng === nlng ? pts.slice(1) : pts))
      } else {
        coordinates.push(...pts)
      }
      time += r.time
      distance += r.distance
      okSegments++
    } catch (e) {
      // 한 구간이 실패해도 나머지 구간은 살려서 가능한 만큼 경로를 그린다
      lastError = String(e)
    }
  }

  if (okSegments === 0) {
    return NextResponse.json({ error: 'tmap route failed', detail: lastError.slice(0, 300) }, { status: 502 })
  }

  return NextResponse.json({
    coordinates,
    count: coordinates.length,
    time,
    distance,
    segments: chunks.length,
    okSegments,
    partial: okSegments < chunks.length,
  })
}
