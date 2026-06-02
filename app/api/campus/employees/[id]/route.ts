import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 요청자 권한 확인 — 캠퍼스 관리자(원장/부원장/본사)만 직원 수정 가능
  const { data: me } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }
  const campusId = me.campus_id ?? ''
  const body = await request.json()

  // 화이트리스트: campus_admin 이 변경 가능한 컬럼만 허용 (mass-assignment 권한상승 차단).
  // role/id/campus_id 는 직접 복사하지 않음 — role 은 별도 검증 후에만 반영.
  const ALLOWED = ['name', 'position', 'company_hired_at', 'campus_hired_at', 'is_active', 'terminated_at', 'email', 'perm_class_roster', 'perm_vehicles', 'perm_vehicles_restricted', 'perm_analytics', 'perm_enroll_edit', 'role'] as const
  const updates: Record<string, unknown> = {}
  for (const k of ALLOWED) if (k in body) updates[k] = body[k]
  // 캠퍼스 관리자는 role 을 employee/campus_admin 으로만 지정 가능 (hq_admin 승격 차단)
  if ('role' in updates && updates.role !== 'employee' && updates.role !== 'campus_admin') {
    return NextResponse.json({ error: '허용되지 않은 권한입니다.' }, { status: 403 })
  }

  // 이름 변경 시 classes.teacher / kt_teacher 도 함께 갱신
  let oldName: string | null = null
  if (updates.name) {
    const { data: target } = await service.from('users').select('name').eq('id', id).single()
    oldName = target?.name ?? null
  }

  const { error } = await service
    .from('users')
    .update(updates)
    .eq('id', id)
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 이름이 실제로 바뀌었으면 반 편성 데이터도 업데이트
  if (oldName && body.name && oldName !== body.name) {
    const { data: sessions } = await service
      .from('class_sessions').select('id').eq('campus_id', campusId)
    const sessionIds = (sessions ?? []).map(s => s.id)
    if (sessionIds.length) {
      const { data: clsList } = await service
        .from('classes').select('id').in('session_id', sessionIds)
      const classIds = (clsList ?? []).map(c => c.id)
      if (classIds.length) {
        await service.from('classes').update({ teacher: body.name })
          .in('id', classIds).eq('teacher', oldName)
        await service.from('classes').update({ kt_teacher: body.name })
          .in('id', classIds).eq('kt_teacher', oldName)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
