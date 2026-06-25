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

  // class_id → {세션명, 반레벨, 시간} 매핑
  const classIds = [...new Set((sessions ?? []).map((s: any) => s.class_id))]
  const classMap = new Map<string, { sessionName: string; level: string; timeRange: string }>()
  if (classIds.length) {
    const { data: classes } = await svc
      .from('classes')
      .select('id, level, smartboard_time_range, class_sessions(name, time_range)')
      .in('id', classIds)
    for (const c of (classes ?? []) as any[]) {
      classMap.set(c.id, {
        sessionName: (c.class_sessions as any)?.name ?? '',
        level: c.level ?? '',
        timeRange: c.smartboard_time_range ?? (c.class_sessions as any)?.time_range ?? '',
      })
    }
  }

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

  // 시간 → 분 (정렬용)
  function startMinOf(tr: string): number {
    const s = (tr.split('~')[0] ?? '').trim()
    const [h, m] = s.split(':').map(Number)
    if (isNaN(h)) return 9999
    const h24 = h < 9 ? h + 12 : h
    return h24 * 60 + (m || 0)
  }

  // 집계 — 결석 외 전부 출석으로 처리, 지각은 출석에 포함하되 별도 카운트
  interface AbsentEntry { name: string; sessionName: string; level: string; timeRange: string; startMin: number; pre: boolean }
  const byDate: Record<string, { present: number; absent: number; late: number; absentList: AbsentEntry[]; lateList: AbsentEntry[] }> = {}
  const bySession: Record<string, { present: number; absent: number; late: number }> = {}
  const byWeekday: Record<string, { present: number; absent: number; late: number }> = {}

  for (const s of (sessions ?? []) as any[]) {
    const date = s.session_date as string
    const wd = WEEKDAYS[new Date(date + 'T00:00:00+09:00').getUTCDay()]
    const ci = classMap.get(s.class_id)
    const sessName = ci?.sessionName || '기타'
    const level = ci?.level ?? ''
    const timeRange = ci?.timeRange ?? ''
    const startMin = startMinOf(timeRange)
    const recs: any[] = s.attendance_records ?? []

    byDate[date] ??= { present: 0, absent: 0, late: 0, absentList: [], lateList: [] }
    bySession[sessName] ??= { present: 0, absent: 0, late: 0 }
    byWeekday[wd] ??= { present: 0, absent: 0, late: 0 }

    for (const r of recs) {
      const name = (r.campus_students as any)?.name ?? ''
      const entry: AbsentEntry = { name, sessionName: sessName, level, timeRange, startMin, pre: !!r.pre_marked }
      if (r.status === 'absent') {
        byDate[date].absent++; bySession[sessName].absent++; byWeekday[wd].absent++
        byDate[date].absentList.push(entry)
      } else if (r.status === 'late') {
        byDate[date].present++; bySession[sessName].present++; byWeekday[wd].present++
        byDate[date].late++; bySession[sessName].late++; byWeekday[wd].late++
        byDate[date].lateList.push({ ...entry, pre: false })
      } else {
        byDate[date].present++; bySession[sessName].present++; byWeekday[wd].present++
      }
    }
  }

  return NextResponse.json({ ym, availableMonths, byDate, bySession, byWeekday })
}
