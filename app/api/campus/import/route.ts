import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 컬럼 인덱스 (0-based)
const COL_NAME = 1        // Col B: 성명
const COL_POSITION = 2    // Col C: 직책
const COL_COMPANY_DATE = 3  // Col D: 회사 입사일
const COL_CAMPUS_DATE = 4   // Col E: 캠퍼스 입사일
const COL_TOTAL = 6       // Col G: 연차 부여 합계
const COL_CARRIED = 23    // Col X: 이월
const COL_DATES_START = 48  // Col AW+: 실제 사용 날짜

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

function parseLeaveDate(val: unknown, year: number): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const trimmed = val.trim()
    const parts = trimmed.split('/')
    if (parts.length === 2) {
      const m = parts[0].padStart(2, '0')
      const d = parts[1].padStart(2, '0')
      return `${year}-${m}-${d}`
    }
    if (parts.length === 3) {
      const y = parts[0]
      const m = parts[1].padStart(2, '0')
      const d = parts[2].padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  }
  if (typeof val === 'number') {
    return parseExcelDate(val)
  }
  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.app_metadata?.user_role
  if (role !== 'campus_admin' && role !== 'hq_admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { data: me } = await supabase.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = me?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const { read, utils } = await import('xlsx')
  const workbook = read(buffer, { type: 'buffer', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  let year = new Date().getFullYear()
  const yearMatch = sheetName.match(/(\d{2,4})년/)
  if (yearMatch) {
    const y = parseInt(yearMatch[1])
    year = y < 100 ? 2000 + y : y
  }

  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  const service = await createServiceClient()
  const results = { success: 0, skipped: 0, errors: [] as string[] }

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const name = row[COL_NAME]
    if (!name || typeof name !== 'string' || !name.trim()) continue

    const nameStr = name.trim()
    const position = typeof row[COL_POSITION] === 'string' ? (row[COL_POSITION] as string).trim() : ''
    const companyDate = parseExcelDate(row[COL_COMPANY_DATE])
    const campusDate = parseExcelDate(row[COL_CAMPUS_DATE])
    const totalDays = typeof row[COL_TOTAL] === 'number' ? row[COL_TOTAL] : 0
    const carriedOver = typeof row[COL_CARRIED] === 'number' ? row[COL_CARRIED] : 0

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('campus_id', campusId)
      .eq('name', nameStr)
      .single()

    let userId: string

    if (existing) {
      userId = existing.id
    } else {
      const tempEmail = `${nameStr.replace(/\s/g, '')}.${campusId.slice(0, 6)}@temp.leave-system.com`
      const tempPassword = Math.random().toString(36).slice(2, 10)

      try {
        const { data: authData, error: authErr } = await service.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true,
        })
        if (authErr || !authData.user) {
          results.errors.push(`${nameStr}: 계정 생성 실패 (${authErr?.message ?? 'unknown'})`)
          results.skipped++
          continue
        }

        await service.from('users').insert({
          id: authData.user.id,
          campus_id: campusId,
          email: tempEmail,
          name: nameStr,
          position,
          role: 'employee',
          company_hired_at: companyDate,
          campus_hired_at: campusDate,
          needs_password_change: true,
        })

        userId = authData.user.id
      } catch {
        results.errors.push(`${nameStr}: 신규 직원 생성 중 오류`)
        results.skipped++
        continue
      }
    }

    await service.from('leave_grants').upsert({
      campus_id: campusId,
      user_id: userId,
      year,
      total_days: totalDays,
      carried_over: carriedOver,
      extra_days: 0,
    }, { onConflict: 'campus_id,user_id,year' })

    const usedDates: string[] = []
    for (let col = COL_DATES_START; col < row.length; col++) {
      const dateVal = parseLeaveDate(row[col], year)
      if (dateVal) usedDates.push(dateVal)
    }

    if (usedDates.length > 0) {
      const records = usedDates.map(date => ({
        campus_id: campusId,
        user_id: userId,
        year,
        date,
        type: 'annual' as const,
        source: 'excel_import' as const,
      }))

      await service.from('leave_records').upsert(records, { onConflict: 'campus_id,user_id,date' })
    }

    results.success++
  }

  return NextResponse.json({ ok: true, year, ...results })
}
