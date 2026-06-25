import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 월별 출결 분석: 날짜별/세션별/요일별 집계 + 결석·지각 명단
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 월 파라미터 "2026-06", 없으면 현재월
  const sp = req.nextUrl.searchParams
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const ym = sp.get('ym') ?? `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`

  // 사용 가능한 월 목록 (탭바용)
  const { data: allDates } = await svc
    .from('attendance_sessions')
    .select('session_date')
    .eq('campus_id', profile.campus_id)
  const availableMonths = [...new Set((allDates ?? []).map((r: any) => (r.session_date as string).slice(0, 7)))].sort().reverse()

  // 해당 월 세션 + 기록
  const { data: sessions } = await svc
    .from('attendance_sessions')
    .select('id, class_id, session_date, completed_at, attendance_records(status, pre_marked, campus_students(name))')
    .eq('campus_id', profile.campus_id)
    .gte('session_date', start)
    .lte('session_date', end)

  // class_id → 세션명 매핑 (현재 활성 반)
  const classIds = [...new Set((sessions ?? []).map((s: any) => s.class_id))]
  const classMap = new Map<string, string>()
  if (classIds.length) {
    const { data: classes } = await svc
      .from('classes')
      .select('id, level, class_sessions(name)')
      .in('id', classIds)
    for (const c of (classes ?? []) as any[]) {
      classMap.set(c.id, (c.class_sessions as any)?.name ?? c.level)
    }
  }

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

  // 집계
  const byDate: Record<string, { present: number; absent: number; late: number; absentNames: string[]; lateNames: string[] }> = {}
  const bySession: Record<string, { present: number; absent: number; late: number }> = {}
  const byWeekday: Record<string, { present: number; absent: number; late: number }> = {}

  for (const s of (sessions ?? []) as any[]) {
    const date = s.session_date as string
    const wd = WEEKDAYS[new Date(date + 'T00:00:00+09:00').getUTCDay()]
    const sessName = classMap.get(s.class_id) ?? '기타'
    const recs: any[] = s.attendance_records ?? []

    byDate[date] ??= { present: 0, absent: 0, late: 0, absentNames: [], lateNames: [] }
    bySession[sessName] ??= { present: 0, absent: 0, late: 0 }
    byWeekday[wd] ??= { present: 0, absent: 0, late: 0 }

    for (const r of recs) {
      const name = (r.campus_students as any)?.name ?? ''
      if (r.status === 'absent') {
        byDate[date].absent++; bySession[sessName].absent++; byWeekday[wd].absent++
        byDate[date].absentNames.push(name + (r.pre_marked ? '(사전)' : ''))
      } else if (r.status === 'late') {
        byDate[date].late++; bySession[sessName].late++; byWeekday[wd].late++
        byDate[date].lateNames.push(name)
      } else {
        byDate[date].present++; bySession[sessName].present++; byWeekday[wd].present++
      }
    }
  }

  return NextResponse.json({ ym, availableMonths, byDate, bySession, byWeekday })
}
