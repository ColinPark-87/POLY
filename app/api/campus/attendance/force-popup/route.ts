import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 세팅에서 반 임시 팝업 트리거 / 해제
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classroom_id, class_id } = await req.json() as { classroom_id: string; class_id: string | null }

  const { error } = await svc
    .from('classrooms')
    .update({ force_popup_class_id: class_id })
    .eq('id', classroom_id)
    .eq('campus_id', profile.campus_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
