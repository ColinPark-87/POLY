import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// One-time fix: position='원장' 직원의 role을 campus_admin으로 업데이트
export async function POST() {
  const service = createServiceClient()

  const { data, error } = await service
    .from('users')
    .update({ role: 'campus_admin' })
    .eq('role', 'employee')
    .eq('position', '원장')
    .select('id, name, campus_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fixed: data?.length ?? 0, users: data })
}
