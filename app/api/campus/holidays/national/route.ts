import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const KR_HOLIDAYS: Record<number, { date: string; name: string }[]> = {
  2024: [
    { date: '2024-01-01', name: '신정' },
    { date: '2024-02-09', name: '설날 연휴' },
    { date: '2024-02-10', name: '설날' },
    { date: '2024-02-11', name: '설날 연휴' },
    { date: '2024-02-12', name: '대체공휴일' },
    { date: '2024-03-01', name: '삼일절' },
    { date: '2024-04-10', name: '국회의원선거일' },
    { date: '2024-05-01', name: '근로자의 날' },
    { date: '2024-05-05', name: '어린이날' },
    { date: '2024-05-06', name: '대체공휴일' },
    { date: '2024-05-15', name: '부처님오신날' },
    { date: '2024-06-06', name: '현충일' },
    { date: '2024-08-15', name: '광복절' },
    { date: '2024-09-16', name: '추석 연휴' },
    { date: '2024-09-17', name: '추석' },
    { date: '2024-09-18', name: '추석 연휴' },
    { date: '2024-10-03', name: '개천절' },
    { date: '2024-10-09', name: '한글날' },
    { date: '2024-12-25', name: '크리스마스' },
  ],
  2025: [
    { date: '2025-01-01', name: '신정' },
    { date: '2025-01-28', name: '설날 연휴' },
    { date: '2025-01-29', name: '설날' },
    { date: '2025-01-30', name: '설날 연휴' },
    { date: '2025-03-01', name: '삼일절' },
    { date: '2025-05-01', name: '근로자의 날' },
    { date: '2025-05-05', name: '어린이날·부처님오신날' },
    { date: '2025-05-06', name: '대체공휴일(어린이날)' },
    { date: '2025-06-06', name: '현충일' },
    { date: '2025-08-15', name: '광복절' },
    { date: '2025-10-03', name: '개천절' },
    { date: '2025-10-05', name: '추석 연휴' },
    { date: '2025-10-06', name: '추석' },
    { date: '2025-10-07', name: '추석 연휴' },
    { date: '2025-10-08', name: '대체공휴일(추석)' },
    { date: '2025-10-09', name: '한글날' },
    { date: '2025-12-25', name: '크리스마스' },
  ],
  2026: [
    { date: '2026-01-01', name: '신정' },
    { date: '2026-02-16', name: '설날 연휴' },
    { date: '2026-02-17', name: '설날' },
    { date: '2026-02-18', name: '설날 연휴' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-05-01', name: '근로자의 날' },
    { date: '2026-05-05', name: '어린이날' },
    { date: '2026-06-06', name: '현충일' },
    { date: '2026-08-15', name: '광복절' },
    { date: '2026-09-23', name: '추석 연휴' },
    { date: '2026-09-24', name: '추석' },
    { date: '2026-09-25', name: '추석 연휴' },
    { date: '2026-10-03', name: '개천절' },
    { date: '2026-10-09', name: '한글날' },
    { date: '2026-12-25', name: '크리스마스' },
  ],
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  if (!me || !['campus_admin', 'hq_admin'].includes(me.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { year } = await request.json()
  const holidays = KR_HOLIDAYS[year]
  if (!holidays) return NextResponse.json({ error: `${year}년 공휴일 데이터가 없습니다. (지원: 2024~2026)` }, { status: 400 })

  const { data: existing } = await service
    .from('holidays')
    .select('date')
    .eq('campus_id', me.campus_id)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)

  const existingDates = new Set((existing ?? []).map((h: { date: string }) => h.date))
  const toInsert = holidays.filter(h => !existingDates.has(h.date))

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: holidays.length })
  }

  const { error } = await service.from('holidays').insert(
    toInsert.map(h => ({ campus_id: me.campus_id, date: h.date, name: h.name }))
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: toInsert.length, skipped: existingDates.size })
}
