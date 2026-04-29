import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.app_metadata?.user_role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const service = await createServiceClient()
  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campus_id')

  let query = service
    .from('users')
    .select('id, name, email, position, role, is_active, campus_id, campuses(name)')
    .order('name')

  if (campusId) query = query.eq('campus_id', campusId)

  const { data } = await query
  return NextResponse.json({ employees: data ?? [] })
}
