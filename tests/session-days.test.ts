import { describe, it, expect } from 'vitest'
import { sessionRideDays, clampRideDaysToSession } from '@/lib/utils/session-days'

describe('sessionRideDays', () => {
  it('월수금/3일 → 월수금', () => {
    expect(sessionRideDays('초등부 월수금')).toEqual(['월', '수', '금'])
    expect(sessionRideDays('3일반')).toEqual(['월', '수', '금'])
  })
  it('화목/2일 → 화목', () => {
    expect(sessionRideDays('초등부 화목')).toEqual(['화', '목'])
    expect(sessionRideDays('2일반')).toEqual(['화', '목'])
  })
  it('매일반·유치부·null → 제한 없음(null)', () => {
    expect(sessionRideDays('초등부 매일반')).toBeNull()
    expect(sessionRideDays('유치부 방과후')).toBeNull()
    expect(sessionRideDays(null)).toBeNull()
  })
})

describe('clampRideDaysToSession', () => {
  it('버그 재현: 월수금 학생에 전 요일 요청 → 월수금만 (화·목 제거)', () => {
    expect(clampRideDaysToSession(['월', '화', '수', '목', '금'], '초등부 월수금'))
      .toEqual(['월', '수', '금'])
  })
  it('매일반은 전 요일 그대로', () => {
    expect(clampRideDaysToSession(['월', '화', '수', '목', '금'], '초등부 매일반'))
      .toEqual(['월', '화', '수', '목', '금'])
  })
  it('요청이 세션요일과 전혀 안 겹치면 세션 요일로 폴백(0일 방지)', () => {
    expect(clampRideDaysToSession(['화', '목'], '초등부 월수금')).toEqual(['월', '수', '금'])
  })
  it('요청이 세션요일 부분집합이면 그대로 유지', () => {
    expect(clampRideDaysToSession(['월'], '초등부 월수금')).toEqual(['월'])
  })
})
