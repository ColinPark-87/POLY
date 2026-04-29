'use client'

import { useRouter } from 'next/navigation'

export default function CampusMobileHeader({ userName, campusName }: { userName: string; campusName: string }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-[#7C3AED] flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">원</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[#64748B] truncate">{campusName}</p>
          <p className="text-xs font-semibold text-[#1E293B] truncate">{userName}</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="text-xs text-[#64748B] px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] shrink-0"
      >
        로그아웃
      </button>
    </header>
  )
}
