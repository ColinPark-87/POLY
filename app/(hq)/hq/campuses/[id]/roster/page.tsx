'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Session { id: string; name: string; time_range: string | null; sort_order: number }
interface Class { id: string; session_id: string; level: string; teacher: string | null; room: string | null; color: string | null; sort_order: number }
interface Enrollment { id: string; class_id: string; student_id: string; campus_students: { id: string; name: string; english_name: string | null; grade: string | null } | null }
interface RosterData {
  campus: { id: string; name: string }
  sessions: Session[]
  classes: Class[]
  enrollments: Enrollment[]
  availableMonths: string[]
  currentMonth: string
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin"/></div>
}

export default function HqRosterPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<RosterData | null>(null)
  const [month, setMonth] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(month ? { month } : {})
    fetch(`/api/hq/campuses/${id}/roster?${params}`).then(r => r.json()).then(d => {
      setData(d)
      if (!month && d.currentMonth) setMonth(d.currentMonth)
    })
  }, [id, month])

  if (!data) return <Spinner />

  const { campus, sessions, classes, enrollments, availableMonths, currentMonth } = data

  // 인덱스 구성
  const classBySession: Record<string, Class[]> = {}
  for (const c of classes) {
    if (!classBySession[c.session_id]) classBySession[c.session_id] = []
    classBySession[c.session_id].push(c)
  }
  const enrByClass: Record<string, Enrollment[]> = {}
  for (const e of enrollments) {
    if (!enrByClass[e.class_id]) enrByClass[e.class_id] = []
    enrByClass[e.class_id].push(e)
  }

  const totalStudents = classes.reduce((s, c) => s + (enrByClass[c.id]?.length ?? 0), 0)

  return (
    <div className="max-w-5xl">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/hq/campuses/${id}`} className="text-xs text-[#94A3B8] hover:text-[#004EA2]">← 캠퍼스</Link>
          </div>
          <h1 className="text-xl font-bold text-[#1E293B]">{campus.name} 재원생 현황</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">읽기 전용 · {currentMonth} · 총 {totalStudents}명</p>
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
          {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-[#94A3B8]">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm">이 월의 수업 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sessions.map(sess => {
            const sessClasses = classBySession[sess.id] ?? []
            const sessTotal = sessClasses.reduce((s, c) => s + (enrByClass[c.id]?.length ?? 0), 0)
            return (
              <div key={sess.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                {/* 세션 헤더 */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#F7F8FA] border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1E293B]">{sess.name}</span>
                    {sess.time_range && (
                      <span className="text-xs text-white bg-[#004EA2] px-2 py-0.5 rounded-full">{sess.time_range}</span>
                    )}
                  </div>
                  <span className="text-xs text-[#94A3B8]">{sessTotal}명 · {sessClasses.length}반</span>
                </div>

                {/* 반 목록 */}
                {sessClasses.length === 0 ? (
                  <p className="text-center text-[#CBD5E1] text-sm py-6">반 없음</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#F1F5F9]">
                    {sessClasses.map(cls => {
                      const students = enrByClass[cls.id] ?? []
                      const color = cls.color ?? '#004EA2'
                      return (
                        <div key={cls.id} className="bg-white p-3">
                          {/* 반 헤더 */}
                          <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#F1F5F9]">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }}/>
                            <span className="font-bold text-sm text-[#1E293B]">{cls.level}</span>
                            {cls.teacher && <span className="text-[10px] text-[#94A3B8]">{cls.teacher}</span>}
                            {cls.room && <span className="text-[10px] text-[#94A3B8]">{cls.room}</span>}
                            <span className="ml-auto text-[10px] font-bold" style={{ color }}>{students.length}명</span>
                          </div>
                          {/* 학생 목록 */}
                          {students.length === 0 ? (
                            <p className="text-[11px] text-[#CBD5E1] text-center py-2">수강생 없음</p>
                          ) : (
                            <div className="space-y-0.5">
                              {students.map((enr, i) => {
                                const stu = enr.campus_students
                                return (
                                  <div key={enr.id} className="flex items-center gap-2 py-0.5">
                                    <span className="text-[9px] text-[#CBD5E1] w-4 text-right flex-shrink-0">{i + 1}</span>
                                    <span className="text-[11px] font-semibold text-[#1E293B]">{stu?.name ?? '-'}</span>
                                    {stu?.english_name && (
                                      <span className="text-[9px] text-[#94A3B8] truncate">{stu.english_name}</span>
                                    )}
                                    {stu?.grade && (
                                      <span className="ml-auto text-[9px] text-[#94A3B8] flex-shrink-0">{stu.grade}</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
