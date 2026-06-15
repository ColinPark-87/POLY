import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

// 신규생 생성/수정 권한: campus_admin/hq_admin 또는 원장·관리자·상담 등 enrollEdit 보유 직책
const STUDENT_EDIT_COLS = 'campus_id, position, role, name, perm_class_roster, perm_enroll_edit, perm_vehicles, perm_vehicles_restricted, perm_analytics'
function canEditStudents(p: { role?: string; position?: string | null; perm_class_roster?: boolean | null; perm_enroll_edit?: boolean | null; perm_vehicles?: boolean | null; perm_vehicles_restricted?: boolean | null; perm_analytics?: boolean | null } | null): boolean {
  if (!p) return false
  return resolvePermissions({
    role: p.role ?? 'employee', position: p.position ?? null,
    perm_class_roster: p.perm_class_roster ?? null, perm_vehicles: p.perm_vehicles ?? null,
    perm_vehicles_restricted: p.perm_vehicles_restricted ?? null, perm_analytics: p.perm_analytics ?? null,
    perm_enroll_edit: p.perm_enroll_edit ?? null,
  }).enrollEdit
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(STUDENT_EDIT_COLS).eq('id', user.id).single()
  // HQ 관리자는 자기 캠퍼스가 없으므로 ?campus_id 로 대상 캠퍼스 지정 (place-spots와 동일 패턴).
  // 일반 캠퍼스 사용자는 항상 자기 campus_id로 스코프되며 ?campus_id 파라미터는 무시됨.
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = new URL(request.url).searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  // 학생 PII 접근 게이트: 개설반/차량/신규생 권한 보유자만 (일반 직원 차단).
  // 모든 정당한 호출부(개설반 현황 페이지·차량 지도)는 이 권한을 이미 보유.
  const perms = resolvePermissions({
    role: profile?.role ?? 'employee', position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null, perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null, perm_analytics: profile?.perm_analytics ?? null,
    perm_enroll_edit: profile?.perm_enroll_edit ?? null,
  })
  if (!perms.classRoster && !perms.enrollEdit && !perms.vehicles) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active') !== 'false'

  // 학교 목록 + 인원수 반환 (지도 스팟용)
  if (searchParams.get('schools') === '1') {
    const { data: rows } = await service
      .from('campus_students')
      .select('school')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .not('school', 'is', null)
    const countMap: Record<string, number> = {}
    for (const r of rows ?? []) {
      const s = (r as any).school as string
      if (s) countMap[s] = (countMap[s] ?? 0) + 1
    }
    const schools = Object.entries(countMap)
      .filter(([k]) => k && k !== '없음' && k !== '미입력')
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
    return NextResponse.json({ schools })
  }

  // 아파트 목록 + 인원수 반환 (지도 스팟용)
  if (searchParams.get('apartments') === '1') {
    const { data: rows } = await service
      .from('campus_students')
      .select('apartment')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .not('apartment', 'is', null)
    const countMap: Record<string, number> = {}
    for (const r of rows ?? []) {
      const a = (r as any).apartment as string
      if (a) countMap[a] = (countMap[a] ?? 0) + 1
    }
    const apartments = Object.entries(countMap)
      .filter(([k]) => k && k !== '없음' && k !== '미입력')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, count]) => ({ name, count }))
    return NextResponse.json({ apartments })
  }

  let query = service.from('campus_students').select('*').eq('campus_id', campusId).order('name')
  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ students: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(STUDENT_EDIT_COLS).eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (!canEditStudents(profile))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { name, english_name, grade, enrolled_at, notes, create_enrollment_log, allow_duplicate } = body
  if (!name?.trim()) return NextResponse.json({ error: '이름 필수' }, { status: 400 })
  const trimmedName = name.trim()

  // 동명 재원생 중복 방지 — 같은 이름의 활성 학생이 이미 있으면 409로 확인 요청
  // (UI에서 '기존 학생 사용' 또는 '동명이인으로 새로 등록' 선택. 후자는 allow_duplicate=true 재요청)
  if (!allow_duplicate) {
    const { data: dupes } = await service.from('campus_students')
      .select('id, name, english_name, grade')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .eq('name', trimmedName)
    if (dupes && dupes.length > 0) {
      return NextResponse.json(
        { error: '동명의 재원생이 이미 있습니다', code: 'DUPLICATE_NAME', existing: dupes },
        { status: 409 },
      )
    }
  }

  const effDate = enrolled_at || new Date().toISOString().slice(0, 10)
  const { data, error } = await service.from('campus_students').insert({
    campus_id: campusId, name: trimmedName, english_name: english_name?.trim() || null,
    grade: grade?.trim() || null, enrolled_at: effDate, notes: notes?.trim() || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 신규 학생 등록 시 입퇴소 기록 생성 (반 미배정 입소)
  if (create_enrollment_log) {
    try {
      await service.from('enrollment_history').insert({
        campus_id: campusId,
        student_id: data.id,
        student_name: name.trim(),
        type: 'enrolled',
        class_name: '',
        effective_date: effDate,
        note: '신규 등록',
        changed_by_id: user.id,
        changed_by_name: (profile as unknown as { name?: string } | null)?.name ?? '',
      })
    } catch {
      // 실패해도 학생 생성은 성공으로 처리
    }
  }

  return NextResponse.json({ student: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(STUDENT_EDIT_COLS).eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (!canEditStudents(profile))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { id, name, english_name, school, apartment, memo } = body
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
  // 메모만 수정하는 경우(이름 미전달)는 이름 필수 검사를 건너뜀
  const memoOnly = memo !== undefined && name === undefined
  if (!memoOnly && !name?.trim()) return NextResponse.json({ error: '이름 필수' }, { status: 400 })

  const updateData: Record<string, unknown> = {}
  if (!memoOnly) {
    updateData.name = name.trim()
    updateData.english_name = english_name?.trim() || null
    if (school !== undefined) updateData.school = school?.trim() || null
    if (apartment !== undefined) updateData.apartment = apartment?.trim() || null
  }
  if (memo !== undefined) {
    updateData.memo = (typeof memo === 'string' && memo.trim()) ? memo.trim() : null
    updateData.memo_updated_by = profile?.name ?? null
    updateData.memo_updated_at = new Date().toISOString()
  }

  const { data, error } = await service.from('campus_students')
    .update(updateData)
    .eq('id', id)
    .eq('campus_id', campusId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ student: data })
}
