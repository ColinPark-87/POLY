'use client'

import { useState, useEffect, useCallback } from 'react'

const todayStr = new Date().toLocaleDateString('en-CA')

const DAYS = ['월', '화', '수', '목', '금'] as const

interface StudentEntry {
  student_id: string
  name: string
  pickup_time: string | null
  location: string | null
  days: string[]
  override?: boolean
  absent?: boolean
  class_id?: string
}

interface TimeGroup {
  session_name: string
  time_range: string
  busMap: Record<string, StudentEntry[]>
  busLocations: Record<string, string[]>
}

interface AbsentEntry {
  student_id: string
  name: string
  bus_name: string
  date: string
}

interface Bus {
  name: string
}

interface ReqState {
  student: StudentEntry
  fromBus: string
  toBus: string
  days: string[]
  note: string
}

function nameFontClass(name: string): string {
  const len = name.length
  if (len <= 2) return 'text-2xl'
  if (len === 3) return 'text-xl'
  if (len === 4) return 'text-lg'
  if (len === 5) return 'text-base'
  return 'text-sm'
}

function normalizeTime(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1])
  const min = m[2]
  if (h < 8) h += 12
  return `${String(h).padStart(2, '0')}:${min}`
}

export default function SafetyTodayView({
  assignedBuses,
  staffName,
}: {
  assignedBuses: string[]
  staffName: string
}) {
  const [dir, setDir] = useState<'arr' | 'dep'>('dep')
  const [date, setDate] = useState(todayStr)
  const [groups, setGroups] = useState<TimeGroup[]>([])
  const [allBuses, setAllBuses] = useState<string[]>([])
  const [absentStudents, setAbsentStudents] = useState<AbsentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [reqState, setReqState] = useState<ReqState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campus/vehicles?date=${date}&direction=${dir}`)
      if (res.ok) {
        const d = await res.json()
        setGroups(d.timeGroups ?? [])
        setAbsentStudents(d.absentStudents ?? [])
        setAllBuses((d.buses ?? []).map((b: Bus) => b.name))
      }
    } finally {
      setLoading(false)
    }
  }, [date, dir])

  useEffect(() => { load() }, [load])

  async function submitRequest() {
    if (!reqState || !reqState.toBus || reqState.days.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_change_request',
          student_id: reqState.student.student_id,
          student_name: reqState.student.name,
          class_id: reqState.student.class_id,
          direction: dir,
          from_bus: reqState.fromBus,
          to_bus: reqState.toBus,
          days: reqState.days,
          note: reqState.note || undefined,
        }),
      })
      if (res.ok) {
        setSuccessMsg(`${reqState.student.name} 변경 요청이 제출되었습니다.`)
        setReqState(null)
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (assignedBuses.length === 0) {
    return (
      <div className="text-center py-16 text-[#94A3B8]">
        <p className="text-2xl mb-2">🚌</p>
        <p className="text-sm font-medium">담당 버스가 배정되지 않았습니다.</p>
        <p className="text-xs mt-1">차량 설정에서 안전 선생님을 배정해주세요.</p>
      </div>
    )
  }

  // 내 버스만 필터링
  const myGroups = groups
    .map(g => {
      const myBusMap: Record<string, StudentEntry[]> = {}
      const myBusLocs: Record<string, string[]> = {}
      for (const bus of assignedBuses) {
        if (g.busMap[bus]) {
          myBusMap[bus] = g.busMap[bus]
          myBusLocs[bus] = g.busLocations[bus] ?? []
        }
      }
      return { ...g, busMap: myBusMap, busLocations: myBusLocs }
    })
    .filter(g => Object.keys(g.busMap).length > 0)

  const myAbsents = absentStudents.filter(a => assignedBuses.includes(a.bus_name))

  const totalStudents = myGroups.reduce(
    (sum, g) => sum + Object.values(g.busMap).reduce((s, arr) => s + arr.length, 0),
    0
  )

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[#1E293B]">오늘 등하원</h1>
        <p className="text-[12px] text-[#64748B] mt-0.5">
          {staffName} 담당 · {assignedBuses.join(', ')}
        </p>
      </div>

      {/* 성공 메시지 */}
      {successMsg && (
        <div className="mb-3 bg-[#DCFCE7] border border-[#86EFAC] rounded-xl px-4 py-2.5 text-sm text-[#166534] font-medium">
          ✅ {successMsg}
        </div>
      )}

      {/* 컨트롤 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
        />
        {(['arr', 'dep'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDir(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              dir === d
                ? d === 'arr' ? 'bg-[#3B82F6] text-white' : 'bg-[#DC2626] text-white'
                : 'bg-white border border-[#E2E8F0] text-[#64748B]'
            }`}
          >
            {d === 'arr' ? '🚌 등원' : '🏠 하원'}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto text-xs text-[#004EA2] border border-[#E2E8F0] px-3 py-1.5 rounded-lg hover:bg-blue-50"
        >
          새로고침
        </button>
        <span className="text-[12px] text-[#94A3B8]">총 {totalStudents}명</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : myGroups.length === 0 && myAbsents.length === 0 ? (
        <div className="text-center py-16 text-[#94A3B8]">
          <p className="text-2xl mb-2">🚌</p>
          <p className="text-sm">{dir === 'arr' ? '등원' : '하원'} 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myGroups.map(group =>
            Object.entries(group.busMap).map(([busName, students]) => (
              <div
                key={`${group.session_name}-${busName}`}
                className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden"
              >
                {/* 버스 헤더 */}
                <div className="px-4 py-3 bg-[#004EA2] text-white flex items-center justify-between">
                  <div>
                    <span className="font-bold text-base">{busName}</span>
                    <span className="text-xs text-blue-200 ml-2">{group.session_name}</span>
                    {group.time_range && (
                      <span className="text-xs text-blue-300 ml-1">({group.time_range})</span>
                    )}
                  </div>
                  <span className="text-sm font-bold bg-white text-[#004EA2] px-2.5 py-1 rounded-full">
                    {students.filter(s => !s.absent).length}명
                  </span>
                </div>

                {/* 학생 목록 — 터치하면 변경 요청 */}
                <div className="divide-y divide-[#F1F5F9]">
                  {students.map(stu => (
                    <button
                      key={stu.student_id}
                      onClick={() => setReqState({
                        student: stu,
                        fromBus: busName,
                        toBus: '',
                        days: [...stu.days],
                        note: '',
                      })}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[#F7F8FA] transition-colors ${
                        stu.absent ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`${nameFontClass(stu.name)} font-bold leading-tight ${
                            stu.absent ? 'line-through text-[#94A3B8]' : 'text-[#1E293B]'
                          }`}
                        >
                          {stu.name}
                        </span>
                        {stu.absent && (
                          <span className="text-xs bg-[#FEE2E2] text-[#EF4444] px-2 py-0.5 rounded-full font-bold">
                            결석
                          </span>
                        )}
                        {stu.override && !stu.absent && (
                          <span className="text-xs bg-[#FEF9C3] text-[#92400E] px-2 py-0.5 rounded-full font-bold">
                            변경
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#64748B]">
                        {stu.location && (
                          <span className="max-w-[160px] truncate">📍 {stu.location}</span>
                        )}
                        {stu.pickup_time && (
                          <span className="font-semibold text-[#1E293B] tabular-nums">
                            ⏱ {normalizeTime(stu.pickup_time)}
                          </span>
                        )}
                        <span className="text-[#CBD5E1] text-sm">›</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* 결석 */}
          {myAbsents.length > 0 && (
            <div className="bg-[#FEF2F2] rounded-2xl border border-[#FECACA] p-4">
              <p className="text-xs font-bold text-[#EF4444] mb-2">🚫 결석 ({myAbsents.length}명)</p>
              <div className="space-y-1">
                {myAbsents.map(a => (
                  <div key={`${a.student_id}-${a.bus_name}`} className="flex items-center gap-2 text-base">
                    <span className="text-[#1E293B] font-medium">{a.name}</span>
                    <span className="text-sm text-[#94A3B8]">{a.bus_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 변경 요청 모달 ── */}
      {reqState && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
          onClick={() => setReqState(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-[#1E293B]">{reqState.student.name}</h3>
                <p className="text-[11px] text-[#64748B]">
                  현재 {reqState.fromBus} · {dir === 'arr' ? '등원' : '하원'} — 변경 요청
                </p>
              </div>
              <button onClick={() => setReqState(null)} className="text-[#94A3B8] text-xl">✕</button>
            </div>

            <p className="text-[11px] text-[#94A3B8] mb-3 bg-[#F8FAFC] rounded-xl px-3 py-2">
              요청 제출 후 상담부·관리자 승인 시 정기 스케줄에 반영됩니다.
            </p>

            {/* 변경할 호차 */}
            <div className="mb-3">
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">변경할 호차 *</p>
              <div className="flex flex-wrap gap-1.5">
                {allBuses.filter(n => n !== reqState.fromBus).map(name => (
                  <button key={name}
                    onClick={() => setReqState(s => s ? { ...s, toBus: name } : s)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors"
                    style={reqState.toBus === name
                      ? { background: '#004EA2', color: '#fff', borderColor: '#004EA2' }
                      : { background: '#F7F8FA', color: '#475569', borderColor: '#E2E8F0' }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 적용 요일 */}
            <div className="mb-3">
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">적용 요일 *</p>
              <div className="flex gap-1.5">
                {DAYS.map((d, di) => {
                  const active = reqState.days.includes(d)
                  const DOT_COLORS = ['#EF4444','#F97316','#10B981','#3B82F6','#8B5CF6']
                  return (
                    <button key={d}
                      onClick={() => setReqState(s => s ? {
                        ...s,
                        days: active ? s.days.filter(x => x !== d) : [...s.days, d]
                      } : s)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      style={active
                        ? { background: DOT_COLORS[di], color: '#fff' }
                        : { background: '#fff', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 메모 */}
            <div className="mb-4">
              <p className="text-[10px] font-bold text-[#94A3B8] mb-1.5">메모 (선택)</p>
              <input
                value={reqState.note}
                onChange={e => setReqState(s => s ? { ...s, note: e.target.value } : s)}
                placeholder="변경 사유 또는 학부모 요청 내용"
                className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setReqState(null)}
                className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm">
                취소
              </button>
              <button
                onClick={submitRequest}
                disabled={submitting || !reqState.toBus || reqState.days.length === 0}
                className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-40">
                {submitting ? '제출 중...' : '변경 요청 제출'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
