import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not logged in', authError })
  }

  const service = createServiceClient()

  // id로 조회
  const { data: byId, error: idErr } = await service
    .from('users')
    .select('id, name, role, position, campus_id, email')
    .eq('id', user.id)
    .maybeSingle()

  // email로 조회
  const { data: byEmail, error: emailErr } = await service
    .from('users')
    .select('id, name, role, position, campus_id, email')
    .eq('email', user.email ?? '')
    .maybeSingle()

  // or 조회
  const { data: orRows, error: orErr } = await service
    .from('users')
    .select('id, name, role, position, campus_id, email')
    .or(`id.eq.${user.id},email.eq.${user.email ?? ''}`)
    .limit(3)

  return NextResponse.json({
    auth: {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata,
    },
    byId: { data: byId, error: idErr?.message },
    byEmail: { data: byEmail, error: emailErr?.message },
    orQuery: { data: orRows, error: orErr?.message },
  })
}
