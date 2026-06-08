import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// TMAP은 한국 IP만 허용 → 이 함수를 Vercel 서울 리전에서 실행 (서버간 호출이라 CORS도 없음)
export const runtime = 'nodejs'
export const preferredRegion = 'icn1'

// POST /api/tmap-route
// body: { stops: [{ name, lat, lng }] }
// returns: { coordinates: [lat, lng][], time, distance } — 실제 도로 경로 좌표 + ETA
export async function POST(req: NextRequest) {
  // 익명 호출 차단 (TMAP 쿼터 보호)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 서버 전용 키가 없으면 공개 키로 폴백 (현재 운영엔 NEXT_PUBLIC_TMAP_APP_KEY만 설정됨)
  const appKey = process.env.TMAP_APP_KEY ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY
  if (!appKey) return NextResponse.json({ error: 'no tmap key' }, { status: 500 })

  const { stops } = await req.json() as { stops: { name: string; lat: number; lng: number }[] }
  if (!stops || stops.length < 2) return NextResponse.json({ error: 'need at least 2 stops' }, { status: 400 })

  const start = stops[0]
  const end = stops[stops.length - 1]
  const waypoints = stops.slice(1, -1) // 최대 5개까지 지원

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
    body.passList = waypoints.slice(0, 5).map(w => `${w.lng},${w.lat}`).join('_')
  }

  try {
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

    if (!res.ok) {
      return NextResponse.json({ error: `tmap ${res.status}`, detail: text }, { status: 502 })
    }

    let data: any
    try { data = JSON.parse(text) } catch {
      return NextResponse.json({ error: 'invalid json', detail: text.slice(0, 300) }, { status: 502 })
    }

    // GeoJSON features에서 LineString 좌표 + ETA(첫 Point의 totalTime/Distance) 추출
    const coordinates: [number, number][] = []
    let time: number | null = null
    let distance: number | null = null
    for (const feature of data.features ?? []) {
      if (feature.geometry?.type === 'Point' && feature.properties?.totalTime != null && time == null) {
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

    return NextResponse.json({ coordinates, count: coordinates.length, time, distance })
  } catch (e) {
    return NextResponse.json({ error: 'fetch failed', detail: String(e) }, { status: 500 })
  }
}
