import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 })

  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no api key' }, { status: 500 })

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`,
      { headers: { Authorization: `KakaoAK ${apiKey}` } }
    )
    if (!res.ok) return NextResponse.json({ error: 'kakao error', status: res.status }, { status: 502 })

    const data = await res.json()
    const results = (data.documents ?? []).map((d: Record<string, string>) => ({
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x),
    }))
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
