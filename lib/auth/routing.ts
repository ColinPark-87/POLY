// 부원장 직급은 원장과 동일 권한으로 동작 (role 은 'employee' 라도 admin 으로 취급)
export function isViceAdmin(position: string): boolean {
  return position.includes('부원장')
}

// 캠퍼스 관리자 동급(원장 / 부원장 / 본사) 판별 — API 가드용
export function isCampusAdminLike(role: string, position: string): boolean {
  return role === 'campus_admin' || role === 'hq_admin' || isViceAdmin(position)
}

export function resolveRedirectPath(role: string, position: string): string {
  if (role === 'hq_admin') return '/hq/dashboard'
  const isCampusUser =
    role === 'campus_admin' ||
    isViceAdmin(position) ||
    position.includes('상담') ||
    position.includes('KT') ||
    position.includes('관리자') ||
    position.includes('POLY안전')
  return isCampusUser ? '/campus/dashboard' : '/dashboard'
}

// 캠퍼스 제한 직원(상담/KT/관리자/POLY안전)은 /campus/dashboard 접근 권한이 없고
// 개설반 현황·차량 관리만 가능하므로, 로그인 후 "실제 접근 가능한" 홈으로 보낸다.
// (resolveRedirectPath 는 레이아웃의 캠퍼스직원 판별에 계속 쓰이므로 분리)
// 부원장은 원장과 동일 접근권한 → staff-only 가 아님
export function isCampusStaffOnly(role: string, position: string): boolean {
  if (role === 'campus_admin' || role === 'hq_admin') return false
  if (isViceAdmin(position)) return false
  return (
    position.includes('상담') ||
    position.includes('KT') ||
    position.includes('관리자') ||
    position.includes('POLY안전')
  )
}

export function resolveHomePath(role: string, position: string): string {
  if (role === 'hq_admin') return '/hq/dashboard'
  if (role === 'campus_admin' || isViceAdmin(position)) return '/campus/dashboard'
  if (isCampusStaffOnly(role, position)) return '/campus/class-roster'
  return '/dashboard'
}
