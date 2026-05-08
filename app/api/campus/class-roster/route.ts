import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET: 세션 목록 + 반 + 수강생 (월별)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // e.g. "2026년 4월"

  // 사용 가능한 월 목록
  const { data: allMonthRows } = await service.from('class_sessions').select('month').eq('campus_id', campusId)
  const availableMonths = [...new Set((allMonthRows ?? []).map(s => s.month))].sort((a, b) => {
    const parse = (m: string) => { const parts = m.match(/\d+/g)!; return Number(parts[0]) * 100 + Number(parts[1]) }
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
    .from('classes').select('*').in('session_id', sessionIds).order('sort_order').order('created_at')
  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 })

  const classIds = (classes ?? []).map(c => c.id)

  // 수강생
  let enrollments: unknown[] = []
  if (classIds.length) {
    const { data, error: enrErr } = await service
      .from('class_enrollments')
      .select('*, campus_students(id, name, english_name, grade)')
      .in('class_id', classIds)
      .order('sort_order')
    if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 })
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
  const { data: profile } = await service.from('users').select('campus_id, position, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin' && !/상담/.test(profile?.position ?? ''))
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

  if (action === 'add_class') {
    const { session_id, level, room, teacher, kt_teacher, color } = body
    const { data, error } = await service.from('classes').insert({
      campus_id: campusId, session_id, level, room, teacher, color: color ?? '#3b82f6',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // kt_teacher RPC로 별도 저장
    if (kt_teacher && data?.id) {
      await service.rpc('update_class_kt_teacher', {
        p_id: data.id,
        p_campus_id: campusId,
        p_kt_teacher: kt_teacher,
      })
    }
    return NextResponse.json({ class: data })
  }

  if (action === 'update_class') {
    const { class_id, level, room, teacher, kt_teacher, color } = body
    const { data, error } = await service.from('classes').update({ level, room, teacher, color })
      .eq('id', class_id).eq('campus_id', campusId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // kt_teacher는 RPC로 별도 업데이트 (schema cache 우회)
    if (kt_teacher !== undefined) {
      await service.rpc('update_class_kt_teacher', {
        p_id: class_id,
        p_campus_id: campusId,
        p_kt_teacher: kt_teacher || null,
      })
    }
    return NextResponse.json({ class: data })
  }

  if (action === 'delete_class') {
    const { class_id } = body
    const { error } = await service.from('classes').delete().eq('id', class_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'enroll') {
    const { class_id, student_id, arr_schedule, dep_schedule, is_waitlist } = body
    const { data, error } = await service.from('class_enrollments').upsert({
      class_id, student_id, campus_id: campusId,
      arr_schedule: arr_schedule ?? {},
      dep_schedule: dep_schedule ?? {},
      is_waitlist: is_waitlist ?? false,
    }, { onConflict: 'class_id,student_id' }).select('*, campus_students(id, name, english_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ enrollment: data })
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
      })
    }
    const { error } = await service.from('class_enrollments').delete().eq('id', enrollment_id).eq('campus_id', campusId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 복구용 데이터 반환
    return NextResponse.json({ ok: true, deleted: enr ? { student_id: enr.student_id, class_id: enr.class_id, arr_schedule: enr.arr_schedule, dep_schedule: enr.dep_schedule } : null })
  }

  if (action === 'withdraw_student') {
    const { student_id, effective_date, note } = body
    // 모든 수강 반 조회
    const { data: enrs } = await service.from('class_enrollments')
      .select('id, class_id, arr_schedule, dep_schedule, classes(level, class_sessions(name))')
      .eq('student_id', student_id).eq('campus_id', campusId)
    const { data: stu } = await service.from('campus_students').select('name').eq('id', student_id).single()
    const studentName = (stu as { name: string } | null)?.name ?? ''
    const effDate = effective_date || new Date().toISOString().slice(0, 10)
    if (enrs && enrs.length > 0) {
      // 각 반에서 퇴소 기록 + 삭제
      for (const enr of enrs) {
        const clsRel = enr.classes as unknown as { level: string; class_sessions: { name: string } | null } | null
        await service.from('enrollment_history').insert({
          campus_id: campusId, student_id, student_name: studentName,
          type: 'withdrawn', class_id: enr.class_id,
          class_name: `${clsRel?.class_sessions?.name ?? ''} ${clsRel?.level ?? ''}`.trim(),
          effective_date: effDate, note: note || null,
        })
      }
      await service.from('class_enrollments').delete().eq('student_id', student_id).eq('campus_id', campusId)
    } else {
      // 반 없이 직접 퇴소 기록
      await service.from('enrollment_history').insert({
        campus_id: campusId, student_id, student_name: studentName,
        type: 'withdrawn', class_name: '', effective_date: effDate, note: note || null,
      })
    }
    await service.from('campus_students').update({ is_active: false }).eq('id', student_id).eq('campus_id', campusId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'restore_enrollment') {
    const { student_id, class_id, arr_schedule, dep_schedule } = body
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
    })
    return NextResponse.json({ enrollment: data })
  }

  if (action === 'move_student') {
    const { enrollment_id, to_class_id } = body
    const { data: enr } = await service.from('class_enrollments').select('*').eq('id', enrollment_id).single()
    if (!enr) return NextResponse.json({ error: '수강생 없음' }, { status: 404 })

    // 새 반에 이미 있으면 안됨
    const { data: exist } = await service.from('class_enrollments')
      .select('id').eq('class_id', to_class_id).eq('student_id', enr.student_id).maybeSingle()
    if (exist) return NextResponse.json({ error: '이미 해당 반에 있습니다' }, { status: 409 })

    const { data: fromClass } = await service.from('classes').select('level, session_id, class_sessions(name)').eq('id', enr.class_id).single()
    const { data: toClass } = await service.from('classes').select('level, session_id, class_sessions(name)').eq('id', to_class_id).single()
    const { data: student } = await service.from('campus_students').select('name').eq('id', enr.student_id).single()

    // 이동 (arr_schedule/dep_schedule/highlight_color override 가능)
    const { arr_schedule: newArr, dep_schedule: newDep, highlight_color: newHighlight } = body
    await service.from('class_enrollments').delete().eq('id', enrollment_id)
    const { data: newEnr, error } = await service.from('class_enrollments').insert({
      class_id: to_class_id, student_id: enr.student_id, campus_id: campusId,
      arr_schedule: newArr ?? enr.arr_schedule,
      dep_schedule: newDep ?? enr.dep_schedule,
      highlight_color: newHighlight !== undefined ? (newHighlight || null) : enr.highlight_color,
    }).select('*, campus_students(id, name, english_name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 변경 기록
    await service.from('class_change_log').insert({
      campus_id: campusId,
      student_id: enr.student_id,
      student_name: student?.name ?? '',
      from_class_id: enr.class_id,
      from_class_name: (fromClass as { level: string } | null)?.level ?? '',
      to_class_id,
      to_class_name: (toClass as { level: string } | null)?.level ?? '',
      from_session: (fromClass as { class_sessions?: { name: string } } | null)?.class_sessions?.name ?? '',
      to_session: (toClass as { class_sessions?: { name: string } } | null)?.class_sessions?.name ?? '',
    })

    return NextResponse.json({ enrollment: newEnr })
  }

  if (action === 'update_bus_schedule') {
    const { enrollment_id, arr_schedule, dep_schedule, highlight_color } = body
    const updateData: Record<string, unknown> = { arr_schedule, dep_schedule }
    if (highlight_color !== undefined) updateData.highlight_color = highlight_color || null
    const { data, error } = await service.from('class_enrollments')
      .update(updateData)
      .eq('id', enrollment_id).eq('campus_id', campusId)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ enrollment: data })
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

    // 수강생 복사
    const fromClassIds = Object.keys(classIdMap)
    if (fromClassIds.length) {
      const { data: enrs } = await service.from('class_enrollments')
        .select('*').in('class_id', fromClassIds).eq('is_waitlist', false)
      for (const enr of enrs ?? []) {
        const toClassId = classIdMap[enr.class_id]
        if (!toClassId) continue
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
      if (clsIds.length) await service.from('class_enrollments').delete().in('class_id', clsIds)
      await service.from('classes').delete().in('session_id', sessIds)
      await service.from('class_sessions').delete().in('id', sessIds)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
