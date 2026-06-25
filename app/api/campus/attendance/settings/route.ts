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

  // 교실 목록 (campus_id 일치 우선, 없으면 전체)
  const ROOM_COLS = 'id, display_name, account_email, popup_minutes_before, force_popup_class_id'
  let classrooms: any[] | null = null
  {
    const r = await serviceClient.from('classrooms').select(ROOM_COLS).eq('campus_id', profile.campus_id).order('display_name')
    if (!r.error && r.data?.length) classrooms = r.data
    else {
      const fb = await serviceClient.from('classrooms').select(ROOM_COLS).order('display_name')
      if (!fb.error) classrooms = fb.data
      else {
        // force_popup_class_id 컬럼 미생성 폴백
        const b = await serviceClient.from('classrooms').select('id, display_name, account_email, popup_minutes_before').order('display_name')
        classrooms = (b.data ?? []).map((c: any) => ({ ...c, force_popup_class_id: null }))
      }
    }
  }

  // 최신 월 세션
  const { data: monthRows } = await serviceClient
    .from('class_sessions').select('month').eq('campus_id', profile.campus_id)
  const months = [...new Set((monthRows ?? []).map((r: any) => r.month as string))].sort((a, b) => {
    const p = (m: string) => { const x = m.match(/\d+/g); return x ? Number(x[0]) * 100 + Number(x[1]) : 0 }
    return p(b) - p(a)
  })
  const kstM = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const currentMonthStr = `${kstM.getUTCFullYear()}년 ${kstM.getUTCMonth() + 1}월`
  const latestMonth = months.includes(currentMonthStr) ? currentMonthStr : (months[0] ?? '')

  const { data: sessions } = await serviceClient
    .from('class_sessions')
    .select('id, name, time_range, days')
    .eq('campus_id', profile.campus_id)
    .eq('month', latestMonth)
    .order('sort_order')

  const sessionIds = (sessions ?? []).map((s: any) => s.id)

  let classes: any[] = []
  if (sessionIds.length) {
    // days/classroom_id 컬럼 없을 수 있으므로 폴백
    const full = await serviceClient
      .from('classes')
      .select('id, session_id, level, room, teacher, color, days, classroom_id, popup_minutes_before, smartboard_time_range')
      .in('session_id', sessionIds)
      .order('sort_order')
    if (!full.error && full.data) {
      classes = full.data
    } else {
      const basic = await serviceClient
        .from('classes')
        .select('id, session_id, level, room, teacher, color')
        .in('session_id', sessionIds)
        .order('sort_order')
      classes = (basic.data ?? []).map((c: any) => ({ ...c, days: null, classroom_id: null, popup_minutes_before: null, smartboard_time_range: null }))
    }
  }

  // classroom_id가 없으면 classes.room 텍스트로 자동 매칭
  const roomNameToId = new Map((classrooms ?? []).map((r: any) => [r.display_name.toLowerCase(), r.id]))
  const classesWithRoom = classes.map((c: any) => ({
    ...c,
    classroom_id: c.classroom_id ?? roomNameToId.get((c.room ?? '').toLowerCase()) ?? null,
  }))

  return NextResponse.json({ classrooms: classrooms ?? [], sessions: sessions ?? [], classes: classesWithRoom })
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

  // 스마트보드 전용 시간 설정 (개설반현황 독립)
  if (body.type === 'class_smartboard_time') {
    const { class_id, smartboard_time_range } = body
    const { error } = await serviceClient
      .from('classes').update({ smartboard_time_range: smartboard_time_range || null })
      .eq('id', class_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 반별 팝업 시간 설정
  if (body.type === 'class_popup') {
    const { class_id, popup_minutes_before } = body
    const { error } = await serviceClient
      .from('classes').update({ popup_minutes_before: popup_minutes_before === null ? null : Number(popup_minutes_before) })
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

  // 반 순서 변경
  if (body.type === 'reorder_classes') {
    const { orders } = body as { orders: { id: string; sort_order: number }[] }
    await Promise.all(orders.map(({ id, sort_order }) =>
      serviceClient.from('classes').update({ sort_order }).eq('id', id)
    ))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown type' }, { status: 400 })
}
