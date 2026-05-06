'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function fmtDays(v: number) { return parseFloat(v.toFixed(2)) }

interface CampusDetail {
  campus: { id: string; name: string; code: string; is_active: boolean } | null
  principalName: string | null
  totalEmployees: number
  pendingCount: number
  onLeaveTodayCount: number
  onLeaveTodayNames: string[]
  employees: {
    id: string
    name: string
    position: string
    is_active: boolean
    campus_hired_at: string | null
  }[]
}

interface BalanceRow {
  id: string
  name: string
  position: string
  campus_hired_at: string | null
  company_hired_at: string | null
  baseDays: number
  carriedOver: number
  extraDays: number
  total: number
  totalUsed: number
  remaining: number
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
}

export default function HqCampusDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CampusDetail | null>(null)
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [empForm, setEmpForm] = useState({ name: '', position: '', annual_days: 15 })
  const [empLoading, setEmpLoading] = useState(false)
  const [empError, setEmpError] = useState('')

  // 연차 현황
  const currentYear = new Date().getFullYear()
  const [balanceYear, setBalanceYear] = useState(currentYear)
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(true)
  const [empListOpen, setEmpListOpen] = useState(false)
  const [dragging, setDragging] = useState<BalanceRow | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ emp: BalanceRow; toCategory: string; toPosition: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BalanceRow | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [lastAction, setLastAction] = useState<
    | { type: 'move'; emp: BalanceRow; fromPosition: string }
    | { type: 'delete'; emp: BalanceRow }
    | null
  >(null)

  // 카드 상세 모달
  const [detailEmp, setDetailEmp] = useState<BalanceRow | null>(null)
  const [detailLeaves, setDetailLeaves] = useState<{ id: string; type: string; days_used: number; start_date: string }[]>([])
  const [detailForm, setDetailForm] = useState({ name: '', position: '', company_hired_at: '', total_days: 0, extra_days: 0, carried_over: 0 })
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [leavesToDelete, setLeavesToDelete] = useState<string[]>([])
  const [leavesToAdd, setLeavesToAdd] = useState<{ date: string; type: string }[]>([])
  const [newLeaveForm, setNewLeaveForm] = useState<{ date: string; type: string } | null>(null)
  const dragStartedRef = useRef(false)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false)

  // Export state
  const [showExport, setShowExport] = useState(false)
  const [exportYear, setExportYear] = useState(currentYear)
  const [exportMonth, setExportMonth] = useState<number | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  // Import (upload) state
  const fileRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number; errors: string[] } | null>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (id) fetch(`/api/hq/campuses/${id}/stats`).then(r => r.json()).then(setData)
  }, [id])

  useEffect(() => {
    if (!id) return
    setBalanceLoading(true)
    fetch(`/api/hq/campuses/${id}/balances?year=${balanceYear}`)
      .then(r => r.json())
      .then(d => { setBalances(d.rows ?? []); setBalanceLoading(false) })
  }, [id, balanceYear])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    if (showExport) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExport])

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!importFile) return
    setImportLoading(true)
    setImportError('')
    setImportResult(null)
    const formData = new FormData()
    formData.append('file', importFile)
    formData.append('campus_id', id)
    const res = await fetch('/api/campus/import', { method: 'POST', body: formData })
    const d = await res.json()
    setImportLoading(false)
    if (!res.ok) { setImportError(d.error ?? '업로드 실패'); return }
    setImportResult(d)
    setImportFile(null)
    if (fileRef.current) fileRef.current.value = ''
    fetch(`/api/hq/campuses/${id}/stats`).then(r => r.json()).then(setData)
  }

  function handleExport() {
    const params = new URLSearchParams({ year: String(exportYear) })
    if (exportMonth !== null) params.set('month', String(exportMonth))
    window.open(`/api/hq/campuses/${id}/export?${params}`, '_blank')
    setShowExport(false)
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault()
    setEmpLoading(true)
    setEmpError('')
    const res = await fetch(`/api/hq/campuses/${id}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empForm),
    })
    const d = await res.json()
    setEmpLoading(false)
    if (!res.ok) { setEmpError(d.error); return }
    setShowAddEmp(false)
    setEmpForm({ name: '', position: '', annual_days: 15 })
    fetch(`/api/hq/campuses/${id}/stats`).then(r => r.json()).then(setData)
    setBalanceLoading(true)
    fetch(`/api/hq/campuses/${id}/balances?year=${balanceYear}`)
      .then(r => r.json())
      .then(d => { setBalances(d.rows ?? []); setBalanceLoading(false) })
  }

  if (!data) return <Spinner />

  const campus = data.campus

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      {/* HQ 보기 모드 배너 */}
      <div className="bg-[#0F172A] text-white rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-lg">HQ</span>
        <div>
          <p className="text-sm font-semibold">HQ 관리자 보기 모드</p>
          <p className="text-xs text-[#94A3B8]">{campus?.name} — 원장 화면과 동일한 데이터를 조회 중입니다</p>
        </div>
        <Link href="/hq/campuses" className="ml-auto text-xs text-[#94A3B8] hover:text-white">← 목록으로</Link>
      </div>

      {/* 캠퍼스명 + 내보내기 버튼 */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold text-[#1E293B]">
          {campus?.name}
          <span className="text-base md:text-lg font-normal text-[#64748B] ml-1.5">
            (원장{data.principalName ?? '***'})
          </span>
        </h1>
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExport(v => !v)}
            className="text-sm bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            연차 현황 엑셀 내보내기
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showExport && (
            <div className="absolute left-0 top-full mt-1.5 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl z-30 p-4 w-64">
              <p className="text-xs font-semibold text-[#64748B] mb-3">내보내기 옵션</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#1E293B] mb-1">연도</label>
                  <select
                    value={exportYear}
                    onChange={e => setExportYear(parseInt(e.target.value))}
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1E293B] mb-1">기간</label>
                  <select
                    value={exportMonth ?? ''}
                    onChange={e => setExportMonth(e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                  >
                    <option value="">전체 연간</option>
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleExport}
                  className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold py-2 rounded-xl text-sm"
                >
                  다운로드
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 연차대장 업로드 */}
      <form onSubmit={handleImport} className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-2 border border-dashed border-[#CBD5E1] rounded-xl px-3 py-2 cursor-pointer hover:border-[#0F172A] transition-colors bg-white"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-4 h-4 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          <span className="text-sm text-[#64748B]">{importFile ? importFile.name : '연차관리대장 엑셀 업로드'}</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
        </div>
        {importFile && (
          <>
            <button type="submit" disabled={importLoading} className="bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
              {importLoading ? '처리중...' : '업로드'}
            </button>
            <button type="button" onClick={() => { setImportFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-sm text-[#64748B] underline">취소</button>
          </>
        )}
      </form>
      {importError && <p className="text-[#EF4444] text-sm bg-[#FEF2F2] rounded-xl px-4 py-2">{importError}</p>}
      {importResult && (
        <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center gap-4">
            <span className="text-[#059669] font-semibold">Import 완료</span>
            <span className="text-[#047857]">성공 {importResult.success}명 / 건너뜀 {importResult.skipped}명</span>
            {importResult.errors.length > 0 && <span className="text-[#DC2626] font-semibold">오류 {importResult.errors.length}건</span>}
            <button onClick={() => setImportResult(null)} className="ml-auto text-[#047857] underline text-xs">닫기</button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-[#DC2626] bg-[#FEF2F2] rounded-lg p-2 max-h-40 overflow-y-auto">
              {importResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: '전체 직원', value: `${data.totalEmployees}명`, color: 'text-[#1E293B]' },
          { label: '승인 대기', value: `${data.pendingCount}건`, color: 'text-[#F59E0B]' },
          { label: '오늘 휴가', value: `${data.onLeaveTodayCount}명`, color: 'text-[#004EA2]' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-[#E2E8F0] text-center">
            <p className="text-xs text-[#64748B] mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 오늘 휴가자 */}
      {data.onLeaveTodayNames.length > 0 && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E2E8F0]">
          <h2 className="font-semibold text-[#1E293B] mb-3">오늘 휴가 중</h2>
          <div className="flex flex-wrap gap-2">
            {data.onLeaveTodayNames.map(name => (
              <span key={name} className="bg-[#EAF2FB] text-[#004EA2] text-sm px-3 py-1.5 rounded-full font-medium">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* 연차 현황 */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0]">
        <button
          onClick={() => setBalanceOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 md:px-6 py-4 hover:bg-[#F8FAFC] rounded-2xl transition-colors"
        >
          <h2 className="font-semibold text-[#1E293B]">연차 현황</h2>
          <div className="flex items-center gap-2">
            {balanceOpen && (
              <select
                value={balanceYear}
                onClick={e => e.stopPropagation()}
                onChange={e => setBalanceYear(parseInt(e.target.value))}
                className="border border-[#E2E8F0] rounded-xl px-3 py-1 text-sm focus:outline-none bg-white"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            )}
            <svg className={`w-4 h-4 text-[#94A3B8] transition-transform ${balanceOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </button>

        {balanceOpen && <div className="px-4 md:px-6 pb-4 md:pb-6">{(() => {
          const CATS = ['원장', '관리자', 'KT', 'FT', '상담부', '기타'] as const
          type Cat = typeof CATS[number]
          const CAT_STYLE: Record<Cat, { bar: string; text: string; badge: string; position: string }> = {
            '원장':  { bar: 'bg-[#0F172A]', text: 'text-[#0F172A]', badge: 'bg-[#F1F5F9] text-[#0F172A]',  position: '원장'  },
            '관리자': { bar: 'bg-[#004EA2]', text: 'text-[#004EA2]', badge: 'bg-[#EAF2FB] text-[#004EA2]', position: '관리자' },
            'KT':   { bar: 'bg-[#2563EB]', text: 'text-[#2563EB]', badge: 'bg-[#EFF6FF] text-[#2563EB]', position: 'KT'   },
            'FT':   { bar: 'bg-[#EA580C]', text: 'text-[#EA580C]', badge: 'bg-[#FFF7ED] text-[#EA580C]', position: 'FT'   },
            '상담부': { bar: 'bg-[#16A34A]', text: 'text-[#16A34A]', badge: 'bg-[#F0FDF4] text-[#16A34A]', position: '상담부' },
            '기타':  { bar: 'bg-[#64748B]', text: 'text-[#64748B]', badge: 'bg-[#F1F5F9] text-[#64748B]',  position: '기타'  },
          }
          const getCat = (p: string): Cat => {
            if (/원장/.test(p) && !/부원장/.test(p)) return '원장'
            if (/부원장|관리자/.test(p)) return '관리자'
            if (/KT/i.test(p)) return 'KT'
            if (/FT/i.test(p)) return 'FT'
            if (/상담/.test(p)) return '상담부'
            return '기타'
          }

          async function doMove(emp: BalanceRow, toPosition: string) {
            setActionLoading(true)
            const fromPosition = emp.position
            await fetch(`/api/hq/campuses/${id}/employees/${emp.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ position: toPosition }),
            })
            setBalances(prev => prev.map(r => r.id === emp.id ? { ...r, position: toPosition } : r))
            setLastAction({ type: 'move', emp, fromPosition })
            setPendingMove(null)
            setActionLoading(false)
          }

          async function doDelete(emp: BalanceRow) {
            setActionLoading(true)
            await fetch(`/api/hq/campuses/${id}/employees/${emp.id}`, { method: 'DELETE' })
            setBalances(prev => prev.filter(r => r.id !== emp.id))
            setLastAction({ type: 'delete', emp })
            setPendingDelete(null)
            setActionLoading(false)
          }

          async function doUndo() {
            if (!lastAction) return
            setActionLoading(true)
            if (lastAction.type === 'move') {
              await fetch(`/api/hq/campuses/${id}/employees/${lastAction.emp.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: lastAction.fromPosition }),
              })
              setBalances(prev => prev.map(r => r.id === lastAction.emp.id ? { ...r, position: lastAction.fromPosition } : r))
            } else {
              await fetch(`/api/hq/campuses/${id}/employees/${lastAction.emp.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true }),
              })
              setBalances(prev => [...prev, lastAction.emp])
            }
            setLastAction(null)
            setActionLoading(false)
          }

          async function openDetail(row: BalanceRow) {
            setDetailEmp(row)
            setDetailForm({
              name: row.name,
              position: row.position,
              company_hired_at: row.company_hired_at ?? '',
              total_days: row.baseDays,
              extra_days: row.extraDays,
              carried_over: row.carriedOver,
            })
            setDetailLeaves([])
            setDetailError('')
            setLeavesToDelete([])
            setLeavesToAdd([])
            setNewLeaveForm(null)
            setDetailLoading(true)
            const res = await fetch(`/api/hq/campuses/${id}/employees/${row.id}?year=${balanceYear}`)
            const d = await res.json()
            setDetailLeaves(d.leaves ?? [])
            setDetailLoading(false)
          }

          async function saveDetail() {
            if (!detailEmp) return
            setDetailSaving(true)
            setDetailError('')
            const res = await fetch(`/api/hq/campuses/${id}/employees/${detailEmp.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: detailForm.name,
                position: detailForm.position,
                company_hired_at: detailForm.company_hired_at,
                grant: { year: balanceYear, total_days: detailForm.total_days, extra_days: detailForm.extra_days, carried_over: detailForm.carried_over },
                leaves_delete: leavesToDelete,
                leaves_add: leavesToAdd,
              }),
            })
            const d = await res.json()
            if (!res.ok) { setDetailError(d.error ?? '저장 실패'); setDetailSaving(false); return }
            // 로컬 상태 갱신
            const newTotal = detailForm.total_days + detailForm.extra_days + detailForm.carried_over
            setBalances(prev => prev.map(r => r.id === detailEmp.id ? {
              ...r,
              name: detailForm.name,
              position: detailForm.position,
              company_hired_at: detailForm.company_hired_at || null,
              baseDays: detailForm.total_days,
              extraDays: detailForm.extra_days,
              carriedOver: detailForm.carried_over,
              total: newTotal,
              remaining: newTotal - r.totalUsed,
            } : r))
            setDetailSaving(false)
            setDetailEmp(null)
          }

          if (balanceLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
          if (balances.length === 0) return <p className="text-sm text-[#64748B] text-center py-6">연차 데이터가 없습니다.</p>

          const totalGranted = fmtDays(balances.reduce((s, r) => s + r.total, 0))
          const totalUsed = fmtDays(balances.reduce((s, r) => s + r.totalUsed, 0))
          const totalRemaining = fmtDays(balances.reduce((s, r) => s + r.remaining, 0))
          const overused = balances.filter(r => r.remaining < 0).length
          const grouped = CATS.reduce<Record<Cat, BalanceRow[]>>((acc, c) => {
            acc[c] = balances.filter(r => getCat(r.position) === c); return acc
          }, { '원장': [], '관리자': [], 'KT': [], 'FT': [], '상담부': [], '기타': [] })

          return <>
            {/* 요약 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
              {[
                { label: '총 부여', value: totalGranted, unit: '일', color: 'text-[#1E293B]', bg: 'bg-[#F8FAFC]' },
                { label: '총 사용', value: totalUsed, unit: '일', color: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB]' },
                { label: '총 잔여', value: totalRemaining, unit: '일', color: 'text-[#004EA2]', bg: 'bg-[#EAF2FB]' },
                { label: '초과 사용', value: overused, unit: '명', color: overused > 0 ? 'text-[#EF4444]' : 'text-[#94A3B8]', bg: overused > 0 ? 'bg-[#FEF2F2]' : 'bg-[#F8FAFC]' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                  <p className="text-xs text-[#64748B] mb-0.5">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}<span className="text-xs font-normal ml-0.5">{s.unit}</span></p>
                </div>
              ))}
            </div>

            {/* 되돌리기 버튼 */}
            {lastAction && (
              <div className="flex items-center gap-3 mb-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-2.5">
                <span className="text-sm text-[#92400E]">
                  {lastAction.type === 'move'
                    ? `${lastAction.emp.name} 이동 취소 가능`
                    : `${lastAction.emp.name} 삭제 취소 가능`}
                </span>
                <button
                  onClick={doUndo}
                  disabled={actionLoading}
                  className="ml-auto text-sm font-semibold bg-[#F59E0B] hover:bg-[#D97706] text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  ↩ 되돌리기
                </button>
                <button
                  onClick={() => setLastAction(null)}
                  className="text-[#B45309] hover:text-[#92400E] text-xs underline"
                >
                  닫기
                </button>
              </div>
            )}

            {/* 카테고리 섹션 */}
            {CATS.map(cat => {
              const style = CAT_STYLE[cat]
              const rows = grouped[cat]
              const isDropTarget = dragOverCat === cat
              return (
                <div
                  key={cat}
                  className={`mb-4 last:mb-0 rounded-2xl transition-colors ${isDropTarget ? 'bg-[#EFF6FF] outline-2 outline-dashed outline-[#2563EB]' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOverCat(cat) }}
                  onDragLeave={() => setDragOverCat(null)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverCat(null)
                    if (dragging && getCat(dragging.position) !== cat) {
                      setPendingMove({ emp: dragging, toCategory: cat, toPosition: style.position })
                    }
                    setDragging(null)
                  }}
                >
                  {/* 섹션 헤더 */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}>{cat}</span>
                    <span className="text-xs text-[#94A3B8]">{rows.length}명</span>
                    <div className="flex-1 h-px bg-[#E2E8F0]" />
                    {rows.length > 0 && <span className="text-xs text-[#94A3B8]">사용 {fmtDays(rows.reduce((s,r)=>s+r.totalUsed,0))} / 부여 {fmtDays(rows.reduce((s,r)=>s+r.total,0))}</span>}
                    {isDropTarget && <span className="text-xs font-semibold text-[#2563EB]">여기에 놓기</span>}
                  </div>

                  {/* 카드 그리드 */}
                  <div className={`grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 min-h-[2rem] ${rows.length === 0 ? 'border-2 border-dashed border-[#E2E8F0] rounded-xl p-2' : ''}`}>
                    {rows.length === 0 && !isDropTarget && (
                      <p className="text-[10px] text-[#CBD5E1] col-span-full text-center py-1">드래그하여 이동</p>
                    )}
                    {rows.map(row => {
                      const usedPct = row.total > 0 ? Math.min((row.totalUsed / row.total) * 100, 100) : 0
                      const isOver = row.remaining < 0
                      return (
                        <div
                          key={row.id}
                          draggable
                          onDragStart={() => { dragStartedRef.current = true; setDragging(row) }}
                          onDragEnd={() => { setDragging(null); setTimeout(() => { dragStartedRef.current = false }, 0) }}
                          onClick={() => { if (!dragStartedRef.current) openDetail(row) }}
                          className={`relative rounded-xl border p-3 cursor-pointer active:cursor-grabbing select-none transition-opacity ${dragging?.id === row.id ? 'opacity-40' : 'opacity-100'} ${isOver ? 'border-[#FCA5A5] bg-[#FEF2F2]' : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#94A3B8]'}`}
                        >
                          {/* 삭제 버튼 */}
                          <button
                            onClick={e => { e.stopPropagation(); setPendingDelete(row) }}
                            className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-[#E2E8F0] hover:bg-[#FEE2E2] text-[#94A3B8] hover:text-[#EF4444] transition-colors text-[10px] font-bold"
                            title="삭제"
                          >✕</button>

                          <div className="mb-2 pr-4">
                            <p className="text-sm font-semibold text-[#1E293B] truncate">{row.name}</p>
                            <p className="text-[10px] text-[#94A3B8] truncate">{row.position || '-'}</p>
                            {(row.campus_hired_at || row.company_hired_at) && (
                              <p className="text-[9px] text-[#CBD5E1] truncate mt-0.5">
                                {(row.campus_hired_at ?? row.company_hired_at)!.slice(0, 10)}
                              </p>
                            )}
                          </div>
                          <div className="h-1.5 bg-white rounded-full overflow-hidden mb-2 border border-[#E2E8F0]">
                            <div className={`h-full rounded-full ${isOver ? 'bg-[#EF4444]' : style.bar}`} style={{ width: `${usedPct}%` }} />
                          </div>
                          <div className="grid grid-cols-3 text-center">
                            <div><p className="text-[9px] text-[#94A3B8]">부여</p><p className="text-xs font-semibold text-[#1E293B]">{row.total}</p></div>
                            <div><p className="text-[9px] text-[#94A3B8]">사용</p><p className={`text-xs font-semibold ${style.text}`}>{fmtDays(row.totalUsed)}</p></div>
                            <div><p className="text-[9px] text-[#94A3B8]">잔여</p><p className={`text-xs font-bold ${isOver ? 'text-[#EF4444]' : style.text}`}>{fmtDays(row.remaining)}</p></div>
                          </div>
                          {isOver && <span className="absolute top-1.5 left-1.5 text-[9px] font-bold text-[#EF4444] bg-[#FEE2E2] px-1 py-0.5 rounded-full">초과</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 이동 확인 다이얼로그 */}
            {pendingMove && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xs text-center">
                  <p className="text-base font-bold text-[#1E293B] mb-1">{pendingMove.emp.name}</p>
                  <p className="text-sm text-[#64748B] mb-5">
                    <span className={`font-semibold ${CAT_STYLE[getCat(pendingMove.emp.position) as Cat].text}`}>{getCat(pendingMove.emp.position)}</span>
                    {' → '}
                    <span className={`font-semibold ${CAT_STYLE[pendingMove.toCategory as Cat].text}`}>{pendingMove.toCategory}</span>
                    {' 로 이동할까요?'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPendingMove(null)}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold text-lg hover:bg-[#F8FAFC] transition-colors"
                    >✕</button>
                    <button
                      onClick={() => doMove(pendingMove.emp, pendingMove.toPosition)}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-xl bg-[#0F172A] text-white font-semibold text-lg hover:bg-[#1E293B] transition-colors disabled:opacity-50"
                    >O</button>
                  </div>
                </div>
              </div>
            )}

            {/* 삭제 확인 다이얼로그 */}
            {pendingDelete && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xs text-center">
                  <p className="text-base font-bold text-[#1E293B] mb-1">{pendingDelete.name}</p>
                  <p className="text-sm text-[#64748B] mb-1">직원을 삭제할까요?</p>
                  <p className="text-xs text-[#EF4444] mb-5">삭제 후 연차 현황에서 제외됩니다.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPendingDelete(null)}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold text-lg hover:bg-[#F8FAFC] transition-colors"
                    >✕</button>
                    <button
                      onClick={() => doDelete(pendingDelete)}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-xl bg-[#EF4444] text-white font-semibold text-lg hover:bg-[#DC2626] transition-colors disabled:opacity-50"
                    >O</button>
                  </div>
                </div>
              </div>
            )}
            {/* 카드 상세 모달 — 엑셀 가로형 */}
            {detailEmp && (() => {
              const LEAVE_LABEL: Record<string, string> = { annual: '연차', half_am: '오전반차', half_pm: '오후반차', quarter: '반반차', sick: '병가', event: '경조', other: '공가/기타' }
              const TYPE_COLOR: Record<string, string> = { annual: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]', half_am: 'bg-[#FFF7ED] text-[#EA580C] border-[#FED7AA]', half_pm: 'bg-[#FFF7ED] text-[#EA580C] border-[#FED7AA]', quarter: 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]', sick: 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]', event: 'bg-[#EAF2FB] text-[#004EA2] border-[#CFE0F4]', other: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]' }
              const computedTotal = detailForm.total_days + detailForm.extra_days + detailForm.carried_over

              // 엑셀 수식으로 자동 계산
              function calcFromHireDate(hireDateStr: string) {
                if (!hireDateStr) return
                const hire = new Date(hireDateStr)
                const fiscalStart = new Date(balanceYear, 0, 1)
                const fiscalEnd = new Date(balanceYear, 11, 31)
                const yearsDiff = (fiscalStart.getTime() - hire.getTime()) / (365.25 * 86400 * 1000)
                if (yearsDiff >= 1) {
                  const completedYears = Math.floor(yearsDiff)
                  const extra = Math.max(0, Math.floor((completedYears - 1) / 2))
                  setDetailForm(f => ({ ...f, total_days: 15, extra_days: extra }))
                } else {
                  const anniversary = new Date(hire.getFullYear() + 1, hire.getMonth(), hire.getDate())
                  let base = 0
                  if (anniversary <= fiscalEnd) {
                    const daysAfter = (fiscalEnd.getTime() - anniversary.getTime()) / 86400000
                    base = Math.ceil(daysAfter / 365 * 15)
                  }
                  setDetailForm(f => ({ ...f, total_days: base, extra_days: 0 }))
                }
              }

              return (
                <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto" onClick={() => setDetailEmp(null)}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>

                    {/* 헤더 */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-sm font-bold">{detailForm.name.slice(0,1)}</span>
                        <div>
                          <p className="font-bold text-[#1E293B]">{detailEmp.name}</p>
                          <p className="text-xs text-[#94A3B8]">{balanceYear}년 연차 현황</p>
                        </div>
                      </div>
                      <button onClick={() => setDetailEmp(null)} className="text-[#94A3B8] hover:text-[#1E293B] text-xl leading-none">✕</button>
                    </div>

                    {/* 엑셀형 행 — 직원정보 + 연차부여 가로 배치 */}
                    <div className="px-6 pt-5 pb-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-[#F8FAFC]">
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-left whitespace-nowrap">이름</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-left whitespace-nowrap">직책</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-left whitespace-nowrap">최초 입사일</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap">기본 ①</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap">추가 ②</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap">이월</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap bg-[#F0FDF4]">총 부여</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap">사용</th>
                              <th className="border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#64748B] text-center whitespace-nowrap">잔여</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border border-[#E2E8F0] px-2 py-1.5">
                                <input value={detailForm.name} onChange={e => setDetailForm(f => ({ ...f, name: e.target.value }))}
                                  className="w-full min-w-[80px] border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm font-medium text-[#1E293B]" />
                              </td>
                              <td className="border border-[#E2E8F0] px-2 py-1.5">
                                <input value={detailForm.position} onChange={e => setDetailForm(f => ({ ...f, position: e.target.value }))}
                                  className="w-full min-w-[80px] border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm text-[#1E293B]"
                                  placeholder="직책 입력" />
                              </td>
                              <td className="border border-[#E2E8F0] px-2 py-1.5">
                                <input type="date" value={detailForm.company_hired_at}
                                  onChange={e => { setDetailForm(f => ({ ...f, company_hired_at: e.target.value })); calcFromHireDate(e.target.value) }}
                                  className="border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm text-[#1E293B] w-full" />
                              </td>
                              <td className="border border-[#E2E8F0] px-2 py-1.5 text-center">
                                <input type="number" step="0.5" value={detailForm.total_days} onChange={e => setDetailForm(f => ({ ...f, total_days: Number(e.target.value) }))}
                                  className="w-16 border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm text-center font-semibold text-[#1E293B]" />
                              </td>
                              <td className="border border-[#E2E8F0] px-2 py-1.5 text-center">
                                <input type="number" step="0.5" value={detailForm.extra_days} onChange={e => setDetailForm(f => ({ ...f, extra_days: Number(e.target.value) }))}
                                  className="w-16 border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm text-center font-semibold text-[#004EA2]" />
                              </td>
                              <td className="border border-[#E2E8F0] px-2 py-1.5 text-center">
                                <input type="number" step="0.25" value={detailForm.carried_over} onChange={e => setDetailForm(f => ({ ...f, carried_over: Number(e.target.value) }))}
                                  className="w-16 border-0 focus:outline-none focus:bg-[#EFF6FF] rounded px-1 py-0.5 text-sm text-center font-semibold text-[#F59E0B]" />
                              </td>
                              <td className="border border-[#E2E8F0] px-3 py-1.5 text-center bg-[#F0FDF4]">
                                <span className="font-bold text-[#16A34A]">{computedTotal}</span>
                              </td>
                              <td className="border border-[#E2E8F0] px-3 py-1.5 text-center">
                                <span className="font-semibold text-[#F59E0B]">{detailEmp.totalUsed}</span>
                              </td>
                              <td className="border border-[#E2E8F0] px-3 py-1.5 text-center">
                                <span className={`font-bold ${computedTotal - detailEmp.totalUsed < 0 ? 'text-[#EF4444]' : 'text-[#2563EB]'}`}>
                                  {computedTotal - detailEmp.totalUsed}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-[#94A3B8] mt-1.5">※ 입사일 변경 시 기본/추가 자동 계산 · 직접 수정도 가능</p>
                    </div>

                    {/* 사용 내역 — 편집 가능 가로 카드 */}
                    <div className="px-6 pb-5">
                      {/* 헤더: 종류별 합계 요약 */}
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-[#64748B]">
                          사용 내역 ({balanceYear}년) &nbsp;
                          <span className="font-normal text-[#94A3B8]">
                            {detailLeaves.filter(l => !leavesToDelete.includes(l.id)).length + leavesToAdd.length}건
                          </span>
                        </p>
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          {(() => {
                            const byType: Record<string, number> = {}
                            for (const l of detailLeaves) {
                              if (leavesToDelete.includes(l.id)) continue
                              byType[l.type] = (byType[l.type] ?? 0) + l.days_used
                            }
                            const TYPE_DAYS: Record<string, number> = { annual: 1, half_am: 0.5, half_pm: 0.5, quarter: 0.25, sick: 1, event: 1, other: 1 }
                            for (const a of leavesToAdd) byType[a.type] = (byType[a.type] ?? 0) + (TYPE_DAYS[a.type] ?? 1)
                            return Object.entries(byType).map(([type, days]) => (
                              <span key={type} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLOR[type] ?? 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'}`}>
                                {LEAVE_LABEL[type] ?? type} {days}일
                              </span>
                            ))
                          })()}
                        </div>
                      </div>

                      {detailLoading ? (
                        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-[#0F172A] border-t-transparent rounded-full animate-spin" /></div>
                      ) : (
                        <div className="overflow-x-auto pb-2">
                          <div className="flex gap-2 items-start" style={{ minWidth: 'max-content' }}>

                            {/* 기존 내역 카드 (삭제 예정 제외) */}
                            {detailLeaves.filter(l => !leavesToDelete.includes(l.id)).map(l => (
                              <div key={l.id} className={`group relative flex-shrink-0 rounded-xl border px-3 pt-2 pb-2.5 text-center ${TYPE_COLOR[l.type] ?? 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'}`} style={{ minWidth: '72px' }}>
                                <button
                                  onClick={() => setLeavesToDelete(prev => [...prev, l.id])}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold hidden group-hover:flex items-center justify-center leading-none"
                                >✕</button>
                                <p className="text-[10px] font-medium opacity-80 mb-0.5">{l.start_date.slice(5).replace('-','/')}</p>
                                <p className="text-xs font-bold leading-tight">{LEAVE_LABEL[l.type] ?? l.type}</p>
                                <p className="text-[10px] opacity-70 mt-0.5">{l.type === 'quarter' ? 0.25 : l.days_used}일</p>
                              </div>
                            ))}

                            {/* 새로 추가된 항목 카드 */}
                            {leavesToAdd.map((a, idx) => {
                              const TYPE_DAYS: Record<string, number> = { annual: 1, half_am: 0.5, half_pm: 0.5, quarter: 0.25, sick: 1, event: 1, other: 1 }
                              return (
                                <div key={`new-${idx}`} className={`group relative flex-shrink-0 rounded-xl border px-3 pt-2 pb-2.5 text-center ring-2 ring-[#22C55E] ${TYPE_COLOR[a.type] ?? 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'}`} style={{ minWidth: '72px' }}>
                                  <button
                                    onClick={() => setLeavesToAdd(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold hidden group-hover:flex items-center justify-center leading-none"
                                  >✕</button>
                                  <p className="text-[10px] font-medium opacity-80 mb-0.5">{a.date.slice(5).replace('-','/')}</p>
                                  <p className="text-xs font-bold leading-tight">{LEAVE_LABEL[a.type] ?? a.type}</p>
                                  <p className="text-[10px] opacity-70 mt-0.5">{TYPE_DAYS[a.type] ?? 1}일</p>
                                </div>
                              )
                            })}

                            {/* 새 항목 입력 폼 카드 */}
                            {newLeaveForm ? (
                              <div className="flex-shrink-0 rounded-xl border-2 border-dashed border-[#22C55E] bg-[#F0FDF4] px-3 py-2" style={{ minWidth: '140px' }}>
                                <input
                                  type="date"
                                  value={newLeaveForm.date}
                                  onChange={e => setNewLeaveForm(f => f ? { ...f, date: e.target.value } : f)}
                                  className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-xs mb-1.5 focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
                                />
                                <select
                                  value={newLeaveForm.type}
                                  onChange={e => setNewLeaveForm(f => f ? { ...f, type: e.target.value } : f)}
                                  className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-[#22C55E] bg-white"
                                >
                                  <option value="annual">연차 (1일)</option>
                                  <option value="half_am">오전반차 (0.5일)</option>
                                  <option value="half_pm">오후반차 (0.5일)</option>
                                  <option value="quarter">반반차 (0.25일)</option>
                                  <option value="sick">병가 (1일)</option>
                                  <option value="event">경조 (1일)</option>
                                  <option value="other">공가/기타 (1일)</option>
                                </select>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      if (newLeaveForm.date) {
                                        setLeavesToAdd(prev => [...prev, { date: newLeaveForm.date, type: newLeaveForm.type }])
                                      }
                                      setNewLeaveForm(null)
                                    }}
                                    disabled={!newLeaveForm.date}
                                    className="flex-1 text-[10px] font-bold bg-[#22C55E] text-white rounded-lg py-1 disabled:opacity-40"
                                  >추가</button>
                                  <button
                                    onClick={() => setNewLeaveForm(null)}
                                    className="flex-1 text-[10px] font-bold bg-[#F1F5F9] text-[#64748B] rounded-lg py-1"
                                  >취소</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setNewLeaveForm({ date: `${balanceYear}-01-01`, type: 'annual' })}
                                className="flex-shrink-0 w-16 h-full min-h-[72px] rounded-xl border-2 border-dashed border-[#CBD5E1] hover:border-[#22C55E] hover:bg-[#F0FDF4] text-[#94A3B8] hover:text-[#16A34A] flex flex-col items-center justify-center gap-1 transition-colors"
                              >
                                <span className="text-xl leading-none">+</span>
                                <span className="text-[10px]">추가</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {(leavesToDelete.length > 0 || leavesToAdd.length > 0) && (
                        <p className="text-[10px] text-[#F59E0B] mt-2">
                          ※ 삭제 {leavesToDelete.length}건 · 추가 {leavesToAdd.length}건 — 저장 버튼을 눌러야 반영됩니다
                        </p>
                      )}
                    </div>

                    {detailError && <p className="text-[#EF4444] text-sm bg-[#FEF2F2] rounded-xl px-4 py-2 mx-6 mb-4">{detailError}</p>}

                    {/* 저장/취소 */}
                    <div className="px-6 pb-5 flex gap-3 border-t border-[#E2E8F0] pt-4">
                      <button onClick={() => setDetailEmp(null)} className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold text-sm hover:bg-[#F8FAFC]">취소</button>
                      <button onClick={saveDetail} disabled={detailSaving} className="flex-1 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold text-sm disabled:opacity-50">
                        {detailSaving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </>
        })()}</div>}
      </div>

      {/* 직원 목록 */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0]">
        <button
          onClick={() => setEmpListOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 md:px-6 py-4 hover:bg-[#F8FAFC] rounded-2xl transition-colors"
        >
          <h2 className="font-semibold text-[#1E293B]">직원 목록 ({data.employees.length}명)</h2>
          <div className="flex items-center gap-2">
            {empListOpen && (
              <span
                onClick={e => { e.stopPropagation(); setShowAddEmp(true) }}
                className="text-xs bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold px-3 py-1.5 rounded-xl transition-colors"
              >
                + 직원 추가
              </span>
            )}
            <svg className={`w-4 h-4 text-[#94A3B8] transition-transform ${empListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </button>
        {empListOpen && <div className="px-4 md:px-6 pb-4 md:pb-6">
        <div className="divide-y divide-[#F1F5F9]">
          {data.employees.map(emp => (
            <div key={emp.id} className={`flex justify-between items-center py-2.5 ${!emp.is_active ? 'opacity-40' : ''}`}>
              <div>
                <p className="text-sm font-medium">{emp.name} {!emp.is_active && <span className="text-xs text-[#EF4444]">(비활성)</span>}</p>
                <p className="text-xs text-[#64748B]">{emp.position}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-[#94A3B8]">{emp.campus_hired_at ?? '-'}</p>
                {!emp.is_active && (
                  <button
                    onClick={() => setPermanentDeleteTarget(emp)}
                    className="text-xs text-[#EF4444] border border-[#FCA5A5] hover:bg-[#FEF2F2] px-2 py-1 rounded-lg transition-colors"
                  >
                    영구 삭제
                  </button>
                )}
              </div>
            </div>
          ))}
          {data.employees.length === 0 && (
            <p className="text-sm text-[#64748B] text-center py-6">등록된 직원이 없습니다.</p>
          )}
        </div>
        </div>}

      {/* 영구 삭제 확인 다이얼로그 */}
      {permanentDeleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xs text-center">
            <div className="w-12 h-12 bg-[#FEF2F2] rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-[#EF4444] text-xl">⚠</span>
            </div>
            <p className="text-base font-bold text-[#1E293B] mb-1">{permanentDeleteTarget.name}</p>
            <p className="text-sm text-[#64748B] mb-1">영구 삭제할까요?</p>
            <p className="text-xs text-[#EF4444] mb-5">연차 기록까지 모두 삭제되며 복구 불가합니다.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPermanentDeleteTarget(null)}
                disabled={permanentDeleteLoading}
                className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold text-lg hover:bg-[#F8FAFC]"
              >✕</button>
              <button
                onClick={async () => {
                  setPermanentDeleteLoading(true)
                  await fetch(`/api/hq/campuses/${id}/employees/${permanentDeleteTarget.id}?permanent=true`, { method: 'DELETE' })
                  setData(prev => prev ? { ...prev, employees: prev.employees.filter(e => e.id !== permanentDeleteTarget.id) } : prev)
                  setPermanentDeleteTarget(null)
                  setPermanentDeleteLoading(false)
                }}
                disabled={permanentDeleteLoading}
                className="flex-1 py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-lg disabled:opacity-50"
              >{permanentDeleteLoading ? '...' : 'O'}</button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* 직원 추가 모달 */}
      {showAddEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4" onClick={() => setShowAddEmp(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-1">직원 추가</h3>
            <p className="text-xs text-[#64748B] mb-5">추가된 직원은 첫 로그인 시 이메일과 비밀번호를 직접 설정합니다.</p>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">이름 *</label>
                <input
                  type="text"
                  required
                  value={empForm.name}
                  onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">직책 *</label>
                <input
                  type="text"
                  required
                  value={empForm.position}
                  onChange={e => setEmpForm(f => ({ ...f, position: e.target.value }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
                  placeholder="KT / FT / 상담부 등"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">올해 연차 일수</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={empForm.annual_days}
                  onChange={e => setEmpForm(f => ({ ...f, annual_days: Number(e.target.value) }))}
                  className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
                />
              </div>
              {empError && <p className="text-[#EF4444] text-sm">{empError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddEmp(false)} className="flex-1 border border-[#E2E8F0] text-[#64748B] font-semibold py-2.5 rounded-xl text-sm">취소</button>
                <button type="submit" disabled={empLoading} className="flex-1 bg-[#0F172A] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {empLoading ? '추가 중...' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
