// app/(campus)/campus/attendance/page.tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance, AttendanceStatus } from '@/lib/attendance'
import { SessionCard } from '@/components/attendance/SessionCard'
import { StudentStatusToggle } from '@/components/attendance/StudentStatusToggle'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassWithAttendance | null>(null)
  const [editStatuses, setEditStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [showPreAbsence, setShowPreAbsence] = useState(false)
  const [editingTime, setEditingTime] = useState<string | null>(null)
  const [timeInput, setTimeInput] = useState('')

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

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
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
      body: JSON.stringify({
        class_id: selectedClass.class_id,
        session_date: todayStr,
        records,
        mark_complete: true,
      }),
    })
    setSaving(false)
    setSelectedClass(null)
    loadData()
  }

  async function handleTimeSave() {
    if (!editingTime || !timeInput) return
    await fetch('/api/campus/attendance/time', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_session_id: editingTime, time_range: timeInput }),
    })
    setEditingTime(null)
    loadData()
  }

  const sessionGroups = classes.reduce((acc, c) => {
    const key = c.class_session_id
    if (!acc[key]) acc[key] = { name: c.class_session_name, time_range: c.class_session_time_range, session_id: key, classes: [] }
    acc[key].classes.push(c)
    return acc
  }, {} as Record<string, { name: string; time_range: string; session_id: string; classes: ClassWithAttendance[] }>)

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>

  return (
    <div className="max-w-5xl">
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

      <div className="space-y-8">
        {Object.values(sessionGroups).map(group => (
          <div key={group.session_id}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-bold text-gray-800">{group.name}</h2>
              {editingTime === group.session_id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={timeInput}
                    onChange={e => setTimeInput(e.target.value)}
                    placeholder="9:40~11:00"
                    className="border rounded-lg px-2 py-1 text-sm w-32"
                  />
                  <button onClick={handleTimeSave} className="text-sm text-[#004EA2] font-bold">저장</button>
                  <button onClick={() => setEditingTime(null)} className="text-sm text-gray-400">취소</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingTime(group.session_id); setTimeInput(group.time_range) }}
                  className="text-sm text-gray-400 hover:text-[#004EA2] transition-colors"
                  title="시작 시간 수정"
                >
                  {group.time_range} ✏️
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {group.classes.map(c => (
                <SessionCard key={c.class_id} classData={c} onClick={handleCardClick} />
              ))}
            </div>
          </div>
        ))}
        {Object.keys(sessionGroups).length === 0 && (
          <div className="py-16 text-center text-gray-400">오늘 등록된 수업이 없습니다</div>
        )}
      </div>

      {selectedClass && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => setSelectedClass(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold">
                {selectedClass.class_level}{selectedClass.class_room ? ` / ${selectedClass.class_room}` : ''} 출결
              </h3>
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
