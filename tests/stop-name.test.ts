import { describe, it, expect } from 'vitest'
import { normStop, sameStop, canonHanjin } from '@/lib/utils/stop-name'

describe('normStop', () => {
  it('내부 이중공백을 한 칸으로 합친다', () => {
    expect(normStop('한진그랑빌  109동')).toBe('한진그랑빌 109동')
    expect(normStop('한진그랑빌   103   동')).toBe('한진그랑빌 103 동')
  })
  it('양끝 공백 제거', () => {
    expect(normStop('  중계역 ')).toBe('중계역')
  })
  it('null/undefined → 빈 문자열', () => {
    expect(normStop(null)).toBe('')
    expect(normStop(undefined)).toBe('')
  })
})

describe('sameStop', () => {
  it('공백 차이만 있으면 같다', () => {
    expect(sameStop('한진그랑빌  109동', '한진그랑빌 109동')).toBe(true)
  })
  it('동 번호 다르면 다르다', () => {
    expect(sameStop('한진그랑빌 109동', '한진그랑빌 103동')).toBe(false)
  })
  it('빈 문자열끼리는 같다고 보지 않는다', () => {
    expect(sameStop('', '')).toBe(false)
    expect(sameStop(null, undefined)).toBe(false)
  })
})

describe('canonHanjin', () => {
  it('이중공백 → 한 칸', () => {
    expect(canonHanjin('한진그랑빌  109동')).toBe('한진그랑빌 109동')
    expect(canonHanjin('한진그랑빌  103동')).toBe('한진그랑빌 103동')
  })
  it('동 누락 → 동 추가', () => {
    expect(canonHanjin('한진그랑빌 103')).toBe('한진그랑빌 103동')
  })
  it('공백 없음 → 정규화', () => {
    expect(canonHanjin('한진그랑빌109동')).toBe('한진그랑빌 109동')
  })
  it('동 번호가 다르면 별개로 유지', () => {
    expect(canonHanjin('한진그랑빌 103동')).not.toBe(canonHanjin('한진그랑빌 109동'))
  })
  it('이미 표준형은 그대로', () => {
    expect(canonHanjin('한진그랑빌 109동')).toBe('한진그랑빌 109동')
  })
  it('번호-동 패턴이 아니면 공백 정규화만(강제 동 안 붙임)', () => {
    expect(canonHanjin('한진그랑빌  정문')).toBe('한진그랑빌 정문')
  })
})
