import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_session_id, time_range } = await req.json() as {
    class_session_id: string
    time_range: string
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('class_sessions')
    .update({ time_range })
    .eq('id', class_session_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
