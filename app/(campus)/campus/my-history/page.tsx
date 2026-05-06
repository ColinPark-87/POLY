'use client'

import { useEffect, useState } from 'react'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import { LEAVE_TYPE_LABELS, type LeaveRequest } from '@/lib/types'

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function MyHistoryPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [selectedSig, setSelectedSig] = useState<string | null>(null)

  function load() {
    fetch('/api/leave')
      .then(r => r.json())
      .then(d => { setRequests(d.requests ?? []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  async function handleCancel(id: string) {
    if (!confirm('이 연차 신청을 취소하시겠습니까?')) return
    setCancellingId(id)
    const res = await fetch(`/api/leave/${id}`, { method: 'DELETE' })
    setCancellingId(null)
    if (res.ok) {
      load()
    } else {
      const d = await res.json()
      alert(d.error ?? '취소 실패')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">나의 연차 내역</h1>

      {loading ? <Spinner /> : requests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#E2E8F0]">
          <p className="text-[#64748B]">신청 내역이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {requests.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold text-sm">{LEAVE_TYPE_LABELS[r.type]}</span>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''} · {r.type === 'quarter' ? 0.25 : r.days_used}일
                    </p>
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
                {r.reason && <p className="text-xs text-[#64748B] mb-2">{r.reason}</p>}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#94A3B8]">{r.created_at.slice(0, 10)}</span>
                  <div className="flex items-center gap-2">
                    {r.signature_data_url && (
                      <button onClick={() => setSelectedSig(r.signature_data_url!)} className="text-xs text-[#004EA2] underline">서명 보기</button>
                    )}
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancellingId === r.id}
                        className="text-xs bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] px-2 py-0.5 rounded font-semibold disabled:opacity-50"
                      >
                        {cancellingId === r.id ? '취소 중...' : '취소'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F8FA] border-b border-[#E2E8F0]">
                <tr>
                  {['신청일', '종류', '기간', '일수', '상태', '사유', '서명', '취소'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-[#F7F8FA] transition-colors">
                    <td className="px-4 py-3 text-[#64748B]">{r.created_at.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-medium">{LEAVE_TYPE_LABELS[r.type]}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</td>
                    <td className="px-4 py-3">{r.type === 'quarter' ? 0.25 : r.days_used}일</td>
                    <td className="px-4 py-3"><LeaveStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-[#64748B] max-w-[120px] truncate">{r.reason ?? '-'}</td>
                    <td className="px-4 py-3">
                      {r.signature_data_url
                        ? <button onClick={() => setSelectedSig(r.signature_data_url!)} className="text-xs text-[#004EA2] underline">보기</button>
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {(r.status === 'pending' || r.status === 'approved') ? (
                        <button
                          onClick={() => handleCancel(r.id)}
                          disabled={cancellingId === r.id}
                          className="text-xs bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50"
                        >
                          {cancellingId === r.id ? '취소 중...' : '취소'}
                        </button>
                      ) : <span className="text-[#CBD5E1]">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
