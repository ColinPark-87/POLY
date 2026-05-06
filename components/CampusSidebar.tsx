'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const AVATAR_COLORS = ['#004EA2','#F59E0B','#8B5CF6','#10B981','#F97316','#EF4444','#6366F1','#06B6D4','#EC4899','#84CC16']
function getAvatarColor(name: string) {
  if (!name) return '#64748B'
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

interface NavDef { href: string; label: string; required?: boolean; employeeOnly?: boolean }

const DASHBOARD_NAV: NavDef[] = [
  { href: '/campus/dashboard', label: '캠퍼스 대시보드', required: true },
  { href: '/campus/my-dashboard', label: '내 대시보드', employeeOnly: true },
]
const LEAVE_NAV: NavDef[] = [
  { href: '/campus/approvals', label: '연차 신청 관리' },
  { href: '/campus/overview', label: '전체 연차 현황' },
  { href: '/campus/balances', label: '연차 잔여 관리' },
  { href: '/campus/my-history', label: '나의 연차 내역', employeeOnly: true },
]
const TOOLS_NAV: NavDef[] = [
  { href: '/campus/class-roster', label: '개설반 현황' },
  { href: '/campus/vehicles', label: '차량 관리' },
  { href: '/campus/direct-entry', label: '연차 직접입력' },
  { href: '/campus/calendar', label: '캠퍼스 캘린더' },
  { href: '/campus/staff', label: '캠퍼스 직원 현황' },
]
const MANAGE_NAV: NavDef[] = [
  { href: '/campus/employees', label: '직원 관리' },
  { href: '/campus/settings', label: '내 설정' },
]
const SETUP_NAV: NavDef[] = [
  { href: '/campus/import', label: '연차 업로드' },
  { href: '/campus/class-roster', label: '반편성·차량 업로드' },
]
const HOLIDAY_NAV: NavDef[] = [
  { href: '/campus/holidays', label: '공휴일 설정' },
]

const ALL_SECTIONS = [
  { id: 'dashboard', label: '대시보드',   items: DASHBOARD_NAV, noCollapse: true },
  { id: 'leave',     label: '연차관리',   items: LEAVE_NAV },
  { id: 'setup',     label: '세팅/업로드', items: SETUP_NAV },
  { id: 'holiday',   label: '공휴일',     items: HOLIDAY_NAV },
  { id: 'manage',    label: '관리',       items: MANAGE_NAV },
]

// 대시보드 아래 자유 배치 가능한 전체 아이템
const ALL_ORDERABLE: NavDef[] = [
  ...TOOLS_NAV,
  ...LEAVE_NAV,
  ...SETUP_NAV,
  ...HOLIDAY_NAV,
  ...MANAGE_NAV,
]
const DEFAULT_ORDER = ALL_ORDERABLE.map(i => i.href)

const PREFS_KEY = 'campus-sidebar-hidden'
const ORDER_KEY  = 'campus-sidebar-order'

export default function CampusSidebar({ userName, campusName, role }: { userName: string; campusName: string; role: string }) {
  const isAdmin = role === 'campus_admin' || role === 'hq_admin'
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_SECTIONS.map(s => [s.id, true]))
  )
  const [settingsMode, setSettingsMode] = useState(false)
  const [hiddenHrefs, setHiddenHrefs] = useState<string[]>([])
  const [draftHidden, setDraftHidden] = useState<string[]>([])
  const [itemOrder, setItemOrder] = useState<string[]>(DEFAULT_ORDER)
  const [draggingHref, setDraggingHref] = useState<string | null>(null)
  const [dragOverHref, setDragOverHref] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY)
      if (saved) setHiddenHrefs(JSON.parse(saved))
    } catch {}
    try {
      const savedOrder = localStorage.getItem(ORDER_KEY)
      if (savedOrder) {
        const parsed: string[] = JSON.parse(savedOrder)
        // 저장된 순서 + 새로 추가된 항목은 뒤에 붙임
        const merged = [
          ...parsed.filter(h => DEFAULT_ORDER.includes(h)),
          ...DEFAULT_ORDER.filter(h => !parsed.includes(h)),
        ]
        setItemOrder(merged)
      }
    } catch {}
  }, [])

  function handleDragDrop(targetHref: string) {
    if (!draggingHref || draggingHref === targetHref) return
    const next = [...itemOrder]
    const fi = next.indexOf(draggingHref)
    const ti = next.indexOf(targetHref)
    next.splice(fi, 1)
    next.splice(ti, 0, draggingHref)
    setItemOrder(next)
    localStorage.setItem(ORDER_KEY, JSON.stringify(next))
    setDraggingHref(null)
    setDragOverHref(null)
  }

  function openSettings() {
    setDraftHidden([...hiddenHrefs])
    setSettingsMode(true)
    if (!sidebarOpen) setSidebarOpen(true)
  }

  function saveSettings() {
    setHiddenHrefs(draftHidden)
    localStorage.setItem(PREFS_KEY, JSON.stringify(draftHidden))
    setSettingsMode(false)
  }

  function toggleDraft(href: string) {
    setDraftHidden(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    )
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function toggle(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const avatarColor = getAvatarColor(userName)
  const initial = userName ? userName[0] : 'O'

  function NavItem({ href, label }: NavDef) {
    const active = pathname === href || (href !== '/' && pathname.startsWith(href))
    return (
      <Link href={href} title={!sidebarOpen ? label : undefined}
        className={`flex-1 block rounded-lg text-sm transition-colors ${
          sidebarOpen ? 'px-3 py-2' : 'px-2 py-2 text-center'
        } ${active
          ? 'bg-[#EAF2FB] text-[#002F65] font-semibold'
          : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
        }`}>
        {sidebarOpen ? label : label[0]}
      </Link>
    )
  }

  function Section({ id, label, items, noCollapse }: { id: string; label: string; items: NavDef[]; noCollapse?: boolean }) {
    const open = noCollapse || !collapsed[id]
    const visibleItems = items.filter(item => !hiddenHrefs.includes(item.href) && !(isAdmin && item.employeeOnly))
    if (visibleItems.length === 0) return null
    const hasActive = visibleItems.some(item => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)))

    if (!sidebarOpen) {
      return (
        <div className="space-y-0.5">
          {visibleItems.map(item => <NavItem key={item.href} {...item} />)}
        </div>
      )
    }

    return (
      <div>
        {noCollapse ? (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 mb-1`}>
            {hasActive && <div className="w-1 h-3 rounded-full bg-[#004EA2]" />}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${hasActive ? 'text-[#004EA2]' : 'text-[#94A3B8]'}`}>{label}</span>
          </div>
        ) : (
          <button
            onClick={() => toggle(id)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg mb-1 transition-colors ${
              hasActive
                ? 'bg-[#EAF2FB] text-[#004EA2]'
                : 'text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F7F8FA]'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {hasActive && <div className="w-1 h-3 rounded-full bg-[#004EA2]" />}
              <span className={`text-[10px] font-bold uppercase tracking-wider ${hasActive ? 'text-[#004EA2]' : ''}`}>{label}</span>
            </div>
            <svg className={`w-3 h-3 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {open && (
          <div className="space-y-0.5">
            {visibleItems.map(item => <NavItem key={item.href} {...item} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className={`${sidebarOpen ? 'w-52' : 'w-12'} min-h-screen bg-white border-r border-[#E2E8F0] hidden md:flex flex-col transition-all duration-200 overflow-hidden flex-shrink-0`}>

      {/* Logo + collapse toggle */}
      <div className="px-3 py-3 border-b border-[#E2E6EC] flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#004EA2] flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-black">P</span>
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-[#0C1220] leading-tight truncate">캠퍼스 관리시스템</p>
              <p className="text-[10px] text-[#6B7687] leading-tight truncate">{campusName}</p>
            </div>
          )}
        </div>
        <button onClick={() => setSidebarOpen(p => !p)}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#64748B] transition-colors"
          title={sidebarOpen ? '접기' : '펼치기'}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={sidebarOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
          </svg>
        </button>
      </div>

      {/* User */}
      <div className={`border-b border-[#E2E8F0] ${sidebarOpen ? 'p-3' : 'py-3 flex justify-center'}`}>
        <div className={`flex items-center ${sidebarOpen ? 'gap-2.5' : 'justify-center'}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }} title={!sidebarOpen ? userName : undefined}>
            {initial}
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1E293B] truncate">{userName}</p>
              <p className="text-xs text-[#64748B]">원장</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav or Settings mode */}
      {settingsMode ? (
        /* ── 사이드바 설정 모드 ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#004EA2]">사이드바 설정</span>
            <span className="text-[9px] text-[#94A3B8]">표시할 메뉴 선택</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
            {ALL_SECTIONS.map(sec => (
              <div key={sec.id}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] px-2 mb-1">{sec.label}</p>
                <div className="space-y-0.5">
                  {sec.items.filter(item => !(isAdmin && item.employeeOnly)).map(item => {
                    const isHidden = draftHidden.includes(item.href)
                    const isRequired = item.required
                    return (
                      <button key={item.href}
                        disabled={isRequired}
                        onClick={() => !isRequired && toggleDraft(item.href)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          isHidden ? 'text-[#CBD5E1] bg-[#F8FAFC]' : 'text-[#1E293B] bg-[#EAF2FB]'
                        } ${isRequired ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-[#F1F5F9]'}`}
                      >
                        <span>{item.label}</span>
                        <span className={`text-[10px] font-bold ${isHidden ? 'text-[#CBD5E1]' : 'text-[#004EA2]'}`}>
                          {isRequired ? '필수' : isHidden ? '숨김' : '표시'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E2E8F0] p-2 flex gap-1.5">
            <button onClick={saveSettings}
              className="flex-1 py-1.5 rounded-lg bg-[#004EA2] text-white text-xs font-bold hover:bg-[#003A82] transition-colors">
              저장
            </button>
            <button onClick={() => setSettingsMode(false)}
              className="flex-1 py-1.5 rounded-lg bg-[#F1F5F9] text-[#64748B] text-xs font-semibold hover:bg-[#E2E8F0] transition-colors">
              취소
            </button>
          </div>
        </div>
      ) : (
        /* ── 일반 네비게이션 ── */
        <nav className={`flex-1 overflow-y-auto ${sidebarOpen ? 'p-3' : 'py-3 px-1'}`}>
          {/* 대시보드 (고정) */}
          <div className="mb-3">
            <Section key="dashboard" id="dashboard" label="대시보드" items={DASHBOARD_NAV} noCollapse={true} />
          </div>

          {/* 나머지 아이템 — 드래그로 순서 변경 */}
          <div className="space-y-0.5">
            {itemOrder
              .map(href => ALL_ORDERABLE.find(i => i.href === href))
              .filter((item): item is NavDef => !!item && !hiddenHrefs.includes(item.href) && !(isAdmin && item.employeeOnly === true))
              .map(item => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                const isDragging = draggingHref === item.href
                const isOver = dragOverHref === item.href && draggingHref !== item.href
                return (
                  <div
                    key={item.href}
                    draggable
                    onDragStart={() => setDraggingHref(item.href)}
                    onDragEnd={() => { setDraggingHref(null); setDragOverHref(null) }}
                    onDragOver={e => { e.preventDefault(); setDragOverHref(item.href) }}
                    onDrop={() => handleDragDrop(item.href)}
                    className={`group flex items-center rounded-lg transition-all ${
                      isOver ? 'ring-1 ring-[#004EA2] ring-offset-1' : ''
                    } ${isDragging ? 'opacity-30' : ''}`}
                  >
                    {sidebarOpen && (
                      <div className="w-4 flex justify-center cursor-grab shrink-0 text-[#CBD5E1] group-hover:text-[#94A3B8]">
                        <svg className="w-2.5 h-4" viewBox="0 0 8 16" fill="currentColor">
                          <circle cx="2" cy="4" r="1.2"/><circle cx="6" cy="4" r="1.2"/>
                          <circle cx="2" cy="8" r="1.2"/><circle cx="6" cy="8" r="1.2"/>
                          <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
                        </svg>
                      </div>
                    )}
                    <NavItem href={item.href} label={item.label} />
                  </div>
                )
              })
            }
          </div>
        </nav>
      )}

      {/* Bottom: 사이드바 설정 + Logout */}
      <div className={`border-t border-[#E2E8F0] ${sidebarOpen ? 'p-3 space-y-1' : 'py-3 px-1 space-y-1'}`}>
        {!settingsMode && (
          <button onClick={openSettings}
            title={!sidebarOpen ? '사이드바 설정' : undefined}
            className={`w-full flex items-center rounded-lg text-sm text-[#64748B] hover:bg-[#EAF2FB] hover:text-[#004EA2] transition-colors ${sidebarOpen ? 'gap-2 px-3 py-2' : 'justify-center py-2'}`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            {sidebarOpen && <span className="text-sm">사이드바 설정</span>}
          </button>
        )}
        <button onClick={handleLogout}
          title={!sidebarOpen ? '로그아웃' : undefined}
          className={`w-full flex items-center rounded-lg text-sm text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors ${sidebarOpen ? 'gap-2 px-3 py-2' : 'justify-center py-2'}`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          {sidebarOpen && <span>로그아웃</span>}
        </button>
      </div>
    </aside>
  )
}
