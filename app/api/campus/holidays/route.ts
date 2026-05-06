import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()

  const { data } = await service
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

  const { data: me } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const body = await request.json()

  // Support both single date and date range
  const startDate: string = body.start_date ?? body.date
  const endDate: string = body.end_date ?? body.date ?? startDate
  const name: string = body.name

  if (!startDate || !name) return NextResponse.json({ error: '날짜와 이름이 필요합니다.' }, { status: 400 })

  // Generate all dates in range
  const dates: string[] = []
  const cur = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }

  if (dates.length === 0) return NextResponse.json({ error: '유효한 날짜 범위가 아닙니다.' }, { status: 400 })

  const rows = dates.map(date => ({ campus_id: me?.campus_id, date, name }))
  const { error } = await service.from('holidays').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, inserted: dates.length })
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
