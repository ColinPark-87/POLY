import { createClient, createServiceClient } from '@/lib/supabase/server'

// 카카오 SDK 키 진단용 — 본사 관리자만
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: requester } = await service.from('users').select('role').eq('id', user.id).maybeSingle()
  if (requester?.role !== 'hq_admin') return Response.json({ error: 'forbidden' }, { status: 403 })

  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
  if (!key) return Response.json({ error: 'NEXT_PUBLIC_KAKAO_JS_KEY 없음' }, { status: 500 })

  const url = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://poly-system.vercel.app/',
        'Origin': 'https://poly-system.vercel.app',
      },
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => { headers[k] = v })
    const body = await res.text()
    return Response.json({
      status: res.status,
      ok: res.ok,
      key_prefix: key.slice(0, 8) + '...',
      response_headers: headers,
      body_preview: body.slice(0, 200),
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
