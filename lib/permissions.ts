// lib/permissions.ts

export interface UserPermissions {
  classRoster: boolean
  vehicles: boolean
  vehiclesRestricted: boolean
  analytics: boolean
  enrollEdit: boolean
}

interface UserProfile {
  role: string
  position: string | null
  perm_class_roster: boolean | null
  perm_vehicles: boolean | null
  perm_vehicles_restricted: boolean | null
  perm_analytics?: boolean | null
  perm_enroll_edit?: boolean | null
}

// 상담부/상담교사 등 '상담' 포함 직책은 모두 전체 권한 (앱 전반의 /상담/ 분류와 일치)
const FULL_ACCESS_POSITIONS = ['원장', '관리자', '상담', 'KT']
const SAFETY_POSITION = 'POLY안전선생님'

export function getPositionDefaults(role: string, position: string | null): UserPermissions {
  const pos = position ?? ''
  // 부원장은 원장과 동일 풀권한 (role 이 employee 라도 admin 처럼 동작)
  if (role === 'campus_admin' || role === 'hq_admin' || pos.includes('부원장')) {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false, analytics: true, enrollEdit: true }
  }
  if (FULL_ACCESS_POSITIONS.some(p => pos.includes(p))) {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false, analytics: false, enrollEdit: pos.includes('상담') || pos.includes('관리자') || pos.includes('원장') }
  }
  if (pos.includes(SAFETY_POSITION)) {
    return { classRoster: false, vehicles: true, vehiclesRestricted: true, analytics: false, enrollEdit: false }
  }
  return { classRoster: false, vehicles: false, vehiclesRestricted: false, analytics: false, enrollEdit: false }
}

export function resolvePermissions(profile: UserProfile): UserPermissions {
  const defaults = getPositionDefaults(profile.role, profile.position)
  return {
    classRoster: profile.perm_class_roster ?? defaults.classRoster,
    vehicles: profile.perm_vehicles ?? defaults.vehicles,
    vehiclesRestricted: profile.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
    analytics: profile.perm_analytics ?? defaults.analytics,
    enrollEdit: profile.perm_enroll_edit ?? defaults.enrollEdit,
  }
}
