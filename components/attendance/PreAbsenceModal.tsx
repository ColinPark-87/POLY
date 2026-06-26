'use client'
import { useState, useRef, useEffect } from 'react'
import type { ClassWithAttendance } from '@/lib/attendance'

interface Props {
  classes: ClassWithAttendance[]
  onClose: () => void
  onSaved: () => void
}

export function PreAbsenceModal({ classes, onClose, onSaved }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ student_id: string; name: string; class_id: string; class_label: string } | null>(null)
  const [status, setStatus] = useState<'absent' | 'late'>('absent')
  const [note, setNote] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ saved: number; skipped: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // 전체 학생 플랫 리스트 (반 정보 포함)
  const allStudents = classes.flatMap(c =>
    c.students.map(s => ({
      student_id: s.student_id,
      name: s.student_name,
      english_name: (s as any).student_english_name as string | null,
      class_id: c.class_id,
      class_label: `${c.class_session_name} — ${c.class_level}${c.class_room ? `/${c.class_room}` : ''}`,
    }))
  )

  const q = query.trim()
  const results = q
    ? allStudents.filter(s =>
        s.name.includes(q) ||
        (s.english_name ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : []

  // 시작~종료 날짜 범위 (포함)
  function dateRange(start: string, end: string): string[] {
    const out: string[] = []
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start]
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().split('T')[0])
      if (out.length > 60) break // 안전장치: 최대 60일
    }
    return out
  }

  async function handleSave() {
    if (!selected) { setError('학생을 선택해주세요'); return }
    setSaving(true); setError('')
    try {
      // 서버가 반 요일·주말·공휴일 필터해서 해당 날짜만 저장 (클라 루프 X)
      const res = await fetch('/api/campus/attendance/pre-absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selected.class_id,
          student_id: selected.student_id,
          status: status === 'late' ? 'late' : 'absent',
          note: note || undefined,
          start_date: startDate,
          end_date: endDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setDone({ saved: data.saved ?? 0, skipped: data.skipped ?? 0 })
    } catch (e) {
      setError('저장 실패: ' + (e instanceof Error ? e.message : '알 수 없음'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-800">사전 결석/지각 등록</h2>

        {/* 이름 검색 */}
        {!selected ? (
          <div>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="학생 이름 검색..."
              className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
            <div className="mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#E2E8F0] divide-y divide-[#F1F5F9]">
              {q === '' ? (
                <p className="text-xs text-[#94A3B8] text-center py-6">이름을 입력하세요</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-6">검색 결과 없음</p>
              ) : results.map(s => (
                <button
                  key={`${s.student_id}-${s.class_id}`}
                  onClick={() => { setSelected(s); setQuery('') }}
                  className="w-full text-left px-3 py-2 hover:bg-[#EAF2FB] transition-colors"
                >
                  <span className="text-sm font-semibold text-[#1E293B]">{s.name}</span>
                  {s.english_name && <span className="text-xs text-[#94A3B8] ml-1.5">{s.english_name}</span>}
                  <p className="text-xs text-[#64748B] mt-0.5">{s.class_label}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 선택된 학생 표시 + 변경 버튼 */
          <div className="flex items-center justify-between bg-[#EAF2FB] rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-bold text-[#1E293B]">{selected.name}</p>
              <p className="text-xs text-[#64748B]">{selected.class_label}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-[#004EA2] font-medium hover:underline">변경</button>
          </div>
        )}

        {/* 기간 (시작~종료) */}
        <div>
          <label className="text-xs font-medium text-[#64748B] block mb-1">기간 (며칠 결석 시 종료일 지정)</label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }}
              className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
            <span className="text-[#94A3B8] text-sm">~</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="flex-1 border border-[#E2E8F0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
            />
          </div>
          {startDate !== endDate && (
            <p className="text-[10px] text-[#7C3AED] mt-1">최대 {dateRange(startDate, endDate).length}일 (반 수업요일·주말·공휴일 제외하고 저장됨)</p>
          )}
        </div>

        {/* 결석/지각 */}
        <div className="flex gap-2">
          <button onClick={() => setStatus('absent')}
            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-colors ${status === 'absent' ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-400'}`}>
            결석
          </button>
          <button onClick={() => setStatus('late')}
            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-colors ${status === 'late' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'border-gray-200 text-gray-400'}`}>
            지각
          </button>
        </div>

        {/* 사유 */}
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="사유 (선택) — 예: 병원 방문"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />

        {error && <p className="text-red-600 text-xs">{error}</p>}
        {done && (
          <p className="text-green-700 text-xs bg-green-50 rounded-lg p-2">
            ✅ {done.saved}일 사전{status === 'late' ? '지각' : '결석'} 등록됨
            {done.skipped > 0 && ` (주말·공휴일·타요일 ${done.skipped}일 제외)`}
          </p>
        )}

        {done ? (
          <button onClick={() => { onSaved(); onClose() }}
            className="w-full py-2.5 bg-[#004EA2] text-white rounded-xl font-bold text-sm">닫기</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-600 text-sm font-medium">취소</button>
            <button onClick={handleSave} disabled={saving || !selected}
              className="flex-1 py-2.5 bg-[#004EA2] text-white rounded-xl font-bold text-sm disabled:opacity-40">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
