'use client'
import { useEffect, useState, useCallback } from 'react'
import { usageToCsv, type CampusStat, type UserStat, type DayStat } from '@/lib/usage-log'

interface Resp { from: string; to: string; totals: { logins: number; edits: number; activeUsers: number }; byCampus: CampusStat[]; byUser: UserStat[]; byDay: DayStat[] }
const fmt = (iso: string | null) => iso ? new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '-'
function download(name: string, csv: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

export default function UsagePage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(new Date(Date.now() + 9 * 3600 * 1000 - 6 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(today)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/hq/usage?from=${from}&to=${to}`)
    setData(r.ok ? await r.json() : null); setLoading(false)
  }, [from, to])
  useEffect(() => { load() }, [load])

  const preset = (days: number) => { setFrom(new Date(Date.now() + 9 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10)); setTo(today) }
  const maxCampus = Math.max(1, ...(data?.byCampus ?? []).map(c => c.logins + c.edits))
  const maxDay = Math.max(1, ...(data?.byDay ?? []).map(d => d.logins + d.edits))

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-black text-[#0F172A]">📊 파일럿 사용현황</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => preset(7)} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm hover:bg-[#F1F5F9]">최근 7일</button>
          <button onClick={() => preset(30)} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm hover:bg-[#F1F5F9]">30일</button>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-[#94A3B8]">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={() => data && download(`usage_campus_${from}_${to}.csv`, usageToCsv(data.byCampus, ['campus_name', 'logins', 'edits', 'activeUsers', 'lastActiveAt']))}
            className="px-3 py-1.5 rounded-lg bg-[#004EA2] text-white text-sm font-semibold">CSV(캠퍼스)</button>
          <button onClick={() => data && download(`usage_user_${from}_${to}.csv`, usageToCsv(data.byUser, ['user_name', 'campus_name', 'role', 'logins', 'edits', 'lastAt']))}
            className="px-3 py-1.5 rounded-lg bg-[#004EA2] text-white text-sm font-semibold">CSV(사용자)</button>
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm hover:bg-[#F1F5F9]">🖨 인쇄</button>
        </div>
      </div>

      {loading ? <p className="text-[#94A3B8] py-10 text-center">불러오는 중…</p> : !data ? <p className="text-[#EF4444] py-10 text-center">불러오기 실패</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {([['로그인', data.totals.logins], ['활동(수정)', data.totals.edits], ['활성 사용자', data.totals.activeUsers]] as const).map(([k, v]) => (
              <div key={k} className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                <p className="text-xs text-[#94A3B8]">{k}</p><p className="text-2xl font-black text-[#004EA2]">{v}</p>
              </div>
            ))}
          </div>

          {/* 일자별 추세 (CSS 막대) */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
            <p className="text-sm font-bold text-[#1E293B] mb-3">일자별 사용량</p>
            <div className="flex items-end gap-1 h-32">
              {data.byDay.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}\n로그인 ${d.logins} · 활동 ${d.edits}`}>
                  <div className="w-full bg-[#004EA2] rounded-t" style={{ height: `${((d.logins + d.edits) / maxDay) * 100}%` }} />
                  <span className="text-[8px] text-[#94A3B8] -rotate-45 origin-top-left whitespace-nowrap">{d.date.slice(5)}</span>
                </div>
              ))}
              {data.byDay.length === 0 && <p className="text-xs text-[#94A3B8]">기간 내 기록 없음</p>}
            </div>
          </div>

          {/* 캠퍼스별 표 + 막대 */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
            <p className="text-sm font-bold text-[#1E293B] mb-3">캠퍼스별</p>
            <div className="space-y-1.5">
              {data.byCampus.map(c => (
                <div key={c.campus_id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 font-semibold text-[#1E293B] truncate">{c.campus_name}</span>
                  <div className="flex-1 bg-[#F1F5F9] rounded h-5 relative overflow-hidden">
                    <div className="h-full bg-[#004EA2]" style={{ width: `${((c.logins + c.edits) / maxCampus) * 100}%` }} />
                  </div>
                  <span className="w-44 shrink-0 text-right text-[#64748B] text-xs">로그인 {c.logins} · 활동 {c.edits} · 사용자 {c.activeUsers}</span>
                  <span className="w-28 shrink-0 text-right text-[#94A3B8] text-[10px]">{fmt(c.lastActiveAt)}</span>
                </div>
              ))}
              {data.byCampus.length === 0 && <p className="text-xs text-[#94A3B8]">기간 내 기록 없음</p>}
            </div>
          </div>

          {/* 사용자별 표 */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 overflow-x-auto">
            <p className="text-sm font-bold text-[#1E293B] mb-3">사용자별 (활동 많은 순)</p>
            <table className="w-full text-sm">
              <thead><tr className="text-[#94A3B8] text-xs border-b border-[#F1F5F9]">
                <th className="text-left py-1.5">이름</th><th className="text-left">캠퍼스</th><th className="text-left">역할</th>
                <th className="text-right">로그인</th><th className="text-right">활동</th><th className="text-right">마지막 접속</th></tr></thead>
              <tbody>{data.byUser.map(u => (
                <tr key={u.user_id} className="border-b border-[#F8FAFC]">
                  <td className="py-1.5 font-medium text-[#1E293B]">{u.user_name}</td><td className="text-[#64748B]">{u.campus_name}</td>
                  <td className="text-[#64748B]">{u.role === 'campus_admin' ? '원장' : u.role === 'hq_admin' ? '본사' : '직원'}</td>
                  <td className="text-right">{u.logins}</td><td className="text-right">{u.edits}</td><td className="text-right text-[#94A3B8] text-xs">{fmt(u.lastAt)}</td>
                </tr>))}</tbody>
            </table>
            {data.byUser.length === 0 && <p className="text-xs text-[#94A3B8] mt-2">기간 내 기록 없음</p>}
          </div>
        </>
      )}
    </div>
  )
}
