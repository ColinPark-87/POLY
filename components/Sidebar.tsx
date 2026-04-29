'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/apply', label: '연차 신청', icon: '✏️' },
  { href: '/history', label: '나의 내역', icon: '📋' },
  { href: '/calendar', label: '캘린더', icon: '📅' },
  { href: '/settings', label: '설정', icon: '⚙️' },
]

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-[#E2E8F0] flex-col hidden md:flex">
      <div className="p-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#4F7EF7] flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">연</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[#64748B]">연차 관리</p>
            <p className="text-sm font-semibold text-[#1E293B] truncate">{userName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? 'bg-[#EEF2FF] text-[#4F7EF7] font-semibold'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-[#E2E8F0]">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
