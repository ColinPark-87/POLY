import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Column positions — exactly matching original 26년 연차관리대장_중계.xlsx
const C_NAME = 1        // B: 사원명
const C_POS = 2         // C: 직책
const C_COMPANY = 3     // D: 최초입사일
const C_CAMPUS = 4      // E: 캠퍼스입사일
const C_TOTAL = 6       // G: 총부여(이월포함)
const C_BASE = 7        // H: 기본부여①
const C_EXTRA = 8       // I: 추가부여②
const C_SHINIP = 22     // W: 신입누적
const C_CARRIED = 23    // X: 이월
const C_MONTH_1 = 32    // AG: 1월 사용 시작 (32~43 = 1월~12월)
const C_TOTAL_USED = 44 // AS: 총사용
const C_REMAIN = 45     // AT: 잔여
const C_DATE_MARK = 47  // AV: "날짜" 레이블 (original과 동일 col 47)
const C_DATE_START = 48 // AW: 실제 날짜 시작 (original과 동일 col 48)

const LEAVE_TYPE_KR: Record<string, string> = {
  annual:  '연차',
  half_am: '오전반차',
  half_pm: '오후반차',
  quarter: '반반차',
  sick:    '병가',
  event:   '경조',
  other:   '공가',
}

function toDateStr(val: string | null | undefined): string {
  if (!val) return ''
  return String(val).slice(0, 10)
}

function emptyRow(size: number): (string | number | null)[] {
  return Array(size).fill(null)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  if (!me || !['campus_admin', 'hq_admin'].includes(me.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const campusId = me.campus_id

  const { data: campus } = await service.from('campuses').select('name').eq('id', campusId ?? '').single()

  const { data: employees } = await service
    .from('users')
    .select('id, name, position, role, campus_hired_at, company_hired_at')
    .eq('campus_id', campusId ?? '')
    .eq('is_active', true)
    .order('name')

  const { data: grants } = await service
    .from('leave_grants')
    .select('user_id, total_days, carried_over, extra_days')
    .eq('campus_id', campusId ?? '')
    .eq('year', year)

  const { data: approved } = await service
    .from('leave_requests')
    .select('user_id, days_used, start_date, type')
    .eq('campus_id', campusId ?? '')
    .eq('status', 'approved')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
    .order('start_date')

  // Build maps
  const grantMap: Record<string, { base: number; carried: number; extra: number; total: number }> = {}
  for (const g of grants ?? []) {
    grantMap[g.user_id] = {
      base: g.total_days,
      carried: g.carried_over,
      extra: g.extra_days,
      total: g.total_days + g.carried_over + g.extra_days,
    }
  }

  const monthlyMap: Record<string, number[]> = {}
  const leavesByUser: Record<string, { start_date: string; type: string }[]> = {}
  for (const r of approved ?? []) {
    if (!monthlyMap[r.user_id]) monthlyMap[r.user_id] = Array(12).fill(0)
    if (!leavesByUser[r.user_id]) leavesByUser[r.user_id] = []
    const days = r.type === 'quarter' ? 0.25 : r.days_used
    const m = new Date(r.start_date).getMonth()
    monthlyMap[r.user_id][m] += days
    leavesByUser[r.user_id].push({ start_date: r.start_date, type: r.type })
  }

  const campusName = campus?.name ?? ''
  const aoa: (string | number | null)[][] = []

  // Row 0: title
  const titleRow = emptyRow(C_DATE_START + 1)
  titleRow[C_NAME] = campusName
  titleRow[C_POS] = `${year}년 연차 관리 대장`
  aoa.push(titleRow)

  // Rows 1-5: blank
  for (let i = 0; i < 5; i++) aoa.push(emptyRow(C_DATE_START + 1))

  // Row 6: column headers
  const headerRow = emptyRow(C_DATE_START + 1)
  headerRow[0] = 'No'
  headerRow[C_NAME] = '사원명'
  headerRow[C_POS] = '직책'
  headerRow[C_COMPANY] = '최초입사일'
  headerRow[C_CAMPUS] = '캠퍼스입사일'
  headerRow[C_TOTAL] = '총부여(이월포함)'
  headerRow[C_BASE] = '기본부여①'
  headerRow[C_EXTRA] = '추가부여②'
  headerRow[C_SHINIP] = '신입누적'
  headerRow[C_CARRIED] = '이월'
  for (let m = 0; m < 12; m++) headerRow[C_MONTH_1 + m] = `${m + 1}월`
  headerRow[C_TOTAL_USED] = '총사용'
  headerRow[C_REMAIN] = '잔여'
  headerRow[C_DATE_MARK] = '날짜'
  aoa.push(headerRow)

  // Data rows: 2 rows per employee (date row + type row)
  let no = 1
  for (const emp of employees ?? []) {
    const grant = grantMap[emp.id] ?? { base: 0, carried: 0, extra: 0, total: 0 }
    const monthly = monthlyMap[emp.id] ?? Array(12).fill(0)
    const totalUsed = monthly.reduce((s, v) => s + v, 0)
    const leaves = leavesByUser[emp.id] ?? []
    const maxCols = C_DATE_START + Math.max(leaves.length, 1)

    const dateRow = emptyRow(maxCols)
    const typeRow = emptyRow(maxCols)

    dateRow[0] = no++
    dateRow[C_NAME] = emp.name
    dateRow[C_POS] = emp.role === 'campus_admin' ? '원장' : (emp.position || '')
    dateRow[C_COMPANY] = toDateStr(emp.company_hired_at)
    dateRow[C_CAMPUS] = toDateStr(emp.campus_hired_at)
    dateRow[C_TOTAL] = grant.total
    dateRow[C_BASE] = grant.base
    dateRow[C_EXTRA] = grant.extra
    dateRow[C_SHINIP] = 0
    dateRow[C_CARRIED] = grant.carried
    for (let m = 0; m < 12; m++) {
      dateRow[C_MONTH_1 + m] = monthly[m] > 0 ? monthly[m] : null
    }
    dateRow[C_TOTAL_USED] = totalUsed > 0 ? totalUsed : 0
    dateRow[C_REMAIN] = grant.total - totalUsed
    dateRow[C_DATE_MARK] = '날짜'
    typeRow[C_DATE_MARK] = '종류'

    // Individual leave dates (col 48+): "YYYY-MM-DD" and type label
    leaves.forEach((lv, i) => {
      dateRow[C_DATE_START + i] = lv.start_date.slice(0, 10)
      typeRow[C_DATE_START + i] = LEAVE_TYPE_KR[lv.type] ?? '연차'
    })

    aoa.push(dateRow, typeRow)
  }

  const { utils, write } = await import('xlsx')
  const ws = utils.aoa_to_sheet(aoa)

  // Column widths
  const colWidths: { wch: number }[] = []
  for (let i = 0; i < C_DATE_START + 40; i++) {
    if (i === 0) colWidths.push({ wch: 4 })
    else if (i === C_NAME) colWidths.push({ wch: 16 })
    else if (i === C_POS) colWidths.push({ wch: 10 })
    else if (i === C_COMPANY || i === C_CAMPUS) colWidths.push({ wch: 12 })
    else if (i >= C_MONTH_1 && i <= C_MONTH_1 + 11) colWidths.push({ wch: 5 })
    else if (i >= C_DATE_START) colWidths.push({ wch: 12 })
    else colWidths.push({ wch: 8 })
  }
  ws['!cols'] = colWidths

  const wb = utils.book_new()
  const sheetLabel = `관리대장(${String(year).slice(2)}년)`
  utils.book_append_sheet(wb, ws, sheetLabel)

  const buf = write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = encodeURIComponent(`${campusName}_${year}년_연차관리대장.xlsx`)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
