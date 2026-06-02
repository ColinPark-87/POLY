import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// auth user ID와 users 테이블 ID를 동기화 (본사 관리자 전용 일회성 보정 스크립트)
// body: { email: "로그인에 사용할 이메일", old_id: "기존 users 테이블 UUID" }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const svc = createServiceClient()
  const { data: requester } = await svc.from('users').select('role').eq('id', user.id).single()
  if (requester?.role !== 'hq_admin') return NextResponse.json({ error: '본사 관리자 전용' }, { status: 403 })

  const { email, old_id } = await request.json()
  if (!email || !old_id) return NextResponse.json({ error: 'email, old_id 필요' }, { status: 400 })

  const service = createServiceClient()

  // 1. auth에서 해당 이메일의 user 찾기
  const { data: authList } = await service.auth.admin.listUsers()
  const authUser = authList?.users.find(u => u.email === email)
  if (!authUser) return NextResponse.json({ error: `auth user 없음: ${email}` }, { status: 404 })

  // 2. users 테이블에서 old_id로 찾기
  const { data: dbUser } = await service
    .from('users')
    .select('*')
    .eq('id', old_id)
    .maybeSingle()

  if (!dbUser) return NextResponse.json({ error: `users 테이블에 id 없음: ${old_id}` }, { status: 404 })

  const newId = authUser.id

  // 이미 일치하면 이메일만 업데이트
  if (newId === old_id) {
    await service.from('users').update({ email }).eq('id', old_id)
    return NextResponse.json({ ok: true, message: '이미 동기화됨, 이메일만 업데이트', id: newId })
  }

  // 3. 새 ID로 users 테이블 레코드 삽입
  const { error: insertErr } = await service.from('users').insert({ ...dbUser, id: newId, email })
  if (insertErr) return NextResponse.json({ error: `users insert 실패: ${insertErr.message}` }, { status: 500 })

  // 4. leave_grants, leave_requests 참조 업데이트
  await service.from('leave_grants').update({ user_id: newId }).eq('user_id', old_id)
  await service.from('leave_requests').update({ user_id: newId }).eq('user_id', old_id)

  // 5. 구 레코드 삭제
  await service.from('users').delete().eq('id', old_id)

  // 6. 구 auth user (@campus.internal) 삭제
  const oldAuthUser = authList?.users.find(u => u.id === old_id)
  if (oldAuthUser) {
    await service.auth.admin.deleteUser(old_id)
  }

  return NextResponse.json({ ok: true, message: '동기화 완료', old_id, new_id: newId, name: dbUser.name, email })
}
