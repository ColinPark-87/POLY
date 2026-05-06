'use client'

import { useEffect, useState } from 'react'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'
import { downloadLeaveForm } from '@/lib/downloadLeaveForm'

interface Campus { id: string; name: string }
interface LeaveRequest {
  id: string
  type: LeaveType
  start_date: string
  end_date: string
  days_used: number
  reason: string | null
  signature_data_url: string | null
  status: string
  created_at: string
  users: { id: string; name: string; position: string; email: string } | null
  campuses: { id: string; name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  approved: '승인',
  pending: '대기',
  rejected: '반려',
}
const STATUS_COLOR: Record<string, string> = {
  approved: 'bg-[#D1FAE5] text-[#059669]',
  pending: 'bg-[#FEF3C7] text-[#D97706]',
  rejected: 'bg-[#FEE2E2] text-[#DC2626]',
}

export default function HqLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [campusId, setCampusId] = useState('all')
  const [status, setStatus] = useState('approved')
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedSig, setSelectedSig] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hq/campuses').then(r => r.json()).then(d => setCampuses(d.campuses ?? []))
  }, [])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ status, year: String(year) })
    if (campusId !== 'all') params.set('campus_id', campusId)
    const res = await fetch(`/api/hq/leaves?${params}`)
    const d = await res.json()
    setLeaves(d.leaves ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [campusId, status, year])

  const currentYear = new Date().getFullYear()

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4">연차 신청 이력</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <select
          value={campusId}
          onChange={e => setCampusId(e.target.value)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
        >
          <option value="all">전체 캠퍼스</option>
          {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
        >
          <option value="approved">승인된 신청</option>
          <option value="pending">대기 중</option>
          <option value="all">전체</option>
        </select>
        <span className="flex items-center text-sm text-[#64748B] ml-1">{leaves.length}건</span>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#64748B]">불러오는 중...</div>
        ) : leaves.length === 0 ? (
          <div className="py-16 text-center text-[#64748B]">해당 조건의 신청 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '900px' }}>
              <thead className="bg-[#F7F8FA] border-b border-[#E2E8F0]">
                <tr>
                  {['신청일', '캠퍼스', '이름', '직위', '종류', '기간', '일수', '상태', '서명', '신청서'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {leaves.map(r => (
                  <tr key={r.id} className="hover:bg-[#F7F8FA]">
                    <td className="px-4 py-3 text-[#64748B]">{r.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-medium">{r.campuses?.name ?? '-'}</td>
                    <td className="px-4 py-3 font-medium">{r.users?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.users?.position ?? '-'}</td>
                    <td className="px-4 py-3">{LEAVE_TYPE_LABELS[r.type]}</td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}
                    </td>
                    <td className="px-4 py-3">{r.type === 'quarter' ? 0.25 : r.days_used}일</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] ?? ''}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.signature_data_url ? (
                        <button
                          onClick={() => setSelectedSig(r.signature_data_url!)}
                          className="text-xs text-[#004EA2] underline"
                        >
                          보기
                        </button>
                      ) : <span className="text-[#CBD5E1]">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => downloadLeaveForm({
                          name: r.users?.name ?? '-',
                          position: r.users?.position ?? '-',
                          email: r.users?.email,
                          typeLabel: LEAVE_TYPE_LABELS[r.type],
                          start_date: r.start_date,
                          end_date: r.end_date,
                          days_used: r.type === 'quarter' ? 0.25 : r.days_used,
                          reason: r.reason,
                          created_at: r.created_at,
                          signature_data_url: r.signature_data_url,
                        })}
                        className="text-xs bg-[#EAF2FB] text-[#004EA2] hover:bg-[#CFE0F4] px-2.5 py-1 rounded-lg font-semibold"
                      >
                        출력
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 서명 모달 */}
      {selectedSig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSig(null)}>
          <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-[#1E293B]">전자서명</h3>
              <button onClick={() => setSelectedSig(null)} className="text-[#64748B] text-2xl leading-none">×</button>
            </div>
            <img src={selectedSig} alt="서명" className="border border-[#E2E8F0] rounded-xl w-full" />
          </div>
        </div>
      )}
    </div>
  )
}
