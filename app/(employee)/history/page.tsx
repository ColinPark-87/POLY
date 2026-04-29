'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import { LEAVE_TYPE_LABELS, type LeaveRequest } from '@/lib/types'

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#4F7EF7] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function HistoryContent() {
  const searchParams = useSearchParams()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSig, setSelectedSig] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leave')
      .then(r => r.json())
      .then(d => { setRequests(d.requests ?? []); setLoading(false) })
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">나의 연차 내역</h1>

      {searchParams.get('submitted') && (
        <div className="mb-4 bg-[#D1FAE5] border border-[#6EE7B7] rounded-xl px-4 py-3 text-sm text-[#059669] font-medium">
          연차 신청이 완료되었습니다. 원장 승인 후 확정됩니다.
        </div>
      )}

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#E2E8F0]">
          <p className="text-[#64748B]">신청 내역이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {requests.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold text-sm">{LEAVE_TYPE_LABELS[r.type]}</span>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''} · {r.days_used}일
                    </p>
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
                {r.reason && <p className="text-xs text-[#64748B] mb-2">{r.reason}</p>}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#94A3B8]">{r.created_at.slice(0, 10)}</span>
                  {r.signature_data_url && (
                    <button
                      onClick={() => setSelectedSig(r.signature_data_url!)}
                      className="text-xs text-[#4F7EF7] underline"
                    >
                      서명 보기
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  {['신청일','종류','기간','일수','상태','사유','서명'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-[#64748B]">{r.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-medium">{LEAVE_TYPE_LABELS[r.type]}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</td>
                    <td className="px-4 py-3">{r.days_used}일</td>
                    <td className="px-4 py-3"><LeaveStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-[#64748B] max-w-[120px] truncate">{r.reason ?? '-'}</td>
                    <td className="px-4 py-3">
                      {r.signature_data_url ? (
                        <button onClick={() => setSelectedSig(r.signature_data_url!)} className="text-xs text-[#4F7EF7] underline">보기</button>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 서명 모달 */}
      {selectedSig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSig(null)}>
          <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-[#1E293B]">전자서명</h3>
              <button onClick={() => setSelectedSig(null)} className="text-[#64748B] hover:text-[#1E293B] text-2xl leading-none">×</button>
            </div>
            <img src={selectedSig} alt="서명" className="border border-[#E2E8F0] rounded-xl w-full" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <HistoryContent />
    </Suspense>
  )
}
