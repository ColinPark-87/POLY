import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DAYS = ['월', '화', '수', '목', '금'] as const

function str(v: unknown) { return String(v ?? '').trim() }

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin') return NextResponse.json({ error: '권한 없음 (campus_admin만 가능)' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })

  const stats = {
    sessions_created: 0, classes_created: 0,
    students_created: 0, enrollments: 0, buses: 0,
    errors: [] as string[],
  }

  // ── 시트 1: 세션설정 ──────────────────────────────────────────
  const ws1 = wb.Sheets['①세션설정']
  if (!ws1) return NextResponse.json({ error: '①세션설정 시트가 없습니다. 템플릿을 확인하세요.' }, { status: 400 })
  const sessRows = (XLSX.utils.sheet_to_json(ws1, { header: 1 }) as unknown[][]).slice(1)

  const sessionMap: Record<string, string> = {} // sessName → session_id

  for (const row of sessRows) {
    const name = str(row[0]); const month = str(row[1])
    const start = str(row[2]); const end = str(row[3])
    const sortOrder = Number(row[4] ?? 99)
    if (!name || !month) continue

    const timeRange = start && end ? `${start}~${end}` : null

    const { data: existing } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId).eq('month', month).eq('name', name).maybeSingle()

    let sessId: string
    if (existing) {
      await service.from('class_sessions').update({ time_range: timeRange, sort_order: sortOrder }).eq('id', existing.id)
      sessId = existing.id
    } else {
      const { data: created, error } = await service.from('class_sessions').insert({
        campus_id: campusId, name, month, time_range: timeRange, sort_order: sortOrder,
      }).select('id').single()
      if (error || !created) { stats.errors.push(`세션 생성 실패: ${name} — ${error?.message ?? ''}`); continue }
      sessId = created.id
      stats.sessions_created++
    }
    sessionMap[name] = sessId
  }

  // ── 시트 2: 반편성_차량 ───────────────────────────────────────
  const ws2 = wb.Sheets['②반편성_차량']
  if (!ws2) return NextResponse.json({ error: '②반편성_차량 시트가 없습니다. 템플릿을 확인하세요.' }, { status: 400 })
  const rosterRows = (XLSX.utils.sheet_to_json(ws2, { header: 1 }) as unknown[][]).slice(1)

  const classMap: Record<string, string> = {}   // "sessId|level|teacher" → class_id
  const studentMap: Record<string, string> = {} // name → student_id

  // 기존 학생 캐시 (이름 정규화 포함)
  const { data: existingStudents } = await service.from('campus_students')
    .select('id, name').eq('campus_id', campusId)
  for (const s of existingStudents ?? []) {
    studentMap[s.name] = s.id
    studentMap[s.name.replace(/\s/g, '')] = s.id
  }

  for (const row of rosterRows) {
    const sessName = str(row[0])
    const level = str(row[1])
    const teacher = str(row[2])
    const studentName = str(row[3])
    const englishName = str(row[4]) || null
    const isWaitlist = str(row[27]) === '대기'
    if (!sessName || !studentName) continue

    // 세션 매칭 (정확히 없으면 포함 검색)
    let sessId = sessionMap[sessName]
    if (!sessId) {
      const matched = Object.keys(sessionMap).find(k => k.includes(sessName) || sessName.includes(k))
      if (matched) sessId = sessionMap[matched]
    }
    if (!sessId) { stats.errors.push(`세션 없음: "${sessName}" (학생: ${studentName})`); continue }

    // 반 upsert
    const classKey = `${sessId}|${level}|${teacher}`
    if (!classMap[classKey]) {
      const { data: existing } = await service.from('classes')
        .select('id').eq('session_id', sessId).eq('level', level).eq('teacher', teacher).maybeSingle()
      if (existing) {
        classMap[classKey] = existing.id
      } else {
        const { data: created, error } = await service.from('classes').insert({
          campus_id: campusId, session_id: sessId, level, teacher,
        }).select('id').single()
        if (error || !created) { stats.errors.push(`반 생성 실패: ${sessName} ${level} ${teacher}`); continue }
        classMap[classKey] = created.id
        stats.classes_created++
      }
    }
    const classId = classMap[classKey]

    // 학생 upsert
    const nameNorm = studentName.replace(/\s/g, '')
    let studentId = studentMap[studentName] ?? studentMap[nameNorm]
    if (!studentId) {
      const { data: created, error } = await service.from('campus_students').insert({
        campus_id: campusId, name: studentName, english_name: englishName, is_active: true,
      }).select('id').single()
      if (error || !created) { stats.errors.push(`학생 생성 실패: ${studentName}`); continue }
      studentId = created.id
      studentMap[studentName] = studentId
      studentMap[nameNorm] = studentId
      stats.students_created++
    }

    // 차량 스케줄 파싱
    // 컬럼: [5,6]=등원월, [7,8]=등원화, ..., [15,16]=하원월, ...
    const arr_schedule: Record<string, string> = {}
    const dep_schedule: Record<string, string> = {}
    DAYS.forEach((day, i) => {
      const arrBus = str(row[5 + i * 2])
      const arrLoc = str(row[6 + i * 2])
      const depBus = str(row[15 + i * 2])
      const depLoc = str(row[16 + i * 2])
      if (arrBus) { arr_schedule[day] = arrBus; if (arrLoc) arr_schedule[`${day}_loc`] = arrLoc }
      if (depBus) { dep_schedule[day] = depBus; if (depLoc) dep_schedule[`${day}_loc`] = depLoc }
    })
    const arrTime = str(row[25]); const depTime = str(row[26])
    if (arrTime) arr_schedule['_time'] = arrTime
    if (depTime) dep_schedule['_time'] = depTime

    // 수강 upsert
    const { error } = await service.from('class_enrollments').upsert({
      campus_id: campusId, student_id: studentId, class_id: classId,
      is_waitlist: isWaitlist, arr_schedule, dep_schedule,
    }, { onConflict: 'student_id,class_id' })
    if (error) { stats.errors.push(`수강배정 실패: ${studentName} — ${error.message}`); continue }
    stats.enrollments++
  }

  // ── 시트 3: 차량정보 ──────────────────────────────────────────
  const ws3 = wb.Sheets['③차량정보']
  if (ws3) {
    const busRows = (XLSX.utils.sheet_to_json(ws3, { header: 1 }) as unknown[][]).slice(1)
    for (const row of busRows) {
      const name = str(row[0])
      if (!name) continue
      const busData = {
        campus_id: campusId, name,
        driver: str(row[1]) || null, driver_phone: str(row[2]) || null,
        safety: str(row[3]) || null, safety_phone: str(row[4]) || null,
        kt_name: str(row[5]) || null, kt_phone: str(row[6]) || null,
      }
      const { data: existing } = await service.from('campus_buses')
        .select('id').eq('campus_id', campusId).eq('name', name).maybeSingle()
      if (existing) {
        await service.from('campus_buses').update(busData).eq('id', existing.id)
      } else {
        await service.from('campus_buses').insert(busData)
        stats.buses++
      }
    }
  }

  // ── 시트 4: 정류장좌표 ────────────────────────────────────────
  const stopCoords: Record<string, { lat: number; lng: number }> = {}
  const ws4 = wb.Sheets['④정류장좌표']
  if (ws4) {
    const coordRows = XLSX.utils.sheet_to_json(ws4) as Record<string, unknown>[]
    const toGeocode: { name: string; address: string }[] = []

    for (const row of coordRows) {
      const name = str(row['정류장명'])
      if (!name) continue
      const lat = parseFloat(str(row['위도']))
      const lng = parseFloat(str(row['경도']))
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        stopCoords[name] = { lat, lng }
      } else {
        // '주소 (입력시 위도경도 자동변환)' 또는 '주소' 컬럼 모두 허용
        const address = str(row['주소 (입력시 위도경도 자동변환)']) || str(row['주소'])
        if (address) toGeocode.push({ name, address })
      }
    }

    // 주소 → 카카오 지오코딩 (서버사이드)
    const kakaoKey = process.env.KAKAO_REST_API_KEY
    if (kakaoKey && toGeocode.length > 0) {
      for (const item of toGeocode) {
        try {
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(item.address)}&size=1`,
            { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
          )
          if (res.ok) {
            const data = await res.json()
            const doc = data.documents?.[0]
            if (doc) stopCoords[item.name] = { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
          }
        } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats, stopCoords })
}
