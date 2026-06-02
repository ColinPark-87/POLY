import { LeaveType } from '@/lib/types'

export function calcBusinessDays(
  startDate: string,
  endDate: string,
  holidays: string[]
): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const holidaySet = new Set(holidays)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    // 요일과 날짜키를 동일한(UTC) 달력 기준으로 계산 — 음수 오프셋 호스트에서 어긋나던 버그 수정.
    // UTC/UTC+ 호스트(현재 Vercel·개발환경)에서는 결과 동일(동작 보존).
    const day = cur.getUTCDay()
    const iso = cur.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function calcUsedDays(
  type: LeaveType,
  startDate: string,
  endDate: string,
  holidays: string[]
): number {
  if (type === 'half_am' || type === 'half_pm') return 0.5
  if (type === 'quarter') return 0.25
  return calcBusinessDays(startDate, endDate, holidays)
}
