'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/hq/dashboard', label: '대시보드', icon: '🏢' },
  { href: '/hq/campuses', label: '캠퍼스', icon: '🏫' },
  { href: '/hq/employees', label: '직원', icon: '👥' },
  { href: '/hq/calendar', label: '캘린더', icon: '📅' },
]

export default function HqBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] flex md:hidden z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map(item => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${
              active ? 'text-[#0F172A]' : 'text-[#94A3B8]'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className={`text-[10px] ${active ? 'font-semibold' : ''}`}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
