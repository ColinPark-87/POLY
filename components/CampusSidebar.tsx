'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/campus/dashboard', label: '대시보드', icon: '📊' },
  { href: '/campus/approvals', label: '승인 대기', icon: '✅' },
  { href: '/campus/overview', label: '연차 현황', icon: '📋' },
  { href: '/campus/balances', label: '잔여 관리', icon: '📊' },
  { href: '/campus/employees', label: '직원 관리', icon: '👥' },
  { href: '/campus/holidays', label: '공휴일', icon: '🗓️' },
  { href: '/campus/direct-entry', label: '직접 입력', icon: '✏️' },
  { href: '/campus/import', label: 'Excel Import', icon: '📥' },
  { href: '/campus/calendar', label: '캘린더', icon: '📅' },
]

export default function CampusSidebar({ userName, campusName }: { userName: string; campusName: string }) {
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
          <div className="w-9 h-9 rounded-xl bg-[#7C3AED] flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">원</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[#64748B] truncate">{campusName}</p>
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
                  ? 'bg-[#F3F0FF] text-[#7C3AED] font-semibold'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-[#E2E8F0] space-y-1">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#64748B] hover:bg-[#F8FAFC]">
          <span>👤</span><span>직원 화면</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
        >
          <span>🚪</span><span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
