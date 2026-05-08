import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { data: backups } = await service
    .from('data_backups')
    .select('id, label, created_at')
    .eq('campus_id', campusId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ backups: backups ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  // ── 백업 저장 ──────────────────────────────────────────────────
  if (action === 'create') {
    const label = body.label || new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

    const { data: sessions } = await service
      .from('class_sessions').select('*').eq('campus_id', campusId).order('month').order('sort_order')

    const sessionIds = (sessions ?? []).map(s => s.id)

    const { data: classes } = sessionIds.length
      ? await service.from('classes').select('*').in('session_id', sessionIds).order('sort_order')
      : { data: [] }

    const classIds = (classes ?? []).map(c => c.id)

    const { data: enrollments } = classIds.length
      ? await service.from('class_enrollments').select('*').in('class_id', classIds).eq('is_waitlist', false)
      : { data: [] }

    const data = {
      sessions: sessions ?? [],
      classes: classes ?? [],
      enrollments: enrollments ?? [],
      saved_at: new Date().toISOString(),
    }

    const { data: backup, error } = await service
      .from('data_backups')
      .insert({ campus_id: campusId, label, data })
      .select('id, label, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, backup })
  }

  // ── 백업 복원 ──────────────────────────────────────────────────
  if (action === 'restore') {
    const { backup_id } = body
    const { data: backup } = await service
      .from('data_backups').select('data').eq('id', backup_id).eq('campus_id', campusId).single()
    if (!backup) return NextResponse.json({ error: '백업 없음' }, { status: 404 })

    const { sessions, classes, enrollments } = backup.data as {
      sessions: Record<string, unknown>[]
      classes: Record<string, unknown>[]
      enrollments: Record<string, unknown>[]
    }

    const months = [...new Set(sessions.map((s: Record<string, unknown>) => s.month as string))]

    // 기존 데이터 삭제 (세션 → classes/enrollments cascade)
    if (months.length) {
      await service.from('class_sessions').delete().eq('campus_id', campusId).in('month', months)
    }

    // 세션 복원
    if (sessions.length) {
      await service.from('class_sessions').insert(sessions)
    }

    // 반 복원
    if (classes.length) {
      for (let i = 0; i < classes.length; i += 200) {
        await service.from('classes').insert(classes.slice(i, i + 200))
      }
    }

    // 수강/차량 복원
    if (enrollments.length) {
      for (let i = 0; i < enrollments.length; i += 200) {
        await service.from('class_enrollments').upsert(
          enrollments.slice(i, i + 200),
          { onConflict: 'class_id,student_id', ignoreDuplicates: false }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      restored: { sessions: sessions.length, classes: classes.length, enrollments: enrollments.length }
    })
  }

  // ── 백업 삭제 ──────────────────────────────────────────────────
  if (action === 'delete') {
    const { backup_id } = body
    const { error } = await service
      .from('data_backups').delete().eq('id', backup_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
