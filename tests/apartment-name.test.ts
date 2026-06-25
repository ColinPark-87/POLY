import { describe, it, expect } from 'vitest'
import { normalizeApt, aptNameMatches } from '@/lib/utils/apartment-name'

describe('normalizeApt', () => {
  it('운영 태그 [2026 차] 를 제거한다 (목동 지오코딩 오염 방지)', () => {
    expect(normalizeApt('목동신시가지아파트8단지 [2026 차]')).toBe('목동신시가지아파트8단지')
    expect(normalizeApt('한신청구아파트 [2026 차]')).toBe('한신청구아파트')
  })

  it('★☆ 등 잡음기호와 * 라이딩표식을 제거한다', () => {
    expect(normalizeApt('자연앤 힐스테이트 ★ 차')).toBe('자연앤 힐스테이트 차')
    expect(normalizeApt('*개별라이딩')).toBe('개별라이딩')
  })

  it('끝의 동-호수/동/호수 꼬리를 제거한다', () => {
    expect(normalizeApt('이편한세상 112-1503')).toBe('이편한세상')
    expect(normalizeApt('롯데캐슬 101동 1502호')).toBe('롯데캐슬')
    expect(normalizeApt('푸르지오 1502호')).toBe('푸르지오')
  })

  it('단지명의 "N단지"는 보존한다 (동/호수가 아님)', () => {
    expect(normalizeApt('목동신시가지아파트14단지 [2026 차]')).toBe('목동신시가지아파트14단지')
  })

  it('빈값/공백은 빈 문자열', () => {
    expect(normalizeApt(null)).toBe('')
    expect(normalizeApt('   ')).toBe('')
  })

  it('aptNameMatches는 공백·표기차를 무시하고 포함 비교', () => {
    expect(aptNameMatches('목동신시가지아파트 8단지', '목동신시가지아파트8단지')).toBe(true)
    expect(aptNameMatches('전혀다른상가', '목동신시가지')).toBe(false)
  })
})
