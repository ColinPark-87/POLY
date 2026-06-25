// hooks/useAttendanceTimer.ts
'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseStartTime, toMinutes } from '@/lib/attendance'

export interface StudentForOverlay {
  student_id: string
  student_name: string
  pre_marked_absent: boolean
}

export function useAttendanceTimer(classId: string, campusId: string) {
  const [showOverlay, setShowOverlay] = useState(false)
  const [students, setStudents] = useState<StudentForOverlay[]>([])
  const triggeredRef = useRef<Set<string>>(new Set())

  const fetchStudents = useCallback(async () => {
    if (!classId) return
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id, campus_students(name)')
      .eq('class_id', classId)
      .eq('is_waitlist', false)

    const studentIds = (enrollments ?? []).map((e: any) => e.student_id)
    let preAbsentIds = new Set<string>()
    if (studentIds.length > 0) {
      const { data: session } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', classId)
        .eq('session_date', today)
        .maybeSingle()
      if (session) {
        const { data: records } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('attendance_session_id', session.id)
          .eq('pre_marked', true)
          .eq('status', 'absent')
        preAbsentIds = new Set((records ?? []).map((r: any) => r.student_id))
      }
    }

    setStudents(
      (enrollments ?? []).map((e: any) => ({
        student_id: e.student_id,
        student_name: (e.campus_students as any)?.name ?? '',
        pre_marked_absent: preAbsentIds.has(e.student_id),
      }))
    )
  }, [classId])

  useEffect(() => {
    if (!classId) return
    fetchStudents()
  }, [classId, fetchStudents])

  useEffect(() => {
    if (!classId) return

    async function checkTime() {
      const supabase = createClient()
      const { data: classData } = await supabase
        .from('classes')
        .select('class_sessions(time_range)')
        .eq('id', classId)
        .single()

      const timeRange = (classData?.class_sessions as any)?.time_range
      if (!timeRange) return

      const startTime = parseStartTime(timeRange)
      const now = new Date()
      const nowMin = toMinutes(`${now.getHours()}:${now.getMinutes()}`)
      const diff = toMinutes(startTime) - nowMin
      const today = now.toISOString().split('T')[0]
      const key = `${today}-${startTime}`

      if (diff <= 2 && diff >= -60 && !triggeredRef.current.has(key)) {
        const { data: existing } = await supabase
          .from('attendance_sessions')
          .select('completed_at')
          .eq('class_id', classId)
          .eq('session_date', today)
          .maybeSingle()

        if (existing?.completed_at) return

        triggeredRef.current.add(key)
        await fetchStudents()
        setShowOverlay(true)
        window.focus()
      }
    }

    checkTime()
    const id = setInterval(checkTime, 30_000)
    return () => clearInterval(id)
  }, [classId, fetchStudents])

  function dismissOverlay() {
    setShowOverlay(false)
    window.blur()
  }

  return { showOverlay, students, dismissOverlay }
}
