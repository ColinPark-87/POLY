'use client'
import { useEffect } from 'react'

export default function RedirectingPage() {
  useEffect(() => {
    fetch('/api/debug/me')
      .then(r => r.json())
      .then(data => {
        const role =
          data.byId?.data?.role ??
          data.byEmail?.data?.role ??
          data.orQuery?.data?.[0]?.role ??
          ''
        if (role === 'hq_admin') {
          window.location.href = '/hq/dashboard'
          return
        }
        if (role === 'campus_admin') {
          window.location.href = '/campus/dashboard'
          return
        }
        window.location.href = '/dashboard'
      })
      .catch(() => {
        window.location.href = '/dashboard'
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#00152F] via-[#002149] to-[#003E83]">
      <div className="text-white text-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm opacity-70">로그인 중...</p>
      </div>
    </div>
  )
}
