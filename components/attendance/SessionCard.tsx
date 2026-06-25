// components/attendance/SessionCard.tsx
'use client'
import type { ClassWithAttendance } from '@/lib/attendance'

const UI_STATUS_STYLE: Record<string, string> = {
  '미도래': 'bg-gray-100 text-gray-500',
  '대기중': 'bg-blue-100 text-blue-700 animate-pulse',
  '완료': 'bg-green-100 text-green-700',
}

interface Props {
  classData: ClassWithAttendance
  onClick: (classData: ClassWithAttendance) => void
}

export function SessionCard({ classData, onClick }: Props) {
  const totalStudents = classData.students.length
  const presentCount = totalStudents - classData.absent_count - classData.late_count

  return (
    <button
      onClick={() => onClick(classData)}
      className="w-full text-left bg-white rounded-xl border-2 border-gray-100 hover:border-[#004EA2] hover:shadow-md transition-all p-4 space-y-2"
      style={{ borderLeftColor: classData.class_color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-800">{classData.class_level}{classData.class_room ? ` / ${classData.class_room}` : ''}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${UI_STATUS_STYLE[classData.ui_status]}`}>
          {classData.ui_status === '완료'
            ? `완료 ${presentCount}/${totalStudents}`
            : classData.ui_status}
        </span>
      </div>
      {classData.class_teacher && (
        <p className="text-sm text-gray-500">{classData.class_teacher}</p>
      )}
      {classData.absent_count > 0 && (
        <p className="text-sm text-red-600">
          결석: {classData.students.filter(s => s.status === 'absent').map(s => s.student_name).join(', ')}
        </p>
      )}
      {classData.late_count > 0 && (
        <p className="text-sm text-yellow-600">
          지각: {classData.students.filter(s => s.status === 'late').map(s => s.student_name).join(', ')}
        </p>
      )}
    </button>
  )
}
