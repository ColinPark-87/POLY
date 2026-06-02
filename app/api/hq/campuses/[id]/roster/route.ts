import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id: campusId } = await params
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') ?? ''

  // 캠퍼스 정보
  const { data: campus } = await service.from('campuses').select('id, name').eq('id', campusId).single()
  if (!campus) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 404 })

  // 사용 가능한 월 목록
  const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
  const availableMonths = [...new Set((allMonthRows ?? []).map(s => s.month))].sort((a, b) => {
    const parse = (m: string) => { const p = m.match(/\d+/g); if (!p || p.length < 2) return 0; return Number(p[0]) * 100 + Number(p[1]) }
    return parse(b) - parse(a)
  })
  const targetMonth = month || availableMonths[0] || ''

  if (!targetMonth) return NextResponse.json({ sessions: [], classes: [], enrollments: [], availableMonths, currentMonth: '' })

  const { data: sessions } = await service.from('class_sessions')
    .select('*').eq('campus_id', campusId).eq('month', targetMonth).order('sort_order').order('created_at')

  const sessionIds = (sessions ?? []).map(s => s.id)
  if (!sessionIds.length) return NextResponse.json({ campus, sessions: [], classes: [], enrollments: [], availableMonths, currentMonth: targetMonth })

  const { data: classes } = await service.from('classes')
    .select('*').in('session_id', sessionIds).order('sort_order').order('level')

  const classIds = (classes ?? []).map(c => c.id)
  let enrollments: unknown[] = []
  if (classIds.length) {
    const { data } = await service.from('class_enrollments')
      .select('id, class_id, student_id, is_waitlist, campus_students(id, name, english_name, grade)')
      .in('class_id', classIds).order('sort_order')
    enrollments = data ?? []
  }

  return NextResponse.json({ campus, sessions: sessions ?? [], classes: classes ?? [], enrollments, availableMonths, currentMonth: targetMonth })
}
