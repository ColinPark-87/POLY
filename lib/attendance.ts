// lib/attendance.ts

export type AttendanceStatus = 'present' | 'absent' | 'late'
export type CompletedBy = 'teacher' | 'counselor'
export type UiSessionStatus = '미도래' | '대기중' | '완료'

export interface AttendanceSession {
  id: string
  class_id: string
  campus_id: string
  session_date: string
  completed_at: string | null
  completed_by: CompletedBy | null
  created_at: string
}

export interface AttendanceRecord {
  id: string
  attendance_session_id: string
  student_id: string
  status: AttendanceStatus
  pre_marked: boolean
  recorded_by: 'teacher' | 'counselor' | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface StudentAttendance {
  student_id: string
  student_name: string
  status: AttendanceStatus
  pre_marked: boolean
  note: string | null
}

export interface ClassWithAttendance {
  class_id: string
  campus_id: string
  class_level: string
  class_room: string | null
  class_teacher: string | null
  class_color: string
  class_session_id: string
  class_session_name: string
  class_session_time_range: string
  start_time_parsed: string
  ui_status: UiSessionStatus
  attendance_session: AttendanceSession | null
  students: StudentAttendance[]
  absent_count: number
  late_count: number
}

/**
 * "9:40~11:00"  → "09:40"
 * "3:10~4:30"   → "15:10"  (hour < 9 → PM)
 * "12:00~13:00" → "12:00"
 */
export function parseStartTime(timeRange: string): string {
  const raw = timeRange.split('~')[0].trim()
  const [h, m] = raw.split(':').map(Number)
  const hour24 = h < 9 ? h + 12 : h
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "09:40" → minutes from midnight */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function resolveUiStatus(
  completedAt: string | null,
  startTimeParsed: string,
  nowMinutes: number
): UiSessionStatus {
  if (completedAt) return '완료'
  const diff = toMinutes(startTimeParsed) - nowMinutes
  return diff <= 2 ? '대기중' : '미도래'
}
