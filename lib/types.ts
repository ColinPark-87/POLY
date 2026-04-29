export type UserRole = 'employee' | 'campus_admin' | 'hq_admin'

export type LeaveType =
  | 'annual'
  | 'half_am'
  | 'half_pm'
  | 'quarter'
  | 'sick'
  | 'event'
  | 'other'

export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface Campus {
  id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
}

export interface User {
  id: string
  campus_id: string | null
  email: string
  name: string
  position: string
  role: UserRole
  company_hired_at: string | null
  campus_hired_at: string | null
  is_active: boolean
  needs_password_change: boolean
  created_at: string
}

export interface LeaveGrant {
  id: string
  campus_id: string
  user_id: string
  year: number
  total_days: number
  carried_over: number
  extra_days: number
}

export interface LeaveRequest {
  id: string
  campus_id: string
  user_id: string
  type: LeaveType
  start_date: string
  end_date: string
  days_used: number
  reason: string | null
  signature_data_url: string | null
  status: LeaveStatus
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
  users?: Pick<User, 'name' | 'position'>
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual:   '연차',
  half_am:  '반차(오전)',
  half_pm:  '반차(오후)',
  quarter:  '반반차',
  sick:     '병가',
  event:    '경조사',
  other:    '기타',
}

export const LEAVE_DAYS: Record<LeaveType, number> = {
  annual:  1,
  half_am: 0.5,
  half_pm: 0.5,
  quarter: 0.25,
  sick:    1,
  event:   1,
  other:   1,
}
