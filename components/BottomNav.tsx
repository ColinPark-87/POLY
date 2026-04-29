'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: '홈', icon: '📊' },
  { href: '/apply', label: '신청', icon: '✏️' },
  { href: '/history', label: '내역', icon: '📋' },
  { href: '/calendar', label: '캘린더', icon: '📅' },
  { href: '/settings', label: '설정', icon: '⚙️' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] flex md:hidden z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {navItems.map(item => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${
              active ? 'text-[#4F7EF7]' : 'text-[#94A3B8]'
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
