import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  // Kakao 쿼터 보호 — 익명 호출 차단
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 })

  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no api key' }, { status: 500 })

  const x = req.nextUrl.searchParams.get('x') // 경도 (lng)
  const y = req.nextUrl.searchParams.get('y') // 위도 (lat)
  const radius = req.nextUrl.searchParams.get('radius') ?? '5000'

  try {
    let kakaoUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`
    if (x && y) kakaoUrl += `&x=${x}&y=${y}&radius=${radius}&sort=distance`
    const res = await fetch(kakaoUrl, { headers: { Authorization: `KakaoAK ${apiKey}` } })
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
