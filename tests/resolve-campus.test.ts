import { describe, it, expect } from 'vitest'
import { resolveCampusId } from '@/lib/utils/resolve-campus'

describe('resolveCampusId', () => {
  it('버그 재현·수정: hq_admin이 홈 campus_id(중계) 있어도 선택 param(광교) 우선', () => {
    expect(resolveCampusId('hq_admin', 'jungkye-id', 'gwanggyo-id')).toBe('gwanggyo-id')
  })
  it('hq_admin + param 없음 → 홈 campus_id', () => {
    expect(resolveCampusId('hq_admin', 'jungkye-id', null)).toBe('jungkye-id')
  })
  it('hq_admin + 홈·param 둘 다 없음 → null(400 유발)', () => {
    expect(resolveCampusId('hq_admin', null, null)).toBeNull()
  })
  it('순수 HQ(홈 없음) + param → param', () => {
    expect(resolveCampusId('hq_admin', null, 'suji-id')).toBe('suji-id')
  })
  it('일반 사용자는 param 무시하고 자기 캠퍼스만 (타 캠퍼스 열람 차단)', () => {
    expect(resolveCampusId('campus_admin', 'my-campus', 'other-campus')).toBe('my-campus')
    expect(resolveCampusId('employee', 'my-campus', 'other-campus')).toBe('my-campus')
  })
  it('일반 사용자 + 캠퍼스 없음 → null', () => {
    expect(resolveCampusId('employee', null, 'other-campus')).toBeNull()
  })
})
