import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DAYS_KO = ['월', '화', '수', '목', '금'] as const

function str(v: unknown) { return String(v ?? '').trim() }

/** 운영요일 문자열 → ['월','화',...] */
function parseDays(dayStr: string): string[] {
  return DAYS_KO.filter(d => dayStr.includes(d))
}

/** 세션명에서 요일 추론 (구 형식 호환용) */
function inferDaysFromName(sessName: string): string[] {
  if (sessName.includes('월수금')) return ['월', '수', '금']
  if (sessName.includes('화목'))   return ['화', '목']
  return ['월', '화', '수', '목', '금']
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const { searchParams } = new URL(request.url)
  let campusId: string | null | undefined = profile?.campus_id
  if (!campusId && profile?.role === 'hq_admin') campusId = searchParams.get('campus_id')
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (!['campus_admin', 'hq_admin'].includes(profile?.role ?? ''))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

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

  // ── "반" 단일시트 포맷 ──────────────────────────────────────────
  if (wb.Sheets['반']) {
    const month = searchParams.get('month') ?? ''
    if (!month) return NextResponse.json({ error: '운영월을 선택해주세요.' }, { status: 400 })

    function excelToTimeStr(val: unknown): string {
      if (typeof val !== 'number' || val <= 0) return ''
      const totalMin = Math.round(val * 24 * 60)
      const h = Math.floor(totalMin / 60)
      const m = totalMin % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    // 기존 버스 캐시
    const busCache: Record<string, boolean> = {}
    const { data: existingBuses } = await service.from('campus_buses').select('name').eq('campus_id', campusId)
    for (const b of existingBuses ?? []) busCache[b.name] = true

    // 기존 학생 캐시
    const studentMap: Record<string, string> = {}
    const { data: existingStudents } = await service.from('campus_students').select('id, name').eq('campus_id', campusId)
    for (const s of existingStudents ?? []) {
      studentMap[s.name] = s.id
      studentMap[s.name.replace(/\s/g, '')] = s.id
    }

    const sessCache: Record<string, string> = {}   // "세션명|운영시간" → session_id
    const classCache: Record<string, string> = {}  // "sessId|반이름" → class_id

    const banRows = (XLSX.utils.sheet_to_json(wb.Sheets['반'], { header: 1 }) as unknown[][]).slice(1)

    for (const row of banRows) {
      const sessName    = str(row[0])
      const timeRange   = str(row[1])   // "09:40~14:40"
      const level       = str(row[2])
      const room        = str(row[3]) || null
      const ktTeacher   = str(row[4]) || null
      const ftTeacher   = str(row[5]) || null
      const studentName = str(row[6])
      const englishName = str(row[7]) || null
      const busName     = str(row[8])   // 차량탑승 — 전 요일 공통

      if (!sessName || !level || !studentName) continue

      // 세션 upsert
      const sessKey = `${sessName}|${timeRange}`
      if (!sessCache[sessKey]) {
        const { data: ex } = await service.from('class_sessions')
          .select('id').eq('campus_id', campusId).eq('month', month).eq('name', sessName).maybeSingle()
        let sessId: string
        if (ex) {
          await service.from('class_sessions').update({ time_range: timeRange || null }).eq('id', ex.id)
          sessId = ex.id
        } else {
          const { data: created, error } = await service.from('class_sessions').insert({
            campus_id: campusId, name: sessName, month, time_range: timeRange || null,
          }).select('id').single()
          if (error || !created) { stats.errors.push(`세션 생성 실패: ${sessName} — ${error?.message ?? ''}`); continue }
          sessId = created.id
          stats.sessions_created++
        }
        sessCache[sessKey] = sessId
      }
      const sessId = sessCache[sessKey]

      // 반 upsert
      const classKey = `${sessId}|${level}`
      if (!classCache[classKey]) {
        const { data: ex } = await service.from('classes')
          .select('id').eq('session_id', sessId).eq('level', level).maybeSingle()
        if (ex) {
          await service.from('classes').update({ room, teacher: ftTeacher, kt_teacher: ktTeacher }).eq('id', ex.id)
          classCache[classKey] = ex.id
        } else {
          const { data: created, error } = await service.from('classes').insert({
            campus_id: campusId, session_id: sessId, level, room, teacher: ftTeacher, kt_teacher: ktTeacher,
          }).select('id').single()
          if (error || !created) { stats.errors.push(`반 생성 실패: ${sessName} ${level} — ${error?.message ?? ''}`); continue }
          classCache[classKey] = created.id
          stats.classes_created++
        }
      }
      const classId = classCache[classKey]

      // 학생 upsert
      const nameNorm = studentName.replace(/\s/g, '')
      let studentId = studentMap[studentName] ?? studentMap[nameNorm]
      if (!studentId) {
        const { data: created, error } = await service.from('campus_students').insert({
          campus_id: campusId, name: studentName, english_name: englishName, is_active: true,
        }).select('id').single()
        if (error || !created) { stats.errors.push(`학생 생성 실패: ${studentName} — ${error?.message ?? ''}`); continue }
        studentId = created.id
        studentMap[studentName] = studentId
        studentMap[nameNorm] = studentId
        stats.students_created++
      }

      // 기존 수강 데이터 (merge용)
      const { data: exEnr } = await service.from('class_enrollments')
        .select('arr_schedule, dep_schedule')
        .eq('student_id', studentId).eq('class_id', classId).maybeSingle()
      const arr_schedule: Record<string, string> = { ...(exEnr?.arr_schedule ?? {}) }
      const dep_schedule: Record<string, string> = { ...(exEnr?.dep_schedule ?? {}) }

      // 컬럼 인덱스: 등원 [10,12,14,16,18], 하원 [21,23,25,27,29]
      const ARR = [10, 12, 14, 16, 18]
      const DEP = [21, 23, 25, 27, 29]
      DAYS_KO.forEach((day, i) => {
        const arrStop = str(row[ARR[i]])
        const arrTime = excelToTimeStr(row[ARR[i] + 1])
        const depStop = str(row[DEP[i]])
        const depTime = excelToTimeStr(row[DEP[i] + 1])

        if (arrStop && busName) {
          arr_schedule[day] = busName
          arr_schedule[`${day}_loc`] = arrStop
          if (arrTime) arr_schedule[`${day}_time`] = arrTime
        }
        if (depStop && busName) {
          dep_schedule[day] = busName
          dep_schedule[`${day}_loc`] = depStop
          if (depTime) dep_schedule[`${day}_time`] = depTime
        }
      })

      const { error } = await service.from('class_enrollments').upsert({
        campus_id: campusId, student_id: studentId, class_id: classId,
        is_waitlist: false, arr_schedule, dep_schedule,
      }, { onConflict: 'student_id,class_id' })
      if (error) { stats.errors.push(`수강배정 실패: ${studentName} — ${error.message}`); continue }
      stats.enrollments++

      // 버스 자동등록 (campus_buses에 없으면 이름만 추가)
      if (busName && !busCache[busName]) {
        const { error: busErr } = await service.from('campus_buses').insert({ campus_id: campusId, name: busName })
        if (!busErr) { busCache[busName] = true; stats.buses++ }
      }
    }

    // 차량정보 시트 처리 (기사/안전/KT 정보)
    if (wb.Sheets['차량정보']) {
      const busInfoRows = (XLSX.utils.sheet_to_json(wb.Sheets['차량정보'], { header: 1 }) as unknown[][]).slice(1)
      for (const row of busInfoRows) {
        const name = str(row[0]); if (!name) continue
        const busData = {
          campus_id: campusId, name,
          driver: str(row[1]) || null, driver_phone: str(row[2]) || null,
          safety: str(row[3]) || null, safety_phone: str(row[4]) || null,
          kt_name: str(row[5]) || null, kt_phone: str(row[6]) || null,
        }
        const { data: ex } = await service.from('campus_buses').select('id').eq('campus_id', campusId).eq('name', name).maybeSingle()
        if (ex) {
          await service.from('campus_buses').update(busData).eq('id', ex.id)
        } else {
          await service.from('campus_buses').insert(busData)
          stats.buses++
        }
      }
    }

    // 정류장별 주소 → 좌표 변환 (Kakao API)
    if (wb.Sheets['정류장별 주소']) {
      const addrRows = (XLSX.utils.sheet_to_json(wb.Sheets['정류장별 주소'], { header: 1 }) as unknown[][]).slice(1)
      const toGeocode: { name: string; address: string }[] = []
      for (const row of addrRows) {
        const name = str(row[0]); const address = str(row[1])
        if (name && address) toGeocode.push({ name, address })
      }
      const kakaoKey = process.env.KAKAO_REST_API_KEY
      const stopCoords: Record<string, { lat: number; lng: number }> = {}
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
          } catch { /* ignore */ }
        }
      }
      if (Object.keys(stopCoords).length > 0) {
        const rows = Object.entries(stopCoords).map(([stop_name, { lat, lng }]) => ({
          campus_id: campusId, stop_name, lat, lng, updated_at: new Date().toISOString(),
        }))
        await service.from('campus_stop_coords').upsert(rows, { onConflict: 'campus_id,stop_name' })
      }
    }

    return NextResponse.json({ ok: true, ...stats })
  }

  // 신규/구 형식 감지
  const isNewFormat = !!(wb.Sheets['③반편성'] || wb.Sheets['②세션설정'])

  // ── 세션설정 시트 ──────────────────────────────────────────────
  const sessSheetName = wb.Sheets['②세션설정'] ? '②세션설정'
    : wb.Sheets['①세션설정'] ? '①세션설정' : null
  if (!sessSheetName)
    return NextResponse.json({ error: '세션설정 시트가 없습니다. 템플릿을 확인하세요.' }, { status: 400 })

  const ws1 = wb.Sheets[sessSheetName]
  const allSessRows = (XLSX.utils.sheet_to_json(ws1, { header: 1 }) as unknown[][]).slice(1)
  // 설명 행 제거 (첫 컬럼이 '※'로 시작하거나, 운영월이 비어있는 경우)
  const sessRows = allSessRows.filter(row => {
    const name = str(row[0])
    const month = isNewFormat ? str(row[1]) : str(row[1])
    return name && !name.startsWith('※') && month
  })

  const sessionMap: Record<string, string> = {}  // sessName → session_id
  const sessionDaysMap: Record<string, string[]> = {} // sessName → days[]

  for (const row of sessRows) {
    const name = str(row[0])
    const month = str(row[1])
    if (!name || !month) continue

    let days: string[]
    let start: string
    let end: string
    let sortOrder: number

    if (isNewFormat) {
      // ②세션설정: 세션명 | 운영월 | 운영요일 | 등원시간 | 하원시간 | 정렬순서
      const dayStr = str(row[2])
      days = dayStr ? parseDays(dayStr) : inferDaysFromName(name)
      start = str(row[3])
      end = str(row[4])
      sortOrder = Number(row[5] ?? 99)
    } else {
      // ①세션설정 (구 형식): 세션명 | 운영월 | 시작시간 | 종료시간 | 정렬순서
      days = inferDaysFromName(name)
      start = str(row[2])
      end = str(row[3])
      sortOrder = Number(row[4] ?? 99)
    }

    const timeRange = start && end ? `${start}~${end}` : null
    sessionDaysMap[name] = days.length ? days : ['월', '화', '수', '목', '금']

    const { data: existing } = await service.from('class_sessions')
      .select('id').eq('campus_id', campusId).eq('month', month).eq('name', name).maybeSingle()

    let sessId: string
    if (existing) {
      await service.from('class_sessions')
        .update({ time_range: timeRange, sort_order: sortOrder }).eq('id', existing.id)
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

  // ── 기존 학생 캐시 ─────────────────────────────────────────────
  const studentMap: Record<string, string> = {}
  const { data: existingStudents } = await service.from('campus_students')
    .select('id, name').eq('campus_id', campusId)
  for (const s of existingStudents ?? []) {
    studentMap[s.name] = s.id
    studentMap[s.name.replace(/\s/g, '')] = s.id
  }

  // ── 반편성 시트 ────────────────────────────────────────────────
  if (isNewFormat) {
    // ③반편성 (신규): 세션명|반이름|학생이름|영문이름|등원_호차|등원_장소|하원_호차|하원_장소|등원시간|하원시간|대기여부
    const ws3 = wb.Sheets['③반편성']
    if (!ws3)
      return NextResponse.json({ error: '③반편성 시트가 없습니다. 템플릿을 확인하세요.' }, { status: 400 })
    const rosterRows = (XLSX.utils.sheet_to_json(ws3, { header: 1 }) as unknown[][]).slice(1)

    const classMap: Record<string, string> = {} // "sessId|level" → class_id

    for (const row of rosterRows) {
      const sessName   = str(row[0])
      const level      = str(row[1])
      const studentName = str(row[2])
      if (!sessName || !level || !studentName) continue

      const englishName = str(row[3]) || null
      const arrBus  = str(row[4])
      const arrLoc  = str(row[5])
      const depBus  = str(row[6])
      const depLoc  = str(row[7])
      const arrTime = str(row[8])
      const depTime = str(row[9])
      const isWaitlist = str(row[10]) === '대기'

      // 세션 매칭 (정확 → 포함 검색)
      let sessId = sessionMap[sessName]
      if (!sessId) {
        const matched = Object.keys(sessionMap).find(k => k.includes(sessName) || sessName.includes(k))
        if (matched) sessId = sessionMap[matched]
      }
      if (!sessId) { stats.errors.push(`세션 없음: "${sessName}" (학생: ${studentName})`); continue }

      // 반 upsert
      const classKey = `${sessId}|${level}`
      if (!classMap[classKey]) {
        const { data: existing } = await service.from('classes')
          .select('id').eq('session_id', sessId).eq('level', level).maybeSingle()
        if (existing) {
          classMap[classKey] = existing.id
        } else {
          const { data: created, error } = await service.from('classes').insert({
            campus_id: campusId, session_id: sessId, level,
          }).select('id').single()
          if (error || !created) { stats.errors.push(`반 생성 실패: ${sessName} ${level}`); continue }
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

      // 세션 요일 기준으로 스케줄 생성
      const days = sessionDaysMap[sessName] ?? inferDaysFromName(sessName)

      // 기존 수강 데이터 조회 (요일별 merge를 위해)
      const { data: existing } = await service.from('class_enrollments')
        .select('arr_schedule, dep_schedule')
        .eq('student_id', studentId).eq('class_id', classId).maybeSingle()

      const arr_schedule: Record<string, string> = { ...(existing?.arr_schedule ?? {}) }
      const dep_schedule: Record<string, string> = { ...(existing?.dep_schedule ?? {}) }

      for (const day of days) {
        if (arrBus) { arr_schedule[day] = arrBus; if (arrLoc) arr_schedule[`${day}_loc`] = arrLoc }
        if (depBus) { dep_schedule[day] = depBus; if (depLoc) dep_schedule[`${day}_loc`] = depLoc }
      }
      if (arrTime) arr_schedule['_time'] = arrTime
      else if (!arr_schedule['_time'] && sessionMap[sessName]) {
        // 세션 기본시간 없으면 비워둠 (이미 없으면 그대로)
      }
      if (depTime) dep_schedule['_time'] = depTime

      const { error } = await service.from('class_enrollments').upsert({
        campus_id: campusId, student_id: studentId, class_id: classId,
        is_waitlist: isWaitlist, arr_schedule, dep_schedule,
      }, { onConflict: 'student_id,class_id' })
      if (error) { stats.errors.push(`수강배정 실패: ${studentName} — ${error.message}`); continue }
      stats.enrollments++
    }
  } else {
    // ②반편성_차량 (구 형식, 28열 가로)
    const ws2 = wb.Sheets['②반편성_차량']
    if (!ws2)
      return NextResponse.json({ error: '②반편성_차량 시트가 없습니다. 템플릿을 확인하세요.' }, { status: 400 })
    const rosterRows = (XLSX.utils.sheet_to_json(ws2, { header: 1 }) as unknown[][]).slice(1)
    const classMap: Record<string, string> = {}

    for (const row of rosterRows) {
      const sessName    = str(row[0])
      const level       = str(row[1])
      const teacher     = str(row[2])
      const studentName = str(row[3])
      const englishName = str(row[4]) || null
      const isWaitlist  = str(row[27]) === '대기'
      if (!sessName || !studentName) continue

      let sessId = sessionMap[sessName]
      if (!sessId) {
        const matched = Object.keys(sessionMap).find(k => k.includes(sessName) || sessName.includes(k))
        if (matched) sessId = sessionMap[matched]
      }
      if (!sessId) { stats.errors.push(`세션 없음: "${sessName}" (학생: ${studentName})`); continue }

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
          if (error || !created) { stats.errors.push(`반 생성 실패: ${sessName} ${level}`); continue }
          classMap[classKey] = created.id
          stats.classes_created++
        }
      }
      const classId = classMap[classKey]

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

      const arr_schedule: Record<string, string> = {}
      const dep_schedule: Record<string, string> = {}
      DAYS_KO.forEach((day, i) => {
        const arrBus = str(row[5 + i * 2]); const arrLoc = str(row[6 + i * 2])
        const depBus = str(row[15 + i * 2]); const depLoc = str(row[16 + i * 2])
        if (arrBus) { arr_schedule[day] = arrBus; if (arrLoc) arr_schedule[`${day}_loc`] = arrLoc }
        if (depBus) { dep_schedule[day] = depBus; if (depLoc) dep_schedule[`${day}_loc`] = depLoc }
      })
      const arrTime = str(row[25]); const depTime = str(row[26])
      if (arrTime) arr_schedule['_time'] = arrTime
      if (depTime) dep_schedule['_time'] = depTime

      const { error } = await service.from('class_enrollments').upsert({
        campus_id: campusId, student_id: studentId, class_id: classId,
        is_waitlist: isWaitlist, arr_schedule, dep_schedule,
      }, { onConflict: 'student_id,class_id' })
      if (error) { stats.errors.push(`수강배정 실패: ${studentName} — ${error.message}`); continue }
      stats.enrollments++
    }
  }

  // ── 차량정보 (⑤차량정보 or ③차량정보) ────────────────────────
  const busSheetName = wb.Sheets['⑤차량정보'] ? '⑤차량정보'
    : wb.Sheets['③차량정보'] ? '③차량정보' : null
  if (busSheetName) {
    const wsBus = wb.Sheets[busSheetName]
    const busRows = (XLSX.utils.sheet_to_json(wsBus, { header: 1 }) as unknown[][]).slice(1)
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

  // ── 정류장좌표 (구 형식 ④만 처리, 위도경도 있는 경우) ─────────
  if (!isNewFormat && wb.Sheets['④정류장좌표']) {
    const stopCoords: Record<string, { lat: number; lng: number }> = {}
    const ws4 = wb.Sheets['④정류장좌표']
    const coordRows = XLSX.utils.sheet_to_json(ws4) as Record<string, unknown>[]
    const toGeocode: { name: string; address: string }[] = []
    for (const row of coordRows) {
      const name = str(row['정류장명'])
      if (!name) continue
      const lat = parseFloat(str(row['위도'])); const lng = parseFloat(str(row['경도']))
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        stopCoords[name] = { lat, lng }
      } else {
        const address = str(row['주소 (입력시 위도경도 자동변환)']) || str(row['주소'])
        if (address) toGeocode.push({ name, address })
      }
    }
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
        } catch { /* ignore */ }
      }
    }
    if (Object.keys(stopCoords).length > 0) {
      const rows = Object.entries(stopCoords).map(([stop_name, { lat, lng }]) => ({
        campus_id: campusId, stop_name, lat, lng, updated_at: new Date().toISOString(),
      }))
      await service.from('campus_stop_coords').upsert(rows, { onConflict: 'campus_id,stop_name' })
    }
  }

  return NextResponse.json({ ok: true, ...stats })
}
