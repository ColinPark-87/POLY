import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()

  const { data } = await supabase
    .from('holidays')
    .select('*')
    .or(`campus_id.is.null,campus_id.eq.${me?.campus_id ?? ''}`)
    .order('date', { ascending: true })

  return NextResponse.json({ holidays: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()
  const { date, name } = await request.json()

  if (!date || !name) return NextResponse.json({ error: '날짜와 이름이 필요합니다.' }, { status: 400 })

  const { error } = await service.from('holidays').insert({ campus_id: me?.campus_id, date, name })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await request.json()
  const { error } = await service.from('holidays').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
