'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Spinner, RosterView, type RosterData } from '@/components/HqRosterView'

export default function HqCampusRosterPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<RosterData | null>(null)
  const [month, setMonth] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(month ? { month } : {})
    fetch(`/api/hq/campuses/${id}/roster?${params}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        if (!month && d.currentMonth) setMonth(d.currentMonth)
      })
  }, [id, month])

  if (!data) return <Spinner />

  const { campus, availableMonths, currentMonth } = data
  const totalStudents = data.classes.reduce(
    (s, c) => s + (data.enrollments.filter(e => e.class_id === c.id).length), 0
  )

  return (
    <div className="max-w-5xl">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/hq/campuses/${id}`} className="text-xs text-[#94A3B8] hover:text-[#004EA2]">
              ← 캠퍼스
            </Link>
          </div>
          <h1 className="text-xl font-bold text-[#1E293B]">{campus.name} 재원생 현황</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            읽기 전용 · {currentMonth} · 총 {totalStudents}명
          </p>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
        >
          {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <RosterView data={data} />
    </div>
  )
}
