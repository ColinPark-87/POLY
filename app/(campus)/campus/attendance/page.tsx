'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance, AttendanceStatus } from '@/lib/attendance'
import { StudentStatusToggle } from '@/components/attendance/StudentStatusToggle'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassWithAttendance | null>(null)
  const [editStatuses, setEditStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [showPreAbsence, setShowPreAbsence] = useState(false)

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const loadData = useCallback(async () => {
    const res = await fetch('/api/campus/attendance')
    if (res.ok) {
      const data = await res.json()
      setClasses(data)
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

  // 세션별 그룹
  const sessionGroups = classes.reduce((acc, c) => {
    const key = c.class_session_id
    if (!acc[key]) acc[key] = { name: c.class_session_name, time_range: c.class_session_time_range, session_id: key, classes: [] }
    acc[key].classes.push(c)
    return acc
  }, {} as Record<string, { name: string; time_range: string; session_id: string; classes: ClassWithAttendance[] }>)

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>

  return (
    <div className="max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">출결 관리</h1>
          <p className="text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => setShowPreAbsence(true)}
          className="bg-[#004EA2] text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-800 transition-colors"
        >
          사전 결석 등록
        </button>
      </div>

      {/* 세션별 그룹 */}
      <div className="space-y-8">
        {Object.values(sessionGroups).map(group => (
          <div key={group.session_id}>
            {/* 세션 헤더 */}
            <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-700">{group.name}</h2>
              <span className="text-sm text-gray-400">{group.time_range}</span>
            </div>

            {/* 반 카드 그리드 — 개설반현황 스타일 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.classes.map(c => (
                <ClassCard key={c.class_id} classData={c} onClick={handleCardClick} />
              ))}
            </div>
          </div>
        ))}
        {Object.keys(sessionGroups).length === 0 && (
          <div className="py-16 text-center text-gray-400">오늘 등록된 수업이 없습니다</div>
        )}
      </div>

      {/* 반 클릭 → 출결 편집 모달 */}
      {selectedClass && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => setSelectedClass(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold">
                  {selectedClass.class_level}{selectedClass.class_room ? ` / ${selectedClass.class_room}` : ''}
                </h3>
                {selectedClass.class_teacher && (
                  <p className="text-sm text-gray-500 mt-0.5">{selectedClass.class_teacher}</p>
                )}
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
              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="flex-1 py-3 bg-[#004EA2] text-white rounded-xl font-bold disabled:opacity-50"
              >
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

const STATUS_CHIP: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent:  'bg-red-100 text-red-700',
  late:    'bg-yellow-100 text-yellow-700',
}
const STATUS_LABEL: Record<string, string> = { present: '출', absent: '결', late: '지' }

const UI_BADGE: Record<string, string> = {
  '미도래': 'bg-gray-100 text-gray-500',
  '대기중': 'bg-blue-100 text-blue-700 animate-pulse',
  '완료':   'bg-green-100 text-green-700',
}

function ClassCard({ classData, onClick }: { classData: ClassWithAttendance; onClick: (c: ClassWithAttendance) => void }) {
  const total = classData.students.length
  const presentCount = total - classData.absent_count - classData.late_count

  return (
    <button
      onClick={() => onClick(classData)}
      className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-[#004EA2] hover:shadow-md transition-all overflow-hidden"
    >
      {/* 컬러 상단 바 */}
      <div className="h-1 w-full" style={{ backgroundColor: classData.class_color }} />

      <div className="p-4 space-y-3">
        {/* 반 이름 + 상태 배지 */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">
              {classData.class_level}
              {classData.class_room ? <span className="text-gray-500 font-normal"> / {classData.class_room}</span> : null}
            </p>
            {classData.class_teacher && (
              <p className="text-xs text-gray-400 mt-0.5">{classData.class_teacher}</p>
            )}
          </div>
          <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full ${UI_BADGE[classData.ui_status]}`}>
            {classData.ui_status === '완료' ? `완료 ${presentCount}/${total}` : classData.ui_status}
          </span>
        </div>

        {/* 학생 칩 */}
        {total > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {classData.students.map(s => (
              <span
                key={s.student_id}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CHIP[s.status]}`}
              >
                {s.student_name}
                {s.status !== 'present' && (
                  <span className="font-bold">{STATUS_LABEL[s.status]}</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">수강생 없음</p>
        )}

        {/* 결석/지각 요약 */}
        {(classData.absent_count > 0 || classData.late_count > 0) && (
          <div className="flex gap-3 text-xs">
            {classData.absent_count > 0 && <span className="text-red-600 font-medium">결석 {classData.absent_count}명</span>}
            {classData.late_count > 0 && <span className="text-yellow-600 font-medium">지각 {classData.late_count}명</span>}
          </div>
        )}
      </div>
    </button>
  )
}
