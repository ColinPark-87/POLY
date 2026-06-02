import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

async function getAuthProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증 필요', status: 401 }

  const service = createServiceClient()
  const { data: profile } = await service.from('users')
    .select('campus_id, role, position, name, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics, perm_enroll_edit')
    .eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return { error: '캠퍼스 없음', status: 400 }

  const perms = resolvePermissions({
    role: profile.role,
    position: profile.position,
    perm_class_roster: profile.perm_class_roster,
    perm_vehicles: profile.perm_vehicles,
    perm_vehicles_restricted: profile.perm_vehicles_restricted,
    perm_analytics: profile.perm_analytics,
    perm_enroll_edit: profile.perm_enroll_edit,
  })

  return { user, profile, service, campusId, perms }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthProfile()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { service, campusId, perms, profile } = auth

  const { searchParams } = new URL(request.url)
  const monthPrefix = searchParams.get('month') // "YYYY-MM" 형식

  let query = service.from('enrollment_history')
    .select('id, student_name, type, class_name, class_id, effective_date, note, created_at, changed_by_name')
    .eq('campus_id', campusId)
    .order('effective_date', { ascending: false })

  if (monthPrefix) {
    const [y, m] = monthPrefix.split('-')
    const startDate = `${y}-${m}-01`
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('effective_date', startDate).lte('effective_date', endDate)
  } else {
    query = query.limit(200)
  }

  const { data: logs } = await query

  return NextResponse.json({
    logs: logs ?? [],
    isAdmin: profile?.role === 'campus_admin',
    canEnrollEdit: perms.enrollEdit,
  })
}

// 수동 입소/퇴소 기록 추가
export async function POST(request: NextRequest) {
  const auth = await getAuthProfile()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, service, campusId, perms, profile } = auth

  if (!perms.enrollEdit) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { student_name, type, class_name, effective_date, note } = body
  if (!student_name?.trim()) return NextResponse.json({ error: '학생 이름 필수' }, { status: 400 })
  if (!type || !['enrolled', 'withdrawn'].includes(type)) return NextResponse.json({ error: 'type 필수 (enrolled/withdrawn)' }, { status: 400 })

  // student_id 조회 (이름 매칭)
  const { data: stu } = await service.from('campus_students').select('id').eq('campus_id', campusId).eq('name', student_name.trim()).limit(1).single()

  const { data, error } = await service.from('enrollment_history').insert({
    campus_id: campusId,
    student_id: stu?.id ?? null,
    student_name: student_name.trim(),
    type,
    class_name: class_name?.trim() || '',
    effective_date: effective_date || new Date().toISOString().slice(0, 10),
    note: note?.trim() || null,
    changed_by_id: user.id,
    changed_by_name: (profile as unknown as { name?: string })?.name ?? '',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, log: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role, position').eq('id', user.id).single()
  if (!profile || !(profile.role === 'campus_admin' || profile.role === 'hq_admin' || (profile.position ?? '').includes('부원장'))) {
    return NextResponse.json({ error: '원장만 삭제 가능합니다' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await service.from('enrollment_history').delete().eq('id', id).eq('campus_id', profile.campus_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
