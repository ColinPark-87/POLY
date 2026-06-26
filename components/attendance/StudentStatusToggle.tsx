// components/attendance/StudentStatusToggle.tsx
'use client'
import type { AttendanceStatus } from '@/lib/attendance'

interface Props {
  studentId: string
  name: string
  englishName?: string | null
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
const STATUS_LABEL_KO: Record<AttendanceStatus, string> = {
  present: '출석', absent: '결석', late: '지각',
}
const STATUS_LABEL_EN: Record<AttendanceStatus, string> = {
  present: 'Present', absent: 'Absent', late: 'Late',
}
const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: '🟢',
  absent: '🔴',
  late: '🟡',
}

export function StudentStatusToggle({ studentId, name, englishName, status, preMarked, onStatusChange }: Props) {
  function cycle() {
    const idx = STATUS_CYCLE.indexOf(status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(studentId, next)
  }

  return (
    <button
      onClick={cycle}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors select-none w-full h-full text-left ${STATUS_STYLE[status]}`}
    >
      <span className="text-xl shrink-0 leading-none">{STATUS_ICON[status]}</span>
      <span className="flex-1 min-w-0">
        <span className="text-lg font-semibold truncate block leading-tight">{name}</span>
        {englishName && <span className="text-xs font-normal opacity-60 truncate block leading-tight">{englishName}</span>}
      </span>
      {preMarked && status === 'absent' && (
        <span className="text-xs font-bold bg-red-200 text-red-700 px-1 rounded shrink-0">사전</span>
      )}
      <span className="shrink-0 w-16 text-right leading-tight">
        <span className="block text-sm font-bold">{STATUS_LABEL_KO[status]}</span>
        <span className="block text-[10px] opacity-70">{STATUS_LABEL_EN[status]}</span>
      </span>
    </button>
  )
}
