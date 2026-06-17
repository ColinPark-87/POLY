import { describe, it, expect } from 'vitest'
import { isStale, conflictBody } from '@/lib/vehicles/conflict'

describe('isStale', () => {
  it('현재가 baseVersion보다 최신이면 stale', () => {
    expect(isStale('2026-06-17T10:00:01Z', '2026-06-17T10:00:00Z')).toBe(true)
  })
  it('동일/이전이면 not stale', () => {
    expect(isStale('2026-06-17T10:00:00Z', '2026-06-17T10:00:00Z')).toBe(false)
    expect(isStale('2026-06-17T09:59:59Z', '2026-06-17T10:00:00Z')).toBe(false)
  })
  it('baseVersion 없으면(최초/force) not stale', () => {
    expect(isStale('2026-06-17T10:00:00Z', null)).toBe(false)
    expect(isStale('2026-06-17T10:00:00Z', undefined)).toBe(false)
  })
})

describe('conflictBody', () => {
  it('stale면 409 본문', () => {
    const cf = conflictBody({ updated_at: '2026-06-17T10:00:05Z', updated_by: 'Colin' }, '2026-06-17T10:00:00Z')
    expect(cf).toEqual({ error: 'conflict', updated_by: 'Colin', updated_at: '2026-06-17T10:00:05Z' })
  })
  it('충돌 없으면 null', () => {
    expect(conflictBody({ updated_at: '2026-06-17T10:00:00Z', updated_by: 'Colin' }, '2026-06-17T10:00:00Z')).toBeNull()
  })
  it('행/updated_at 없으면 null', () => {
    expect(conflictBody(null, '2026-06-17T10:00:00Z')).toBeNull()
    expect(conflictBody({ updated_by: 'x' }, '2026-06-17T10:00:00Z')).toBeNull()
  })
})
