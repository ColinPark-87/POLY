import { describe, it, expect } from 'vitest'
import { buildScheduleUpdate, detectPerDay, type RosterEditState } from '@/lib/utils/vehicle-schedule'

function base(overrides: Partial<RosterEditState> = {}): RosterEditState {
  return {
    studentId: 'stu1',
    classId: 'cls1',
    direction: 'dep',
    perDay: false,
    bus: '8호차',
    oldBus: '8호차',
    location: '중계역',
    time: '17:10',
    days: ['월', '화', '수', '목', '금'],
    dayBus: {},
    dayLoc: {},
    dayTime: {},
    ...overrides,
  }
}

describe('buildScheduleUpdate — 단일 호차 모드', () => {
  it('기본 정보를 그대로 days/bus_name/location/pickup_time 으로 보낸다', () => {
    const body = buildScheduleUpdate(base())
    expect(body).toEqual({
      action: 'update_enrollment_schedule',
      student_id: 'stu1',
      class_id: 'cls1',
      direction: 'dep',
      days: ['월', '화', '수', '목', '금'],
      bus_name: '8호차',
      old_bus_name: '8호차',
      location: '중계역',
      pickup_time: '17:10',
    })
  })

  it('호차 이동 시 old_bus_name 이 이전 호차로 들어간다', () => {
    const body = buildScheduleUpdate(base({ bus: '2호차', oldBus: '8호차' }))
    expect(body.bus_name).toBe('2호차')
    expect(body.old_bus_name).toBe('8호차')
  })

  it('미배정(bus 빈값)이면 bus_name 은 undefined', () => {
    const body = buildScheduleUpdate(base({ bus: '' }))
    expect(body.bus_name).toBeUndefined()
  })

  it('시간 빈값이면 pickup_time 은 undefined', () => {
    const body = buildScheduleUpdate(base({ time: '' }))
    expect(body.pickup_time).toBeUndefined()
  })

  it('per-day 키는 단일 모드에서 보내지 않는다', () => {
    const body = buildScheduleUpdate(base())
    expect(body.day_buses).toBeUndefined()
    expect(body.day_locations).toBeUndefined()
    expect(body.day_times).toBeUndefined()
  })
})

describe('buildScheduleUpdate — 요일별 호차 모드 (변경 요일만 전송)', () => {
  const allEight = { 월: '8호차', 화: '8호차', 수: '8호차', 목: '8호차', 금: '8호차' }

  it('변경된 요일만 day_buses/locations/times 로 보낸다', () => {
    const body = buildScheduleUpdate(base({
      perDay: true,
      dayBus: { ...allEight, 수: '2호차' },
      dayLoc: { 수: '하계역' },
      dayTime: { 수: '17:30' },
      orig: { dayBus: { ...allEight }, dayLoc: {}, dayTime: {} },
    }))
    expect(body.day_buses).toEqual({ 수: '2호차' })
    expect(body.day_locations).toEqual({ 수: '하계역' })
    expect(body.day_times).toEqual({ 수: '17:30' })
    // 단일 모드 키는 보내지 않는다
    expect(body.days).toBeUndefined()
    expect(body.bus_name).toBeUndefined()
  })

  it('요일 해제(탑승 안 함)는 빈 호차값으로 제거, 다른 요일은 보존', () => {
    const body = buildScheduleUpdate(base({
      perDay: true,
      dayBus: { ...allEight, 수: '' },
      orig: { dayBus: { ...allEight }, dayLoc: {}, dayTime: {} },
    }))
    expect(body.day_buses).toEqual({ 수: '' })
    expect(body.day_locations).toEqual({})
  })

  it('변경 없으면 빈 day_buses (no-op)', () => {
    const body = buildScheduleUpdate(base({
      perDay: true,
      dayBus: { ...allEight },
      orig: { dayBus: { ...allEight }, dayLoc: {}, dayTime: {} },
    }))
    expect(body.day_buses).toEqual({})
    expect(body.day_locations).toEqual({})
    expect(body.day_times).toEqual({})
  })

  it('새 요일 추가 시 장소/시간은 공통값으로 채운다', () => {
    const body = buildScheduleUpdate(base({
      perDay: true,
      location: '중계역', time: '17:10',
      dayBus: { 월: '8호차' },
      orig: { dayBus: {}, dayLoc: {}, dayTime: {} },
    }))
    expect(body.day_buses).toEqual({ 월: '8호차' })
    expect(body.day_locations).toEqual({ 월: '중계역' })
    expect(body.day_times).toEqual({ 월: '17:10' })
  })

  it('orig 미제공이면 현재값 전부를 변경으로 간주', () => {
    const body = buildScheduleUpdate(base({
      perDay: true,
      dayBus: { 월: '8호차', 화: '2호차' },
      location: '중계역', time: '17:10',
    }))
    expect(body.day_buses).toEqual({ 월: '8호차', 화: '2호차' })
    expect(body.day_locations).toEqual({ 월: '중계역', 화: '중계역' })
  })
})

describe('detectPerDay', () => {
  const common = { baseBus: '8호차', baseLoc: '중계역', baseTime: '17:10' }

  it('모든 요일이 동일하면 false', () => {
    expect(detectPerDay({ ...common, days: ['월', '화', '수'], dayBus: {}, dayLoc: {}, dayTime: {} })).toBe(false)
  })

  it('요일별 호차가 다르면 true', () => {
    expect(detectPerDay({ ...common, days: ['월', '수'], dayBus: { 수: '2호차' }, dayLoc: {}, dayTime: {} })).toBe(true)
  })

  it('요일별 장소가 다르면 true', () => {
    expect(detectPerDay({ ...common, days: ['월', '수'], dayBus: {}, dayLoc: { 수: '하계역' }, dayTime: {} })).toBe(true)
  })

  it('요일별 시간이 다르면 true', () => {
    expect(detectPerDay({ ...common, days: ['월', '수'], dayBus: {}, dayLoc: {}, dayTime: { 수: '17:30' } })).toBe(true)
  })

  it('요일이 없으면 false', () => {
    expect(detectPerDay({ ...common, days: [], dayBus: {}, dayLoc: {}, dayTime: {} })).toBe(false)
  })
})
