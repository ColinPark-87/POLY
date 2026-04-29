import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('campus_id').eq('id', user.id).single()

  const { data } = await supabase
    .from('leave_requests')
    .select(`
      id, type, start_date, end_date, days_used, reason,
      signature_data_url, status, created_at,
      users(id, name, email, position)
    `)
    .eq('campus_id', me?.campus_id ?? '')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return NextResponse.json({ requests: data ?? [] })
}
