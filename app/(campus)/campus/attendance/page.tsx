'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance } from '@/lib/attendance'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'
import { AttendanceAnalytics } from '@/components/attendance/AttendanceAnalytics'

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
  const [pageTab, setPageTab] = useState<'roster' | 'analytics' | 'settings'>('roster')
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftMap>(new Map())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [showPreAbsence, setShowPreAbsence] = useState(false)
  const [heroList, setHeroList] = useState<{ label: string; students: string[] } | null>(null)
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
      // tabOrder: 최초 1회만 서버 순서로 초기화, 이후 유지
      setTabOrder(prev => {
        if (prev.length > 0) return prev  // 이미 설정됨 → 유지
        return [...new Set(data.map(c => c.class_session_id))]
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
      method: 'POST',
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
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4 overflow-x-auto">
        {([['roster','당일 출결현황'],['analytics','출결현황 분석'],['settings','세팅']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pageTab === key ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}>{label}</button>
        ))}
      </div>

      {/* ── 출결 현황 탭 ── */}
      {pageTab === 'roster' && (<>

      {/* 히어로: 한 줄 인라인 */}
      {activeGroup && (() => {
        const g = activeGroup
        const total   = g.classes.reduce((n, c) => n + c.students.length, 0)
        const absent  = g.classes.reduce((n, c) => n + c.students.filter(s => s.status === 'absent' && !s.pre_marked).length, 0)
        const late    = g.classes.reduce((n, c) => n + c.late_count, 0)
        const preAbs  = g.classes.reduce((n, c) => n + c.students.filter(s => s.pre_marked && s.status === 'absent').length, 0)
        const present = total - absent - late - preAbs
        return (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white rounded-xl border border-[#E2E8F0] shadow-sm flex-wrap">
            <span className="text-xs font-bold" style={{ color: g.color }}>{g.name}</span>
            {g.time_range && <span className="text-xs text-[#94A3B8]">{g.time_range}</span>}
            <span className="text-xs text-[#94A3B8]">총 {total}명</span>
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {[
                { label: '출석', value: present, color: '#10B981', bg: '#F0FDF4', students: g.classes.flatMap(c => c.students.filter(s => !s.pre_marked && s.status === 'present').map(s => s.student_name)) },
                { label: '결석', value: absent,  color: '#DC2626', bg: '#FEF2F2', students: g.classes.flatMap(c => c.students.filter(s => !s.pre_marked && s.status === 'absent').map(s => s.student_name)) },
                { label: '지각', value: late,    color: '#D97706', bg: '#FFFBEB', students: g.classes.flatMap(c => c.students.filter(s => s.status === 'late').map(s => s.student_name)) },
                { label: '사전', value: preAbs,  color: '#7C3AED', bg: '#FDF4FF', students: g.classes.flatMap(c => c.students.filter(s => s.pre_marked && s.status === 'absent').map(s => s.student_name)) },
              ].map(({ label, value, color, bg, students }) => (
                <button key={label}
                  onClick={() => setHeroList({ label, students })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ background: bg, color }}>
                  {label} {value}
                </button>
              ))}
            </div>
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

          {/* 반응형 그리드 (모바일 2열 → 데스크톱 5열) */}
          <div className="grid gap-[6px] grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

      {/* 히어로 명단 팝업 */}
      {heroList && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setHeroList(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-xs max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#1E293B]">{heroList.label} 명단 ({heroList.students.length}명)</h3>
              <button onClick={() => setHeroList(null)} className="text-[#94A3B8] hover:text-[#64748B]">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {heroList.students.length === 0
                ? <p className="text-sm text-[#CBD5E1] text-center py-4">없음</p>
                : <div className="space-y-0.5">
                    {heroList.students.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F8FAFC]">
                        <span className="text-[10px] text-[#CBD5E1] w-5 text-right">{i + 1}</span>
                        <span className="text-sm text-[#1E293B]">{name}</span>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>
      )}
      </>)}

      {/* ── 분석 탭 ── */}
      {pageTab === 'analytics' && <AttendanceAnalytics />}

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
interface Classroom { id: string; display_name: string; account_email: string | null; popup_minutes_before: number; force_popup_class_id: string | null }
interface SettingsSession { id: string; name: string; time_range: string | null; days: string | null }
interface SettingsClass { id: string; session_id: string; level: string; room: string | null; teacher: string | null; color: string; days: string | null; classroom_id: string | null; popup_minutes_before: number | null; smartboard_time_range: string | null }

function AttendanceSettings() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [sessions, setSessions] = useState<SettingsSession[]>([])
  const [classes, setClasses] = useState<SettingsClass[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRoom, setEditingRoom] = useState<string | null>(null)
  const [roomDraft, setRoomDraft] = useState<Partial<Classroom>>({})
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [classDraft, setClassDraft] = useState<{ days: string; time_range: string; classroom_id: string }>({ days: '', time_range: '', classroom_id: '' })
  const [creatingAccounts, setCreatingAccounts] = useState(false)
  const [accountResults, setAccountResults] = useState<{ email: string; classroom: string; status: string }[] | null>(null)
  // 교실 변경 코드
  const [changeCode, setChangeCode] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [codeSaving, setCodeSaving] = useState(false)
  const [codeSaved, setCodeSaved] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/campus/attendance/settings')
    if (res.ok) {
      const d = await res.json()
      setClassrooms(d.classrooms ?? [])
      setSessions(d.sessions ?? [])
      setClasses(d.classes ?? [])
    }
    const cr = await fetch('/api/campus/attendance/change-code')
    if (cr.ok) { const d = await cr.json(); setChangeCode(d.code); setCodeDraft(d.code) }
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
  // classes.room 텍스트로 교실 자동 매칭
  const roomByName = new Map(classrooms.map(r => [r.display_name.toLowerCase(), r.id]))
  const classesWithRoom = classes.map(c => ({
    ...c,
    classroom_id: c.classroom_id ?? roomByName.get((c.room ?? '').toLowerCase()) ?? null,
  }))
  const unassigned = classesWithRoom.filter(c => !c.classroom_id)

  // 시간 파싱 (정렬용)
  function parseTime(t: string | null | undefined): number {
    if (!t) return 9999
    const s = t.split('~')[0].trim()
    const [h, m] = s.split(':').map(Number)
    const h24 = h < 9 ? h + 12 : h
    return h24 * 60 + (m || 0)
  }

  return (
    <div>
      {/* 계정 생성 + 교실 변경 코드 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* 컴퓨터 계정 일괄 생성 */}
        <div className="flex items-center gap-2 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#1E293B]">컴퓨터 계정 자동 생성</p>
            <p className="text-[10px] text-[#94A3B8] truncate">computer1~11 (비번 7659) + 교실 연결</p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('컴퓨터 1~11 계정을 생성하고 교실에 연결합니다. 계속하시겠습니까?')) return
              setCreatingAccounts(true)
              const res = await fetch('/api/campus/attendance/create-computer-accounts', { method: 'POST' })
              const d = await res.json()
              setAccountResults(d.results)
              setCreatingAccounts(false)
              load()
            }}
            disabled={creatingAccounts}
            className="bg-[#1e3a5f] text-white text-xs px-3 py-2 rounded-lg hover:bg-[#2c5f8a] disabled:opacity-50 flex-shrink-0"
          >{creatingAccounts ? '생성 중...' : '계정 생성'}</button>
        </div>

        {/* 교실 변경 코드 설정 */}
        <div className="flex items-center gap-2 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#1E293B]">교실 변경 코드</p>
            <p className="text-[10px] text-[#94A3B8] truncate">스마트보드 교실 변경 시 입력</p>
          </div>
          <input
            value={codeDraft}
            onChange={e => { setCodeDraft(e.target.value); setCodeSaved(false) }}
            placeholder="7659"
            className="w-20 border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#004EA2]"
          />
          <button
            onClick={async () => {
              setCodeSaving(true)
              await fetch('/api/campus/attendance/change-code', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: codeDraft }),
              })
              setChangeCode(codeDraft); setCodeSaving(false); setCodeSaved(true)
            }}
            disabled={codeSaving || codeDraft === changeCode}
            className="bg-[#1e3a5f] text-white text-xs px-3 py-2 rounded-lg hover:bg-[#2c5f8a] disabled:opacity-40 flex-shrink-0"
          >{codeSaving ? '...' : codeSaved ? '✓' : '저장'}</button>
        </div>
      </div>
      {accountResults && (
        <div className="mb-3 p-3 bg-white rounded-xl border border-[#E2E8F0] text-[10px] space-y-0.5">
          {accountResults.map(r => (
            <div key={r.email} className="flex gap-2">
              <span className="text-[#1E293B] font-medium w-36 truncate">{r.email}</span>
              <span className="text-[#64748B] w-20">{r.classroom}</span>
              <span className={r.status.includes('완료') ? 'text-[#10B981]' : 'text-[#EF4444]'}>{r.status}</span>
            </div>
          ))}
          <button onClick={() => setAccountResults(null)} className="text-[#94A3B8] mt-1">닫기</button>
        </div>
      )}

      {classrooms.length === 0 && (
        <div className="py-10 text-center text-[#94A3B8] text-sm">015_classrooms.sql 실행 필요</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {classrooms.map(room => {
        const roomClasses = classesWithRoom
          .filter(c => c.classroom_id === room.id)
          .sort((a, b) => parseTime(sessMap.get(a.session_id)?.time_range) - parseTime(sessMap.get(b.session_id)?.time_range))
        const isEditing = editingRoom === room.id

        return (
          <div key={room.id}>
            {/* 교실 헤더 */}
            <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-[#1e3a5f]">
              <span className="text-xs font-extrabold text-[#1e3a5f]">{room.display_name}</span>
              {room.account_email
                ? <span className="text-[9px] text-[#10B981] truncate max-w-[100px]">{room.account_email}</span>
                : <span className="text-[9px] text-[#CBD5E1]">계정 미설정</span>}
              <button onClick={async () => {
                  const on = room.force_popup_class_id === '__TEST__'
                  await fetch('/api/campus/attendance/force-popup', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classroom_id: room.id, class_id: on ? null : '__TEST__' }),
                  })
                  await load()
                }}
                title="반 없어도 이 교실 PC에 테스트 팝업을 띄움 (닫으면 자동 해제)"
                className={`ml-auto text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 ${room.force_popup_class_id === '__TEST__' ? 'bg-[#DC2626] text-white' : 'bg-[#FFF3E0] text-[#E65100] hover:bg-[#FFE0B2]'}`}>
                {room.force_popup_class_id === '__TEST__' ? '⏹ 테스트끄기' : '🧪 테스트팝업'}
              </button>
              <button onClick={() => { setEditingRoom(isEditing ? null : room.id); setRoomDraft({ ...room }) }}
                className="text-[9px] text-[#004EA2] hover:underline flex-shrink-0">{isEditing ? '닫기' : '설정'}</button>
            </div>

            {isEditing && (
              <div className="flex flex-wrap gap-1.5 items-end mb-2 px-2 py-2 bg-[#F0F7FF] rounded border border-[#DBEAFE]">
                <div>
                  <label className="text-[9px] text-[#64748B] block mb-0.5">이메일</label>
                  <input value={roomDraft.account_email ?? ''} onChange={e => setRoomDraft(p => ({ ...p, account_email: e.target.value }))}
                    placeholder="computer1@jungkye.poly"
                    className="border border-[#BFDBFE] rounded px-1.5 py-0.5 text-[10px] w-44 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-[#64748B] block mb-0.5">팝업 분전</label>
                  <input type="number" min={0} max={30} value={roomDraft.popup_minutes_before ?? 2}
                    onChange={e => setRoomDraft(p => ({ ...p, popup_minutes_before: Number(e.target.value) }))}
                    className="border border-[#BFDBFE] rounded px-1.5 py-0.5 text-[10px] w-12 focus:outline-none" />
                </div>
                <button onClick={async () => { await patch({ type: 'classroom', classroom_id: room.id, account_email: roomDraft.account_email, popup_minutes_before: roomDraft.popup_minutes_before }); setEditingRoom(null) }}
                  className="bg-[#004EA2] text-white text-[10px] px-2 py-0.5 rounded">저장</button>
              </div>
            )}

            {/* 5열 카드 그리드 (시간순, 드래그 reorder) */}
            {roomClasses.length === 0
              ? <p className="text-xs text-[#CBD5E1] py-1">배정된 반 없음</p>
              : <SettingsClassGrid
                  roomClasses={roomClasses}
                  classroomId={room.id}
                  forcePopupClassId={room.force_popup_class_id}
                  sessMap={sessMap}
                  roomDefault={room.popup_minutes_before}
                  selectedClassId={selectedClassId}
                  onSelect={(cls, sess) => {
                    if (selectedClassId === cls.id) { setSelectedClassId(null); return }
                    setSelectedClassId(cls.id)
                    setClassDraft({ days: cls.days ?? sess?.days ?? '', time_range: sess?.time_range ?? '', classroom_id: cls.classroom_id ?? '' })
                  }}
                  onPatch={patch}
                  onReload={load}
                />
            }
          </div>
        )
      })}
      </div>
    </div>
  )
}

function SettingsClassGrid({ roomClasses, classroomId, forcePopupClassId, sessMap, roomDefault, selectedClassId, onSelect, onPatch, onReload }: {
  roomClasses: SettingsClass[]
  classroomId: string
  forcePopupClassId: string | null
  sessMap: Map<string, SettingsSession>
  roomDefault: number
  selectedClassId: string | null
  onSelect: (cls: SettingsClass, sess: SettingsSession | undefined) => void
  onPatch: (body: object) => Promise<void>
  onReload: () => void
}) {
  const [order, setOrder] = useState<string[]>(() => roomClasses.map(c => c.id))
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null)
  const [timeDraft, setTimeDraft] = useState('')

  // 토글: 현재 켜진 반이면 끄기(null), 아니면 켜기
  async function toggleForcePopup(classId: string) {
    const next = forcePopupClassId === classId ? null : classId
    await fetch('/api/campus/attendance/force-popup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classroom_id: classroomId, class_id: next }),
    })
    onReload()
  }

  const sorted = order.map(id => roomClasses.find(c => c.id === id)).filter(Boolean) as SettingsClass[]

  async function drop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return }
    const next = [...order]
    const from = next.indexOf(dragId); const to = next.indexOf(targetId)
    next.splice(from, 1); next.splice(to, 0, dragId)
    setOrder(next)
    setDragId(null); setDragOver(null)
    await onPatch({ type: 'reorder_classes', orders: next.map((id, i) => ({ id, sort_order: i })) })
  }

  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
      {sorted.map(cls => {
        const sess = sessMap.get(cls.session_id)
        const isSelected = selectedClassId === cls.id
        return (
          <div key={cls.id}
            draggable
            onDragStart={() => setDragId(cls.id)}
            onDragOver={e => { e.preventDefault(); setDragOver(cls.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => drop(cls.id)}
            onDragEnd={() => { setDragId(null); setDragOver(null) }}
            onClick={() => onSelect(cls, sess)}
            className={`rounded-[5px] border bg-white overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
              dragOver === cls.id ? 'ring-1 ring-[#004EA2]' : dragId === cls.id ? 'opacity-40' : ''
            } ${isSelected ? 'border-[#004EA2]' : 'border-[#E0E0E0] hover:border-[#004EA2]'}`}
          >
            <div className="px-1 py-0.5 text-white" style={{ background: cls.color || '#94A3B8' }}>
              <p className="text-[9px] font-extrabold truncate leading-tight">{cls.level}</p>
            </div>
            <div className="px-1 py-0.5">
              {/* 시간 — 클릭 인라인 편집 (개설반현황 독립) */}
              <div onClick={e => { e.stopPropagation(); setEditingTimeId(cls.id); setTimeDraft(cls.smartboard_time_range ?? sess?.time_range ?? '') }}>
                {editingTimeId === cls.id ? (
                  <input autoFocus value={timeDraft}
                    onChange={e => setTimeDraft(e.target.value)}
                    onBlur={async () => { await onPatch({ type: 'class_smartboard_time', class_id: cls.id, smartboard_time_range: timeDraft }); setEditingTimeId(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    placeholder="9:40~11:00"
                    className="w-full text-[8px] border border-[#004EA2] rounded px-0.5 focus:outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <p className={`text-[8px] truncate leading-tight cursor-pointer hover:text-[#004EA2] ${cls.smartboard_time_range ? 'text-[#004EA2] font-semibold' : 'text-[#64748B]'}`}>
                    {cls.smartboard_time_range ?? sess?.time_range ?? '미설정'}{cls.smartboard_time_range ? ' *' : ''}
                  </p>
                )}
              </div>
              <p className="text-[7px] text-[#94A3B8] truncate leading-tight">{cls.days ?? sess?.days ?? '매일'}</p>
              {/* 팝업 시간 HH:MM */}
              <PopupTimeInput
                timeRange={cls.smartboard_time_range ?? sess?.time_range ?? ''}
                popupMinsBefore={cls.popup_minutes_before}
                roomDefault={roomDefault}
                onSave={async (mins) => onPatch({ type: 'class_popup', class_id: cls.id, popup_minutes_before: mins })}
              />
              {/* 임시 팝업 토글 버튼 */}
              <button
                onClick={e => { e.stopPropagation(); toggleForcePopup(cls.id) }}
                className={`mt-0.5 w-full text-[7px] font-bold rounded py-0.5 transition-colors ${
                  forcePopupClassId === cls.id ? 'bg-[#DC2626] text-white' : 'bg-[#FFF3E0] text-[#E65100] hover:bg-[#FFE0B2]'
                }`}
              >{forcePopupClassId === cls.id ? '⏹ 팝업 끄기' : '🔔 지금 팝업'}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function calcPopupTime(timeRange: string, minsBefore: number): string {
  const s = timeRange.split('~')[0]?.trim() ?? ''
  const [h, m] = s.split(':').map(Number)
  if (isNaN(h)) return ''
  const h24 = h < 9 ? h + 12 : h
  const totalMin = h24 * 60 + (m || 0) - minsBefore
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
}

function PopupTimeInput({ timeRange, popupMinsBefore, roomDefault, onSave }: {
  timeRange: string
  popupMinsBefore: number | null
  roomDefault: number
  onSave: (mins: number | null) => Promise<void>
}) {
  const defaultTime = timeRange ? calcPopupTime(timeRange, roomDefault) : ''
  const currentTime = popupMinsBefore !== null && timeRange ? calcPopupTime(timeRange, popupMinsBefore) : ''
  const displayTime = currentTime || defaultTime
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentTime)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft) { setSaving(true); await onSave(null); setSaving(false); setEditing(false); return }
    const [ph, pm] = draft.split(':').map(Number)
    if (isNaN(ph) || isNaN(pm)) { setEditing(false); return }
    const [sh, sm] = (timeRange.split('~')[0]?.trim() ?? '').split(':').map(Number)
    if (isNaN(sh)) { setEditing(false); return }
    const sh24 = sh < 9 ? sh + 12 : sh
    const diff = sh24 * 60 + (sm || 0) - (ph * 60 + pm)
    setSaving(true); await onSave(diff); setSaving(false); setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-0.5 mt-0.5" onClick={e => e.stopPropagation()}>
        <span className="text-[7px] text-[#94A3B8]">팝업</span>
        <span className={`text-[7px] font-semibold ${currentTime ? 'text-[#004EA2]' : 'text-[#94A3B8]'}`}>
          {displayTime || '자동'}
        </span>
        <button onClick={() => { setDraft(currentTime); setEditing(true) }}
          className="text-[7px] text-[#004EA2] hover:underline ml-auto">수정</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 mt-0.5" onClick={e => e.stopPropagation()}>
      <input type="text" value={draft} placeholder={defaultTime || 'HH:MM'} autoFocus
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-10 text-[7px] border border-[#004EA2] rounded px-0.5 focus:outline-none"
      />
      <button onClick={save} disabled={saving}
        className="text-[7px] font-bold text-white bg-[#004EA2] rounded px-1 disabled:opacity-50">
        {saving ? '…' : '저장'}
      </button>
      <button onClick={() => setEditing(false)}
        className="text-[7px] text-[#94A3B8] hover:text-[#64748B]">취소</button>
    </div>
  )
}
