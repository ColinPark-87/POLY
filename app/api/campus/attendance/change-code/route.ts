import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET: 현재 코드 조회 (관리자용) / PATCH: 코드 변경
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: campus } = await svc
      .from('campuses').select('smartboard_change_code').eq('id', profile.campus_id).maybeSingle()
    return NextResponse.json({ code: campus?.smartboard_change_code ?? '7659' })
  } catch {
    return NextResponse.json({ code: '7659' })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { code } = await req.json() as { code: string }
  const { error } = await svc
    .from('campuses').update({ smartboard_change_code: code || '7659' }).eq('id', profile.campus_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
