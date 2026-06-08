import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

// GET: 세션 목록 + 반 + 수강생 (월별)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id)
    .single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!permissions.classRoster) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // e.g. "2026년 4월"

  // 사용 가능한 월 목록
  const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
  const availableMonths = [...new Set((allMonthRows ?? []).map(s => s.month))].sort((a, b) => {
    const parse = (m: string) => { const parts = m.match(/\d+/g); if (!parts || parts.length < 2) return 0; return Number(parts[0]) * 100 + Number(parts[1]) }
    return parse(b) - parse(a)
  })

  // 세션 목록 — month 없으면 가장 최근 월 자동 선택
  const targetMonth = month || availableMonths[0] || ''
  let sessQuery = service.from('class_sessions').select('*').eq('campus_id', campusId).order('sort_order').order('created_at')
  if (targetMonth) sessQuery = sessQuery.eq('month', targetMonth)

  const { data: sessions, error: sessErr } = await sessQuery
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  if (!sessions?.length) return NextResponse.json({ sessions: [], classes: [], enrollments: [], availableMonths, currentMonth: targetMonth })

  const sessionIds = sessions.map(s => s.id)

  // 반 목록
  const { data: classes, error: clsErr } = await service
    .from('classes').select('*').in('session_id', sessionIds).order('sort_order').order('id')
  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 })

  const classIds = (classes ?? []).map(c => c.id)

  // 수강생 (메모 컬럼 포함 시도 → 컬럼 미생성 시 메모 없이 폴백: 명단 로딩 자체는 절대 깨지지 않게)
  let enrollments: unknown[] = []
  if (classIds.length) {
    const withMemo = '*, campus_students(id, name, english_name, grade, school, apartment, is_active, memo, memo_updated_by, memo_updated_at)'
    const noMemo = '*, campus_students(id, name, english_name, grade, school, apartment, is_active)'
    let { data, error: enrErr } = await service
      .from('class_enrollments')
      .select(withMemo)
      .in('class_id', classIds)
      .order('sort_order')
    if (enrErr) {
      // memo 컬럼 미생성(또는 기타 select 오류) → 메모 없이 재조회
      const fb = await service
        .from('class_enrollments')
        .select(noMemo)
        .in('class_id', classIds)
        .order('sort_order')
      if (fb.error) return NextResponse.json({ error: fb.error.message }, { status: 500 })
      data = fb.data
    }
    enrollments = data ?? []
  }

  // 버스 목록
  const { data: buses } = await service.from('campus_buses').select('*').eq('campus_id', campusId).order('sort_order')

  return NextResponse.json({ sessions: sessions ?? [], classes: classes ?? [], enrollments, buses: buses ?? [], availableMonths, currentMonth: targetMonth })
}

// POST: 세션/반/수강생 추가
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, role, position, name, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id).single()
  const changedByName: string = (profile as unknown as { name?: string } | null)?.name ?? ''
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!permissions.classRoster)
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  if (action === 'add_session') {
    const { name, time_range, month } = body
    const { data, error } = await service.from('class_sessions').insert({
      campus_id: campusId, name, time_range, month,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data })
  }

  if (action === 'delete_session') {
    const { session_id } = body
    if (!session_id) return NextResponse.json({ error: 'session_id 필요' }, { status: 400 })
    // 소속 반 + 수강 전부 삭제 후 세션 삭제 (campus_id로 소유권 확인)
    const { data: sess } = await service.from('class_sessions')
      .select('id').eq('id', session_id).eq('campus_id', campusId).maybeSingle()
    if (!sess) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
    const { data: clsRows } = await service.from('classes').select('id').eq('session_id', session_id)
    const clsIds = (clsRows ?? []).map(c => c.id)
    if (clsIds.length) {
      await service.from('class_enrollments').delete().in('class_id', clsIds)
      // enrollment_history는 보존하되 class_id 참조만 해제 (FK 제약 회피, class_name 텍스트는 유지)
      await service.from('enrollment_history').update({ class_id: null }).in('class_id', clsIds)
    }
    await service.from('classes').delete().eq('session_id', session_id)
    const { error } = await service.from('class_sessions').delete().eq('id', session_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'add_class') {
    const { session_id, level, room, teacher, kt_teacher, color, hours_per_week } = body
    // 대상 세션이 자기 캠퍼스 소속인지 검증 (cross-campus 무결성 오염 방지)
    const { data: sessOwn } = await service.from('class_sessions')
      .select('id').eq('id', session_id).eq('campus_id', campusId).maybeSingle()
    if (!sessOwn) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 403 })
    const { data, error } = await service.from('classes').insert({
      campus_id: campusId, session_id, level, room, teacher,
      kt_teacher: kt_teacher || null,
      color: color ?? '#3b82f6',
      hours_per_week: hours_per_week ? Number(hours_per_week) : null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ class: data })
  }

  if (action === 'update_class') {
    const { class_id, level, room, teacher, kt_teacher, color, hours_per_week } = body
    const updatePayload: Record<string, unknown> = { level, room, teacher, color }
    if (kt_teacher !== undefined) updatePayload.kt_teacher = kt_teacher || null
    if (hours_per_week !== undefined) updatePayload.hours_per_week = hours_per_week ? Number(hours_per_week) : null
    const { error } = await service.from('classes').update(updatePayload)
      .eq('id', class_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reorder_classes') {
    const { orders } = body // [{id, sort_order}]
    await Promise.all((orders as { id: string; sort_order: number }[]).map(({ id, sort_order }) =>
      service.from('classes').update({ sort_order }).eq('id', id).eq('campus_id', campusId)
    ))
    return NextResponse.json({ ok: true })
  }

  if (action === 'reorder_sessions') {
    const { orders } = body // [{id, sort_order}]
    await Promise.all((orders as { id: string; sort_order: number }[]).map(({ id, sort_order }) =>
      service.from('class_sessions').update({ sort_order }).eq('id', id).eq('campus_id', campusId)
    ))
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_class') {
    const { class_id } = body
    // enrollment_history 참조 해제(보존) + 수강 삭제 후 반 삭제 (FK 제약 회피)
    await service.from('enrollment_history').update({ class_id: null }).eq('class_id', class_id)
    await service.from('class_enrollments').delete().eq('class_id', class_id)
    const { error } = await service.from('classes').delete().eq('id', class_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'enroll') {
    const { class_id, student_id, arr_schedule, dep_schedule, is_waitlist } = body
    // 대상 반이 자기 캠퍼스 소속인지 검증 (cross-campus 무결성 오염 방지)
    const { data: clsOwn } = await service.from('classes')
      .select('id').eq('id', class_id).eq('campus_id', campusId).maybeSingle()
    if (!clsOwn) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 403 })
    // 퇴소 학생 등록 방지
    const { data: stuCheck } = await service.from('campus_students')
      .select('is_active').eq('id', student_id).eq('campus_id', campusId).maybeSingle()
    if (stuCheck?.is_active === false)
      return NextResponse.json({ error: '퇴소한 학생은 수강 등록할 수 없습니다' }, { status: 400 })
    const { data, error } = await service.from('class_enrollments').upsert({
      class_id, student_id, campus_id: campusId,
      arr_schedule: arr_schedule ?? {},
      dep_schedule: dep_schedule ?? {},
      is_waitlist: is_waitlist ?? false,
    }, { onConflict: 'class_id,student_id' }).select('*, campus_students(id, name, english_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 변경기록
    let historyError: string | null = null
    if (!is_waitlist) {
      try {
        const { data: stu } = await service.from('campus_students').select('name').eq('id', student_id).single()
        const { data: cls } = await service.from('classes').select('level, class_sessions(name)').eq('id', class_id).single()
        const className = `${(cls as unknown as { level: string; class_sessions: { name: string } | null } | null)?.class_sessions?.name ?? ''} ${cls?.level ?? ''}`.trim()
        const { error: hErr } = await service.from('enrollment_history').insert({
          campus_id: campusId, student_id, student_name: stu?.name ?? '',
          type: 'enrolled', class_id,
          class_name: className,
          effective_date: new Date().toISOString().slice(0, 10),
          note: null,
          changed_by_id: user.id, changed_by_name: changedByName,
        })
        if (hErr) historyError = hErr.message
      } catch (e: unknown) {
        historyError = e instanceof Error ? e.message : String(e)
      }
    }
    return NextResponse.json({ enrollment: data, ...(historyError ? { _historyError: historyError } : {}) })
  }

  if (action === 'unenroll') {
    const { enrollment_id, effective_date, note } = body
    // 삭제 전 정보 저장 (복구용 + 로그용)
    const { data: enr } = await service.from('class_enrollments')
      .select('student_id, class_id, arr_schedule, dep_schedule, campus_students(name), classes(level, class_sessions(name))')
      .eq('id', enrollment_id).eq('campus_id', campusId).single()
    if (enr) {
      const stuRel = enr.campus_students as unknown as { name: string } | null
      const clsRel = enr.classes as unknown as { level: string; class_sessions: { name: string } | null } | null
      const studentName = stuRel?.name ?? ''
      const classLevel = clsRel?.level ?? ''
      const sessName = clsRel?.class_sessions?.name ?? ''
      await service.from('enrollment_history').insert({
        campus_id: campusId, student_id: enr.student_id, student_name: studentName,
        type: 'withdrawn', class_id: enr.class_id,
        class_name: `${sessName} ${classLevel}`.trim(),
        effective_date: effective_date || new Date().toISOString().slice(0, 10),
        note: note || null,
        changed_by_id: user.id, changed_by_name: changedByName,
      })
    }
    const { error } = await service.from('class_enrollments').delete().eq('id', enrollment_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 복구용 데이터 반환
    return NextResponse.json({ ok: true, deleted: enr ? { student_id: enr.student_id, class_id: enr.class_id, arr_schedule: enr.arr_schedule, dep_schedule: enr.dep_schedule } : null })
  }

  if (action === 'withdraw_student') {
    const { student_id, effective_date, note } = body
    const { data: stu } = await service.from('campus_students').select('name').eq('id', student_id).single()
    const studentName = (stu as { name: string } | null)?.name ?? ''
    const effDate = effective_date || new Date().toISOString().slice(0, 10)

    // 퇴소 기준 월 계산 (이 월 포함 이후 수강만 삭제, 과거 월 수강은 보존)
    const effYear = parseInt(effDate.slice(0, 4))
    const effMon = parseInt(effDate.slice(5, 7))
    const effMonNum = effYear * 100 + effMon

    // 모든 수강 반 조회 — 세션 월 정보 포함
    const { data: enrs } = await service.from('class_enrollments')
      .select('id, class_id, arr_schedule, dep_schedule, classes(level, class_sessions(name, month))')
      .eq('student_id', student_id).eq('campus_id', campusId)

    const toDeleteIds: string[] = []
    if (enrs && enrs.length > 0) {
      for (const enr of enrs) {
        const clsRel = enr.classes as unknown as { level: string; class_sessions: { name: string; month: string } | null } | null
        const sessMonth = clsRel?.class_sessions?.month ?? ''
        const mMatch = sessMonth.match(/(\d+)년 (\d+)월/)
        const sessMonNum = mMatch ? parseInt(mMatch[1]) * 100 + parseInt(mMatch[2]) : 999999
        if (sessMonNum >= effMonNum) {
          // 퇴소 월 이상 → 삭제 + 기록
          toDeleteIds.push(enr.id)
          await service.from('enrollment_history').insert({
            campus_id: campusId, student_id, student_name: studentName,
            type: 'withdrawn', class_id: enr.class_id,
            class_name: `${clsRel?.class_sessions?.name ?? ''} ${clsRel?.level ?? ''}`.trim(),
            effective_date: effDate, note: note || null,
            changed_by_id: user.id, changed_by_name: changedByName,
          })
        }
        // 과거 월 수강 기록은 보존 (삭제하지 않음)
      }
      if (toDeleteIds.length > 0) {
        await service.from('class_enrollments').delete().in('id', toDeleteIds)
      }
    } else {
      // 반 없이 직접 퇴소 기록
      await service.from('enrollment_history').insert({
        campus_id: campusId, student_id, student_name: studentName,
        type: 'withdrawn', class_name: '', effective_date: effDate, note: note || null,
        changed_by_id: user.id, changed_by_name: changedByName,
      })
    }
    await service.from('campus_students').update({ is_active: false }).eq('id', student_id).eq('campus_id', campusId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'restore_enrollment') {
    const { student_id, class_id, arr_schedule, dep_schedule } = body
    // 대상 반이 자기 캠퍼스 소속인지 확인 (enroll 액션과 동일한 소유권 검증)
    const { data: clsOwn } = await service.from('classes').select('id').eq('id', class_id).eq('campus_id', campusId).maybeSingle()
    if (!clsOwn) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    const { data, error } = await service.from('class_enrollments').insert({
      campus_id: campusId, student_id, class_id,
      arr_schedule: arr_schedule ?? {}, dep_schedule: dep_schedule ?? {}, is_waitlist: false,
    }).select('*, campus_students(id, name, english_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 복구 기록
    const { data: stu } = await service.from('campus_students').select('name').eq('id', student_id).single()
    const { data: cls } = await service.from('classes').select('level, class_sessions(name)').eq('id', class_id).single()
    await service.from('enrollment_history').insert({
      campus_id: campusId, student_id, student_name: stu?.name ?? '',
      type: 'enrolled', class_id,
      class_name: `${(cls as unknown as { level: string; class_sessions: { name: string } | null } | null)?.class_sessions?.name ?? ''} ${cls?.level ?? ''}`.trim(),
      effective_date: new Date().toISOString().slice(0, 10),
      note: '복구',
      changed_by_id: user.id, changed_by_name: changedByName,
    })
    return NextResponse.json({ enrollment: data })
  }

  if (action === 'move_student') {
    const { enrollment_id, to_class_id } = body
    const { data: enr } = await service.from('class_enrollments').select('*').eq('id', enrollment_id).eq('campus_id', campusId).single()
    if (!enr) return NextResponse.json({ error: '수강생 없음' }, { status: 404 })

    // 대상 반이 자기 캠퍼스 소속인지 확인 (cross-campus 이동 차단)
    const { data: toClassOwn } = await service.from('classes').select('id').eq('id', to_class_id).eq('campus_id', campusId).maybeSingle()
    if (!toClassOwn) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    // 새 반에 이미 있으면 안됨
    const { data: exist } = await service.from('class_enrollments')
      .select('id').eq('class_id', to_class_id).eq('student_id', enr.student_id).maybeSingle()
    if (exist) return NextResponse.json({ error: '이미 해당 반에 있습니다' }, { status: 409 })

    const { data: fromClass } = await service.from('classes').select('level, session_id, class_sessions(name)').eq('id', enr.class_id).single()
    const { data: toClass } = await service.from('classes').select('level, session_id, class_sessions(name)').eq('id', to_class_id).single()
    const { data: student } = await service.from('campus_students').select('name').eq('id', enr.student_id).single()

    // 이동 (arr_schedule/dep_schedule/highlight_color override 가능)
    const { arr_schedule: newArr, dep_schedule: newDep, highlight_color: newHighlight } = body
    await service.from('class_enrollments').delete().eq('id', enrollment_id).eq('campus_id', campusId)
    const { data: newEnr, error } = await service.from('class_enrollments').insert({
      class_id: to_class_id, student_id: enr.student_id, campus_id: campusId,
      arr_schedule: newArr ?? enr.arr_schedule,
      dep_schedule: newDep ?? enr.dep_schedule,
      highlight_color: newHighlight !== undefined ? (newHighlight || null) : enr.highlight_color,
    }).select('*, campus_students(id, name, english_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 변경 기록 (enrollment_history)
    const fromName = `${(fromClass as { class_sessions?: { name: string } } | null)?.class_sessions?.name ?? ''} ${(fromClass as { level: string } | null)?.level ?? ''}`.trim()
    const toName = `${(toClass as { class_sessions?: { name: string } } | null)?.class_sessions?.name ?? ''} ${(toClass as { level: string } | null)?.level ?? ''}`.trim()
    await service.from('enrollment_history').insert({
      campus_id: campusId,
      student_id: enr.student_id,
      student_name: student?.name ?? '',
      type: 'transferred',
      class_id: to_class_id,
      class_name: `${fromName} → ${toName}`,
      effective_date: new Date().toISOString().slice(0, 10),
      note: null,
      changed_by_id: user.id, changed_by_name: changedByName,
    })

    return NextResponse.json({ enrollment: newEnr })
  }

  if (action === 'update_bus_schedule') {
    const { enrollment_id, arr_schedule, dep_schedule, highlight_color } = body
    const updateData: Record<string, unknown> = { arr_schedule, dep_schedule }
    if (highlight_color !== undefined) updateData.highlight_color = highlight_color || null
    const { error } = await service.from('class_enrollments')
      .update(updateData)
      .eq('id', enrollment_id)
      .eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'copy_month') {
    const { from_month, to_month } = body
    if (!from_month || !to_month) return NextResponse.json({ error: 'from_month, to_month 필요' }, { status: 400 })

    // 원본 세션 조회
    const { data: fromSessions } = await service.from('class_sessions')
      .select('*').eq('campus_id', campusId).eq('month', from_month)
    if (!fromSessions?.length) return NextResponse.json({ error: '원본 세션 없음' }, { status: 404 })

    const sessionIdMap: Record<string, string> = {}
    const classIdMap: Record<string, string> = {}

    for (const sess of fromSessions) {
      const { data: newSess, error: sErr } = await service.from('class_sessions').insert({
        campus_id: campusId, name: sess.name, time_range: sess.time_range,
        month: to_month, sort_order: sess.sort_order,
      }).select('id').single()
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
      sessionIdMap[sess.id] = newSess.id

      const { data: fromClasses } = await service.from('classes').select('*').eq('session_id', sess.id)
      for (const cls of fromClasses ?? []) {
        const { data: newCls, error: cErr } = await service.from('classes').insert({
          campus_id: campusId, session_id: newSess.id,
          level: cls.level, room: cls.room, teacher: cls.teacher,
          kt_teacher: cls.kt_teacher ?? null,
          color: cls.color, sort_order: cls.sort_order,
        }).select('id').single()
        if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
        classIdMap[cls.id] = newCls.id
      }
    }

    // 수강생 복사 (활성 학생만)
    const fromClassIds = Object.keys(classIdMap)
    if (fromClassIds.length) {
      const { data: activeRows } = await service.from('campus_students')
        .select('id').eq('campus_id', campusId).eq('is_active', true)
      const activeSet = new Set((activeRows ?? []).map(s => s.id))
      const { data: enrs } = await service.from('class_enrollments')
        .select('*').in('class_id', fromClassIds).eq('is_waitlist', false)
      for (const enr of enrs ?? []) {
        const toClassId = classIdMap[enr.class_id]
        if (!toClassId || !activeSet.has(enr.student_id)) continue
        await service.from('class_enrollments').upsert({
          class_id: toClassId, student_id: enr.student_id, campus_id: campusId,
          arr_schedule: enr.arr_schedule, dep_schedule: enr.dep_schedule,
          is_waitlist: false,
        }, { onConflict: 'class_id,student_id' })
      }
    }

    return NextResponse.json({ ok: true, to_month })
  }

  if (action === 'delete_month') {
    const { month } = body
    if (!month) return NextResponse.json({ error: 'month 필요' }, { status: 400 })
    const { data: sessions } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId).eq('month', month)
    const sessIds = (sessions ?? []).map(s => s.id)
    if (sessIds.length) {
      const { data: clsRows } = await service.from('classes').select('id').in('session_id', sessIds)
      const clsIds = (clsRows ?? []).map(c => c.id)
      if (clsIds.length) {
        await service.from('class_enrollments').delete().in('class_id', clsIds)
        await service.from('enrollment_history').update({ class_id: null }).in('class_id', clsIds)
      }
      await service.from('classes').delete().in('session_id', sessIds)
      await service.from('class_sessions').delete().in('id', sessIds)
    }
    return NextResponse.json({ ok: true })
  }

  // 동명이인 분리: 새 campus_students 생성 후 현재 enrollment만 교체
  if (action === 'split_enrollment') {
    const { enrollment_id, name, english_name } = body
    const { data: enr } = await service.from('class_enrollments').select('*').eq('id', enrollment_id).eq('campus_id', campusId).single()
    if (!enr) return NextResponse.json({ error: '수강생 없음' }, { status: 404 })
    // 새 학생 레코드 생성
    const { data: newStu, error: stuErr } = await service.from('campus_students').insert({
      campus_id: campusId,
      name: name.trim(),
      english_name: english_name?.trim() || null,
      enrolled_at: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 })
    // 현재 enrollment의 student_id만 교체
    const { error: updErr } = await service.from('class_enrollments')
      .update({ student_id: newStu.id })
      .eq('id', enrollment_id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, student: newStu })
  }

  // 다중등록 학생 일괄 분리: 한 student_id가 지정월에 N개 반에 등록된 경우
  // 정렬상 첫 enrollment는 원본 row 유지(grade/school만 반 종류에 맞게 갱신),
  // 나머지 enrollment는 새 row 생성 + student_id 재할당
  // 반 level 규칙: 'ECP*' → grade=유치부, school=null  /  그 외 → grade=초등부, school=원본 복사
  // 이름·영문이름·아파트는 원본과 동일하게 복사
  if (action === 'bulk_split_homonyms') {
    const { student_ids, month } = body as { student_ids: string[]; month?: string }
    if (!Array.isArray(student_ids) || !student_ids.length) {
      return NextResponse.json({ error: 'student_ids 필요' }, { status: 400 })
    }
    if (!month) return NextResponse.json({ error: 'month 필요' }, { status: 400 })

    // 해당 월의 class 정보 (level 포함)
    const { data: monthSessions } = await service.from('class_sessions')
      .select('id, sort_order').eq('campus_id', campusId).eq('month', month)
    const monthSessIds = (monthSessions ?? []).map(s => s.id)
    if (!monthSessIds.length) return NextResponse.json({ error: '해당 월 세션 없음' }, { status: 404 })
    const { data: monthClasses } = await service.from('classes')
      .select('id, level, sort_order, session_id').in('session_id', monthSessIds)
    const monthClassIds = (monthClasses ?? []).map(c => c.id)
    const classMap: Record<string, { level: string; sort_order: number; session_id: string }> = {}
    for (const c of monthClasses ?? []) classMap[c.id] = { level: c.level ?? '', sort_order: c.sort_order ?? 0, session_id: c.session_id }
    const sessSortMap: Record<string, number> = {}
    for (const s of monthSessions ?? []) sessSortMap[s.id] = s.sort_order ?? 0

    // 반 level로 grade/school 결정
    const fieldsForLevel = (level: string, originalSchool: string | null): { grade: string; school: string | null } => {
      const isEcp = /^ecp/i.test(level)
      return isEcp ? { grade: '유치부', school: null } : { grade: '초등부', school: originalSchool }
    }

    // 학생 원본 정보 조회
    const { data: stuRows } = await service.from('campus_students')
      .select('id, name, english_name, school, apartment').in('id', student_ids).eq('campus_id', campusId)
    const stuMap: Record<string, { name: string; english_name: string | null; school: string | null; apartment: string | null }> = {}
    for (const s of stuRows ?? []) stuMap[s.id] = {
      name: s.name, english_name: s.english_name ?? null,
      school: s.school ?? null, apartment: s.apartment ?? null,
    }

    let newStudents = 0
    let reassigned = 0
    let originalsUpdated = 0
    const errors: string[] = []
    const splitDetails: Array<{ student_id: string; new_student_ids: string[] }> = []

    for (const sid of student_ids) {
      const stu = stuMap[sid]
      if (!stu) { errors.push(`student_id=${sid}: 학생 없음`); continue }

      // 해당 월 enrollments
      const { data: enrs } = await service.from('class_enrollments')
        .select('id, class_id, sort_order')
        .eq('student_id', sid).in('class_id', monthClassIds).eq('is_waitlist', false)
      if (!enrs || enrs.length < 2) continue

      // 정렬: session.sort_order → class.sort_order → enrollment.sort_order
      const sorted = enrs.slice().sort((a, b) => {
        const ca = classMap[a.class_id], cb = classMap[b.class_id]
        const sa = sessSortMap[ca?.session_id] ?? 0
        const sb = sessSortMap[cb?.session_id] ?? 0
        return sa - sb
          || ((ca?.sort_order ?? 0) - (cb?.sort_order ?? 0))
          || ((a.sort_order ?? 0) - (b.sort_order ?? 0))
      })
      const keepEnr = sorted[0]
      const moveEnrs = sorted.slice(1)

      // 1. 원본 row의 grade/school을 첫 반 기준으로 갱신
      const keepLevel = classMap[keepEnr.class_id]?.level ?? ''
      const keepFields = fieldsForLevel(keepLevel, stu.school)
      const { error: updOrigErr } = await service.from('campus_students')
        .update({ grade: keepFields.grade, school: keepFields.school }).eq('id', sid)
      if (updOrigErr) {
        errors.push(`${stu.name} 원본 갱신 실패: ${updOrigErr.message}`)
      } else {
        originalsUpdated++
      }

      // 2. 나머지 enrollment 마다 새 학생 row 생성 + student_id 교체
      const newIds: string[] = []
      for (const me of moveEnrs) {
        const meLevel = classMap[me.class_id]?.level ?? ''
        const fields = fieldsForLevel(meLevel, stu.school)
        const { data: newStu, error: insErr } = await service.from('campus_students').insert({
          campus_id: campusId,
          name: stu.name,
          english_name: stu.english_name,
          grade: fields.grade,
          school: fields.school,
          apartment: stu.apartment,
          is_active: true,
          enrolled_at: new Date().toISOString().slice(0, 10),
          notes: `동명이인 일괄분리: 원본 ${sid} (${month})`,
        }).select('id').single()
        if (insErr || !newStu) { errors.push(`${stu.name} 학생 생성 실패: ${insErr?.message}`); continue }
        const { error: updErr } = await service.from('class_enrollments')
          .update({ student_id: newStu.id }).eq('id', me.id)
        if (updErr) { errors.push(`${stu.name} enrollment 업데이트 실패: ${updErr.message}`); continue }
        newStudents++
        reassigned++
        newIds.push(newStu.id)
      }
      if (newIds.length) splitDetails.push({ student_id: sid, new_student_ids: newIds })
    }

    return NextResponse.json({ ok: true, newStudents, reassigned, originalsUpdated, errors, splitDetails })
  }

  if (action === 'copy_student_bus_from_month') {
    // 특정 학생의 from_month arr/dep_schedule을 to_month 동일 레벨 반에 복사 (활성 학생 기준)
    const { student_name, from_month, to_month } = body
    if (!student_name || !from_month || !to_month)
      return NextResponse.json({ error: '파라미터 필요' }, { status: 400 })

    // from_month 반 ID 목록
    const { data: fromSess } = await service.from('class_sessions').select('id').eq('campus_id', campusId).eq('month', from_month)
    const fromSessIds = (fromSess ?? []).map(s => s.id)
    if (!fromSessIds.length) return NextResponse.json({ error: 'from_month 세션 없음' }, { status: 404 })
    const { data: fromCls } = await service.from('classes').select('id, level').in('session_id', fromSessIds)
    const fromClsIds = (fromCls ?? []).map(c => c.id)

    // 이름 일치하는 모든 campus_students
    const { data: matchStudents } = await service.from('campus_students')
      .select('id, is_active').eq('campus_id', campusId).eq('name', student_name)
    const allMatchIds = (matchStudents ?? []).map(s => s.id)
    if (!allMatchIds.length) return NextResponse.json({ error: '학생 없음' }, { status: 404 })

    // from_month 수강 enrollment (arr_schedule 포함)
    const { data: fromEnrs } = await service.from('class_enrollments')
      .select('class_id, student_id, arr_schedule, dep_schedule, classes(level)')
      .in('class_id', fromClsIds).in('student_id', allMatchIds).eq('is_waitlist', false)
    if (!fromEnrs?.length) return NextResponse.json({ error: 'from_month 수강 데이터 없음' }, { status: 404 })

    // to_month 반 ID 목록 (level → class_id)
    const { data: toSess } = await service.from('class_sessions').select('id').eq('campus_id', campusId).eq('month', to_month)
    const toSessIds = (toSess ?? []).map(s => s.id)
    if (!toSessIds.length) return NextResponse.json({ error: 'to_month 세션 없음' }, { status: 404 })
    const { data: toCls } = await service.from('classes').select('id, level').in('session_id', toSessIds)
    const toLevelMap: Record<string, string> = {}
    for (const c of toCls ?? []) toLevelMap[c.level] = c.id

    // is_active=true인 학생을 to_month에 등록 (arr/dep_schedule 복사)
    const activeId = (matchStudents ?? []).find(s => s.is_active)?.id
    if (!activeId) return NextResponse.json({ error: '활성 학생 없음' }, { status: 404 })

    const results: { level: string; class_id: string }[] = []
    for (const enr of fromEnrs) {
      const level = (enr.classes as unknown as { level: string } | null)?.level ?? ''
      const toClassId = toLevelMap[level]
      if (!toClassId) continue
      await service.from('class_enrollments').upsert({
        class_id: toClassId, student_id: activeId, campus_id: campusId,
        arr_schedule: enr.arr_schedule, dep_schedule: enr.dep_schedule, is_waitlist: false,
      }, { onConflict: 'class_id,student_id' })
      results.push({ level, class_id: toClassId })
    }
    return NextResponse.json({ ok: true, restored: results.length, results })
  }

  if (action === 'reactivate_student') {
    // 퇴소처리된 학생을 다시 활성화 (is_active=true)
    const { student_name } = body
    if (!student_name) return NextResponse.json({ error: 'student_name 필요' }, { status: 400 })
    const { data: targets, error: findErr } = await service.from('campus_students')
      .select('id, name, is_active').eq('campus_id', campusId).eq('name', student_name.trim()).eq('is_active', false)
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (!targets?.length) return NextResponse.json({ error: '퇴소 처리된 해당 이름의 학생이 없습니다' }, { status: 404 })
    const ids = targets.map(s => s.id)
    const { error: updErr } = await service.from('campus_students').update({ is_active: true }).in('id', ids).eq('campus_id', campusId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, reactivated: ids.length, names: targets.map(s => s.name) })
  }

  if (action === 'purge_inactive') {
    const { month } = body
    if (!month) return NextResponse.json({ error: 'month 필요' }, { status: 400 })

    // 비활성 학생 ID 목록
    const { data: inactiveRows } = await service.from('campus_students')
      .select('id').eq('campus_id', campusId).eq('is_active', false)
    const inactiveIds = (inactiveRows ?? []).map(s => s.id)
    if (!inactiveIds.length) return NextResponse.json({ ok: true, deleted: 0 })

    // 해당 월 반 ID 목록
    const { data: monthSessions } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId).eq('month', month)
    const monthSessIds = (monthSessions ?? []).map(s => s.id)
    if (!monthSessIds.length) return NextResponse.json({ ok: true, deleted: 0 })

    const { data: monthClasses } = await service.from('classes')
      .select('id').in('session_id', monthSessIds)
    const monthClsIds = (monthClasses ?? []).map(c => c.id)
    if (!monthClsIds.length) return NextResponse.json({ ok: true, deleted: 0 })

    // 비활성 학생 수강 삭제
    const { data: deleted, error: delErr } = await service.from('class_enrollments')
      .delete().in('class_id', monthClsIds).in('student_id', inactiveIds).select('id')
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: (deleted ?? []).length })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
