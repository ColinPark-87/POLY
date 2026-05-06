'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const AVATAR_COLORS = ['#004EA2', '#F59E0B', '#8B5CF6', '#10B981', '#F97316', '#EF4444', '#6366F1', '#06B6D4', '#EC4899', '#84CC16']
function getAvatarColor(name: string) {
  if (!name) return '#64748B'
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

export default function Sidebar({ userName, userPosition }: { userName: string; userPosition?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
    const active = pathname === href || (href !== '/' && pathname.startsWith(href))
    return (
      <Link href={href} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-[#EAF2FB] text-[#002F65] font-semibold' : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
      }`}>
        <span className="text-base w-5 text-center">{icon}</span>
        <span>{label}</span>
      </Link>
    )
  }

  const avatarColor = getAvatarColor(userName)
  const initial = userName ? userName[0] : 'U'

  return (
    <aside className="w-52 min-h-screen bg-white border-r border-[#E2E8F0] flex-col hidden md:flex">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-[#E2E6EC]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#004EA2] flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-black tracking-tight">P</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0C1220] leading-tight">Poly Leave</p>
            <p className="text-[10px] text-[#6B7687] leading-tight">직원 포털</p>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="p-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1E293B] truncate">{userName}</p>
            <p className="text-xs text-[#64748B]">{userPosition ?? '직원'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        <div>
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider px-3 mb-1">공통</p>
          <NavItem href="/calendar" label="전사 캘린더" icon="📅" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider px-3 mb-1">개인</p>
          <NavItem href="/dashboard" label="내 대시보드" icon="🏠" />
          <NavItem href="/apply" label="연차 신청" icon="✏️" />
          <NavItem href="/history" label="나의 연차 내역" icon="🕐" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider px-3 mb-1">계정</p>
          <NavItem href="/settings" label="내 설정" icon="⚙️" />
        </div>
      </nav>

      <div className="p-3 border-t border-[#E2E8F0]">
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
        >
          <span>🚪</span><span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
