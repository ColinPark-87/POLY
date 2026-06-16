import { describe, it, expect } from 'vitest'
import { buildScheduleUpdate, detectPerDay, applyEnrollmentSchedule, applyBulkTimeToSchedule, type RosterEditState } from '@/lib/utils/vehicle-schedule'

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

describe('applyEnrollmentSchedule — 서버 스케줄 변형', () => {
  it('단일 호차 전 요일: 공유 _time 으로 통일하고 요일별 _time 제거', () => {
    const out = applyEnrollmentSchedule(
      { 월: '8호차', 화: '8호차', 수: '8호차', 수_time: '17:30' },
      { days: ['월', '화', '수'], bus_name: '8호차', old_bus_name: '8호차', location: '중계역', pickup_time: '17:10' },
    )
    expect(out['_time']).toBe('17:10')
    expect(out['수_time']).toBeUndefined()
  })

  // 회귀: 조준우 유치부 하원 — 한 학생이 요일별로 다른 호차를 타는 경우
  // (수=2호차/15:03, 월·금=5호차/15:22). 5호차를 나중에 저장해도 수요일 15:03 이 보존돼야 한다.
  it('요일별 다른 호차: 5호차(월·금)를 저장해도 수요일(2호차) 시간이 덮어써지지 않는다', () => {
    // 1) 먼저 2호차(수) 15:03 저장
    let sched = applyEnrollmentSchedule(
      {},
      { days: ['수'], bus_name: '2호차', old_bus_name: '2호차', location: '중계1동 주민센터 건너편', pickup_time: '15:03' },
    )
    expect(sched['수']).toBe('2호차')
    // otherDays 없음 → 공유 _time
    expect(sched['_time']).toBe('15:03')

    // 2) 이어서 5호차(월·금) 15:22 저장 — 이때 수요일 배정이 이미 존재
    sched = applyEnrollmentSchedule(
      sched,
      { days: ['월', '금'], bus_name: '5호차', old_bus_name: '5호차', location: '신내 진로A 버스정류장', pickup_time: '15:22' },
    )

    // 수요일은 여전히 2호차 / 15:03, 월·금은 5호차 / 15:22
    expect(sched['수']).toBe('2호차')
    expect(sched['수_time']).toBe('15:03')
    expect(sched['월']).toBe('5호차')
    expect(sched['금']).toBe('5호차')
    expect(sched['월_time']).toBe('15:22')
    expect(sched['금_time']).toBe('15:22')
    // 요일별 모드로 전환 → 공유 _time 은 비어야 한다(섞이면 화면 시간 어긋남)
    expect(sched['_time']).toBeUndefined()
  })

  it('요일별 다른 호차: 반대 순서(2호차를 나중에 저장)에도 월·금 시간이 보존된다', () => {
    let sched = applyEnrollmentSchedule(
      {},
      { days: ['월', '금'], bus_name: '5호차', old_bus_name: '5호차', location: '신내 진로A', pickup_time: '15:22' },
    )
    expect(sched['_time']).toBe('15:22')
    sched = applyEnrollmentSchedule(
      sched,
      { days: ['수'], bus_name: '2호차', old_bus_name: '2호차', location: '중계1동 주민센터 건너편', pickup_time: '15:03' },
    )
    expect(sched['월_time']).toBe('15:22')
    expect(sched['금_time']).toBe('15:22')
    expect(sched['수_time']).toBe('15:03')
    expect(sched['_time']).toBeUndefined()
  })

  it('요일별 day_times 저장 시에도 dayList 밖 다른 호차 시간을 보존한다', () => {
    // 수=2호차 15:03(공유 _time) 상태에서, 5호차(월·금)를 요일별 시간으로 저장
    let sched = applyEnrollmentSchedule(
      {},
      { days: ['수'], bus_name: '2호차', old_bus_name: '2호차', location: '중계1동', pickup_time: '15:03' },
    )
    sched = applyEnrollmentSchedule(sched, {
      days: ['월', '금'],
      bus_name: '5호차',
      old_bus_name: '5호차',
      location: '신내',
      day_locations: { 월: '신내', 금: '신내' },
      day_times: { 월: '15:22', 금: '15:22' },
    })
    expect(sched['수_time']).toBe('15:03')
    expect(sched['월_time']).toBe('15:22')
    expect(sched['_time']).toBeUndefined()
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

describe('applyBulkTimeToSchedule — 호차 시간 일괄변경 (요일별 다른 호차 보존)', () => {
  it('요일별 다른 호차: 한 호차 시간 변경이 다른 호차 요일 시간을 덮어쓰지 않는다 (한휘 버그)', () => {
    // 월=3호차, 화수목금=6호차. 공유 _time 17:00.
    const sched = {
      월: '3호차', 화: '6호차', 수: '6호차', 목: '6호차', 금: '6호차',
      _time: '17:00',
      월_loc: '성원A', 화_loc: '청구3차', 수_loc: '청구3차', 목_loc: '청구3차', 금_loc: '청구3차',
    }
    const out = applyBulkTimeToSchedule(sched, '3호차', '성원A', '15:06')
    // 3호차(월)만 15:06, 6호차(화수목금)는 기존 17:00 보존, 공유 _time 제거
    expect(out['월_time']).toBe('15:06')
    expect(out['화_time']).toBe('17:00')
    expect(out['금_time']).toBe('17:00')
    expect(out['_time']).toBeUndefined()
    // 호차 배정은 그대로
    expect(out['월']).toBe('3호차')
    expect(out['화']).toBe('6호차')
  })

  it('단일 호차 전 요일: 공유 _time 으로 통일하고 요일별 시간 제거', () => {
    const sched = { 월: '3호차', 화: '3호차', 수: '3호차', _time: '17:00' }
    const out = applyBulkTimeToSchedule(sched, '3호차', null, '15:06')
    expect(out['_time']).toBe('15:06')
    expect(out['월_time']).toBeUndefined()
    expect(out['월']).toBe('3호차')
  })

  it('해당 호차를 안 타면 변경 없음', () => {
    const sched = { 월: '6호차', _time: '17:00' }
    const out = applyBulkTimeToSchedule(sched, '3호차', null, '15:06')
    expect(out['_time']).toBe('17:00')
  })

  it('위치 필터: 같은 호차라도 다른 위치 요일은 시간 보존', () => {
    const sched = { 월: '3호차', 화: '3호차', _time: '17:00', 월_loc: '성원A', 화_loc: '선덕사거리' }
    const out = applyBulkTimeToSchedule(sched, '3호차', '성원A', '15:06')
    expect(out['월_time']).toBe('15:06')   // 성원A
    expect(out['화_time']).toBe('17:00')   // 선덕사거리 보존
    expect(out['_time']).toBeUndefined()
  })
})
