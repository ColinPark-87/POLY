'use client'
import { useState } from 'react'

// AI 차량 분석(증차/감차/쪽차) Phase A: 호차별 현황 수집 → Groq 분석 → 근거·재배정안 표시.
// (Phase B: 2분할 before/after 지도·프린트는 후속)

interface Action { type: string; bus: string; session?: string; reason?: string; reassign?: { student: string; fromBus?: string; toBus?: string; toStop?: string }[] }
interface AiResult { summary?: string; actions?: Action[] }

const cqsOf = (campusId?: string) => (campusId ? `&campus_id=${campusId}` : '')

export default function VehicleAiView({ campusId }: { campusId?: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<AiResult | null>(null)
  const [busCount, setBusCount] = useState(0)

  async function run() {
    setLoading(true); setErr(''); setResult(null)
    try {
      // 호차별 현황 수집 (등원+하원 master)
      const cqs = cqsOf(campusId)
      const [arrR, depR, coordR] = await Promise.all([
        fetch(`/api/campus/vehicles?direction=arr&master=true${cqs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/campus/vehicles?direction=dep&master=true${cqs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/campus/stop-coords${campusId ? `?campus_id=${campusId}` : ''}`).then(r => r.ok ? r.json() : null),
      ])
      const coords: Record<string, { lat: number; lng: number }> = coordR?.coords ?? coordR ?? {}
      const vehicles = buildSummary(arrR, depR, coords)
      setBusCount(vehicles.length)
      if (vehicles.length === 0) { setErr('분석할 호차 데이터가 없습니다.'); return }

      const res = await fetch(`/api/campus/vehicle-analysis${campusId ? `?campus_id=${campusId}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.needKey ? 'GROQ_API_KEY 미설정 — Vercel 환경변수 추가 후 재배포하세요.' : (d?.error ?? `오류 ${res.status}`)); return }
      setResult(d.result ?? {})
    } catch (e) { setErr(`실패: ${(e as Error).message}`) } finally { setLoading(false) }
  }

  return (
    <div className="p-3 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-black text-[#0F172A]">🤖 AI 차량 분석 <span className="text-[11px] font-medium text-[#94A3B8]">(증차·감차·쪽차)</span></h2>
        <button onClick={run} disabled={loading}
          className="ml-auto bg-[#004EA2] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
          {loading ? '분석 중…' : '분석 실행'}
        </button>
      </div>
      <p className="text-[11px] text-[#64748B] mb-3">전 호차·세션·정류장·인원을 기준으로 감차(전 세션 통틀어 1대) 시 학생 재배정안과 근거를 제시합니다. 유치부는 감차 대신 쪽차 유지.</p>

      {err && <div className="text-[12px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2 mb-3">{err}</div>}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl px-3 py-2.5 text-[13px] text-[#1E3A8A] font-semibold">💡 {result.summary}</div>
          )}
          <p className="text-[10px] text-[#94A3B8]">분석 대상 {busCount}개 호차 · 변경되는 호차만 표시</p>
          {(result.actions ?? []).map((a, i) => (
            <div key={i} className="border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: a.type === '감차' ? '#DC2626' : a.type === '증차' ? '#16A34A' : '#7C3AED' }}>{a.type}</span>
                <span className="text-[13px] font-bold text-[#0F172A]">{a.bus}</span>
                {a.session && <span className="text-[11px] text-[#64748B]">· {a.session}</span>}
              </div>
              <div className="px-3 py-2">
                {a.reason && <p className="text-[12px] text-[#334155] leading-snug mb-1.5">{a.reason}</p>}
                {a.reassign && a.reassign.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] font-bold text-[#94A3B8] uppercase">재배정</p>
                    {a.reassign.map((r, j) => (
                      <p key={j} className="text-[11px] text-[#475569]">
                        <b>{r.student}</b>{r.fromBus ? ` (${r.fromBus})` : ''} → <b className="text-[#004EA2]">{r.toBus}</b>{r.toStop ? ` · ${r.toStop}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {(result.actions ?? []).length === 0 && <p className="text-[12px] text-[#64748B]">변경 제안 없음(현 배차 적정).</p>}
          <button onClick={() => window.print()} className="text-[12px] font-bold border border-[#E2E8F0] text-[#334155] rounded-lg px-3 py-1.5">🖨 인쇄</button>
        </div>
      )}
    </div>
  )
}

// vehicle master 응답 → 호차별 요약 [{bus, sessions, total, stops:[{name,count,lat,lng}]}]
function buildSummary(arrR: unknown, depR: unknown, coords: Record<string, { lat: number; lng: number }>) {
  type Entry = { location?: string | null; days?: string[]; name?: string }
  type Resp = { busMap?: Record<string, Entry[]>; timeGroups?: { session_name: string; busMap: Record<string, Entry[]> }[] }
  const out: Record<string, { bus: string; sessions: Set<string>; stops: Record<string, number>; total: number }> = {}
  const ensure = (bus: string) => (out[bus] ??= { bus, sessions: new Set(), stops: {}, total: 0 })
  for (const [dir, R] of [['등원', arrR], ['하원', depR]] as const) {
    const resp = R as Resp | null
    for (const tg of resp?.timeGroups ?? []) {
      for (const [bus, students] of Object.entries(tg.busMap ?? {})) {
        const c = ensure(bus)
        c.sessions.add(`${tg.session_name}·${dir}`)
        for (const s of students) {
          const loc = (s.location ?? '').trim()
          if (loc) { c.stops[loc] = (c.stops[loc] ?? 0) + 1; c.total++ }
        }
      }
    }
  }
  return Object.values(out).map(v => ({
    bus: v.bus,
    sessions: [...v.sessions],
    total: v.total,
    stops: Object.entries(v.stops).map(([name, count]) => ({ name, count, lat: coords[name]?.lat, lng: coords[name]?.lng })),
  }))
}
