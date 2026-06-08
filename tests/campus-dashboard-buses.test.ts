import { describe, it, expect } from 'vitest'
import { computeNoShuttleByGroup, NO_SHUTTLE_BUS, type DashEnr } from '@/lib/campus-dashboard-buses'

const GROUPS = ['유치부', '매일반', '3일반', '2일반'] as const
const full = (bus: string) => ({ 월: bus, 화: bus, 수: bus, 목: bus, 금: bus })

describe('computeNoShuttleByGroup', () => {
  it('실탑승 학생은 차량안탐으로 잡히지 않는다', () => {
    const enrs: DashEnr[] = [
      { student_id: 'a', group: '유치부', arr_schedule: full('1호차'), dep_schedule: full('1호차') },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['유치부']).toBeUndefined()
    expect(r.dep['유치부']).toBeUndefined()
  })

  it('운행 그룹에서 빈값(없음) 학생은 차량안탐으로 집계된다', () => {
    const enrs: DashEnr[] = [
      { student_id: 'rider', group: '유치부', arr_schedule: full('1호차'), dep_schedule: full('1호차') }, // 그룹 운행요일 확정
      { student_id: 'none', group: '유치부', arr_schedule: {}, dep_schedule: {} },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['유치부']).toEqual({ 월: 1, 화: 1, 수: 1, 목: 1, 금: 1 })
    expect(r.dep['유치부']).toEqual({ 월: 1, 화: 1, 수: 1, 목: 1, 금: 1 })
  })

  it('복수 enrollment: 다른 반에서 실탑승하면 그 요일은 차량안탐 아님', () => {
    const enrs: DashEnr[] = [
      { student_id: 'x', group: '유치부', arr_schedule: {}, dep_schedule: {} },              // 빈값
      { student_id: 'x', group: '유치부', arr_schedule: full('2호차'), dep_schedule: full('2호차') }, // 실제 탑승
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['유치부']).toBeUndefined()
    expect(r.dep['유치부']).toBeUndefined()
  })

  it('요일제 그룹은 운행하지 않는 요일을 집계하지 않는다 (2일반=화목)', () => {
    const enrs: DashEnr[] = [
      { student_id: 'rider', group: '2일반', arr_schedule: { 화: '3호차', 목: '3호차' }, dep_schedule: { 화: '3호차', 목: '3호차' } },
      { student_id: 'none', group: '2일반', arr_schedule: {}, dep_schedule: {} },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['2일반']).toEqual({ 월: 0, 화: 1, 수: 0, 목: 1, 금: 0 })
    expect(r.dep['2일반']).toEqual({ 월: 0, 화: 1, 수: 0, 목: 1, 금: 0 })
  })

  it('방향 독립: 등원만 타고 하원 안 타면 하원만 차량안탐', () => {
    const enrs: DashEnr[] = [
      { student_id: 'a', group: '매일반', arr_schedule: full('1호차'), dep_schedule: {} },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    // 등원은 실탑승 → arr 없음. 하원은 빈값 + 그룹 운행요일(등원으로 월~금 확정)
    expect(r.arr['매일반']).toBeUndefined()
    expect(r.dep['매일반']).toEqual({ 월: 1, 화: 1, 수: 1, 목: 1, 금: 1 })
  })

  it('운행이 전혀 없는 그룹은 집계 대상 없음(운행요일 0)', () => {
    const enrs: DashEnr[] = [
      { student_id: 'a', group: '3일반', arr_schedule: {}, dep_schedule: {} },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['3일반']).toBeUndefined()
    expect(r.dep['3일반']).toBeUndefined()
  })

  it('_loc 접미 키와 빈 문자열은 실탑승으로 보지 않는다', () => {
    const enrs: DashEnr[] = [
      { student_id: 'rider', group: '유치부', arr_schedule: full('1호차'), dep_schedule: full('1호차') },
      { student_id: 'q', group: '유치부', arr_schedule: { 월: '', 월_loc: '어딘가' } as Record<string, string>, dep_schedule: {} },
    ]
    const r = computeNoShuttleByGroup(enrs, GROUPS)
    expect(r.arr['유치부']?.월).toBe(1)
    expect(NO_SHUTTLE_BUS).toBe('차량안탐')
  })
})
