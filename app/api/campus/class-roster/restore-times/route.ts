import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const FB_URL = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class.json'

function toArr<T>(val: unknown): T[] {
  if (!val) return []
  if (Array.isArray(val)) return val as T[]
  if (typeof val === 'object') return Object.values(val) as T[]
  return []
}

function parseKoName(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return ''
  const name = raw.replace(/[\s]*[\(（\[].+$/, '').trim()
  return name.length >= 2 ? name : ''
}

// "3:08" → "15:08", "08:40" → "08:40"
function normalizeTimeStr(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return t
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function normalizeTimeMin(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return -1
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}

// Firebase 섹션명 → 유형 ('유치부' | '매일반' | '3일반' | '2일반')
function getSectionType(name: string): string {
  if (name.includes('유치부')) return '유치부'
  if (name.includes('매일반')) return '매일반'
  if (name.includes('3일반')) return '3일반'
  if (name.includes('2일반')) return '2일반'
  return ''
}

// Supabase 세션명 → 유형 (방과후 = 유치부 섹션에 포함)
function getSessionType(name: string): string {
  if (name.includes('방과후')) return '유치부'
  if (name.includes('유치부')) return '유치부'
  if (name.includes('매일반')) return '매일반'
  if (name.includes('월수금') || name.includes('3일반')) return '3일반'
  if (name.includes('화목') || name.includes('2일반')) return '2일반'
  return ''
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const fbRes = await fetch(FB_URL)
  if (!fbRes.ok) return NextResponse.json({ error: 'Firebase 연결 실패' }, { status: 500 })
  const fbData = await fbRes.json()
  const monthsData: Record<string, unknown> = fbData.months ?? {}

  const targetMonths = ['2026년 3월', '2026년 4월', '2026년 5월']

  // 학생 이름→id 맵
  const { data: students } = await service.from('campus_students')
    .select('id, name').eq('campus_id', campusId).eq('is_active', true)
  const stuMap: Record<string, string> = {}
  for (const s of students ?? []) stuMap[s.name] = s.id

  const results: Record<string, {
    updated: number; skipped_no_student: number; skipped_no_time: number; skipped_no_enr: number
  }> = {}

  for (const month of targetMonths) {
    const md = monthsData[month] as Record<string, unknown> | undefined
    if (!md) {
      results[month] = { updated: 0, skipped_no_student: 0, skipped_no_time: 0, skipped_no_enr: 0 }
      continue
    }

    // ① 세션/반/수강 조회 (busRoutes 처리 전에 먼저)
    const { data: sessions } = await service.from('class_sessions')
      .select('id, name').eq('campus_id', campusId).eq('month', month)
    const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)
    if (!sessionIds.length) {
      results[month] = { updated: 0, skipped_no_student: 0, skipped_no_time: 0, skipped_no_enr: 0 }
      continue
    }

    const sessionNameMap: Record<string, string> = {}
    for (const s of sessions ?? []) sessionNameMap[s.id] = s.name

    const { data: classes } = await service.from('classes').select('id, session_id').in('session_id', sessionIds)
    const classIds = (classes ?? []).map((c: { id: string }) => c.id)
    const classSessionMap: Record<string, string> = {}
    for (const c of classes ?? []) classSessionMap[c.id] = c.session_id

    if (!classIds.length) {
      results[month] = { updated: 0, skipped_no_student: 0, skipped_no_time: 0, skipped_no_enr: 0 }
      continue
    }

    const { data: enrollments } = await service.from('class_enrollments')
      .select('student_id, class_id, arr_schedule, dep_schedule')
      .in('class_id', classIds).eq('is_waitlist', false)

    // ② 학생별 세션 유형 맵 — 이름 충돌 방지 핵심
    // 예: 유치부 김준서 → '유치부', 초등부 김준서 → '2일반'
    const stuSessionType: Record<string, string> = {}
    for (const enr of enrollments ?? []) {
      const sessId = classSessionMap[enr.class_id]
      const sessName = sessId ? sessionNameMap[sessId] ?? '' : ''
      if (!stuSessionType[enr.student_id]) {
        stuSessionType[enr.student_id] = getSessionType(sessName)
      }
    }

    // ③ busRoutes 처리
    const br = toArr<{ name?: string; buses?: unknown }>(md.busRoutes)
    const timeMap: Record<string, { arr_time?: string; dep_time?: string }> = {}
    let skipNoStu = 0, skipNoTime = 0

    for (const sec of br) {
      const secName = sec.name ?? ''
      const isArr = secName.includes('등원')
      const isDep = secName.includes('하원')
      if (!isArr && !isDep) continue

      const secType = getSectionType(secName)

      const buses = toArr<{ bus?: string; students?: unknown }>(sec.buses)
      for (const bus of buses) {
        const studs = toArr<{ name?: unknown; time?: string }>(bus.students)
        for (const stu of studs) {
          const koName = parseKoName(stu.name)
          if (!koName) continue
          const stuId = stuMap[koName]
          if (!stuId) { skipNoStu++; continue }

          // 세션 유형 불일치 → 건너뜀 (이름 충돌 방지)
          const stuType = stuSessionType[stuId]
          if (stuType && secType && stuType !== secType) continue

          const rawTime = (stu.time ?? '').trim()
          if (!rawTime) { skipNoTime++; continue }

          const time = normalizeTimeStr(rawTime)
          const normMins = normalizeTimeMin(time)

          // 방향별 시간대 검사 (오전<13시=등원, 오후>=13시=하원)
          if (isArr && normMins >= 13 * 60) { skipNoTime++; continue }
          if (isDep && normMins < 13 * 60) { skipNoTime++; continue }

          if (!timeMap[stuId]) timeMap[stuId] = {}
          if (isArr && !timeMap[stuId].arr_time) timeMap[stuId].arr_time = time
          if (isDep && !timeMap[stuId].dep_time) timeMap[stuId].dep_time = time
        }
      }
    }

    // ④ 수강 업데이트 목록 수집
    const toUpdate: { student_id: string; class_id: string; updates: Record<string, Record<string, string>> }[] = []
    let skipNoEnr = 0

    for (const enr of enrollments ?? []) {
      const times = timeMap[enr.student_id]
      if (!times?.arr_time && !times?.dep_time) { skipNoEnr++; continue }

      const updates: Record<string, Record<string, string>> = {}
      if (times?.arr_time) {
        const arr = { ...(enr.arr_schedule ?? {}) } as Record<string, string>
        arr['_time'] = times.arr_time
        updates['arr_schedule'] = arr
      }
      if (times?.dep_time) {
        const dep = { ...(enr.dep_schedule ?? {}) } as Record<string, string>
        dep['_time'] = times.dep_time
        updates['dep_schedule'] = dep
      }
      if (Object.keys(updates).length) toUpdate.push({ student_id: enr.student_id, class_id: enr.class_id, updates })
    }

    // ⑤ 병렬 업데이트 (30개 청크)
    let updated = 0
    const CHUNK = 30
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK)
      const res_chunk = await Promise.all(
        chunk.map(u =>
          service.from('class_enrollments')
            .update(u.updates)
            .eq('student_id', u.student_id).eq('class_id', u.class_id)
        )
      )
      updated += res_chunk.filter(r => !r.error).length
    }

    results[month] = { updated, skipped_no_student: skipNoStu, skipped_no_time: skipNoTime, skipped_no_enr: skipNoEnr }
  }

  return NextResponse.json({ ok: true, results })
}
