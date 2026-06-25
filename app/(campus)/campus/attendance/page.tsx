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
  is_today: boolean
  classes: ClassWithAttendance[]
}

// classId → map<studentId → {status, note}>
type DraftMap = Map<string, Map<string, { status: LocalStatus; note: string }>>

export default function AttendancePage() {
  const [pageTab, setPageTab] = useState<'roster' | 'settings'>('roster')
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
      // 오늘 수업 중 현재 시간에 가장 가까운 세션 자동 선택
      setActiveSessionId(prev => {
        if (prev) return prev
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
        const todayClasses = data.filter(c => (c as any).class_session_is_today)
        const active = todayClasses.find(c => {
          const t = c.class_session_time_range
          if (!t) return false
          const [s, e] = t.split('~').map((x: string) => {
            const [h, m] = x.trim().split(':').map(Number)
            const h24 = h < 9 ? h + 12 : h
            return h24 * 60 + m
          })
          return nowMin >= s - 2 && nowMin <= e
        })
        return active?.class_session_id ?? todayClasses[0]?.class_session_id ?? data[0]?.class_session_id ?? null
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
        is_today: (c as any).class_session_is_today ?? true,
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
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-[#1E293B]">출결 관리</h1>
          <p className="text-[#64748B] text-xs mt-0.5">{today}</p>
        </div>
        {pageTab === 'roster' && (
          <button onClick={() => setShowPreAbsence(true)}
            className="bg-[#004EA2] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
            사전 결석 등록
          </button>
        )}
      </div>

      {/* 페이지 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4">
        {([['roster','출결 현황'],['settings','세팅']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pageTab === key ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}>{label}</button>
        ))}
      </div>

      {/* ── 출결 현황 탭 ── */}
      {pageTab === 'roster' && (<>

      {/* 히어로: 전체 세션 요약 */}
      {sessionGroups.length > 0 && (() => {
        const todayGroups = sessionGroups.filter(g => g.is_today)
        const total   = todayGroups.reduce((n, g) => n + g.classes.reduce((m, c) => m + c.students.length, 0), 0)
        const absent  = todayGroups.reduce((n, g) => n + g.classes.reduce((m, c) => m + c.students.filter(s => s.status === 'absent' && !s.pre_marked).length, 0), 0)
        const late    = todayGroups.reduce((n, g) => n + g.classes.reduce((m, c) => m + c.late_count, 0), 0)
        const preAbs  = todayGroups.reduce((n, g) => n + g.classes.reduce((m, c) => m + c.students.filter(s => s.pre_marked && s.status === 'absent').length, 0), 0)
        const present = total - absent - late - preAbs
        return (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: '출석', value: present, color: '#10B981', bg: '#F0FDF4' },
              { label: '결석', value: absent,  color: '#DC2626', bg: '#FEF2F2' },
              { label: '지각', value: late,    color: '#D97706', bg: '#FFFBEB' },
              { label: '사전결석', value: preAbs, color: '#7C3AED', bg: '#FDF4FF' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-xl px-4 py-3 flex flex-col" style={{ background: bg }}>
                <span className="text-xs font-medium mb-1" style={{ color }}>{label}</span>
                <span className="text-2xl font-extrabold" style={{ color }}>{value}</span>
                <span className="text-[10px] mt-0.5" style={{ color, opacity: 0.7 }}>/ {total}명</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* 세션 탭 (드래그로 순서 변경) */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4 overflow-x-auto">
        {sessionGroups.map(g => {
          const isActive = activeSessionId === g.session_id
          const isToday = g.is_today
          return (
            <button key={g.session_id}
              draggable
              onDragStart={() => setDragTabId(g.session_id)}
              onDragOver={e => { e.preventDefault(); setDragOverTabId(g.session_id) }}
              onDragLeave={() => setDragOverTabId(null)}
              onDrop={() => dropTab(g.session_id)}
              onDragEnd={() => { setDragTabId(null); setDragOverTabId(null) }}
              onClick={() => setActiveSessionId(g.session_id)}
              title={!isToday ? '오늘 수업 없는 세션 (클릭해 사전결석 등록 가능)' : ''}
              className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all cursor-grab active:cursor-grabbing ${
                dragOverTabId === g.session_id ? 'bg-[#F1F5F9]' : ''
              } ${isActive ? 'border-current' : 'border-transparent'} ${
                isToday ? '' : 'opacity-35 grayscale'
              }`}
              style={isActive
                ? { color: g.color, borderColor: g.color }
                : isToday ? { color: g.color } : {}
              }>
              {/* 오늘 수업 세션: 탭 이름 아래 컬러 도트 */}
              {isToday && !isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full mb-0.5" style={{ background: g.color }} />
              )}
              {g.name}
              <span className="ml-1.5 text-xs opacity-60">{g.classes.length}반</span>
            </button>
          )
        })}
      </div>

      {/* 활성 세션 */}
      {activeGroup && (
        <>
          {/* 요일 토글 */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-xs text-[#64748B]">수업 요일</span>
            {/* 전체 리셋 버튼 */}
            <button
              onClick={async () => {
                await fetch('/api/campus/class-roster', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'update_session', session_id: activeGroup.session_id, days: null }),
                })
                loadData()
              }}
              className={`text-xs font-bold px-2 h-7 rounded transition-colors ${
                !activeGroup.days ? 'text-white' : 'bg-[#F1F5F9] text-[#94A3B8]'
              }`}
              style={!activeGroup.days ? { background: activeGroup.color } : {}}
            >전체</button>
            {(['월','화','수','목','금'] as const).map(d => {
              // null(전체) 일 때는 모두 활성, 설정된 경우만 개별 체크
              const active = activeGroup.days ? activeGroup.days.includes(d) : false
              return (
                <button key={d}
                  onClick={async () => {
                    const cur = activeGroup.days ?? '월화수목금'
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
            <span className="text-xs text-[#94A3B8] ml-1">
              {activeGroup.days ? `${activeGroup.days} 요일만 표시` : '매일 표시'}
            </span>
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
                sessionDays={activeGroup.days}
                students={getStudents(c)}
                dirty={isDirty(c.class_id)}
                isSaving={saving.has(c.class_id)}
                onSetStatus={(sid, st) => setStudentStatus(c.class_id, sid, st)}
                onSetNote={(sid, note) => setNote(c.class_id, sid, note)}
                onSave={() => saveClass(c)}
                onUpdateDays={async (days) => {
                  await fetch('/api/campus/attendance/class-days', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_id: c.class_id, days }),
                  })
                  loadData()
                }}
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
      </>)}

      {/* ── 세팅 탭 ── */}
      {pageTab === 'settings' && <AttendanceSettings />}
    </div>
  )
}

const DAYS_LIST = ['월','화','수','목','금'] as const

function ClassCard({ classData, color, sessionDays, students, dirty, isSaving, onSetStatus, onSetNote, onSave, onUpdateDays }: {
  classData: ClassWithAttendance
  color: string
  sessionDays: string | null
  students: StudentLocal[]
  dirty: boolean
  isSaving: boolean
  onSetStatus: (studentId: string, status: LocalStatus) => void
  onSetNote: (studentId: string, note: string) => void
  onSave: () => void
  onUpdateDays: (days: string | null) => Promise<void>
}) {
  const [showDays, setShowDays] = useState(false)
  const classDays = (classData as any).class_days as string | null
  // 실제 적용 요일: 반 개별 > 세션 > null(전체)
  const effectiveDays = classDays ?? sessionDays

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
          {/* 요일 설정 토글 버튼 */}
          <button
            onClick={e => { e.stopPropagation(); setShowDays(v => !v) }}
            className="text-[9px] bg-white/20 hover:bg-white/35 px-1 py-px rounded ml-0.5 flex-shrink-0"
            title="반별 요일 설정"
          >요일</button>
        </div>
        {/* 요일 토글 패널 */}
        {showDays && (
          <div className="flex items-center gap-0.5 mt-1 flex-wrap" onClick={e => e.stopPropagation()}>
            {/* 세션 상속 버튼 */}
            <button
              onClick={async () => { await onUpdateDays(null); setShowDays(false) }}
              className={`text-[8px] font-bold px-1 py-px rounded ${!classDays ? 'bg-white text-gray-700' : 'bg-white/20'}`}
              title="세션 요일 상속"
            >{classDays ? '상속' : '✓상속'}</button>
            {DAYS_LIST.map(d => {
              const active = effectiveDays ? effectiveDays.includes(d) : true
              const isOverride = !!classDays
              return (
                <button key={d}
                  onClick={async () => {
                    const cur = classDays ?? effectiveDays ?? '월화수목금'
                    const next = active ? cur.replace(d, '') : cur + d
                    await onUpdateDays(next || null)
                  }}
                  className={`text-[8px] font-bold w-5 h-5 rounded transition-colors ${
                    active
                      ? isOverride ? 'bg-white text-gray-800' : 'bg-white/40'
                      : 'bg-white/10 text-white/40'
                  }`}
                >{d}</button>
              )
            })}
          </div>
        )}
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

// ──────────────────────────────────────────────
// 세팅 탭
// ──────────────────────────────────────────────
interface Classroom { id: string; display_name: string; account_email: string | null; popup_minutes_before: number }
interface SettingsSession { id: string; name: string; time_range: string | null; days: string | null }
interface SettingsClass { id: string; session_id: string; level: string; room: string | null; teacher: string | null; color: string; days: string | null; classroom_id: string | null }

function AttendanceSettings() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [sessions, setSessions] = useState<SettingsSession[]>([])
  const [classes, setClasses] = useState<SettingsClass[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRoom, setEditingRoom] = useState<string | null>(null)
  const [roomDraft, setRoomDraft] = useState<Partial<Classroom>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/campus/attendance/settings')
    if (res.ok) {
      const d = await res.json()
      setClassrooms(d.classrooms ?? [])
      setSessions(d.sessions ?? [])
      setClasses(d.classes ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(body: object) {
    await fetch('/api/campus/attendance/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    load()
  }

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>

  const sessMap = new Map(sessions.map(s => [s.id, s]))
  const unassigned = classes.filter(c => !c.classroom_id)

  return (
    <div>
      {/* 교실 테이블 */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden mb-4">
        {/* 헤더 */}
        <div className="grid grid-cols-[80px_1fr_180px_60px_44px] gap-0 px-3 py-1.5 bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide">
          <span>교실</span><span>배정된 반</span><span>계정</span><span className="text-center">팝업</span><span />
        </div>

        {classrooms.length === 0 && (
          <div className="px-4 py-6 text-xs text-[#94A3B8] text-center">015_classrooms.sql 실행 필요</div>
        )}

        {classrooms.map(room => {
          const roomClasses = classes.filter(c => c.classroom_id === room.id)
          const isEditing = editingRoom === room.id
          return (
            <div key={room.id} className="border-b border-[#F1F5F9] last:border-0">
              {/* 교실 행 */}
              <div className="grid grid-cols-[80px_1fr_180px_60px_44px] gap-0 px-3 py-2 items-center hover:bg-[#FAFBFC]">
                <span className="text-sm font-bold text-[#1E293B]">{room.display_name}</span>

                {/* 배정 반 칩 */}
                <div className="flex flex-wrap gap-1">
                  {roomClasses.length === 0
                    ? <span className="text-[10px] text-[#CBD5E1]">없음</span>
                    : roomClasses.map(cls => {
                      const sess = sessMap.get(cls.session_id)
                      return (
                        <span key={cls.id}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white cursor-pointer hover:opacity-80"
                          style={{ background: cls.color || '#94A3B8' }}
                          title={`${sess?.name ?? ''} ${sess?.time_range ?? ''}`}
                          onClick={() => patch({ type: 'class_classroom', class_id: cls.id, classroom_id: null })}
                        >
                          {cls.level} ×
                        </span>
                      )
                    })
                  }
                </div>

                {/* 계정 */}
                <span className="text-[11px] text-[#64748B] truncate">
                  {room.account_email ?? <span className="text-[#CBD5E1]">미설정</span>}
                </span>

                {/* 팝업 분 */}
                <span className="text-[11px] text-[#94A3B8] text-center">{room.popup_minutes_before}분</span>

                {/* 설정 버튼 */}
                <button
                  onClick={() => { setEditingRoom(isEditing ? null : room.id); setRoomDraft({ ...room }) }}
                  className="text-[11px] text-[#004EA2] hover:text-blue-800 font-medium text-center"
                >{isEditing ? '닫기' : '설정'}</button>
              </div>

              {/* 인라인 편집 */}
              {isEditing && (
                <div className="px-3 pb-2.5 pt-1 bg-[#F0F7FF] border-t border-[#DBEAFE] flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-[10px] text-[#64748B] block mb-0.5">계정 이메일</label>
                    <input value={roomDraft.account_email ?? ''} onChange={e => setRoomDraft(p => ({ ...p, account_email: e.target.value }))}
                      placeholder="room-america@poly"
                      className="border border-[#BFDBFE] rounded px-2 py-1 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block mb-0.5">팝업 (분 전)</label>
                    <input type="number" min={0} max={30} value={roomDraft.popup_minutes_before ?? 2}
                      onChange={e => setRoomDraft(p => ({ ...p, popup_minutes_before: Number(e.target.value) }))}
                      className="border border-[#BFDBFE] rounded px-2 py-1 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-[#004EA2]" />
                  </div>
                  <button onClick={async () => { await patch({ type: 'classroom', classroom_id: room.id, account_email: roomDraft.account_email, popup_minutes_before: roomDraft.popup_minutes_before }); setEditingRoom(null) }}
                    className="bg-[#004EA2] text-white text-xs px-3 py-1.5 rounded hover:bg-blue-800">저장</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 미배정 반 */}
      {unassigned.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed border-[#E2E8F0] overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#E2E8F0] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide">
            미배정 반 ({unassigned.length})
          </div>
          <div className="divide-y divide-[#F9FAFB]">
            {unassigned.map(cls => {
              const sess = sessMap.get(cls.session_id)
              return (
                <div key={cls.id} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cls.color || '#94A3B8' }} />
                  <span className="text-xs font-semibold text-[#1E293B] w-16 truncate">{cls.level}</span>
                  <span className="text-[10px] text-[#94A3B8] w-24 truncate">{sess?.name ?? ''}</span>
                  <span className="text-[10px] text-[#94A3B8]">{sess?.time_range ?? ''}</span>
                  <select defaultValue="" onChange={e => { if (e.target.value) patch({ type: 'class_classroom', class_id: cls.id, classroom_id: e.target.value }) }}
                    className="ml-auto text-xs border border-[#E2E8F0] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#004EA2]">
                    <option value="">교실 배정...</option>
                    {classrooms.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
