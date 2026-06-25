import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const class_id: string = user.user_metadata.class_id
  const campus_id: string = user.user_metadata.campus_id
  const session_date = new Date().toISOString().split('T')[0]

  const { records } = await req.json() as {
    records: { student_id: string; status: AttendanceStatus }[]
  }

  const serviceClient = createServiceClient()

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
      records.map(r => ({
        attendance_session_id: session.id,
        student_id: r.student_id,
        status: r.status,
        pre_marked: false,
        recorded_by: 'teacher' as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'attendance_session_id,student_id' }
    )

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  await serviceClient
    .from('attendance_sessions')
    .update({ completed_at: new Date().toISOString(), completed_by: 'teacher' })
    .eq('id', session.id)

  await serviceClient
    .from('smartboard_devices')
    .upsert(
      { class_id, campus_id, last_seen: new Date().toISOString() },
      { onConflict: 'class_id' }
    )

  return NextResponse.json({ ok: true, session_id: session.id })
}
