import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id, session_date, records, mark_complete } = await req.json() as {
    class_id: string
    session_date: string
    records: { student_id: string; status: AttendanceStatus; pre_marked?: boolean; note?: string }[]
    mark_complete?: boolean
  }

  const serviceClient = createServiceClient()

  const { data: profile } = await serviceClient
    .from('users')
    .select('campus_id')
    .eq('id', user.id)
    .maybeSingle()
  const campus_id = profile?.campus_id
  if (!campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: session, error: sessionError } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  if (records.length > 0) {
    const { error: recError } = await serviceClient
      .from('attendance_records')
      .upsert(
        records.map(r => ({
          attendance_session_id: session.id,
          student_id: r.student_id,
          status: r.status,
          pre_marked: r.pre_marked ?? false,
          recorded_by: 'counselor' as const,
          note: r.note ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'attendance_session_id,student_id' }
      )
    if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })
  }

  if (mark_complete) {
    await serviceClient
      .from('attendance_sessions')
      .update({ completed_at: new Date().toISOString(), completed_by: 'counselor' })
      .eq('id', session.id)
  }

  return NextResponse.json({ ok: true, session_id: session.id })
}
