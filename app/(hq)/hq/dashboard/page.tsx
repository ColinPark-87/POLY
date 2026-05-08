'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Category = '유치부' | '초등부'

interface StudentChange {
  student_id: string
  name: string
  campus_id: string
  campus_name: string
  group: Category
  type: 'added' | 'removed'
}

interface CampusSummary {
  id: string
  name: string
  code: string
  is_active: boolean
  employeeCount: number
  totalGranted: number
  totalUsed: number
  remaining: number
  usageRate: number | null
  studentCount: number
  studentByGroup: Record<string, number>
  studentByCategory: Record<Category, number>
  prevStudentByCategory: Record<Category, number>
  todayArr: number
  todayDep: number
}

interface Stats {
  totalCampuses: number
  activeCampuses: number
  totalEmployees: number
  pendingTotal: number
  onLeaveTodayTotal: number
  campusSummaries: CampusSummary[]
  year: number
  totalStudents: number
  totalStudentByGroup: Record<string, number>
  totalStudentsByCategory: Record<Category, number>
  prevTotalStudentsByCategory: Record<Category, number>
  studentChanges: StudentChange[]
  prevMonthLabel: string | null
  todayDay: string | null
  totalTodayArr: number
  totalTodayDep: number
}

function fmtDays(v: number) { return parseFloat(v.toFixed(2)) }

function rateColor(rate: number) {
  if (rate >= 80) return { bar: '#EF4444', text: 'text-[#EF4444]', bg: 'bg-[#FEF2F2]', border: 'border-[#FECACA]' }
  if (rate >= 50) return { bar: '#F59E0B', text: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB]', border: 'border-[#FDE68A]' }
  return { bar: '#004EA2', text: 'text-[#004EA2]', bg: 'bg-[#EAF2FB]', border: 'border-[#BFDBFE]' }
}

export default function HqDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [sortBy, setSortBy] = useState<'rate' | 'name'>('rate')
  const [changeModal, setChangeModal] = useState<{ filter: Category | 'all'; campus_id?: string } | null>(null)

  useEffect(() => {
    fetch('/api/hq/stats').then(r => r.json()).then(setStats)
  }, [])

  const GROUP_COLORS: Record<string, string> = { '유치부': '#FF6B35', '매일반': '#2196F3', '3일반': '#4CAF50', '2일반': '#9C27B0' }
  const GROUPS = ['유치부', '매일반', '3일반', '2일반']
  const CAT_COLORS: Record<Category, string> = { '유치부': '#FF6B35', '초등부': '#2196F3' }

  if (!stats) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalGrantedAll = stats.campusSummaries.reduce((s, c) => s + c.totalGranted, 0)
  const totalUsedAll = stats.campusSummaries.reduce((s, c) => s + c.totalUsed, 0)
  const totalRemainingAll = totalGrantedAll - totalUsedAll
  const overallRate = totalGrantedAll > 0 ? Math.round((totalUsedAll / totalGrantedAll) * 100) : 0
  const overallCol = rateColor(overallRate)

  const activeWithData = stats.campusSummaries.filter(c => c.is_active && c.totalGranted > 0)
  const chartData = [...activeWithData].sort((a, b) =>
    sortBy === 'rate'
      ? (b.usageRate ?? 0) - (a.usageRate ?? 0)
      : a.name.localeCompare(b.name, 'ko')
  )
  const BAR_MAX_H = 140

  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="space-y-5 max-w-full">

      {/* ── 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">{today} · {stats.year}년 연차 현황</p>
          <h1 className="text-2xl font-black text-[#0F172A] tracking-tight">통합 대시보드</h1>
        </div>
        {/* 전체 소진율 히어로 */}
        <div className={`${overallCol.bg} rounded-2xl px-5 py-3 flex items-center gap-4 border ${overallCol.border}`}>
          <div>
            <p className="text-xs text-[#64748B] mb-0.5">전체 평균 소진율</p>
            <p className={`text-4xl font-black ${overallCol.text} leading-none`}>{overallRate}%</p>
            <p className="text-[10px] text-[#94A3B8] mt-1">{fmtDays(totalUsedAll)}일 사용 / {fmtDays(totalGrantedAll)}일 부여</p>
          </div>
          {/* 원형 게이지 */}
          <svg width="60" height="60" className="-rotate-90 shrink-0">
            <circle cx="30" cy="30" r="24" fill="none" stroke="#E2E8F0" strokeWidth="6" />
            <circle cx="30" cy="30" r="24" fill="none" stroke={overallCol.bar} strokeWidth="6"
              strokeDasharray={`${(overallRate / 100) * 2 * Math.PI * 24} ${2 * Math.PI * 24}`}
              strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ── 전체 학생 현황 히어로 ── */}
      <div className="bg-gradient-to-r from-[#0F172A] to-[#1E3A5F] rounded-2xl p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#94A3B8] mb-1">
              전체 학생 현황 · 최근 월 기준
              {stats.prevMonthLabel && <span className="ml-1">· 직전월: {stats.prevMonthLabel}</span>}
            </p>
            <div className="flex items-end gap-2">
              <p className="text-5xl font-black leading-none">{stats.totalStudents}</p>
              <p className="text-xl text-[#94A3B8] mb-1">명</p>
            </div>
          </div>
          <div className="flex gap-3">
            {(['유치부', '초등부'] as Category[]).map(cat => {
              const curr = stats.totalStudentsByCategory?.[cat] ?? 0
              const prev = stats.prevTotalStudentsByCategory?.[cat] ?? 0
              const delta = curr - prev
              const hasChanges = delta !== 0 && prev > 0 && (stats.studentChanges ?? []).some(c => c.group === cat)
              return (
                <div key={cat} className="rounded-2xl px-5 py-3 min-w-[100px] text-center"
                  style={{ background: CAT_COLORS[cat] + '30', border: `1px solid ${CAT_COLORS[cat]}50` }}>
                  <p className="text-xs font-bold mb-1" style={{ color: CAT_COLORS[cat] }}>{cat}</p>
                  <p className="text-3xl font-black leading-none">{curr}</p>
                  <p className="text-[10px] text-[#94A3B8] mb-1">명</p>
                  {hasChanges ? (
                    <button
                      onClick={() => setChangeModal({ filter: cat })}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors hover:opacity-80"
                      style={{ background: delta > 0 ? '#16A34A33' : '#DC262633', color: delta > 0 ? '#86EFAC' : '#FCA5A5' }}
                    >
                      {delta > 0 ? `▲ ${delta}명` : `▼ ${Math.abs(delta)}명`}
                    </button>
                  ) : prev > 0 ? (
                    <p className="text-[10px] text-[#64748B]">변동 없음</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── KPI 카드 5개 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
        {[
          {
            label: '활성 캠퍼스', icon: '🏫',
            value: stats.activeCampuses, unit: '개',
            sub: `전체 ${stats.totalCampuses}개 중`,
            color: 'text-[#0F172A]', bg: 'bg-white',
          },
          {
            label: '전체 직원', icon: '👥',
            value: stats.totalEmployees, unit: '명',
            sub: '활성 직원 합계',
            color: 'text-[#0F172A]', bg: 'bg-white',
          },
          {
            label: '총 부여 연차', icon: '📋',
            value: fmtDays(totalGrantedAll), unit: '일',
            sub: `잔여 ${fmtDays(totalRemainingAll)}일`,
            color: 'text-[#004EA2]', bg: 'bg-white',
          },
          {
            label: '승인 대기', icon: '⏳',
            value: stats.pendingTotal, unit: '건',
            sub: stats.pendingTotal > 0 ? '처리 필요' : '모두 처리됨',
            color: stats.pendingTotal > 0 ? 'text-[#F59E0B]' : 'text-[#94A3B8]',
            bg: stats.pendingTotal > 0 ? 'bg-[#FFFBEB]' : 'bg-white',
          },
          {
            label: '오늘 휴가', icon: '🏖️',
            value: stats.onLeaveTodayTotal, unit: '명',
            sub: '현재 휴가 중',
            color: stats.onLeaveTodayTotal > 0 ? 'text-[#10B981]' : 'text-[#94A3B8]',
            bg: stats.onLeaveTodayTotal > 0 ? 'bg-[#F0FDF4]' : 'bg-white',
          },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-2xl border border-[#E2E8F0] p-4 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#94A3B8]">{card.label}</p>
              <span className="text-base">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color} leading-none`}>
              {card.value}<span className="text-xs font-normal text-[#94A3B8] ml-0.5">{card.unit}</span>
            </p>
            <p className="text-[10px] text-[#CBD5E1] mt-1.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 증감 모달 ── */}
      {changeModal && (() => {
        const filtered = (stats.studentChanges ?? []).filter(ch =>
          (changeModal.filter === 'all' || ch.group === changeModal.filter) &&
          (!changeModal.campus_id || ch.campus_id === changeModal.campus_id)
        )
        const added = filtered.filter(c => c.type === 'added')
        const removed = filtered.filter(c => c.type === 'removed')
        const title = changeModal.filter === 'all' ? '전체' : changeModal.filter
        const campusName = changeModal.campus_id ? stats.campusSummaries.find(c => c.id === changeModal.campus_id)?.name : null
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={() => setChangeModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-[#0F172A] text-lg">
                    {campusName ? `${campusName} · ` : ''}{title} 학생 증감
                  </h3>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    직전월 대비 · 추가 {added.length}명 / 이탈 {removed.length}명
                  </p>
                </div>
                <button onClick={() => setChangeModal(null)} className="text-[#94A3B8] hover:text-[#1E293B] text-xl font-light">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3">
                {added.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#16A34A] mb-1.5 uppercase tracking-wider">▲ 신규 추가 {added.length}명</p>
                    <div className="flex flex-wrap gap-1.5">
                      {added.map((s, i) => (
                        <div key={i} className="flex items-center gap-1 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-2.5 py-1.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: CAT_COLORS[s.group] + '20', color: CAT_COLORS[s.group] }}>{s.group}</span>
                          <span className="text-[12px] font-semibold text-[#1E293B]">{s.name}</span>
                          {!changeModal.campus_id && <span className="text-[9px] text-[#94A3B8]">{s.campus_name}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {removed.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#DC2626] mb-1.5 uppercase tracking-wider">▼ 이탈 {removed.length}명</p>
                    <div className="flex flex-wrap gap-1.5">
                      {removed.map((s, i) => (
                        <div key={i} className="flex items-center gap-1 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-2.5 py-1.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg" style={{ background: CAT_COLORS[s.group] + '20', color: CAT_COLORS[s.group] }}>{s.group}</span>
                          <span className="text-[12px] font-semibold text-[#1E293B]">{s.name}</span>
                          {!changeModal.campus_id && <span className="text-[9px] text-[#94A3B8]">{s.campus_name}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {filtered.length === 0 && (
                  <p className="text-sm text-[#94A3B8] text-center py-8">변경 사항 없음</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 세로 막대 차트 ── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-bold text-[#0F172A]">캠퍼스별 연차 소진율</h2>
            <div className="flex gap-3 mt-1.5">
              {[{ color: '#004EA2', label: '50% 미만' }, { color: '#F59E0B', label: '50~79%' }, { color: '#EF4444', label: '80% 이상' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-[#64748B]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#F7F8FA] rounded-xl p-1 self-start sm:self-auto">
            <button onClick={() => setSortBy('rate')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${sortBy === 'rate' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#94A3B8]'}`}>
              소진율순
            </button>
            <button onClick={() => setSortBy('name')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${sortBy === 'name' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#94A3B8]'}`}>
              이름순
            </button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="text-sm text-[#94A3B8] text-center py-12">연차 데이터가 없습니다</p>
        ) : (
          <div className="relative">
            {/* Y축 레이블 */}
            <div className="absolute left-0 flex flex-col justify-between text-right pr-1.5 pointer-events-none"
              style={{ top: 0, height: `${BAR_MAX_H}px`, width: '28px' }}>
              {[100, 75, 50, 25, 0].map(v => (
                <span key={v} className="text-[9px] text-[#CBD5E1] leading-none">{v}</span>
              ))}
            </div>
            {/* 차트 영역 */}
            <div className="ml-8 relative overflow-x-auto pb-1">
              {/* 가이드라인 */}
              <div className="absolute left-0 right-0 pointer-events-none" style={{ height: `${BAR_MAX_H}px` }}>
                {[0, 25, 50, 75, 100].map(v => (
                  <div key={v} className="absolute w-full border-t border-[#F1F5F9]"
                    style={{ bottom: `${(v / 100) * BAR_MAX_H}px` }} />
                ))}
                {/* 80% 위험선 */}
                <div className="absolute w-full border-t-2 border-dashed border-[#EF4444]/20"
                  style={{ bottom: `${0.8 * BAR_MAX_H}px` }}>
                  <span className="absolute right-0 text-[9px] text-[#EF4444]/50" style={{ top: '-12px' }}>80%</span>
                </div>
              </div>
              {/* 막대 */}
              <div className="flex items-end gap-1.5 min-w-max" style={{ height: `${BAR_MAX_H + 48}px`, alignItems: 'flex-end', paddingBottom: '48px' }}>
                {chartData.map(c => {
                  const rate = c.usageRate ?? 0
                  const col = rateColor(rate)
                  const barH = Math.max((rate / 100) * BAR_MAX_H, 3)
                  return (
                    <Link key={c.id} href={`/hq/campuses/${c.id}`}
                      className="group flex flex-col items-center shrink-0 w-12">
                      <span className={`text-[10px] font-bold ${col.text} mb-1 transition-opacity`}>{rate}%</span>
                      <div
                        className="w-9 rounded-t-lg group-hover:brightness-90 transition-all"
                        style={{ height: `${barH}px`, backgroundColor: col.bar }}
                      />
                      <div className="mt-2 text-center w-full">
                        <span className="text-[9px] text-[#94A3B8] group-hover:text-[#004EA2] transition-colors leading-tight line-clamp-2 block">{c.name}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 캠퍼스별 현황 카드 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#0F172A]">
            캠퍼스별 현황
            <span className="text-[#94A3B8] font-normal text-sm ml-2">{stats.campusSummaries.length}개</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...stats.campusSummaries]
            .sort((a, b) => (b.usageRate ?? -1) - (a.usageRate ?? -1))
            .map(c => {
              const rate = c.usageRate ?? 0
              const col = c.totalGranted > 0 ? rateColor(rate) : null
              return (
                <div
                  key={c.id}
                  className={`group bg-white rounded-2xl border p-4 hover:shadow-lg transition-all hover:border-[#004EA2] flex flex-col ${
                    !c.is_active ? 'opacity-50 border-[#E2E8F0]' : col ? col.border : 'border-[#E2E8F0]'
                  }`}
                >
                <Link href={`/hq/campuses/${c.id}`} className="flex-1 flex flex-col">
                  {/* 카드 헤더 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.is_active ? 'bg-[#22C55E]' : 'bg-[#CBD5E1]'}`} />
                        <span className="text-[10px] text-[#94A3B8]">{c.is_active ? '운영중' : '비활성'}</span>
                      </div>
                      <h3 className="font-bold text-[#0F172A] text-[15px] group-hover:text-[#004EA2] transition-colors leading-snug truncate">{c.name}</h3>
                    </div>
                    {col && (
                      <div className={`${col.bg} rounded-xl px-3 py-1.5 text-center ml-2 shrink-0`}>
                        <p className={`text-2xl font-black ${col.text} leading-none`}>{rate}%</p>
                        <p className="text-[9px] text-[#94A3B8]">소진율</p>
                      </div>
                    )}
                  </div>

                  {/* 진행 바 */}
                  {col ? (
                    <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: col.bar }} />
                    </div>
                  ) : (
                    <div className="h-2 bg-[#F1F5F9] rounded-full mb-3" />
                  )}

                  {/* 수치 4칸 */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="bg-[#F7F8FA] rounded-xl py-2.5 text-center">
                      <p className="text-[9px] text-[#94A3B8] mb-0.5">직원</p>
                      <p className="text-sm font-bold text-[#0F172A]">
                        {c.employeeCount}<span className="text-[9px] font-normal text-[#94A3B8]">명</span>
                      </p>
                    </div>
                    <div className="bg-[#F7F8FA] rounded-xl py-2.5 text-center">
                      <p className="text-[9px] text-[#94A3B8] mb-0.5">수강생</p>
                      <p className="text-sm font-bold text-[#FF6B35]">
                        {c.studentCount}<span className="text-[9px] font-normal text-[#94A3B8]">명</span>
                      </p>
                    </div>
                    <div className="bg-[#EFF6FF] rounded-xl py-2.5 text-center">
                      <p className="text-[9px] text-[#2563eb] mb-0.5">등원</p>
                      <p className="text-sm font-bold text-[#2563eb]">
                        {c.todayArr}<span className="text-[9px] font-normal text-[#94A3B8]">명</span>
                      </p>
                    </div>
                    <div className="bg-[#FFF1F2] rounded-xl py-2.5 text-center">
                      <p className="text-[9px] text-[#dc2626] mb-0.5">하원</p>
                      <p className="text-sm font-bold text-[#dc2626]">
                        {c.todayDep}<span className="text-[9px] font-normal text-[#94A3B8]">명</span>
                      </p>
                    </div>
                  </div>

                  {/* 유치부 / 초등부 인원 변동 */}
                  {(() => {
                    const campusChanges = (stats.studentChanges ?? []).filter(ch => ch.campus_id === c.id)
                    const hasPrev = Object.values(c.prevStudentByCategory ?? {}).some(v => v > 0)
                    return (
                      <div className="flex gap-1.5 mt-2">
                        {(['유치부', '초등부'] as Category[]).map(cat => {
                          const cnt = c.studentByCategory?.[cat] ?? 0
                          if (!cnt && !(c.prevStudentByCategory?.[cat])) return null
                          const prev = c.prevStudentByCategory?.[cat] ?? 0
                          const d = cnt - prev
                          const hasChange = hasPrev && d !== 0 && campusChanges.some(ch => ch.group === cat)
                          return (
                            <div key={cat} className="flex-1 rounded-xl py-2 text-center"
                              style={{ background: CAT_COLORS[cat] + '15' }}>
                              <p className="text-[9px] font-bold" style={{ color: CAT_COLORS[cat] }}>{cat}</p>
                              <p className="text-sm font-black" style={{ color: CAT_COLORS[cat] }}>{cnt}</p>
                              {hasChange ? (
                                <button
                                  onClick={e => { e.preventDefault(); setChangeModal({ filter: cat, campus_id: c.id }) }}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg mt-0.5"
                                  style={{ background: d > 0 ? '#DCFCE7' : '#FEE2E2', color: d > 0 ? '#16A34A' : '#DC2626' }}
                                >
                                  {d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}
                                </button>
                              ) : hasPrev ? (
                                <p className="text-[9px] text-[#CBD5E1] mt-0.5">±0</p>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* 연차 요약 */}
                  <div className="flex justify-between text-[10px] text-[#CBD5E1] mt-2">
                    <span>부여 {fmtDays(c.totalGranted)}일</span>
                    <span>소진 {fmtDays(c.totalUsed)}일</span>
                    <span className={c.remaining < 0 ? 'text-[#EF4444]' : ''}>잔여 {fmtDays(c.remaining)}일</span>
                  </div>
                </Link>
                {/* 차량 바로가기 */}
                <Link
                  href={`/hq/campuses/${c.id}/vehicles`}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold border border-[#E2E8F0] text-[#64748B] hover:border-[#004EA2] hover:text-[#004EA2] hover:bg-[#EAF2FB] transition-colors"
                >
                  🚌 차량 운행 보기
                </Link>
                </div>
              )
            })}
        </div>
      </div>

    </div>
  )
}
