import { describe, it, expect } from 'vitest'
import { filterPresent } from '@/lib/vehicles/presence'

describe('filterPresent', () => {
  const now = Date.parse('2026-06-17T10:00:00Z')
  const iso = (sBack: number) => new Date(now - sBack * 1000).toISOString()

  it('30초 윈도우 내, 본인 제외', () => {
    const rows = [
      { user_id: 'me', user_name: 'Me', last_seen: iso(5) },
      { user_id: 'a', user_name: 'Alice', last_seen: iso(10) },
      { user_id: 'b', user_name: 'Bob', last_seen: iso(40) }, // 윈도우 밖
    ]
    const out = filterPresent(rows, 'me', now, 30)
    expect(out.map(r => r.user_name)).toEqual(['Alice'])
  })

  it('아무도 없으면 빈 배열', () => {
    expect(filterPresent([], 'me', now, 30)).toEqual([])
  })

  it('경계값(정확히 30초 전)은 포함', () => {
    const rows = [{ user_id: 'a', user_name: 'Alice', last_seen: iso(30) }]
    expect(filterPresent(rows, 'me', now, 30)).toHaveLength(1)
  })

  it('page에 edit 포함이면 editing=true, 아니면 false', () => {
    const rows = [
      { user_id: 'a', user_name: 'Alice', last_seen: iso(5), page: 'vehicles-edit' },
      { user_id: 'b', user_name: 'Bob', last_seen: iso(5), page: 'vehicles' },
    ]
    const out = filterPresent(rows, 'me', now, 30)
    expect(out.find(r => r.user_name === 'Alice')?.editing).toBe(true)
    expect(out.find(r => r.user_name === 'Bob')?.editing).toBe(false)
  })
})
