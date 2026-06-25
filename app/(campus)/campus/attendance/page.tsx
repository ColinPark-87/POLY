'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance } from '@/lib/attendance'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'

const SESS_COLORS: Record<string, string> = {
  '유치부': '#FF6B35', '유치부 방과후': '#FF9800',
  '초등부 매일반': '#2196F3', '초등부 월수금': '#4CAF50',
  '초등부 화목': '#9C27B0', '초등부': '#2196F3',
  '중등부': '#2E7D32', '고등부': '#6A1B9A',
}
const FALLBACK_COLORS = ['#FF6B35','#2196F3','#4CAF50','#9C27B0','#E53935','#00897B','#F57C00','#607D8B']
function sessColor(name: string, idx: number) {
  if (SESS_COLORS[name]) return SESS_COLORS[name]
  for (const key of Object.keys(SESS_COLORS)) { if (name.includes(key)) return SESS_COLORS[key] }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

type LocalStatus = 'present' | 'absent' | 'late' | 'pre_absent'

// 각 버튼 스타일: off(기본) / on(선택)
const BTN_OFF = 'border border-[#E2E8F0] text-[#94A3B8] bg-white'
const BTN_ON: Record<LocalStatus, string> = {
  present:    'border border-[#10B981] text-white bg-[#10B981]',
  absent:     'border border-[#DC2626] text-white bg-[#DC2626]',
  late:       'border border-[#D97706] text-white bg-[#D97706]',
  pre_absent: 'border border-[#7C3AED] text-white bg-[#7C3AED]',
}
const BTN_LABELS: { status: LocalStatus; label: string }[] = [
  { status: 'present',    label: '출석' },
  { status: 'absent',     label: '결석' },
  { status: 'late',       label: '지각' },
  { status: 'pre_absent', label: '사전' },
]

const UI_STATUS_STYLE: Record<string, string> = {
  '미도래': 'bg-white/20 text-white/70',
  '대기중': 'bg-blue-100 text-blue-700',
  '완료':   'bg-green-100 text-green-700',
}

interface StudentLocal {
  student_id: string
  name: string
  english_name: string | null
  status: LocalStatus
  note: string
}

interface SessionGroup {
  session_id: string; name: string; time_range: string; color: string
  days: string | null
  classes: ClassWithAttendance[]
}

// classId → map<studentId → {status, note}>
type DraftMap = Map<string, Map<string, { status: LocalStatus; note: string }>>

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftMap>(new Map())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [showPreAbsence, setShowPreAbsence] = useState(false)
  // Tab drag
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [tabOrder, setTabOrder] = useState<string[]>([])

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const loadData = useCallback(async () => {
    const res = await fetch('/api/campus/attendance')
    if (res.ok) {
      const data: ClassWithAttendance[] = await res.json()
      setClasses(data)
      // 현재 시간에 가장 가까운 세션 자동 선택
      setActiveSessionId(prev => {
        if (prev) return prev
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
        // 시작 2분 전 ~ 종료 후까지 진행 중인 세션 우선
        const active = data.find(c => {
          const t = c.class_session_time_range
          if (!t) return false
          const [s, e] = t.split('~').map((x: string) => {
            const [h, m] = x.trim().split(':').map(Number)
            const h24 = h < 9 ? h + 12 : h
            return h24 * 60 + m
          })
          return nowMin >= s - 2 && nowMin <= e
        })
        return active?.class_session_id ?? data[0]?.class_session_id ?? null
      })
      // tabOrder 초기화 (서버 sort_order 반영, 이미 있으면 유지)
      setTabOrder(prev => {
        const ids = [...new Set(data.map(c => c.class_session_id))]
        if (prev.length === ids.length && prev.every(id => ids.includes(id))) return prev
        return ids
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const supabase = createClient()
    const channel = supabase.channel('attendance-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, loadData)
      .subscribe()
    const interval = setInterval(loadData, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [loadData])

  // 세션 그룹 (tabOrder 순서 적용)
  const groupMap = new Map<string, SessionGroup>()
  classes.forEach(c => {
    if (!groupMap.has(c.class_session_id)) {
      groupMap.set(c.class_session_id, {
        session_id: c.class_session_id, name: c.class_session_name,
        time_range: c.class_session_time_range,
        days: (c as any).class_session_days ?? null,
        color: sessColor(c.class_session_name, 0),
        classes: [],
      })
    }
    groupMap.get(c.class_session_id)!.classes.push(c)
  })
  // 색상 순서 재계산
  let colorIdx = 0
  for (const g of groupMap.values()) { g.color = sessColor(g.name, colorIdx++) }

  const sessionGroups = tabOrder.map(id => groupMap.get(id)).filter(Boolean) as SessionGroup[]
  const activeGroup = sessionGroups.find(g => g.session_id === activeSessionId) ?? sessionGroups[0] ?? null

  // 학생 로컬 상태 (draft 없으면 서버값 사용)
  function getStudents(classData: ClassWithAttendance): StudentLocal[] {
    const classMap = drafts.get(classData.class_id)
    return classData.students.map(s => {
      const d = classMap?.get(s.student_id)
      const raw = d?.status ?? (s.pre_marked && s.status === 'absent' ? 'pre_absent' : s.status as LocalStatus)
      return {
        student_id: s.student_id,
        name: s.student_name,
        english_name: (s as any).student_english_name ?? null,
        status: raw,
        note: d?.note ?? s.note ?? '',
      }
    })
  }

  function isDirty(classId: string) { return drafts.has(classId) }

  function setStudentStatus(classId: string, studentId: string, status: LocalStatus, note?: string) {
    setDrafts(prev => {
      const next = new Map(prev)
      const classMap = new Map(next.get(classId) ?? [])
      const existing = classMap.get(studentId) ?? { status, note: '' }
      classMap.set(studentId, { status, note: note !== undefined ? note : existing.note })
      next.set(classId, classMap)
      return next
    })
  }

  function setNote(classId: string, studentId: string, note: string) {
    setDrafts(prev => {
      const next = new Map(prev)
      const classMap = new Map(next.get(classId) ?? [])
      const existing = classMap.get(studentId) ?? { status: 'pre_absent' as LocalStatus, note: '' }
      classMap.set(studentId, { ...existing, note })
      next.set(classId, classMap)
      return next
    })
  }

  async function saveClass(classData: ClassWithAttendance) {
    const students = getStudents(classData)
    setSaving(prev => new Set(prev).add(classData.class_id))
    const todayStr = new Date().toISOString().split('T')[0]
    const records = students.map(s => ({
      student_id: s.student_id,
      status: s.status === 'pre_absent' ? 'absent' : s.status,
      pre_marked: s.status === 'pre_absent',
      note: s.note || undefined,
    }))
    await fetch('/api/campus/attendance/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classData.class_id, session_date: todayStr, records, mark_complete: true }),
    })
    setSaving(prev => { const n = new Set(prev); n.delete(classData.class_id); return n })
    setDrafts(prev => { const n = new Map(prev); n.delete(classData.class_id); return n })
    loadData()
  }

  // 탭 드래그 순서 변경
  async function dropTab(targetId: string) {
    if (!dragTabId || dragTabId === targetId) { setDragTabId(null); setDragOverTabId(null); return }
    const newOrder = [...tabOrder]
    const from = newOrder.indexOf(dragTabId)
    const to = newOrder.indexOf(targetId)
    newOrder.splice(from, 1); newOrder.splice(to, 0, dragTabId)
    setTabOrder(newOrder)
    setDragTabId(null); setDragOverTabId(null)
    // DB 업데이트 (class-roster 동일 엔드포인트)
    await fetch('/api/campus/class-roster', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder_sessions', orders: newOrder.map((id, i) => ({ id, sort_order: i })) }),
    })
  }

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>

  return (
    <div className="max-w-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[#1E293B]">출결 관리</h1>
          <p className="text-[#64748B] text-xs mt-0.5">{today}</p>
        </div>
        <button onClick={() => setShowPreAbsence(true)}
          className="bg-[#004EA2] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
          사전 결석 등록
        </button>
      </div>

      {/* 세션 탭 (드래그로 순서 변경) */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4 overflow-x-auto">
        {sessionGroups.map(g => (
          <button key={g.session_id}
            draggable
            onDragStart={() => setDragTabId(g.session_id)}
            onDragOver={e => { e.preventDefault(); setDragOverTabId(g.session_id) }}
            onDragLeave={() => setDragOverTabId(null)}
            onDrop={() => dropTab(g.session_id)}
            onDragEnd={() => { setDragTabId(null); setDragOverTabId(null) }}
            onClick={() => setActiveSessionId(g.session_id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-grab active:cursor-grabbing ${
              dragOverTabId === g.session_id ? 'bg-[#F1F5F9]' : ''
            } ${activeSessionId === g.session_id ? 'border-current' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}
            style={activeSessionId === g.session_id ? { color: g.color, borderColor: g.color } : {}}>
            {g.name}
            <span className="ml-1.5 text-xs opacity-60">{g.classes.length}반</span>
          </button>
        ))}
      </div>

      {/* 활성 세션 */}
      {activeGroup && (
        <>
          {/* 요일 토글 */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-[#64748B]">수업 요일</span>
            {(['월','화','수','목','금'] as const).map(d => {
              const active = activeGroup.days ? activeGroup.days.includes(d) : false
              return (
                <button key={d}
                  onClick={async () => {
                    const cur = activeGroup.days ?? ''
                    const next = active ? cur.replace(d, '') : cur + d
                    await fetch('/api/campus/class-roster', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'update_session', session_id: activeGroup.session_id, days: next || null }),
                    })
                    loadData()
                  }}
                  className={`text-xs font-bold w-8 h-7 rounded transition-colors ${
                    active ? 'text-white' : 'bg-[#F1F5F9] text-[#CBD5E1]'
                  }`}
                  style={active ? { background: activeGroup.color } : {}}
                >{d}</button>
              )
            })}
            {activeGroup.days && (
              <span className="text-xs text-[#94A3B8] ml-1">설정된 요일에만 탭 표시됨</span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            {activeGroup.time_range && (
              <span className="text-xs text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">{activeGroup.time_range}</span>
            )}
            <span className="text-xs text-[#94A3B8]">
              {activeGroup.classes.length}반 · {activeGroup.classes.reduce((n, c) => n + c.students.length, 0)}명
            </span>
            {activeGroup.classes.reduce((n, c) => n + c.absent_count, 0) > 0 && (
              <span className="text-xs text-[#DC2626] font-medium">
                결석 {activeGroup.classes.reduce((n, c) => n + c.absent_count, 0)}명
              </span>
            )}
          </div>

          {/* 5열 그리드 */}
          <div className="grid gap-[6px]" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {activeGroup.classes.map(c => (
              <ClassCard
                key={c.class_id}
                classData={c}
                color={activeGroup.color}
                students={getStudents(c)}
                dirty={isDirty(c.class_id)}
                isSaving={saving.has(c.class_id)}
                onSetStatus={(sid, st) => setStudentStatus(c.class_id, sid, st)}
                onSetNote={(sid, note) => setNote(c.class_id, sid, note)}
                onSave={() => saveClass(c)}
              />
            ))}
          </div>
        </>
      )}

      {sessionGroups.length === 0 && (
        <div className="py-16 text-center text-gray-400">오늘 등록된 수업이 없습니다</div>
      )}

      {showPreAbsence && (
        <PreAbsenceModal classes={classes} onClose={() => setShowPreAbsence(false)}
          onSaved={() => { setShowPreAbsence(false); loadData() }} />
      )}
    </div>
  )
}

function ClassCard({ classData, color, students, dirty, isSaving, onSetStatus, onSetNote, onSave }: {
  classData: ClassWithAttendance
  color: string
  students: StudentLocal[]
  dirty: boolean
  isSaving: boolean
  onSetStatus: (studentId: string, status: LocalStatus) => void
  onSetNote: (studentId: string, note: string) => void
  onSave: () => void
}) {
  const total = students.length
  const absentCount = students.filter(s => s.status === 'absent' || s.status === 'pre_absent').length
  const lateCount = students.filter(s => s.status === 'late').length
  const presentCount = total - absentCount - lateCount

  return (
    <div className="rounded-[9px] border-[1.5px] border-[#E0E0E0] bg-white shadow-sm overflow-hidden">
      {/* 카드 헤더 */}
      <div className="px-1.5 py-1 text-white select-none" style={{ background: color }}>
        <div className="flex items-center gap-0.5">
          <span className="font-extrabold text-[11px] leading-tight truncate flex-1">{classData.class_level}</span>
          <span className="text-[9px] font-bold bg-white/30 px-1 py-px rounded flex-shrink-0">{total}</span>
        </div>
        {classData.ui_status !== '미도래' && (
          <span className={`mt-0.5 inline-block text-[8px] font-bold px-1.5 py-px rounded-full ${UI_STATUS_STYLE[classData.ui_status]}`}>
            {classData.ui_status === '완료' ? `완료 ${presentCount}/${total}` : classData.ui_status}
          </span>
        )}
        {(classData.class_room || classData.class_teacher) && (
          <div className="mt-0.5 space-y-px">
            {classData.class_room && <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate"><span className="opacity-60">교</span><span className="bg-white/15 px-0.5 rounded truncate">{classData.class_room}</span></div>}
            {classData.class_teacher && <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate"><span className="opacity-60">강</span><span className="bg-white/15 px-0.5 rounded truncate">{classData.class_teacher}</span></div>}
          </div>
        )}
      </div>

      {/* 학생 rows — 4버튼 토글 */}
      <div>
        {students.map((s, i) => (
          <div key={s.student_id}
            className="border-b border-[#f0f0f0] px-1.5 py-1"
            style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#ffffff' }}>
            {/* 이름 줄 */}
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[9px] text-[#ccc] w-3 text-right flex-shrink-0">{i + 1}</span>
              <span className="text-xs font-semibold text-[#1a1a1a] leading-tight truncate">{s.name}</span>
              {s.english_name && (
                <span className="text-[9px] text-[#94A3B8] truncate">{s.english_name}</span>
              )}
            </div>
            {/* 4버튼 */}
            <div className="flex gap-0.5 ml-3">
              {BTN_LABELS.map(({ status, label }) => (
                <button
                  key={status}
                  onClick={() => onSetStatus(s.student_id, status)}
                  className={`flex-1 text-[9px] font-bold py-0.5 rounded transition-colors ${s.status === status ? BTN_ON[status] : BTN_OFF}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 사전결석 메모 인라인 */}
            {s.status === 'pre_absent' && (
              <div className="mt-0.5 ml-3">
                <input
                  value={s.note}
                  onChange={e => onSetNote(s.student_id, e.target.value)}
                  placeholder="사유 (선택)"
                  className="w-full text-[9px] border border-[#D8B4FE] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-white"
                />
              </div>
            )}
          </div>
        ))}
        {total === 0 && (
          <div className="h-[28px] flex items-center justify-center text-[#CBD5E1] text-[10px]">수강생 없음</div>
        )}
      </div>

      {/* 저장 버튼 (변경 있을 때만) */}
      {dirty && (
        <div className="px-1.5 py-1.5 border-t border-[#f0f0f0]">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full text-[10px] font-bold py-1 rounded bg-[#004EA2] text-white disabled:opacity-50 hover:bg-blue-800 transition-colors"
          >
            {isSaving ? '저장 중...' : '출석 완료 저장'}
          </button>
        </div>
      )}
    </div>
  )
}
