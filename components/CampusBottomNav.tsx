'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/campus/dashboard', label: '홈', icon: '📊' },
  { href: '/campus/approvals', label: '연차', icon: '✅' },
  { href: '/campus/class-roster', label: '반편성', icon: '🏫' },
  { href: '/campus/vehicles', label: '등하원', icon: '🚌' },
  { href: '/campus/settings', label: '설정', icon: '⚙️' },
]

// 캠퍼스 제한 직원(상담/KT/관리자/POLY안전) — 개인 연차(직원 자가서비스) + 허용된 캠퍼스 도구
const staffNavItems = [
  { href: '/dashboard', label: '내연차', icon: '🌴' },
  { href: '/apply', label: '신청', icon: '✏️' },
  { href: '/campus/class-roster', label: '반편성', icon: '🏫' },
  { href: '/campus/vehicles', label: '등하원', icon: '🚌' },
  { href: '/campus/attendance', label: '출결', icon: '✅' },
]

export default function CampusBottomNav({ staffOnly = false, permAttendance = false }: { staffOnly?: boolean; permAttendance?: boolean }) {
  const pathname = usePathname()
  let items = staffOnly ? staffNavItems : navItems
  // 출결 권한 있으면 일반 네비에 '출결' 추가 (설정 앞에 끼움)
  if (!staffOnly && permAttendance) {
    items = [...navItems.slice(0, 4), { href: '/campus/attendance', label: '출결', icon: '📋' }, ...navItems.slice(4)]
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] flex md:hidden z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(item => {
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
