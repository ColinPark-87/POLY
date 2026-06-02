import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isCampusAdminLike } from '@/lib/auth/routing'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 요청자 권한 + 캠퍼스 확인 — 관리자만 동료 비번 리셋 가능
  const { data: me } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!me || !isCampusAdminLike(me.role ?? '', me.position ?? '')) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  // 대상 직원이 같은 캠퍼스인지 확인
  const { data: target } = await service.from('users').select('campus_id').eq('id', id).single()
  if (target?.campus_id !== me.campus_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // CSPRNG 기반 임시 비밀번호
  const tempPassword = randomBytes(9).toString('base64url')

  const { error } = await service.auth.admin.updateUserById(id, { password: tempPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, tempPassword })
}
