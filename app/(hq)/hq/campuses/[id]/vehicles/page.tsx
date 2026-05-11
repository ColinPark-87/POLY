'use client'

import { use } from 'react'
import Link from 'next/link'
import RouteMapView from '@/app/(campus)/campus/vehicles/RouteMapView'

export default function HqCampusVehiclesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/hq/campuses/${id}`} className="text-sm text-[#94A3B8] hover:text-[#004EA2] transition-colors">
          ← 캠퍼스 상세
        </Link>
        <span className="text-[#E2E8F0]">/</span>
        <span className="text-sm font-semibold text-[#1E293B]">차량 운행 현황</span>
      </div>
      <RouteMapView campusId={id} />
    </div>
  )
}
