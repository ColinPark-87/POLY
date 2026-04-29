import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.app_metadata?.user_role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const { data } = await service.from('campuses').select('*').order('name')
  return NextResponse.json({ campuses: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.app_metadata?.user_role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const { name, code, principal_email, principal_name } = await request.json()

  if (!name || !code) return NextResponse.json({ error: '이름과 코드는 필수입니다.' }, { status: 400 })

  const { data: campus, error: campusErr } = await service
    .from('campuses')
    .insert({ name, code })
    .select()
    .single()

  if (campusErr) return NextResponse.json({ error: campusErr.message }, { status: 400 })

  let tempPassword: string | null = null
  if (principal_email && principal_name) {
    tempPassword = Math.random().toString(36).slice(2, 10)
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email: principal_email,
      password: tempPassword,
      email_confirm: true,
    })
    if (!authErr && authData.user) {
      await service.from('users').insert({
        id: authData.user.id,
        campus_id: campus.id,
        email: principal_email,
        name: principal_name,
        position: '원장',
        role: 'campus_admin',
        needs_password_change: true,
      })
      await service.from('campuses').update({ principal_id: authData.user.id }).eq('id', campus.id)
    }
  }

  return NextResponse.json({ ok: true, campusId: campus.id, tempPassword })
}
