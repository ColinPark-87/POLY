import { describe, it, expect } from 'vitest'
import { normStop, sameStop, canonHanjin, splitLocTime, renameStopInSchedule } from '@/lib/utils/stop-name'

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

describe('splitLocTime', () => {
  it('시간 프리픽스 분리 + 프리픽스 보존', () => {
    expect(splitLocTime('08:57 중계1동 어린이집')).toEqual({ prefix: '08:57 ', name: '중계1동 어린이집' })
  })
  it('시간 범위(08:57~09:10) 프리픽스도 분리', () => {
    expect(splitLocTime('08:57~09:10 중계역')).toEqual({ prefix: '08:57~09:10 ', name: '중계역' })
  })
  it('시간 없으면 prefix 빈 문자열', () => {
    expect(splitLocTime('중계역')).toEqual({ prefix: '', name: '중계역' })
  })
  it('null → 빈 값', () => {
    expect(splitLocTime(null)).toEqual({ prefix: '', name: '' })
  })
})

describe('renameStopInSchedule', () => {
  it('정확일치 정류장명을 모든 요일에서 치환', () => {
    const { sched, changed } = renameStopInSchedule(
      { 월: '4호차', 월_loc: '중계역', 수: '4호차', 수_loc: '중계역' }, '중계역', '중계역 2번출구')
    expect(changed).toBe(true)
    expect(sched.월_loc).toBe('중계역 2번출구')
    expect(sched.수_loc).toBe('중계역 2번출구')
  })
  it('시간 프리픽스가 붙어 있어도 정류장명만 치환하고 시간은 보존', () => {
    const { sched, changed } = renameStopInSchedule(
      { 월_loc: '08:57 중계1동 어린이집' }, '중계1동 어린이집', '중계1동 행복어린이집')
    expect(changed).toBe(true)
    expect(sched.월_loc).toBe('08:57 중계1동 행복어린이집')
  })
  it('이중공백 차이를 무시하고 매칭', () => {
    const { sched, changed } = renameStopInSchedule(
      { 화_loc: '한진그랑빌  109동' }, '한진그랑빌 109동', '한진그랑빌 109동 정문')
    expect(changed).toBe(true)
    expect(sched.화_loc).toBe('한진그랑빌 109동 정문')
  })
  it('일치하는 정류장이 없으면 changed=false, 원본 유지', () => {
    const { sched, changed } = renameStopInSchedule({ 월_loc: '중계역' }, '하계역', '하계역 2번')
    expect(changed).toBe(false)
    expect(sched.월_loc).toBe('중계역')
  })
  it('다른 정류장은 건드리지 않음', () => {
    const { sched } = renameStopInSchedule(
      { 월_loc: '중계역', 화_loc: '하계역' }, '중계역', '중계역 2번출구')
    expect(sched.화_loc).toBe('하계역')
  })
})
