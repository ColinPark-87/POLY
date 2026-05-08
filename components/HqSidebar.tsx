'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/hq/dashboard', label: '통합 대시보드', icon: '🏢' },
  { href: '/hq/campuses', label: '캠퍼스 관리', icon: '🏫' },
  { href: '/hq/employees', label: '전체 직원', icon: '👥' },
  { href: '/hq/calendar', label: '통합 캘린더', icon: '📅' },
  { href: '/hq/leaves', label: '연차 신청 이력', icon: '📄' },
  { href: '/hq/import', label: '캠퍼스파일 업로드/다운로드', icon: '📂' },
  { href: '/hq/settings', label: '설정', icon: '⚙️' },
]

export default function HqSidebar({ userName }: { userName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-[#E2E8F0] flex-col hidden md:flex">
      <div className="px-4 py-3 border-b border-[#E2E6EC]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#004EA2] flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-black tracking-tight">P</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0C1220] leading-tight">Poly Leave</p>
            <p className="text-[10px] text-[#6B7687] leading-tight">본사 (HQ)</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#004EA2] flex items-center justify-center text-white text-[10px] font-bold">{userName[0]}</div>
          <p className="text-xs text-[#2E3744] font-medium truncate">{userName}</p>
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
                  ? 'bg-[#EAF2FB] text-[#002F65] font-semibold'
                  : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
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
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
        >
          <span>🚪</span><span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
