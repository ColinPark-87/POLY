export function resolveRedirectPath(role: string, position: string): string {
  if (role === 'hq_admin') return '/hq/dashboard'
  const isCampusUser =
    role === 'campus_admin' ||
    position.includes('상담') ||
    position.includes('KT') ||
    position.includes('관리자') ||
    position.includes('POLY안전')
  return isCampusUser ? '/campus/dashboard' : '/dashboard'
}
