import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const body = await request.json()
  // 화이트리스트: UI 가 실제 전송하는 컬럼만 (mass-assignment 차단)
  const allowed: Record<string, unknown> = {}
  for (const k of ['name', 'is_active'] as const) {
    if (body[k] !== undefined) allowed[k] = body[k]
  }
  const { error } = await service.from('campuses').update(allowed).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  // ── 캠퍼스 완전 삭제 ──────────────────────────────────────────────
  // campuses(id) 를 참조하는 자식 중 일부(users / leave_* / holidays)는 ON DELETE CASCADE 가
  // 아니라서 단순 delete 는 FK 위반으로 실패한다. 직원 영구삭제와 동일하게 자식을 먼저 제거한다.
  // FK 동작이 환경마다 다를 수 있으므로(마이그레이션 상충) 명시적 삭제로 어떤 경우에도 동작하게 한다.

  // 1) 캠퍼스 소속 직원 id 수집 (auth 정리 + users 삭제용)
  const { data: campusUsers } = await service.from('users').select('id').eq('campus_id', id)
  const userIds = (campusUsers ?? []).map(u => u.id)

  // 2) 자기참조 해제 — campuses.principal_id → users(id) 때문에 user 삭제가 막히지 않도록
  await service.from('campuses').update({ principal_id: null }).eq('id', id)

  // 3) user 를 참조하거나 cascade 가 아닌 캠퍼스 데이터 먼저 제거
  //    (pickup_overrides.created_by / leave_requests.reviewed_by 는 users(id) 를 cascade 없이 참조)
  await service.from('leave_records').delete().eq('campus_id', id)
  await service.from('leave_requests').delete().eq('campus_id', id)
  await service.from('leave_grants').delete().eq('campus_id', id)
  await service.from('holidays').delete().eq('campus_id', id)
  await service.from('pickup_overrides').delete().eq('campus_id', id)
  await service.from('campus_stop_coords').delete().eq('campus_id', id)

  // 4) 직원 레코드 삭제 (notifications 등은 user_id cascade 로 함께 제거)
  if (userIds.length > 0) {
    const { error: usersErr } = await service.from('users').delete().eq('campus_id', id)
    if (usersErr) return NextResponse.json({ error: `직원 삭제 실패: ${usersErr.message}` }, { status: 400 })
  }

  // 5) 고아 auth 계정 정리 (best-effort — 실패해도 캠퍼스 삭제는 진행)
  for (const uid of userIds) {
    await service.auth.admin.deleteUser(uid)
  }

  // 6) 캠퍼스 삭제 → 남은 campus_* 운영 테이블은 ON DELETE CASCADE 로 자동 제거
  const { error } = await service.from('campuses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, deletedUsers: userIds.length })
}
