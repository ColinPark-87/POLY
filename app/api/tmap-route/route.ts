import { NextRequest, NextResponse } from 'next/server'

// POST /api/tmap-route
// body: { stops: [{ name, lat, lng }] }
// returns: { coordinates: [lat, lng][] } — 실제 도로 경로 좌표 배열
export async function POST(req: NextRequest) {
  const appKey = process.env.TMAP_APP_KEY
  if (!appKey) return NextResponse.json({ error: 'no tmap key' }, { status: 500 })

  const { stops } = await req.json() as { stops: { name: string; lat: number; lng: number }[] }
  if (!stops || stops.length < 2) return NextResponse.json({ error: 'need at least 2 stops' }, { status: 400 })

  const start = stops[0]
  const end = stops[stops.length - 1]
  const waypoints = stops.slice(1, -1)

  const body: Record<string, string> = {
    startX: String(start.lng),
    startY: String(start.lat),
    startName: encodeURIComponent(start.name),
    endX: String(end.lng),
    endY: String(end.lat),
    endName: encodeURIComponent(end.name),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
  }

  if (waypoints.length > 0) {
    // passList: "lng1,lat1_lng2,lat2_..."
    body.passList = waypoints.map(w => `${w.lng},${w.lat}`).join('_')
  }

  try {
    const res = await fetch(
      'https://apis.openapi.sk.com/tmap/routes/routeSequential05?version=1&format=json',
      {
        method: 'POST',
        headers: {
          appKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `tmap error ${res.status}`, detail: text }, { status: 502 })
    }

    const data = await res.json()
    // features 배열에서 LineString geometry 좌표 추출
    const coordinates: [number, number][] = []
    for (const feature of data.features ?? []) {
      if (feature.geometry?.type === 'LineString') {
        for (const coord of feature.geometry.coordinates ?? []) {
          // TMAP returns [lng, lat]
          coordinates.push([coord[1], coord[0]])
        }
      }
    }

    return NextResponse.json({ coordinates })
  } catch (e) {
    return NextResponse.json({ error: 'fetch failed', detail: String(e) }, { status: 500 })
  }
}
