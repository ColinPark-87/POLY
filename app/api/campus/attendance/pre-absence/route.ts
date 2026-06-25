import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id, session_date, student_id, status, note } = await req.json() as {
    class_id: string
    session_date: string
    student_id: string
    status: 'absent' | 'late'
    note?: string
  }

  const serviceClient = createServiceClient()

  const { data: profile } = await serviceClient
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .maybeSingle()
  const campus_id = profile?.campus_id
  if (!campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: session, error: sessErr } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  const { error: recErr } = await serviceClient
    .from('attendance_records')
    .upsert(
      {
        attendance_session_id: session.id,
        student_id,
        status,
        pre_marked: true,
        recorded_by: 'counselor',
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'attendance_session_id,student_id' }
    )

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
