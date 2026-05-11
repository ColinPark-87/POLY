import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campus_id')

  let usersQuery = service
    .from('users')
    .select('id, name, email, position, role, is_active, campus_id')
    .order('name')

  if (campusId) usersQuery = usersQuery.eq('campus_id', campusId)

  const { data: users, error: usersError } = await usersQuery
  if (usersError) {
    console.error('[hq/employees] users query error:', usersError)
    return NextResponse.json({ employees: [], error: usersError.message }, { status: 500 })
  }

  const { data: campuses } = await service.from('campuses').select('id, name')
  const campusMap = new Map((campuses ?? []).map(c => [c.id, c.name]))

  const employees = (users ?? []).map(u => ({
    ...u,
    campuses: u.campus_id ? { name: campusMap.get(u.campus_id) ?? '알 수 없음' } : null,
  }))

  // 실제 운행 차량 수 = 현재 월 등록된 학생 스케줄에 실제로 배차된 고유 버스 이름 수
  const currentMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const { data: sessions } = await service
    .from('class_sessions').select('id').eq('month', currentMonth)
  const sessionIds = (sessions ?? []).map(s => s.id)

  let activeBusCount = 0
  if (sessionIds.length) {
    const { data: classes } = await service
      .from('classes').select('id').in('session_id', sessionIds)
    const classIds = (classes ?? []).map(c => c.id)

    if (classIds.length) {
      const { data: enrollments } = await service
        .from('class_enrollments').select('arr_schedule, dep_schedule').in('class_id', classIds)
      const busNames = new Set<string>()
      for (const enr of enrollments ?? []) {
        const arr = enr.arr_schedule as Record<string, string> | null
        const dep = enr.dep_schedule as Record<string, string> | null
        if (arr) Object.values(arr).forEach(v => v && busNames.add(v))
        if (dep) Object.values(dep).forEach(v => v && busNames.add(v))
      }
      activeBusCount = busNames.size
    }
  }

  return NextResponse.json({ employees, totalBuses: activeBusCount })
}
