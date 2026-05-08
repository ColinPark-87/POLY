'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navSections = [
  {
    items: [
      { href: '/hq/dashboard', label: '통합 대시보드', icon: '🏢' },
    ],
  },
  {
    title: '캠퍼스',
    items: [
      { href: '/hq/campuses', label: '캠퍼스 관리', icon: '🏫' },
      { href: '/hq/vehicles', label: '차량 운행현황', icon: '🚌' },
    ],
  },
  {
    title: '인사 · 연차',
    items: [
      { href: '/hq/employees', label: '전체 직원', icon: '👥' },
      { href: '/hq/calendar', label: '통합 캘린더', icon: '📅' },
      { href: '/hq/leaves', label: '연차 신청 이력', icon: '📄' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/hq/import', label: '파일 업로드/다운로드', icon: '📂' },
      { href: '/hq/settings', label: '설정', icon: '⚙️' },
    ],
  },
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
      {/* 로고 */}
      <div className="px-4 py-4 border-b border-[#E2E6EC]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#004EA2] flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-black tracking-tight">P</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0C1220] leading-tight">Poly Leave</p>
            <p className="text-[10px] text-[#6B7687] leading-tight">본사 (HQ)</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#004EA2] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{userName[0]}</div>
          <p className="text-xs text-[#2E3744] font-medium truncate">{userName}</p>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="text-[9px] font-bold text-[#CBD5E1] uppercase tracking-widest px-2 mb-1">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = pathname === item.href || (item.href !== '/hq/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                      active
                        ? 'bg-[#EAF2FB] text-[#002F65] font-semibold'
                        : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
                    }`}
                  >
                    <span className="text-[14px] w-5 text-center leading-none shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 로그아웃 */}
      <div className="px-3 py-3 border-t border-[#E2E8F0]">
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
        >
          <span className="text-[14px] w-5 text-center shrink-0">🚪</span>
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
