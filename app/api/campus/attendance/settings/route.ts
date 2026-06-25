import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 교실 목록
  const { data: classrooms } = await serviceClient
    .from('classrooms')
    .select('id, display_name, account_email, popup_minutes_before')
    .eq('campus_id', profile.campus_id)
    .order('id')

  // 최신 월 세션
  const { data: monthRows } = await serviceClient
    .from('class_sessions').select('month').eq('campus_id', profile.campus_id)
  const months = [...new Set((monthRows ?? []).map((r: any) => r.month as string))].sort((a, b) => {
    const p = (m: string) => { const x = m.match(/\d+/g); return x ? Number(x[0]) * 100 + Number(x[1]) : 0 }
    return p(b) - p(a)
  })
  const latestMonth = months[0] ?? ''

  const { data: sessions } = await serviceClient
    .from('class_sessions')
    .select('id, name, time_range, days')
    .eq('campus_id', profile.campus_id)
    .eq('month', latestMonth)
    .order('sort_order')

  const sessionIds = (sessions ?? []).map((s: any) => s.id)

  let classes: any[] = []
  if (sessionIds.length) {
    const { data } = await serviceClient
      .from('classes')
      .select('id, session_id, level, room, teacher, color, days, classroom_id')
      .in('session_id', sessionIds)
      .order('sort_order')
    classes = data ?? []
  }

  return NextResponse.json({ classrooms: classrooms ?? [], sessions: sessions ?? [], classes })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // 교실 설정 업데이트 (account_email, popup_minutes_before)
  if (body.type === 'classroom') {
    const { classroom_id, account_email, popup_minutes_before } = body
    const upd: any = {}
    if (account_email !== undefined) upd.account_email = account_email || null
    if (popup_minutes_before !== undefined) upd.popup_minutes_before = Number(popup_minutes_before)
    const { error } = await serviceClient
      .from('classrooms').update(upd)
      .eq('id', classroom_id).eq('campus_id', profile.campus_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 반 교실 배정
  if (body.type === 'class_classroom') {
    const { class_id, classroom_id } = body
    const { error } = await serviceClient
      .from('classes').update({ classroom_id: classroom_id || null })
      .eq('id', class_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 반 수업시간/요일 업데이트 → class_sessions
  if (body.type === 'session') {
    const { session_id, time_range, days } = body
    const upd: any = {}
    if (time_range !== undefined) upd.time_range = time_range || null
    if (days !== undefined) upd.days = days || null
    const { error } = await serviceClient
      .from('class_sessions').update(upd)
      .eq('id', session_id).eq('campus_id', profile.campus_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown type' }, { status: 400 })
}
