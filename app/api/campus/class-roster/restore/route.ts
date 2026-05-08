import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const FB_URL = 'https://jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class/months.json'
const CLASS_COLORS = ['#FF6B35','#FF9800','#2196F3','#4CAF50','#9C27B0','#E53935','#00897B','#1565C0','#F57C00','#607D8B']

// Firebase는 배열을 {"0":{...},"1":{...}} 객체로 반환할 수 있음
function toArr<T>(val: unknown): T[] {
  if (!val) return []
  if (Array.isArray(val)) return val as T[]
  if (typeof val === 'object') return Object.values(val) as T[]
  return []
}

function parseKoName(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return ''
  const m = raw.match(/^(.+?)\s*\(/)
  return (m ? m[1] : raw).trim()
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
  const monthsData = await fbRes.json()

  const targetMonths = ['2026년 3월', '2026년 4월', '2026년 5월']

  // 학생 이름→id 맵
  const { data: students } = await service.from('campus_students')
    .select('id, name').eq('campus_id', campusId).eq('is_active', true)
  const stuMap: Record<string, string> = {}
  for (const s of students ?? []) stuMap[s.name] = s.id

  // 기존 삭제
  await service.from('class_sessions').delete().eq('campus_id', campusId).in('month', targetMonths)

  const results: Record<string, { sessions: number; classes: number; enrolled: number; skipped: number }> = {}

  for (const month of targetMonths) {
    const monthData = monthsData[month]
    const sessions = toArr<{ name: string; time?: string; classes?: unknown }>(monthData?.classData?.sessions)
    if (!sessions.length) { results[month] = { sessions: 0, classes: 0, enrolled: 0, skipped: 0 }; continue }

    // 세션 배치 insert
    const sessRows = sessions.map((sess, si) => ({
      campus_id: campusId,
      name: sess.name,
      time_range: (sess.time && sess.time !== '매일') ? sess.time : null,
      month,
      sort_order: si,
    }))
    const { data: newSessions } = await service.from('class_sessions').insert(sessRows).select('id, name')
    if (!newSessions?.length) { results[month] = { sessions: 0, classes: 0, enrolled: 0, skipped: 0 }; continue }

    const sessIdMap: Record<string, string> = {}
    for (const ns of newSessions) sessIdMap[ns.name] = ns.id

    // 반 배치 insert
    type ClsRow = { campus_id: string; session_id: string; level: string; room: string|null; teacher: string|null; color: string; sort_order: number }
    const clsRows: ClsRow[] = []
    // 나중에 수강생 매핑용으로 보관
    const sessClsIndex: Array<{ sessName: string; ci: number; cls: { level: string; teacher?: string; room?: string; students?: unknown } }> = []

    for (const sess of sessions) {
      const classes = toArr<{ level: string; teacher?: string; room?: string; students?: unknown }>(sess.classes)
      for (let ci = 0; ci < classes.length; ci++) {
        const cls = classes[ci]
        clsRows.push({
          campus_id: campusId,
          session_id: sessIdMap[sess.name] ?? '',
          level: cls.level,
          room: cls.room ?? null,
          teacher: cls.teacher ?? null,
          color: CLASS_COLORS[ci % CLASS_COLORS.length],
          sort_order: ci,
        })
        sessClsIndex.push({ sessName: sess.name, ci, cls })
      }
    }

    const { data: newClasses } = await service.from('classes').insert(clsRows).select('id, session_id, sort_order')
    if (!newClasses?.length) { results[month] = { sessions: newSessions.length, classes: 0, enrolled: 0, skipped: 0 }; continue }

    // session_id + sort_order → class DB id
    const clsIdMap: Record<string, string> = {}
    for (const nc of newClasses) clsIdMap[`${nc.session_id}::${nc.sort_order}`] = nc.id

    // 수강생 배치 insert
    type EnrRow = { campus_id: string; class_id: string; student_id: string; arr_schedule: object; dep_schedule: object; is_waitlist: boolean }
    const enrRows: EnrRow[] = []
    let skipCount = 0

    for (const { sessName, ci, cls } of sessClsIndex) {
      const sessId = sessIdMap[sessName]
      if (!sessId) continue
      const clsId = clsIdMap[`${sessId}::${ci}`]
      if (!clsId) continue

      const studs = toArr<{ name?: unknown; arr?: Record<string,string>|null; dep?: Record<string,string>|null; arrLoc?: Record<string,string>|null; depLoc?: Record<string,string>|null }>(cls.students)
      for (const stu of studs) {
        const koName = parseKoName(stu.name)
        if (!koName) continue
        const stuId = stuMap[koName]
        if (!stuId) { skipCount++; continue }
        const arrSchedule: Record<string, string> = {}
        for (const [day, bus] of Object.entries(stu.arr ?? {})) { if (bus) arrSchedule[day] = bus }
        for (const [day, loc] of Object.entries(stu.arrLoc ?? {})) { if (loc) arrSchedule[day + '_loc'] = loc }
        const depSchedule: Record<string, string> = {}
        for (const [day, bus] of Object.entries(stu.dep ?? {})) { if (bus) depSchedule[day] = bus }
        for (const [day, loc] of Object.entries(stu.depLoc ?? {})) { if (loc) depSchedule[day + '_loc'] = loc }
        enrRows.push({
          campus_id: campusId,
          class_id: clsId,
          student_id: stuId,
          arr_schedule: arrSchedule,
          dep_schedule: depSchedule,
          is_waitlist: false,
        })
      }
    }

    // 중복 제거 (같은 class_id+student_id)
    const seen = new Set<string>()
    const dedupedEnrRows = enrRows.filter(r => {
      const key = `${r.class_id}::${r.student_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    let enrollCount = 0
    const insertErrors: string[] = []
    for (let i = 0; i < dedupedEnrRows.length; i += 200) {
      const chunk = dedupedEnrRows.slice(i, i + 200)
      const { error } = await service.from('class_enrollments')
        .upsert(chunk, { onConflict: 'class_id,student_id', ignoreDuplicates: true })
      if (!error) enrollCount += chunk.length
      else insertErrors.push(error.message)
    }

    results[month] = {
      sessions: newSessions.length,
      classes: newClasses.length,
      enrolled: enrollCount,
      skipped: skipCount,
      // @ts-ignore
      errors: insertErrors.length ? insertErrors.slice(0, 3) : undefined,
      total_processed: enrRows.length,
    }
  }

  return NextResponse.json({ ok: true, results })
}
