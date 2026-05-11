// lib/permissions.ts

export interface UserPermissions {
  classRoster: boolean
  vehicles: boolean
  vehiclesRestricted: boolean
}

interface UserProfile {
  role: string
  position: string | null
  perm_class_roster: boolean | null
  perm_vehicles: boolean | null
  perm_vehicles_restricted: boolean | null
}

const FULL_ACCESS_POSITIONS = ['원장', '관리자', '상담부', 'KT']
const SAFETY_POSITION = 'POLY안전선생님'

export function getPositionDefaults(role: string, position: string | null): UserPermissions {
  if (role === 'campus_admin' || role === 'hq_admin') {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false }
  }
  const pos = position ?? ''
  if (FULL_ACCESS_POSITIONS.some(p => pos.includes(p))) {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false }
  }
  if (pos.includes(SAFETY_POSITION)) {
    return { classRoster: false, vehicles: true, vehiclesRestricted: true }
  }
  return { classRoster: false, vehicles: false, vehiclesRestricted: false }
}

export function resolvePermissions(profile: UserProfile): UserPermissions {
  const defaults = getPositionDefaults(profile.role, profile.position)
  return {
    classRoster: profile.perm_class_roster ?? defaults.classRoster,
    vehicles: profile.perm_vehicles ?? defaults.vehicles,
    vehiclesRestricted: profile.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
  }
}
