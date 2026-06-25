// components/attendance/PreAbsenceModal.tsx
'use client'
import { useState } from 'react'
import type { ClassWithAttendance } from '@/lib/attendance'

interface Props {
  classes: ClassWithAttendance[]
  onClose: () => void
  onSaved: () => void
}

export function PreAbsenceModal({ classes, onClose, onSaved }: Props) {
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [status, setStatus] = useState<'absent' | 'late'>('absent')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const selectedClass = classes.find(c => c.class_id === selectedClassId)

  async function handleSave() {
    if (!selectedClassId || !selectedStudentId) {
      setError('반과 학생을 선택해주세요')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campus/attendance/pre-absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClassId,
          session_date: today,
          student_id: selectedStudentId,
          status,
          note: note || undefined,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      onSaved()
    } catch {
      setError('저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-800">사전 결석/지각 등록</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-600">반 선택</label>
          <select
            value={selectedClassId}
            onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId('') }}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">반을 선택하세요</option>
            {classes.map(c => (
              <option key={c.class_id} value={c.class_id}>
                {c.class_session_name} — {c.class_level}{c.class_room ? `/${c.class_room}` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedClass && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-600">학생 선택</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">학생을 선택하세요</option>
              {selectedClass.students.map(s => (
                <option key={s.student_id} value={s.student_id}>{s.student_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStatus('absent')}
            className={`flex-1 py-2 rounded-lg font-bold border-2 transition-colors ${status === 'absent' ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-500'}`}
          >
            결석
          </button>
          <button
            onClick={() => setStatus('late')}
            className={`flex-1 py-2 rounded-lg font-bold border-2 transition-colors ${status === 'late' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'border-gray-200 text-gray-500'}`}
          >
            지각
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-600">사유 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="예: 병원 방문, 가족 행사"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium">취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-[#004EA2] text-white rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
