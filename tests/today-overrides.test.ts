import { describe, it, expect } from 'vitest'
import { selectOrphanOverrides, buildSynthEntry, type OverrideRow } from '@/lib/utils/today-overrides'

const ov = (o: Partial<OverrideRow> & { student_id: string }): OverrideRow => ({
  bus_name: '5호차', is_absent: false, location: null, pickup_time: null, ...o,
})

describe('selectOrphanOverrides', () => {
  it('안 그려진 비결석+호차지정 override만 고른다', () => {
    const overrides = [ov({ student_id: 'a' }), ov({ student_id: 'b' })]
    const rendered = new Set<string>() // 아무도 안 그려짐
    expect(selectOrphanOverrides(overrides, rendered).map(o => o.student_id)).toEqual(['a', 'b'])
  })

  it('이미 그려진 학생(등록 후 override 이동 포함)은 제외 → 중복 방지', () => {
    const overrides = [ov({ student_id: 'a' }), ov({ student_id: 'b' })]
    const rendered = new Set(['a']) // a는 enrollment로 이미 그려짐
    expect(selectOrphanOverrides(overrides, rendered).map(o => o.student_id)).toEqual(['b'])
  })

  it('결석 override는 합성하지 않는다', () => {
    const overrides = [ov({ student_id: 'a', is_absent: true, bus_name: null }), ov({ student_id: 'b' })]
    expect(selectOrphanOverrides(overrides, new Set()).map(o => o.student_id)).toEqual(['b'])
  })

  it('호차 미지정(bus_name null) override는 제외', () => {
    const overrides = [ov({ student_id: 'a', bus_name: null }), ov({ student_id: 'b' })]
    expect(selectOrphanOverrides(overrides, new Set()).map(o => o.student_id)).toEqual(['b'])
  })

  it('빈 목록이면 빈 결과', () => {
    expect(selectOrphanOverrides([], new Set())).toEqual([])
  })
})

describe('buildSynthEntry', () => {
  it('override + 학생정보 → 오늘 요일만 켜진 합성 entry', () => {
    const e = buildSynthEntry(
      ov({ student_id: 'a', location: '중계역', pickup_time: '17:10' }),
      { name: '홍길동', english_name: 'Gildong' },
      '목',
    )
    expect(e).toEqual({
      student_id: 'a', class_id: '', name: '홍길동', english_name: 'Gildong',
      override: true, location: '중계역', days: ['목'], busByDay: {}, dayLocs: {},
      pickup_time: '17:10', is_bangwaHu: false,
    })
  })

  it('정류장/시간 미지정이면 null', () => {
    const e = buildSynthEntry(ov({ student_id: 'a' }), { name: '김철수', english_name: null }, '월')
    expect(e.location).toBeNull()
    expect(e.pickup_time).toBeNull()
    expect(e.days).toEqual(['월'])
  })
})
