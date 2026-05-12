import { NextRequest, NextResponse } from 'next/server'

// POST /api/tmap-route
// body: { stops: [{ name, lat, lng }] }
// returns: { coordinates: [lat, lng][], debug? } — 실제 도로 경로 좌표
export async function POST(req: NextRequest) {
  const appKey = process.env.TMAP_APP_KEY
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

    // GeoJSON features에서 LineString 좌표 추출
    const coordinates: [number, number][] = []
    for (const feature of data.features ?? []) {
      if (feature.geometry?.type === 'LineString') {
        for (const coord of feature.geometry.coordinates ?? []) {
          // TMAP: [lng, lat] → Leaflet: [lat, lng]
          coordinates.push([coord[1], coord[0]])
        }
      }
    }

    return NextResponse.json({ coordinates, count: coordinates.length })
  } catch (e) {
    return NextResponse.json({ error: 'fetch failed', detail: String(e) }, { status: 500 })
  }
}

// GET /api/tmap-route/test — 브라우저에서 직접 API 동작 확인용
export async function GET() {
  const appKey = process.env.TMAP_APP_KEY
  if (!appKey) return NextResponse.json({ status: 'NO_KEY' })

  // 서울 → 강남 간단 테스트
  const body = new URLSearchParams({
    startX: '126.9779692',
    startY: '37.5662952',
    endX: '127.0276368',
    endY: '37.4979502',
    startName: '서울시청',
    endName: '강남역',
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
  })

  const res = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
    method: 'POST',
    headers: { appKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await res.text()
  return NextResponse.json({ status: res.status, ok: res.ok, preview: text.slice(0, 500) })
}
