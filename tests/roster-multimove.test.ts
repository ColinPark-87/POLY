import { describe, it, expect } from 'vitest'
import {
  toggleSelection,
  rangeIds,
  applyRange,
  partitionBulkMove,
  type BulkCandidate,
} from '@/lib/utils/roster-multimove'

describe('toggleSelection', () => {
  it('없으면 추가, 있으면 제거', () => {
    expect([...toggleSelection(new Set(), 'a')]).toEqual(['a'])
    expect([...toggleSelection(new Set(['a', 'b']), 'b')]).toEqual(['a'])
  })
  it('원본 Set을 변형하지 않는다', () => {
    const src = new Set(['a'])
    toggleSelection(src, 'b')
    expect([...src]).toEqual(['a'])
  })
})

describe('rangeIds', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('anchor~target 양끝 포함 범위', () => {
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
  })
  it('역방향도 동일 범위', () => {
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })
  it('anchor 없으면 target 하나', () => {
    expect(rangeIds(order, null, 'c')).toEqual(['c'])
  })
  it('anchor가 목록 밖이면 target 하나', () => {
    expect(rangeIds(order, 'zzz', 'c')).toEqual(['c'])
  })
  it('target이 목록 밖이면 빈 배열', () => {
    expect(rangeIds(order, 'a', 'zzz')).toEqual([])
  })
})

describe('applyRange', () => {
  it('기존 선택에 범위를 합집합', () => {
    const order = ['a', 'b', 'c', 'd']
    const result = applyRange(new Set(['z']), order, 'b', 'd')
    expect([...result].sort()).toEqual(['b', 'c', 'd', 'z'])
  })
})

describe('partitionBulkMove', () => {
  const cands: BulkCandidate[] = [
    { id: 'e1', student_id: 's1', class_id: 'cFrom', name: '김하나' },
    { id: 'e2', student_id: 's2', class_id: 'cFrom', name: '이두리' },
    { id: 'e3', student_id: 's3', class_id: 'cTarget', name: '박세찌' }, // 이미 대상 반
  ]

  it('정상 학생은 모두 movable', () => {
    const { movable, skipped } = partitionBulkMove(cands, ['e1', 'e2'], 'cTarget', [])
    expect(movable.map(m => m.id)).toEqual(['e1', 'e2'])
    expect(skipped).toEqual([])
  })

  it('이미 대상 반 소속이면 건너뜀', () => {
    const { movable, skipped } = partitionBulkMove(cands, ['e1', 'e3'], 'cTarget', [])
    expect(movable.map(m => m.id)).toEqual(['e1'])
    expect(skipped).toEqual([{ id: 'e3', name: '박세찌', reason: '이미 대상 반' }])
  })

  it('대상 반에 같은 학생이 이미 있으면 건너뜀', () => {
    const { movable, skipped } = partitionBulkMove(cands, ['e1'], 'cTarget', ['s1'])
    expect(movable).toEqual([])
    expect(skipped[0]).toMatchObject({ id: 'e1', reason: '대상 반에 중복' })
  })

  it('후보에 없는 id(타 캠퍼스/삭제)는 건너뜀', () => {
    const { movable, skipped } = partitionBulkMove(cands, ['eX'], 'cTarget', [])
    expect(movable).toEqual([])
    expect(skipped).toEqual([{ id: 'eX', reason: '없음/권한' }])
  })

  it('같은 학생의 enrollment가 둘 이상이면 한 명만 이동', () => {
    const dup: BulkCandidate[] = [
      { id: 'e1', student_id: 's1', class_id: 'cFrom', name: '김하나' },
      { id: 'e1b', student_id: 's1', class_id: 'cFrom2', name: '김하나' },
    ]
    const { movable, skipped } = partitionBulkMove(dup, ['e1', 'e1b'], 'cTarget', [])
    expect(movable.map(m => m.id)).toEqual(['e1'])
    expect(skipped[0]).toMatchObject({ id: 'e1b', reason: '대상 반에 중복' })
  })
})
