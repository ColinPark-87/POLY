'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const defaultNavItems = [
  { href: '/dashboard', label: '홈', icon: '📊' },
  { href: '/apply', label: '신청', icon: '✏️' },
  { href: '/history', label: '내역', icon: '📋' },
  { href: '/calendar', label: '캘린더', icon: '📅' },
  { href: '/settings', label: '설정', icon: '⚙️' },
]

const safetyNavItems = [
  { href: '/vehicles', label: '등하원', icon: '🚌' },
  { href: '/dashboard', label: '홈', icon: '📊' },
  { href: '/calendar', label: '캘린더', icon: '📅' },
  { href: '/settings', label: '설정', icon: '⚙️' },
]

const campusStaffNavItems = [
  { href: '/dashboard', label: '홈', icon: '📊' },
  { href: '/campus/class-roster', label: '반편성', icon: '🏫' },
  { href: '/campus/vehicles', label: '차량', icon: '🚌' },
  { href: '/apply', label: '연차신청', icon: '✏️' },
  { href: '/settings', label: '설정', icon: '⚙️' },
]

export default function BottomNav({ userPosition }: { userPosition?: string }) {
  const pathname = usePathname()
  const isSafety = userPosition?.includes('안전') || userPosition?.includes('POLY')
  const isCampusStaff =
    !isSafety && (
      userPosition?.includes('상담') ||
      userPosition?.includes('KT') ||
      userPosition?.includes('관리자') ||
      userPosition?.includes('POLY안전')
    )
  const navItems = isSafety ? safetyNavItems : isCampusStaff ? campusStaffNavItems : defaultNavItems

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
              active ? 'text-[#004EA2]' : 'text-[#94A3B8]'
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
