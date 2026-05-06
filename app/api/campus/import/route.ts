import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 엑셀 컬럼 인덱스 (0-based) — 26년 연차관리대장_중계.xlsx 기준
const COL_NAME = 1          // B: 사원명
const COL_POSITION = 2      // C: 직책
const COL_COMPANY_DATE = 3  // D: 최초 입사일
const COL_CAMPUS_DATE = 4   // E: 캠퍼스 입사일
const COL_TOTAL = 6         // G: 최종 부여 (이월 포함 합계)
const COL_BASE = 7          // H: 기본 부여 ① (정규: 15일 / 신입: 1주년 이후 비례)
const COL_EXTRA = 8         // I: 추가 부여 ② (근속 가산: +1/2년)
const COL_SHINIP = 22       // W: 신입 월별 누적 (1주년 이전 월 1일 합계)
const COL_CARRIED = 23      // X: 이월 (전년도 이월)
const COL_MONTHLY_START = 32 // AG: 월별 사용일수 시작 (1월)
const COL_DATES_MARKER = 46  // AW: "날짜" 레이블 위치
const COL_DATES_START = 47   // AX: 실제 사용 날짜 시작

// 연차 종류 매핑 (엑셀 문자열 → DB type)
const LEAVE_TYPE_MAP: Record<string, string> = {
  '연차': 'annual',
  '반차': 'half_am',
  '오전반차': 'half_am',
  '오후반차': 'half_pm',
  '반반차': 'quarter',
  '병가': 'sick',
  '경조': 'event',
  '공가': 'other',
  '기타': 'other',
}

function parseExcelDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const cleaned = val.replace(/\./g, '-').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned
    return null
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    return date.toISOString().slice(0, 10)
  }
  return null
}

function parseExtraInt(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const n = parseInt(val.replace(/[^0-9-]/g, ''))
    return isNaN(n) ? 0 : n
  }
  return 0
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('role, campus_id').eq('id', user.id).single()
  if (me?.role !== 'campus_admin' && me?.role !== 'hq_admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  // HQ는 campus_id를 form으로 전달, 캠퍼스 원장은 본인 캠퍼스
  let campusId: string | null = null
  if (me.role === 'hq_admin') {
    campusId = formData.get('campus_id') as string | null
    if (!campusId) return NextResponse.json({ error: 'HQ는 캠퍼스를 선택해야 합니다.' }, { status: 400 })
  } else {
    campusId = me.campus_id
  }
  if (!campusId) return NextResponse.json({ error: '캠퍼스 정보 없음' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const { read, utils } = await import('xlsx')
  const workbook = read(buffer, { type: 'buffer', cellDates: false })

  // 연도: 첫 번째 시트명에서 추출 (예: "관리대장(26년)" → 2026)
  const sheetName = workbook.SheetNames[0]
  let year = new Date().getFullYear()
  const yearMatch = sheetName.match(/(\d{2,4})년/)
  if (yearMatch) {
    const y = parseInt(yearMatch[1])
    year = y < 100 ? 2000 + y : y
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  const results = { success: 0, skipped: 0, errors: [] as string[], year, debug: null as unknown }

  // 데이터는 row 7부터 시작 (0-indexed), 2행 1쌍 (날짜행 + 종류행)
  let i = 7
  while (i < rows.length) {
    const dateRow = rows[i] as unknown[]
    const typeRow = (rows[i + 1] ?? []) as unknown[]
    i += 2

    const name = dateRow[COL_NAME]
    if (!name || typeof name !== 'string' || !name.trim()) continue
    const nameStr = name.trim()

    const position = typeof dateRow[COL_POSITION] === 'string' ? (dateRow[COL_POSITION] as string).trim() : ''
    const companyDate = parseExcelDate(dateRow[COL_COMPANY_DATE])
    const campusDate = parseExcelDate(dateRow[COL_CAMPUS_DATE])

    const totalDays = typeof dateRow[COL_TOTAL] === 'number' ? dateRow[COL_TOTAL] as number : 0
    // 부여 ① + 신입 월별 누적 합산 (신입의 경우 두 컬럼을 합쳐야 실제 기본 부여)
    const baseDays = (typeof dateRow[COL_BASE] === 'number' ? dateRow[COL_BASE] as number : 0)
                   + (typeof dateRow[COL_SHINIP] === 'number' ? dateRow[COL_SHINIP] as number : 0)
    const extraDays = parseExtraInt(dateRow[COL_EXTRA])
    const carriedOver = typeof dateRow[COL_CARRIED] === 'number' ? dateRow[COL_CARRIED] as number : 0

    // 첫 번째 직원 파싱 결과를 디버그로 기록
    if (results.debug === null) {
      results.debug = {
        name: nameStr, position,
        raw_companyDate: dateRow[COL_COMPANY_DATE], companyDate,
        raw_campusDate: dateRow[COL_CAMPUS_DATE], campusDate,
        raw_base: dateRow[COL_BASE], baseDays,
        raw_extra: dateRow[COL_EXTRA], extraDays,
        raw_carried: dateRow[COL_CARRIED], carriedOver,
        totalDays,
        dateRowLength: dateRow.length,
        datesStartCol: COL_DATES_START,
      }
    }

    // 기존 직원 조회
    const { data: existing } = await service
      .from('users')
      .select('id')
      .eq('campus_id', campusId)
      .eq('name', nameStr)
      .single()

    let userId: string

    if (existing) {
      userId = existing.id
      // 직책/입사일 업데이트 (position 비어있으면 기존값 유지)
      const updateFields: Record<string, unknown> = {}
      if (position) updateFields.position = position
      if (companyDate) updateFields.company_hired_at = companyDate
      if (campusDate) updateFields.campus_hired_at = campusDate
      if (Object.keys(updateFields).length > 0) {
        const { error: updateErr } = await service.from('users').update(updateFields).eq('id', userId)
        if (updateErr) results.errors.push(`${nameStr}: 직원 정보 업데이트 실패 (${updateErr.message})`)
      }
    } else {
      // 신규 직원: Supabase auth 계정 생성 (첫 로그인 전까지 임시)
      const syntheticEmail = `${crypto.randomUUID()}@campus.internal`
      const { data: authData, error: authErr } = await service.auth.admin.createUser({
        email: syntheticEmail,
        password: crypto.randomUUID(),
        email_confirm: true,
      })
      if (authErr || !authData.user) {
        results.errors.push(`${nameStr}: 계정 생성 실패 (${authErr?.message ?? 'unknown'})`)
        results.skipped++
        continue
      }

      const assignedRole = position === '원장' ? 'campus_admin' : 'employee'
      const { error: userErr } = await service.from('users').insert({
        id: authData.user.id,
        campus_id: campusId,
        email: syntheticEmail,
        name: nameStr,
        position,
        role: assignedRole,
        is_active: true,
        ...(companyDate ? { company_hired_at: companyDate } : {}),
        ...(campusDate ? { campus_hired_at: campusDate } : {}),
      })

      if (userErr) {
        await service.auth.admin.deleteUser(authData.user.id)
        results.errors.push(`${nameStr}: DB 저장 실패 (${userErr.message})`)
        results.skipped++
        continue
      }

      userId = authData.user.id
    }

    // 연차 부여 — 기존 행 삭제 후 재삽입 (constraint 이름 불일치 방지)
    await service.from('leave_grants').delete().eq('user_id', userId).eq('year', year)
    const { error: grantErr } = await service.from('leave_grants').insert({
      campus_id: campusId,
      user_id: userId,
      year,
      total_days: baseDays,
      carried_over: carriedOver,
      extra_days: extraDays,
    })
    if (grantErr) results.errors.push(`${nameStr}: 연차 부여 저장 실패 (${grantErr.message})`)

    // 사용 날짜 import — 기존 엑셀 import 분 삭제 후 재삽입 (중복 방지)
    await service
      .from('leave_requests')
      .delete()
      .eq('user_id', userId)
      .eq('campus_id', campusId)
      .eq('status', 'approved')
      .eq('reason', 'Excel 가져오기')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)

    const leaveRows: object[] = []
    for (let col = COL_DATES_START; col < dateRow.length; col++) {
      const dateVal = parseExcelDate(dateRow[col])
      if (!dateVal) continue

      const typeRaw = typeRow[col]
      const leaveType = (typeof typeRaw === 'string' && LEAVE_TYPE_MAP[typeRaw.trim()])
        ? LEAVE_TYPE_MAP[typeRaw.trim()]
        : 'annual'

      const daysUsed = leaveType === 'quarter' ? 0.25 : leaveType === 'half_am' || leaveType === 'half_pm' ? 0.5 : 1

      leaveRows.push({
        campus_id: campusId,
        user_id: userId,
        type: leaveType,
        start_date: dateVal,
        end_date: dateVal,
        days_used: daysUsed,
        status: 'approved',
        reason: 'Excel 가져오기',
      })
    }

    if (leaveRows.length > 0) {
      const { error: leaveErr } = await service.from('leave_requests').insert(leaveRows)
      if (leaveErr) results.errors.push(`${nameStr}: 연차 사용 내역 저장 실패 (${leaveErr.message})`)
    }

    results.success++
  }

  return NextResponse.json({ ok: true, ...results })
}
