import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DAYCHARS = ['일', '월', '화', '수', '목', '금', '토']

// 날짜문자열(YYYY-MM-DD) → 요일문자 (UTC 자정 기준 — 날짜만 다루므로 시프트 없음)
function dayCharOf(dateStr: string): string {
  return DAYCHARS[new Date(dateStr + 'T00:00:00Z').getUTCDay()]
}

// start~end(포함) 날짜 배열 (UTC 일관 → 하루 밀림 없음)
function rangeDates(start: string, end: string): string[] {
  const out: string[] = []
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start]
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
    if (out.length > 90) break
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    class_id: string
    student_id: string
    status: 'absent' | 'late'
    note?: string
    session_date?: string         // 단일 (레거시)
    start_date?: string
    end_date?: string
  }
  const { class_id, student_id, status, note } = body
  if (!class_id || !student_id) return NextResponse.json({ error: 'class_id/student_id 필요' }, { status: 400 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  const campus_id = profile?.campus_id
  if (!campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 대상 날짜 후보
  const start = body.start_date ?? body.session_date
  const end = body.end_date ?? body.session_date ?? start
  if (!start) return NextResponse.json({ error: '날짜 필요' }, { status: 400 })
  const candidates = rangeDates(start, end as string)

  // 반 요일 (class.days > session.days). null이면 평일(월~금)로 간주
  const { data: cls } = await serviceClient
    .from('classes').select('days, session_id').eq('id', class_id).maybeSingle()
  let classDays: string | null = (cls as any)?.days ?? null
  if (!classDays && (cls as any)?.session_id) {
    const { data: sess } = await serviceClient
      .from('class_sessions').select('days').eq('id', (cls as any).session_id).maybeSingle()
    classDays = (sess as any)?.days ?? null
  }
  const effectiveDays = classDays || '월화수목금'  // 미설정 = 평일

  // 공휴일 (캠퍼스 캘린더: 전국 null + 캠퍼스별)
  const holidaySet = new Set<string>()
  try {
    const { data: hols } = await serviceClient
      .from('holidays').select('date')
      .or(`campus_id.is.null,campus_id.eq.${campus_id}`)
      .gte('date', candidates[0]).lte('date', candidates[candidates.length - 1])
    for (const h of (hols ?? []) as any[]) holidaySet.add(h.date)
  } catch { /* holidays 테이블 없으면 무시 */ }

  // 필터: 반 요일에 해당 + 공휴일 아님 (주말은 effectiveDays에 토/일 없으면 자동 제외)
  const targetDates = candidates.filter(d => effectiveDays.includes(dayCharOf(d)) && !holidaySet.has(d))

  const savedDates: string[] = []
  for (const session_date of targetDates) {
    const { data: session, error: sessErr } = await serviceClient
      .from('attendance_sessions')
      .upsert({ class_id, campus_id, session_date }, { onConflict: 'class_id,session_date', ignoreDuplicates: false })
      .select().single()
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

    const { error: recErr } = await serviceClient
      .from('attendance_records')
      .upsert({
        attendance_session_id: session.id,
        student_id,
        status,
        pre_marked: true,
        recorded_by: 'counselor',
        note: note ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'attendance_session_id,student_id' })
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
    savedDates.push(session_date)
  }

  return NextResponse.json({
    ok: true,
    saved: savedDates.length,
    saved_dates: savedDates,
    skipped: candidates.length - savedDates.length,
    class_days: effectiveDays,
  })
}
