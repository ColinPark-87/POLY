import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function extractKoreanName(raw: string): string {
  // "최윤후 (Celine Choi)" → "최윤후"
  return raw.split('(')[0].trim()
}

function extractApartment(detail: string | null): string {
  if (!detail) return ''
  // "(월계동, 그랑빌아파트) 105동" → "그랑빌아파트"
  const m = detail.match(/\(([^,)]+),\s*([^)]+)\)/)
  if (m?.[2]) {
    return m[2].trim().replace(/\s*\d+[-\d]*동.*$/, '').replace(/\s+[A-Z]-.*$/, '').trim()
  }
  const m2 = detail.match(/\(([^)]+)\)/)
  if (m2?.[1]) {
    const v = m2[1].trim()
    if (v.endsWith('동') || v.endsWith('리')) return ''
    return v
  }
  return ''
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('campus_id, role, perm_analytics')
    .eq('id', user.id)
    .single()

  if (!profile?.campus_id) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile.role !== 'campus_admin' && !profile.perm_analytics)
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const campusId = profile.campus_id

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { read, utils } = await import('xlsx')
  const wb = read(buffer, { type: 'buffer' })

  // 첫 번째 시트 사용
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]

  // 헤더 행 찾기 (학생명 포함 행)
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].includes('학생명') || rows[i].includes('이름')) { headerIdx = i; break }
  }
  if (headerIdx === -1) return NextResponse.json({ error: '헤더 행을 찾을 수 없습니다' }, { status: 400 })

  const header = rows[headerIdx]
  const nameIdx = header.findIndex(h => String(h).includes('학생명') || String(h).includes('이름'))
  const zipIdx  = header.findIndex(h => String(h).includes('우편'))
  const addrIdx = header.findIndex(h => String(h).includes('주소') && !String(h).includes('상세'))
  const detailIdx = header.findIndex(h => String(h).includes('상세'))
  const schoolIdx = header.findIndex(h => String(h).includes('학교'))
  const gradeIdx = header.findIndex(h => String(h).includes('학년'))

  const dataRows = rows.slice(headerIdx + 1).filter(r => r[nameIdx])

  let updated = 0, notFound = 0
  const notFoundNames: string[] = []

  for (const row of dataRows) {
    const rawName = String(row[nameIdx] ?? '').trim()
    if (!rawName) continue
    const korName = extractKoreanName(rawName)
    const detail = String(row[detailIdx] ?? '')
    const apt = extractApartment(detail)

    const { data: student } = await service
      .from('campus_students')
      .select('id')
      .eq('campus_id', campusId)
      .ilike('name', korName)
      .maybeSingle()

    if (!student) {
      notFound++
      notFoundNames.push(korName)
      continue
    }

    await service.from('campus_students').update({
      school: String(row[schoolIdx] ?? '').trim() || null,
      grade: String(row[gradeIdx] ?? '').trim() || null,
      zip_code: String(row[zipIdx] ?? '').trim() || null,
      address: String(row[addrIdx] ?? '').trim() || null,
      detail_address: detail.trim() || null,
      apartment: apt || null,
    }).eq('id', student.id)

    updated++
  }

  return NextResponse.json({
    ok: true,
    total: dataRows.length,
    updated,
    notFound,
    notFoundSample: notFoundNames.slice(0, 10),
  })
}
