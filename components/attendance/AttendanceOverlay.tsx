// components/attendance/AttendanceOverlay.tsx
'use client'
import { useEffect, useState } from 'react'
import { StudentStatusToggle } from './StudentStatusToggle'
import type { AttendanceStatus } from '@/lib/attendance'
import type { StudentForOverlay } from '@/hooks/useAttendanceTimer'

interface Props {
  classId: string
  campusId: string
  students: StudentForOverlay[]
  onComplete: () => void
}

export function AttendanceOverlay({ classId, campusId, students, onComplete }: Props) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const init: Record<string, AttendanceStatus> = {}
    students.forEach(s => {
      init[s.student_id] = s.pre_marked_absent ? 'absent' : 'present'
    })
    setStatuses(init)
  }, [students])

  useEffect(() => {
    // ESC / Alt+F4 / Ctrl+W / F11 등 닫기·이탈 키 차단
    const block = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'Escape' || k === 'F11'
        || (e.altKey && k === 'F4')
        || (e.ctrlKey && (k === 'w' || k === 'W' || k === 'r' || k === 'R'))
      ) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', block, true)
    // 새로고침·닫기 시도 경고
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('keydown', block, true)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])

  function handleStatusChange(studentId: string, status: AttendanceStatus) {
    setStatuses(prev => ({ ...prev, [studentId]: status }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const records = students.map(s => ({
        student_id: s.student_id,
        status: statuses[s.student_id] ?? 'present',
      }))
      const res = await fetch('/api/smartboard/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId, records }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      onComplete()
    } catch (e) {
      setErr('저장 실패: ' + (e instanceof Error ? e.message : '알 수 없음'))
      setSubmitting(false)
    }
  }

  const absentCount = Object.values(statuses).filter(s => s === 'absent').length
  const lateCount = Object.values(statuses).filter(s => s === 'late').length

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col"
      style={{ zIndex: 9999, width: '100vw', height: '100vh' }}
    >
      <div className="bg-[#004EA2] text-white px-8 py-6 flex-shrink-0">
        <h1 className="text-3xl font-bold">출석 체크</h1>
        <p className="text-blue-200 mt-1 text-lg">결석·지각 학생을 탭하여 표시하세요. 완료 버튼을 눌러야 저장됩니다.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {students.map(s => (
            <StudentStatusToggle
              key={s.student_id}
              studentId={s.student_id}
              name={s.student_name}
              status={statuses[s.student_id] ?? 'present'}
              preMarked={s.pre_marked_absent}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 p-8 border-t bg-gray-50 flex items-center justify-between">
        <div className="text-gray-600 text-lg">
          결석 <strong className="text-red-600">{absentCount}</strong>명 &nbsp;
          지각 <strong className="text-yellow-600">{lateCount}</strong>명
          {err && <p className="text-red-600 text-sm mt-1">{err}</p>}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-[#004EA2] hover:bg-blue-800 disabled:opacity-50 text-white text-2xl font-bold px-16 py-5 rounded-2xl transition-colors"
        >
          {submitting ? '저장 중...' : '출석 완료'}
        </button>
      </div>
    </div>
  )
}
