'use client'

import { useEffect, useState } from 'react'
import RouteMapView from '@/app/(campus)/campus/vehicles/RouteMapView'

interface Campus {
  id: string
  name: string
  code: string
  is_active: boolean
}

export default function HqVehiclesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hq/campuses')
      .then(r => r.json())
      .then((data: { campuses: Campus[] }) => {
        const active = (data.campuses ?? []).filter(c => c.is_active)
        setCampuses(active)
        if (active.length > 0) setSelectedId(active[0].id)
      })
  }, [])

  const selected = campuses.find(c => c.id === selectedId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-[#0F172A] tracking-tight">캠퍼스 차량 운행현황</h1>
        <p className="text-xs text-[#94A3B8] mt-0.5">캠퍼스를 선택하여 차량 운행 현황을 확인하세요</p>
      </div>

      {/* 캠퍼스 탭 */}
      <div className="flex flex-wrap gap-2">
        {campuses.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedId === c.id
                ? 'bg-[#004EA2] text-white shadow-sm'
                : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#004EA2] hover:text-[#004EA2]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 선택된 캠퍼스 차량 현황 */}
      {selectedId ? (
        <div>
          {selected && (
            <p className="text-xs text-[#94A3B8] mb-3 font-medium">{selected.name} 차량 운행 현황</p>
          )}
          <RouteMapView campusId={selectedId} />
        </div>
      ) : (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
