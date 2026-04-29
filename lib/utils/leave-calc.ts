import { LeaveType, LEAVE_DAYS } from '@/lib/types'

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
    const day = cur.getDay()
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
