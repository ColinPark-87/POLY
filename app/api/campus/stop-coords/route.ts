import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { data, error } = await service
    .from('campus_stop_coords')
    .select('stop_name, lat, lng')
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const coords: Record<string, { lat: number; lng: number }> = {}
  for (const row of data ?? []) {
    coords[row.stop_name] = { lat: row.lat, lng: row.lng }
  }

  return NextResponse.json({ coords })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const body = await request.json()
  const coords: Record<string, { lat: number; lng: number }> = body.coords ?? {}

  const rows = Object.entries(coords).map(([stop_name, { lat, lng }]) => ({
    campus_id: campusId,
    stop_name,
    lat,
    lng,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) return NextResponse.json({ ok: true, saved: 0 })

  const { error } = await service
    .from('campus_stop_coords')
    .upsert(rows, { onConflict: 'campus_id,stop_name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, saved: rows.length })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { error } = await service
    .from('campus_stop_coords')
    .delete()
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
