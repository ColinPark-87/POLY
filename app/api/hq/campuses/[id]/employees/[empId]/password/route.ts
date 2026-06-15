import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// HQ 가 캠퍼스 직원(원장 포함) 비밀번호를 직접 지정해 변경한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; empId: string }> }
) {
  const { id: campusId, empId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { password } = await request.json()
  if (!password || password.length < 6) {
    return NextResponse.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
  }

  // 대상 직원이 해당 캠퍼스 소속인지 확인
  const { data: target } = await service.from('users').select('campus_id, name').eq('id', empId).single()
  if (!target || target.campus_id !== campusId) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { error } = await service.auth.admin.updateUserById(empId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, name: target.name })
}
