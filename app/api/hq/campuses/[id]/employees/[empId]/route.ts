import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function checkHqAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'hq_admin') return null
  return service
}

// 직원 상세 조회 (연차 부여 + 사용 내역 포함)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; empId: string }> }
) {
  const { id: campusId, empId } = await params
  const service = await checkHqAdmin()
  if (!service) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const [{ data: emp }, { data: grant }, { data: leaves }] = await Promise.all([
    service.from('users').select('id, name, position, company_hired_at, campus_hired_at').eq('id', empId).single(),
    service.from('leave_grants').select('total_days, extra_days, carried_over').eq('user_id', empId).eq('year', year).single(),
    service.from('leave_requests').select('id, type, days_used, start_date, end_date, reason').eq('user_id', empId).eq('campus_id', campusId).eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).order('start_date'),
  ])

  return NextResponse.json({ emp, grant, leaves: leaves ?? [], year })
}

// 직원 정보 + 연차 부여 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; empId: string }> }
) {
  const { id: campusId, empId } = await params
  const service = await checkHqAdmin()
  if (!service) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()

  // 직원 정보 업데이트
  const userUpdate: Record<string, unknown> = {}
  if (body.name !== undefined) userUpdate.name = body.name
  if (body.position !== undefined) userUpdate.position = body.position
  if (body.is_active !== undefined) userUpdate.is_active = body.is_active
  if (body.company_hired_at !== undefined) userUpdate.company_hired_at = body.company_hired_at || null
  if (body.campus_hired_at !== undefined) userUpdate.campus_hired_at = body.campus_hired_at || null

  if (Object.keys(userUpdate).length > 0) {
    const { error } = await service.from('users').update(userUpdate).eq('id', empId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 연차 부여 업데이트
  if (body.grant !== undefined) {
    const { year, total_days, extra_days, carried_over } = body.grant
    const { error } = await service.from('leave_grants')
      .update({ total_days, extra_days, carried_over })
      .eq('user_id', empId)
      .eq('year', year)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 연차 항목 삭제
  if (Array.isArray(body.leaves_delete) && body.leaves_delete.length > 0) {
    const { error } = await service.from('leave_requests').delete().in('id', body.leaves_delete).eq('user_id', empId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 연차 항목 추가
  if (Array.isArray(body.leaves_add) && body.leaves_add.length > 0) {
    const TYPE_DAYS: Record<string, number> = { annual: 1, half_am: 0.5, half_pm: 0.5, quarter: 0.25, sick: 1, event: 1, other: 1 }
    const rows = body.leaves_add.map((l: { date: string; type: string }) => ({
      campus_id: campusId,
      user_id: empId,
      type: l.type,
      start_date: l.date,
      end_date: l.date,
      days_used: TYPE_DAYS[l.type] ?? 1,
      status: 'approved',
      reason: 'HQ 직접 입력',
    }))
    const { error } = await service.from('leave_requests').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

// 직원 삭제 (소프트 or 영구)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; empId: string }> }
) {
  const { empId } = await params
  const service = await checkHqAdmin()
  if (!service) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const permanent = new URL(request.url).searchParams.get('permanent') === 'true'

  if (!permanent) {
    // 소프트 삭제 (비활성화)
    const { error } = await service.from('users').update({ is_active: false }).eq('id', empId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // 영구 삭제: 관련 데이터 → users → auth 순으로 제거
  await service.from('leave_requests').delete().eq('user_id', empId)
  await service.from('leave_grants').delete().eq('user_id', empId)
  const { error: userErr } = await service.from('users').delete().eq('id', empId)
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 400 })
  await service.auth.admin.deleteUser(empId)

  return NextResponse.json({ ok: true })
}
