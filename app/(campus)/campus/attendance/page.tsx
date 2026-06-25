'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance, AttendanceStatus } from '@/lib/attendance'
import { StudentStatusToggle } from '@/components/attendance/StudentStatusToggle'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'

const SESS_COLORS: Record<string, string> = {
  '유치부': '#FF6B35',
  '유치부 방과후': '#FF9800',
  '초등부 매일반': '#2196F3',
  '초등부 월수금': '#4CAF50',
  '초등부 화목': '#9C27B0',
  '초등부': '#2196F3',
  '중등부': '#2E7D32',
  '고등부': '#6A1B9A',
}
const FALLBACK_COLORS = ['#FF6B35','#2196F3','#4CAF50','#9C27B0','#E53935','#00897B','#F57C00','#607D8B']
function sessColor(name: string, idx: number) {
  if (SESS_COLORS[name]) return SESS_COLORS[name]
  for (const key of Object.keys(SESS_COLORS)) {
    if (name.includes(key)) return SESS_COLORS[key]
  }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

// 호차 자리에 들어갈 출결 배지 스타일
const STATUS_BADGE: Record<string, { bg: string; bd: string; tx: string; label: string } | null> = {
  present: null,
  absent:  { bg: '#FEF2F2', bd: '#FCA5A5', tx: '#DC2626', label: '결' },
  late:    { bg: '#FFFBEB', bd: '#FCD34D', tx: '#D97706', label: '지' },
}

const UI_STATUS_STYLE: Record<string, string> = {
  '미도래': 'bg-white/20 text-white/70',
  '대기중': 'bg-blue-100 text-blue-700',
  '완료':   'bg-green-100 text-green-700',
}

interface SessionGroup {
  session_id: string
  name: string
  time_range: string
  color: string
  classes: ClassWithAttendance[]
}

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<ClassWithAttendance | null>(null)
  const [editStatuses, setEditStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [showPreAbsence, setShowPreAbsence] = useState(false)

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const loadData = useCallback(async () => {
    const res = await fetch('/api/campus/attendance')
    if (res.ok) {
      const data: ClassWithAttendance[] = await res.json()
      setClasses(data)
      setActiveSessionId(prev => prev ?? data[0]?.class_session_id ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const supabase = createClient()
    const channel = supabase
      .channel('attendance-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, loadData)
      .subscribe()
    const interval = setInterval(loadData, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [loadData])

  // 세션 그룹 (순서 유지)
  const sessionGroups: SessionGroup[] = []
  const seenIds = new Set<string>()
  classes.forEach(c => {
    if (!seenIds.has(c.class_session_id)) {
      seenIds.add(c.class_session_id)
      sessionGroups.push({
        session_id: c.class_session_id,
        name: c.class_session_name,
        time_range: c.class_session_time_range,
        color: sessColor(c.class_session_name, sessionGroups.length),
        classes: [],
      })
    }
    sessionGroups.find(g => g.session_id === c.class_session_id)!.classes.push(c)
  })

  const activeGroup = sessionGroups.find(g => g.session_id === activeSessionId) ?? sessionGroups[0] ?? null

  function handleCardClick(classData: ClassWithAttendance) {
    setSelectedClass(classData)
    const init: Record<string, AttendanceStatus> = {}
    classData.students.forEach(s => { init[s.student_id] = s.status })
    setEditStatuses(init)
  }

  async function handleSaveAttendance() {
    if (!selectedClass) return
    setSaving(true)
    const todayStr = new Date().toISOString().split('T')[0]
    const records = selectedClass.students.map(s => ({
      student_id: s.student_id,
      status: editStatuses[s.student_id] ?? 'present',
    }))
    await fetch('/api/campus/attendance/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: selectedClass.class_id, session_date: todayStr, records, mark_complete: true }),
    })
    setSaving(false)
    setSelectedClass(null)
    loadData()
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
        <button
          onClick={() => setShowPreAbsence(true)}
          className="bg-[#004EA2] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          사전 결석 등록
        </button>
      </div>

      {/* 세션 탭 */}
      <div className="flex gap-0 border-b border-[#E2E8F0] mb-4 overflow-x-auto">
        {sessionGroups.map(g => (
          <button
            key={g.session_id}
            onClick={() => setActiveSessionId(g.session_id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeSessionId === g.session_id
                ? 'border-current'
                : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}
            style={activeSessionId === g.session_id ? { color: g.color, borderColor: g.color } : {}}
          >
            {g.name}
            <span className="ml-1.5 text-xs opacity-60">{g.classes.length}반</span>
          </button>
        ))}
      </div>

      {/* 활성 세션 요약 */}
      {activeGroup && (
        <>
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
              <ClassCard key={c.class_id} classData={c} color={activeGroup.color} onClick={handleCardClick} />
            ))}
          </div>
        </>
      )}

      {sessionGroups.length === 0 && (
        <div className="py-16 text-center text-gray-400">오늘 등록된 수업이 없습니다</div>
      )}

      {/* 출결 편집 모달 */}
      {selectedClass && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => setSelectedClass(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold">
                  {selectedClass.class_level}{selectedClass.class_room ? ` / ${selectedClass.class_room}` : ''}
                </h3>
                {selectedClass.class_teacher && <p className="text-sm text-gray-500 mt-0.5">{selectedClass.class_teacher}</p>}
              </div>
              <button onClick={() => setSelectedClass(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {selectedClass.students.map(s => (
                <StudentStatusToggle
                  key={s.student_id}
                  studentId={s.student_id}
                  name={s.student_name}
                  status={editStatuses[s.student_id] ?? s.status}
                  preMarked={s.pre_marked}
                  onStatusChange={(id, st) => setEditStatuses(prev => ({ ...prev, [id]: st }))}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedClass(null)} className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600">닫기</button>
              <button onClick={handleSaveAttendance} disabled={saving}
                className="flex-1 py-3 bg-[#004EA2] text-white rounded-xl font-bold disabled:opacity-50">
                {saving ? '저장 중...' : '출석 완료 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreAbsence && (
        <PreAbsenceModal
          classes={classes}
          onClose={() => setShowPreAbsence(false)}
          onSaved={() => { setShowPreAbsence(false); loadData() }}
        />
      )}
    </div>
  )
}

function ClassCard({ classData, color, onClick }: {
  classData: ClassWithAttendance
  color: string
  onClick: (c: ClassWithAttendance) => void
}) {
  const total = classData.students.length
  const presentCount = total - classData.absent_count - classData.late_count

  return (
    <div
      onClick={() => onClick(classData)}
      className="rounded-[9px] border-[1.5px] border-[#E0E0E0] bg-white shadow-sm overflow-hidden cursor-pointer hover:border-[#004EA2] hover:shadow-md transition-all"
    >
      {/* 카드 헤더 — 개설반현황 동일 스타일 */}
      <div className="px-1.5 py-1 text-white select-none" style={{ background: color }}>
        <div className="flex items-center gap-0.5">
          <span className="font-extrabold text-[11px] leading-tight truncate flex-1">{classData.class_level}</span>
          <span className="text-[9px] font-bold bg-white/30 px-1 py-px rounded flex-shrink-0">{total}</span>
        </div>
        {/* 출결 상태 배지 */}
        {classData.ui_status !== '미도래' && (
          <span className={`mt-0.5 inline-block text-[8px] font-bold px-1.5 py-px rounded-full ${UI_STATUS_STYLE[classData.ui_status]}`}>
            {classData.ui_status === '완료' ? `완료 ${presentCount}/${total}` : classData.ui_status}
          </span>
        )}
        {(classData.class_room || classData.class_teacher) && (
          <div className="mt-0.5 space-y-px">
            {classData.class_room && (
              <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate">
                <span className="opacity-60">교</span>
                <span className="bg-white/15 px-0.5 rounded truncate">{classData.class_room}</span>
              </div>
            )}
            {classData.class_teacher && (
              <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate">
                <span className="opacity-60">강</span>
                <span className="bg-white/15 px-0.5 rounded truncate">{classData.class_teacher}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 학생 rows — 호차 자리에 결석/지각 배지 */}
      <div>
        {classData.students.map((s, i) => {
          const badge = STATUS_BADGE[s.status]
          return (
            <div
              key={s.student_id}
              className="flex items-center gap-0.5 px-1 border-b border-[#f0f0f0]"
              style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#ffffff', minHeight: '18px' }}
            >
              <span className="text-[8px] text-[#ccc] w-2.5 text-right flex-shrink-0">{i + 1}</span>
              <span className="flex-1 text-[10px] font-semibold text-[#1a1a1a] truncate leading-tight px-0.5">{s.student_name}</span>
              {badge && (
                <span
                  className="text-[8px] font-bold px-0.5 rounded border flex-shrink-0 self-center"
                  style={{ background: badge.bg, borderColor: badge.bd, color: badge.tx }}
                >
                  {badge.label}
                </span>
              )}
            </div>
          )
        })}
        {total === 0 && (
          <div className="h-[18px] flex items-center justify-center text-[#CBD5E1] text-[9px]">수강생 없음</div>
        )}
      </div>
    </div>
  )
}
