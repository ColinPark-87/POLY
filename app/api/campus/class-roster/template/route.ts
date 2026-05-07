import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DAYS = ['월', '화', '수', '목', '금']

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = profile?.campus_id

  const wb = XLSX.utils.book_new()

  // ── 시트 1: 세션설정 ──────────────────────────────────────────
  const sessHeaders = ['세션명', '운영월', '시작시간', '종료시간', '정렬순서']
  const sessData = [
    sessHeaders,
    ['유치부', '2026년 6월', '13:00', '15:00', '1'],
    ['방과후', '2026년 6월', '15:30', '18:00', '2'],
    ['매일반', '2026년 6월', '15:30', '18:30', '3'],
    ['월수금반', '2026년 6월', '15:30', '18:30', '4'],
    ['화목반', '2026년 6월', '15:30', '18:30', '5'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(sessData)
  ws1['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws1, '①세션설정')

  // ── 시트 2: 반편성_차량 ───────────────────────────────────────
  const arrHeaders = DAYS.flatMap(d => [`등원_${d}_호차`, `등원_${d}_장소`])
  const depHeaders = DAYS.flatMap(d => [`하원_${d}_호차`, `하원_${d}_장소`])
  const headers2 = [
    '세션명', '레벨', '강의실(알파벳순)', '학생명', '영문명',
    ...arrHeaders,
    ...depHeaders,
    '등원시간', '하원시간', '대기여부(대기/공백)',
  ]
  const sampleRows = [
    [
      '유치부', 'ECP5', 'America', '홍길동', 'Gildong Hong',
      '1호차', '중계역 2번출구', '1호차', '중계역 2번출구', '1호차', '중계역 2번출구', '1호차', '중계역 2번출구', '1호차', '중계역 2번출구',
      '2호차', '폴리앞', '2호차', '폴리앞', '2호차', '폴리앞', '2호차', '폴리앞', '2호차', '폴리앞',
      '13:00', '15:00', '',
    ],
    [
      '매일반', 'MGT3A', 'Belgium', '김영희', 'Younghee Kim',
      '3호차', '태릉입구역', '3호차', '태릉입구역', '3호차', '태릉입구역', '3호차', '태릉입구역', '3호차', '태릉입구역',
      '5호차', '', '5호차', '', '5호차', '', '5호차', '', '5호차', '',
      '15:30', '18:30', '',
    ],
    [
      '화목반', 'ELP2', 'Canada', '박지훈', 'Jihun Park',
      '2호차', '한진그랑빌', '', '', '2호차', '한진그랑빌', '', '', '2호차', '한진그랑빌',
      '3호차', '', '', '', '3호차', '', '', '', '3호차', '',
      '15:30', '18:30', '대기',
    ],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...sampleRows])
  ws2['!cols'] = headers2.map((_, i) => ({ wch: i < 5 ? 20 : 13 }))
  XLSX.utils.book_append_sheet(wb, ws2, '②반편성_차량')

  // ── 시트 3: 차량정보 ──────────────────────────────────────────
  const busHeaders = ['호차명', '기사명', '기사연락처', '안전교사', '안전연락처', 'KT담당자', 'KT연락처']
  const busData = [
    busHeaders,
    ['1호차', '김기사', '010-1234-5678', '박안전', '010-2345-6789', '이KT', '010-3456-7890'],
    ['2호차', '이기사', '010-4567-8901', '최안전', '010-5678-9012', '', ''],
    ['3호차', '박기사', '010-7890-1234', '', '', '', ''],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(busData)
  ws3['!cols'] = busHeaders.map(() => ({ wch: 17 }))
  XLSX.utils.book_append_sheet(wb, ws3, '③차량정보')

  // ── 시트 4: 정류장좌표 ────────────────────────────────────────
  // 기존 수강 데이터에서 정류장 자동 추출 (없으면 예시 행 표시)
  const coordHeaders = ['정류장명', '방향', '호차', '주소 (입력시 위도경도 자동변환)', '위도', '경도']
  const coordRows: unknown[][] = [coordHeaders]

  if (campusId) {
    const { data: enrList } = await service
      .from('class_enrollments')
      .select('arr_schedule, dep_schedule')
      .eq('campus_id', campusId)
      .eq('is_waitlist', false)

    const stopMap = new Map<string, { buses: Set<string>; directions: Set<string> }>()
    for (const enr of enrList ?? []) {
      for (const day of DAYS) {
        const arrBus = (enr.arr_schedule as Record<string, string>)?.[day]
        const arrLoc = (enr.arr_schedule as Record<string, string>)?.[`${day}_loc`]
        if (arrBus && arrLoc) {
          if (!stopMap.has(arrLoc)) stopMap.set(arrLoc, { buses: new Set(), directions: new Set() })
          stopMap.get(arrLoc)!.buses.add(arrBus)
          stopMap.get(arrLoc)!.directions.add('등원')
        }
        const depBus = (enr.dep_schedule as Record<string, string>)?.[day]
        const depLoc = (enr.dep_schedule as Record<string, string>)?.[`${day}_loc`]
        if (depBus && depLoc) {
          if (!stopMap.has(depLoc)) stopMap.set(depLoc, { buses: new Set(), directions: new Set() })
          stopMap.get(depLoc)!.buses.add(depBus)
          stopMap.get(depLoc)!.directions.add('하원')
        }
      }
    }

    if (stopMap.size > 0) {
      // 등원 → 하원 → 공통 순 정렬
      const sorted = [...stopMap.entries()].sort((a, b) => {
        const da = [...a[1].directions].join(''), db = [...b[1].directions].join('')
        return da.localeCompare(db) || a[0].localeCompare(b[0])
      })
      for (const [name, info] of sorted) {
        coordRows.push([name, [...info.directions].join(', '), [...info.buses].join(', '), '', '', ''])
      }
    }
  }

  if (coordRows.length === 1) {
    // 기존 데이터 없음 — 예시 행
    coordRows.push(['중계역 2번출구', '등원, 하원', '1호차, 2호차', '', '37.618530', '127.065030'])
    coordRows.push(['태릉입구역', '하원', '3호차', '서울 노원구 태릉입구역', '', ''])
    coordRows.push(['공릉동 주민센터', '등원', '2호차', '서울 노원구 공릉동 주민센터', '', ''])
  }

  const ws4 = XLSX.utils.aoa_to_sheet(coordRows)
  ws4['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 42 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws4, '④정류장좌표')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'%EB%B0%98%ED%8E%B8%EC%84%B1_%EC%B0%A8%EB%9F%89_%ED%85%9C%ED%94%8C%EB%A6%BF.xlsx',
    },
  })
}
