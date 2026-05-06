'use client'

import { useEffect, useState } from 'react'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/types'
import { downloadLeaveForm } from '@/lib/downloadLeaveForm'

interface Request {
  id: string
  type: LeaveType
  start_date: string
  end_date: string
  days_used: number
  reason: string | null
  signature_data_url: string | null
  created_at: string
  users: { id: string; name: string; email: string; position: string } | null
}

type Tab = 'pending' | 'approved'

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" /></div>
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [selectedSig, setSelectedSig] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/campus/approvals?status=${tab}`)
    const data = await res.json()
    if (!res.ok) alert(data.error ?? '데이터를 불러오지 못했습니다.')
    setRequests(data.requests ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  async function handleAction(id: string, status: 'approved' | 'rejected' | 'cancelled') {
    const labels: Record<string, string> = { approved: '승인', rejected: '반려', cancelled: '취소' }
    if (!confirm(`이 신청을 ${labels[status]}하시겠습니까?`)) return

    setActionLoading(id)
    const res = await fetch(`/api/campus/approvals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewer_note: noteMap[id] ?? null }),
    })
    setActionLoading(null)

    if (res.ok) {
      load()
    } else {
      const d = await res.json()
      alert(d.error)
    }
  }

  const pendingCount = tab === 'pending' ? requests.length : 0

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">
        연차 신청 관리
      </h1>

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'pending'
              ? 'bg-[#004EA2] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]'
          }`}
        >
          대기중 {tab === 'pending' && requests.length > 0 ? `(${requests.length})` : ''}
        </button>
        <button
          onClick={() => setTab('approved')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === 'approved'
              ? 'bg-[#059669] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F8FA]'
          }`}
        >
          승인완료 {tab === 'approved' && requests.length > 0 ? `(${requests.length})` : ''}
        </button>
      </div>

      {loading ? <Spinner /> : requests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#E2E8F0]">
          <p className="text-3xl mb-3">{tab === 'pending' ? '✅' : '📋'}</p>
          <p className="text-[#64748B]">
            {tab === 'pending' ? '대기 중인 신청이 없습니다.' : '승인된 신청이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
              {/* 헤더 */}
              <div className="flex justify-between items-start p-4 md:p-5 border-b border-[#F1F5F9]">
                <div>
                  <p className="font-semibold text-[#1E293B]">{r.users?.name ?? '-'}</p>
                  <p className="text-xs text-[#64748B]">{r.users?.position} · {r.users?.email}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                  tab === 'pending'
                    ? 'bg-[#FEF3C7] text-[#D97706]'
                    : 'bg-[#D1FAE5] text-[#059669]'
                }`}>
                  {tab === 'pending' ? '대기중' : '승인완료'}
                </span>
              </div>

              {/* 상세 */}
              <div className="p-4 md:p-5 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-[#64748B]">종류</p><p className="font-medium">{LEAVE_TYPE_LABELS[r.type]}</p></div>
                  <div><p className="text-xs text-[#64748B]">기간</p><p className="font-medium">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</p></div>
                  <div><p className="text-xs text-[#64748B]">일수</p><p className="font-medium">{r.type === 'quarter' ? 0.25 : r.days_used}일</p></div>
                  <div><p className="text-xs text-[#64748B]">신청일</p><p className="font-medium">{r.created_at.slice(0, 10)}</p></div>
                </div>
                {r.reason && <p className="text-sm text-[#64748B]">사유: {r.reason}</p>}
                <div className="flex items-center gap-3">
                  {r.signature_data_url && (
                    <button onClick={() => setSelectedSig(r.signature_data_url!)} className="text-xs text-[#004EA2] underline">서명 보기</button>
                  )}
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
                    신청서 출력
                  </button>
                </div>
              </div>

              {/* 액션 */}
              <div className="p-4 md:p-5 bg-[#F7F8FA] border-t border-[#F1F5F9] space-y-3">
                {tab === 'pending' && (
                  <input
                    type="text"
                    placeholder="메모 (선택) — 반려 시 사유 입력"
                    value={noteMap[r.id] ?? ''}
                    onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                    className="w-full border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2] bg-white"
                  />
                )}
                {actionLoading === r.id ? (
                  <p className="text-sm text-[#64748B] text-center py-2">처리 중...</p>
                ) : tab === 'pending' ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAction(r.id, 'rejected')}
                      className="flex-1 border border-[#FCA5A5] text-[#DC2626] font-semibold py-2.5 rounded-xl hover:bg-[#FEF2F2] transition-colors text-sm"
                    >
                      반려
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'approved')}
                      className="flex-1 bg-[#004EA2] hover:bg-[#003E83] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                    >
                      승인
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAction(r.id, 'cancelled')}
                    className="w-full border border-[#FCA5A5] text-[#DC2626] font-semibold py-2.5 rounded-xl hover:bg-[#FEF2F2] transition-colors text-sm"
                  >
                    승인 취소
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 서명 모달 */}
      {selectedSig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSig(null)}>
          <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">전자서명</h3>
              <button onClick={() => setSelectedSig(null)} className="text-2xl text-[#64748B] leading-none">×</button>
            </div>
            <img src={selectedSig} alt="서명" className="border border-[#E2E8F0] rounded-xl w-full" />
          </div>
        </div>
      )}
    </div>
  )
}
