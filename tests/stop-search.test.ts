import { describe, it, expect } from 'vitest'
import { buildStopSearchResults, getRunLabel } from '@/lib/utils/stop-search'

const mockGroups = [
  {
    group: {
      session_name: '매일반',
      time_range: '08:10~14:30',
      busMap: {
        '1호차': [
          { student_id: 's1', name: '홍길동', location: '동아청솔', pickup_time: '14:30', days: ['월','화','수','목','금'] },
          { student_id: 's2', name: '김철수', location: '동아청솔', pickup_time: '14:35', days: ['월','화','수','목','금'] },
          { student_id: 's3', name: '이영희', location: '중계역', pickup_time: '14:45', days: ['월','화','수','목','금'] },
        ],
        '2호차': [
          { student_id: 's4', name: '박민수', location: '동아청솔', pickup_time: '14:20', days: ['월','화','수','목','금'] },
        ],
      },
    },
    dir: 'dep' as const,
  },
  {
    group: {
      session_name: '유치부',
      time_range: '08:00~13:00',
      busMap: {
        '1호차': [
          { student_id: 's5', name: '최지우', location: '동아청솔', pickup_time: '08:10', days: ['월','화','수','목','금'] },
        ],
      },
    },
    dir: 'arr' as const,
  },
]

describe('buildStopSearchResults', () => {
  it('빈 쿼리면 빈 배열 반환', () => {
    expect(buildStopSearchResults(mockGroups, '')).toHaveLength(0)
  })

  it('동아청솔 검색 시 3개 행 반환 (1호차 dep, 2호차 dep, 1호차 arr)', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    expect(rows).toHaveLength(3)
  })

  it('중계역은 동아청솔 검색에 포함되지 않음', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    expect(rows.every(r => r.stopName === '동아청솔')).toBe(true)
  })

  it('1호차 dep 행: count=2, time=14:30 (가장 이른 시간)', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '1호차' && r.dir === 'dep')
    expect(row).toBeDefined()
    expect(row!.count).toBe(2)
    expect(row!.time).toBe('14:30')
  })

  it('2호차 dep 행: count=1, time=14:20', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '2호차' && r.dir === 'dep')
    expect(row).toBeDefined()
    expect(row!.count).toBe(1)
    expect(row!.time).toBe('14:20')
  })

  it('1호차 arr 행: count=1, time=08:10', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '1호차' && r.dir === 'arr')
    expect(row).toBeDefined()
    expect(row!.count).toBe(1)
    expect(row!.time).toBe('08:10')
  })

  it('부분 문자열 매칭: "청솔"로도 동아청솔 검색됨', () => {
    const rows = buildStopSearchResults(mockGroups, '청솔')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].stopName).toBe('동아청솔')
  })

  it('앞뒤 공백 무시: " 동아청솔 "도 매칭', () => {
    const rows = buildStopSearchResults(mockGroups, ' 동아청솔 ')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('dep 행이 arr 행보다 먼저 정렬', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const firstArrIdx = rows.findIndex(r => r.dir === 'arr')
    const lastDepIdx = rows.map((r, i) => r.dir === 'dep' ? i : -1).filter(i => i >= 0).pop() ?? -1
    expect(lastDepIdx).toBeLessThan(firstArrIdx)
  })

  it('중계역 검색 시 1개 행 반환', () => {
    const rows = buildStopSearchResults(mockGroups, '중계역')
    expect(rows).toHaveLength(1)
    expect(rows[0].busName).toBe('1호차')
    expect(rows[0].dir).toBe('dep')
  })
})

describe('getRunLabel', () => {
  it('매일반 dep → 매일반', () => expect(getRunLabel('매일반', 'dep')).toBe('매일반'))
  it('유치부 arr → 유치부', () => expect(getRunLabel('유치부', 'arr')).toBe('유치부'))
  it('월수금반 → 3일반', () => expect(getRunLabel('월수금반', 'dep')).toBe('3일반'))
  it('화목반 → 2일반', () => expect(getRunLabel('화목반', 'dep')).toBe('2일반'))
  it('유치부 방과후 dep → 유치부', () => expect(getRunLabel('유치부 방과후', 'dep')).toBe('유치부'))
  it('방과후 dep → 매일반', () => expect(getRunLabel('방과후', 'dep')).toBe('매일반'))
  it('방과후 arr → 방과후', () => expect(getRunLabel('방과후', 'arr')).toBe('방과후'))
})
