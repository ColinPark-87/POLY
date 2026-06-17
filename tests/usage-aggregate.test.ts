import { describe, it, expect } from 'vitest'
import { aggregateUsage, usageToCsv, type UsageRow } from '@/lib/usage-log'

const rows: UsageRow[] = [
  { event_type: 'login', area: null, campus_id: 'c1', user_id: 'u1', user_name: 'A', role: 'campus_admin', created_at: '2026-06-17T01:00:00Z' },
  { event_type: 'edit', area: 'vehicles', campus_id: 'c1', user_id: 'u1', user_name: 'A', role: 'campus_admin', created_at: '2026-06-17T02:00:00Z' },
  { event_type: 'edit', area: 'roster', campus_id: 'c1', user_id: 'u2', user_name: 'B', role: 'employee', created_at: '2026-06-17T03:00:00Z' },
  { event_type: 'login', area: null, campus_id: 'c2', user_id: 'u3', user_name: 'C', role: 'campus_admin', created_at: '2026-06-16T05:00:00Z' },
]
const campusMap = { c1: '대치', c2: '분당' }

describe('aggregateUsage', () => {
  const r = aggregateUsage(rows, campusMap)
  it('전체 합계', () => {
    expect(r.totals).toEqual({ logins: 2, edits: 2, activeUsers: 3 })
  })
  it('캠퍼스별: 로그인/활동/활성사용자/마지막', () => {
    const c1 = r.byCampus.find(x => x.campus_id === 'c1')!
    expect([c1.campus_name, c1.logins, c1.edits, c1.activeUsers]).toEqual(['대치', 1, 2, 2])
    expect(c1.lastActiveAt).toBe('2026-06-17T03:00:00Z')
  })
  it('사용자별: 활동 많은 순 정렬', () => {
    expect(r.byUser[0].user_name).toBe('A')
    const a = r.byUser.find(u => u.user_id === 'u1')!
    expect([a.logins, a.edits]).toEqual([1, 1])
  })
  it('일자별 집계(KST)', () => {
    const d17 = r.byDay.find(d => d.date === '2026-06-17')!
    expect([d17.logins, d17.edits]).toEqual([1, 2])
  })
})

describe('usageToCsv', () => {
  it('헤더 + 행, UTF-8 BOM 포함', () => {
    const csv = usageToCsv(aggregateUsage(rows, campusMap).byCampus, ['campus_name', 'logins', 'edits', 'activeUsers', 'lastActiveAt'])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('campus_name,logins,edits,activeUsers,lastActiveAt')
    expect(csv).toContain('대치,1,2,2,')
  })
})
