'use client'

import { useRouter } from 'next/navigation'

export default function MobileHeader({ userName }: { userName: string }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#4F7EF7] flex items-center justify-center">
          <span className="text-white text-xs font-bold">연</span>
        </div>
        <span className="text-sm font-semibold text-[#1E293B]">{userName}</span>
      </div>
      <button
        onClick={handleLogout}
        className="text-xs text-[#64748B] px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
      >
        로그아웃
      </button>
    </header>
  )
}
