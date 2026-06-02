import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'
import { buildEnrolledStudents, type EnrollmentRow } from '@/lib/campus-analytics'

export const dynamic = 'force-dynamic'

// 클래스 레벨 코드에서 학년 추론 (GT1→1학년, MGT3→3학년, ECP→유치부 등)
function gradeFromLevel(level: string): string | null {
  if (!level) return null
  const l = level.trim()
  if (/방과후|afterschool/i.test(l)) return null
  // 유치부 레벨 코드
  if (/ECP|kindy|kinder|유치/i.test(l)) return '유치부'
  // 끝자리 숫자 = 학년 (GT1→1학년, MGT2→2학년, S5→5학년 등)
  const m = l.match(/([1-6])\s*$/)
  if (m) {
    const n = parseInt(m[1])
    if (n >= 1 && n <= 6) return `${n}학년`
  }
  return null
}

async function getAuthAndProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증 필요', status: 401 }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics')
    .eq('id', user.id)
    .single()

  if (!profile?.campus_id) return { error: '캠퍼스 없음', status: 400 }

  const perms = resolvePermissions({
    role: profile.role,
    position: profile.position,
    perm_class_roster: profile.perm_class_roster,
    perm_vehicles: profile.perm_vehicles,
    perm_vehicles_restricted: profile.perm_vehicles_restricted,
    perm_analytics: profile.perm_analytics,
  })
  if (!perms.analytics) return { error: '권한 없음', status: 403 }

  return { user, profile, service, campusId: profile.campus_id as string }
}

export async function GET(_req: NextRequest) {
  const auth = await getAuthAndProfile()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { service, campusId } = auth

  // 개설반 현황과 동일한 경로: 가장 최근 월 세션 → classes → enrollments
  // (campus_id 직접 필터 대신 class_id 경로로 조회, 개설반 현황과 월 기준 일치)
  const { data: allMonthRows } = await service
    .from('class_sessions')
    .select('month')
    .eq('campus_id', campusId)

  const parseMonth = (m: string) => { const p = m.match(/\d+/g); return p ? Number(p[0]) * 100 + Number(p[1]) : 0 }
  const availableMonths = [...new Set((allMonthRows ?? []).map((s: any) => s.month as string))].sort((a, b) => parseMonth(b) - parseMonth(a))
  const targetMonth = availableMonths[0]
  if (!targetMonth) return NextResponse.json({ students: [] })

  const { data: sessions } = await service
    .from('class_sessions')
    .select('id, name')
    .eq('campus_id', campusId)
    .eq('month', targetMonth)

  const sessionIds = (sessions ?? []).map((s: any) => s.id)
  if (sessionIds.length === 0) return NextResponse.json({ students: [] })

  const { data: classes, error } = await service
    .from('classes')
    .select('id, level, session_id, class_sessions(name)')
    .in('session_id', sessionIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const classIds = (classes ?? []).map((c: any) => c.id)
  if (classIds.length === 0) return NextResponse.json({ students: [], grandSessTotal: 0 })

  const classMap: Record<string, { level: string; session: string; sessionId: string }> = {}
  for (const c of classes ?? []) {
    classMap[c.id] = { level: c.level ?? '', session: (c as any).class_sessions?.name ?? '', sessionId: c.session_id ?? '' }
  }

  // 개설반 현황과 동일한 JOIN 쿼리 — is_waitlist SQL 필터 사용 안 함 (NULL 포함 위해 JS 필터)
  const { data: enrollments, error: enrErr } = await service
    .from('class_enrollments')
    .select('student_id, class_id, is_waitlist, campus_students(id, name, english_name, grade, school, zip_code, address, detail_address, apartment)')
    .in('class_id', classIds)

  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 })

  // 개설반 현황과 동일: !e.is_waitlist (null, false 모두 포함)
  const activeEnrollments = (enrollments ?? []).filter((e: any) => !e.is_waitlist)

  // grandSessTotal: 개설반현황과 동일 — 방과후 제외 세션의 !is_waitlist 수강건수
  const nonBangwahuSessionIds = new Set(
    (sessions ?? [])
      .filter((s: any) => !/방과후|afterschool/i.test(s.name ?? ''))
      .map((s: any) => s.id)
  )
  const grandSessTotal = activeEnrollments.filter((e: any) => {
    const cls = classMap[e.class_id]
    return cls && nonBangwahuSessionIds.has(cls.sessionId)
  }).length

  // 고유 학생 목록 — 비대기 수강 등록된 학생만 (반 미배정·중복 레코드 제외)
  // 개설반 현황의 '6월 인원'·'전체 학생'과 동일 모집단으로 일치시킴
  const result = buildEnrolledStudents((enrollments ?? []) as unknown as EnrollmentRow[], classMap, gradeFromLevel)

  // 유치부/초등부 수강건수 (개설반현황과 동일 기준)
  const yuchibuSessionIds = new Set(
    (sessions ?? [])
      .filter((s: any) => /유치부/i.test(s.name ?? '') && !/방과후/i.test(s.name ?? ''))
      .map((s: any) => s.id)
  )
  const yuchibuCount = activeEnrollments.filter((e: any) => {
    const cls = classMap[e.class_id]
    return cls && yuchibuSessionIds.has(cls.sessionId)
  }).length
  const chodeungCount = grandSessTotal - yuchibuCount

  return NextResponse.json({
    students: result,
    grandSessTotal,
    yuchibuCount,
    chodeungCount,
  })
}

// 학생 정보 수정 (school, grade, apartment 등)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthAndProfile()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { service, campusId } = auth

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const ALLOWED = ['school', 'grade', 'zip_code', 'address', 'detail_address', 'apartment']
  const updates: Record<string, any> = {}
  for (const k of ALLOWED) {
    if (k in fields) updates[k] = fields[k] === '' ? null : fields[k]
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })

  const { error } = await service
    .from('campus_students')
    .update(updates)
    .eq('id', id)
    .eq('campus_id', campusId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
