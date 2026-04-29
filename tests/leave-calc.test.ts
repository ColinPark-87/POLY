import { describe, it, expect } from 'vitest'
import { calcBusinessDays, calcUsedDays } from '@/lib/utils/leave-calc'

describe('calcBusinessDays', () => {
  it('같은 날이면 1일', () => {
    expect(calcBusinessDays('2026-04-01', '2026-04-01', [])).toBe(1)
  })

  it('월~금 5일', () => {
    expect(calcBusinessDays('2026-04-06', '2026-04-10', [])).toBe(5)
  })

  it('주말 포함 시 제외', () => {
    // 2026-04-06(월) ~ 2026-04-12(일) → 5일
    expect(calcBusinessDays('2026-04-06', '2026-04-12', [])).toBe(5)
  })

  it('공휴일 포함 시 제외', () => {
    // 2026-04-06(월) ~ 2026-04-10(금), 화요일이 공휴일 → 4일
    expect(calcBusinessDays('2026-04-06', '2026-04-10', ['2026-04-07'])).toBe(4)
  })
})

describe('calcUsedDays', () => {
  it('연차는 영업일 그대로', () => {
    expect(calcUsedDays('annual', '2026-04-06', '2026-04-07', [])).toBe(2)
  })

  it('반차는 0.5일 고정', () => {
    expect(calcUsedDays('half_am', '2026-04-06', '2026-04-06', [])).toBe(0.5)
  })

  it('반반차는 0.25일 고정', () => {
    expect(calcUsedDays('quarter', '2026-04-06', '2026-04-06', [])).toBe(0.25)
  })
})
