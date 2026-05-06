import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// One-time fix: quarter type leave_requests stored as 0.3 should be 0.25
export async function POST() {
  const service = createServiceClient()

  // Fix days_used = 0.3 for quarter type → 0.25
  const { data, error, count } = await service
    .from('leave_requests')
    .update({ days_used: 0.25 })
    .eq('type', 'quarter')
    .gte('days_used', 0.28)
    .lte('days_used', 0.32)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fixed: data?.length ?? count ?? 0 })
}
