'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

  useEffect(() => {
    fetch('/api/hq/stats').then(r => r.json()).then(setStats)
  }, [])

  if (!stats) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const GROUP_COLORS: Record<string, string> = { '유치부': '#FF6B35', '매일반': '#2196F3', '3일반': '#4CAF50', '2일반': '#9C27B0' }
  const GROUPS = ['유치부', '매일반', '3일반', '2일반']

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

      {/* ── 학생 현황 + 오늘 차량 현황 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 학생 현황 */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-[#0F172A]">전체 학생 현황</h2>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">최근 월 기준 · 전체 {stats.totalStudents}명</p>
            </div>
            <div className="flex gap-1.5">
              {GROUPS.map(g => {
                const count = stats.totalStudentByGroup[g] ?? 0
                if (!count) return null
                return (
                  <div key={g} className="text-center px-2 py-1 rounded-xl" style={{ background: GROUP_COLORS[g] + '18' }}>
                    <div className="text-[10px] font-bold" style={{ color: GROUP_COLORS[g] }}>{g}</div>
                    <div className="text-sm font-black" style={{ color: GROUP_COLORS[g] }}>{count}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* 캠퍼스별 학생 바 */}
          <div className="space-y-2">
            {[...stats.campusSummaries].filter(c => c.is_active && c.studentCount > 0)
              .sort((a, b) => b.studentCount - a.studentCount)
              .map(c => {
                const pct = stats.totalStudents > 0 ? Math.round(c.studentCount / stats.totalStudents * 100) : 0
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <Link href={`/hq/campuses/${c.id}/roster`} className="font-semibold text-[#1E293B] truncate max-w-[120px] hover:text-[#004EA2] hover:underline">{c.name}</Link>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {GROUPS.map(g => c.studentByGroup[g] ? (
                          <span key={g} className="font-bold" style={{ color: GROUP_COLORS[g] }}>
                            {g.slice(0, 2)} {c.studentByGroup[g]}
                          </span>
                        ) : null)}
                        <span className="font-black text-[#1E293B]">{c.studentCount}명</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#004EA2]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* 오늘 차량 현황 */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-[#0F172A]">오늘 차량 현황</h2>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">
                {stats.todayDay ? `${stats.todayDay}요일 기준` : '주말 — 수업 없음'}
              </p>
            </div>
            {stats.todayDay && (
              <div className="flex gap-2">
                <div className="text-center px-3 py-1.5 rounded-xl bg-[#EFF6FF]">
                  <div className="text-[10px] font-bold text-[#2563eb]">등원</div>
                  <div className="text-lg font-black text-[#2563eb]">{stats.totalTodayArr}</div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-xl bg-[#FFF1F2]">
                  <div className="text-[10px] font-bold text-[#dc2626]">하원</div>
                  <div className="text-lg font-black text-[#dc2626]">{stats.totalTodayDep}</div>
                </div>
              </div>
            )}
          </div>
          {!stats.todayDay ? (
            <div className="flex items-center justify-center py-8 text-[#94A3B8] text-sm">주말 — 수업 없음</div>
          ) : (
            <div className="space-y-1.5">
              {[...stats.campusSummaries].filter(c => c.is_active && (c.todayArr > 0 || c.todayDep > 0))
                .sort((a, b) => (b.todayArr + b.todayDep) - (a.todayArr + a.todayDep))
                .map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#F7F8FA]">
                    <span className="text-[11px] font-semibold text-[#1E293B] flex-1 truncate">{c.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-[#EFF6FF] text-[#2563eb]">
                        등 {c.todayArr}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-[#FFF1F2] text-[#dc2626]">
                        하 {c.todayDep}
                      </span>
                    </div>
                  </div>
                ))}
              {stats.campusSummaries.every(c => !c.todayArr && !c.todayDep) && (
                <div className="flex items-center justify-center py-6 text-[#94A3B8] text-sm">오늘 탑승 데이터 없음</div>
              )}
            </div>
          )}
        </div>
      </div>

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
                <Link
                  key={c.id}
                  href={`/hq/campuses/${c.id}`}
                  className={`group bg-white rounded-2xl border p-4 hover:shadow-lg transition-all hover:border-[#004EA2] ${
                    !c.is_active ? 'opacity-50 border-[#E2E8F0]' : col ? col.border : 'border-[#E2E8F0]'
                  }`}
                >
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

                  {/* 연차 요약 */}
                  <div className="flex justify-between text-[10px] text-[#CBD5E1] mt-2">
                    <span>부여 {fmtDays(c.totalGranted)}일</span>
                    <span>소진 {fmtDays(c.totalUsed)}일</span>
                    <span className={c.remaining < 0 ? 'text-[#EF4444]' : ''}>잔여 {fmtDays(c.remaining)}일</span>
                  </div>
                </Link>
              )
            })}
        </div>
      </div>

    </div>
  )
}
