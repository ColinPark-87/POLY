// components/attendance/StudentStatusToggle.tsx
'use client'
import type { AttendanceStatus } from '@/lib/attendance'

interface Props {
  studentId: string
  name: string
  status: AttendanceStatus
  preMarked?: boolean
  onStatusChange: (studentId: string, status: AttendanceStatus) => void
}

const STATUS_CYCLE: AttendanceStatus[] = ['present', 'absent', 'late']
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-green-50 border-green-400 text-green-800',
  absent: 'bg-red-50 border-red-400 text-red-800',
  late: 'bg-yellow-50 border-yellow-400 text-yellow-800',
}
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
}
const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: '🟢',
  absent: '🔴',
  late: '🟡',
}

export function StudentStatusToggle({ studentId, name, status, preMarked, onStatusChange }: Props) {
  function cycle() {
    const idx = STATUS_CYCLE.indexOf(status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(studentId, next)
  }

  return (
    <button
      onClick={cycle}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl text-lg font-medium border-2 transition-colors select-none ${STATUS_STYLE[status]}`}
    >
      <span className="text-xl">{STATUS_ICON[status]}</span>
      <span>{name}</span>
      {preMarked && status === 'absent' && (
        <span className="text-xs font-bold bg-red-200 text-red-700 px-1 rounded">사전</span>
      )}
      <span className="text-sm font-normal opacity-70">{STATUS_LABEL[status]}</span>
    </button>
  )
}
