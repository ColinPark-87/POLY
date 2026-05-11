import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DAYS_KO = ['월', '화', '수', '목', '금'] as const

/** "09:40" → Excel 소수 (0.402777...) */
function timeToExcel(t: string | undefined | null): number | '' {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return (parseInt(m[1]) * 60 + parseInt(m[2])) / 1440
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const wb = XLSX.utils.book_new()

  // ── ① 반 시트 ─────────────────────────────────────────────────
  const banHeader: unknown[] = [
    '세션', '운영시간', '반이름', '교실이름', 'KT', 'FT',
    '학생 한글이름', '학생 영어이름', '차량탑승', '등원',
    '월', '', '화', '', '수', '', '목', '', '금', '',
    '하원',
    '월', '', '화', '', '수', '', '목', '', '금', '',
  ]

  const sampleRow: unknown[] = [
    '유치부', '09:40~14:40', 'ECP5', 'America', '김KT', 'Liz',
    '홍길동', 'Gildong Hong', '3호차', '',
    '중계역 2번출구', timeToExcel('09:40'),
    '중계역 2번출구', timeToExcel('09:40'),
    '중계역 2번출구', timeToExcel('09:40'),
    '중계역 2번출구', timeToExcel('09:40'),
    '중계역 2번출구', timeToExcel('09:40'),
    '',
    '폴리앞', timeToExcel('14:40'),
    '폴리앞', timeToExcel('14:40'),
    '폴리앞', timeToExcel('14:40'),
    '폴리앞', timeToExcel('14:40'),
    '폴리앞', timeToExcel('14:40'),
  ]

  const banData = [banHeader, sampleRow]

  const wsBan = XLSX.utils.aoa_to_sheet(banData)

  // 시간 컬럼 포맷 (소수 → HH:MM 표시)
  // 시간 컬럼 인덱스: 11,13,15,17,19,22,24,26,28,30 (0-indexed)
  const timeCols = [11, 13, 15, 17, 19, 22, 24, 26, 28, 30]
  const range = XLSX.utils.decode_range(wsBan['!ref'] ?? 'A1')
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of timeCols) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (wsBan[addr] && typeof wsBan[addr].v === 'number') {
        wsBan[addr].t = 'n'
        wsBan[addr].z = 'HH:MM'
      }
    }
  }

  wsBan['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 4 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 4 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
    { wch: 24 }, { wch: 7 },
  ]
  XLSX.utils.book_append_sheet(wb, wsBan, '반')

  // ── ② 정류장별 주소 시트 ──────────────────────────────────────
  const stopHeader = ['정류장 명', '주소']
  const stopData: unknown[][] = [stopHeader]
  stopData.push(['중계역 2번출구', '서울시 노원구 중계동 중계역'])
  stopData.push(['폴리앞', '서울시 노원구 중계동 폴리어학원 앞'])
  const wsStop = XLSX.utils.aoa_to_sheet(stopData)
  wsStop['!cols'] = [{ wch: 30 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsStop, '정류장별 주소')

  // ── ③ 차량정보 시트 ───────────────────────────────────────────
  const busHeader = ['호차명', '기사명', '기사연락처', 'POLY 안전선생님', '안전연락처', 'KT담당자', 'KT연락처']
  const busData: unknown[][] = [busHeader]
  busData.push(['1호차', '김기사', '010-1234-5678', '박안전', '010-2345-6789', '이KT', '010-3456-7890'])
  busData.push(['2호차', '이기사', '010-4567-8901', '최안전', '010-5678-9012', '', ''])
  busData.push(['3호차', '박기사', '010-7890-1234', '', '', '', ''])
  const wsBus = XLSX.utils.aoa_to_sheet(busData)
  wsBus['!cols'] = busHeader.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, wsBus, '차량정보')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'%EB%B0%98%ED%8E%B8%EC%84%B1_%EC%B0%A8%EB%9F%89_%ED%85%9C%ED%94%8C%EB%A6%BF.xlsx',
    },
  })
}
