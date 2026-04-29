'use client'

import { useEffect, useState } from 'react'

interface Holiday { id: string; date: string; name: string; campus_id: string | null }

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [form, setForm] = useState({ date: '', name: '' })
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/campus/holidays')
    const d = await res.json()
    setHolidays(d.holidays ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/campus/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { setForm({ date: '', name: '' }); load() }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch('/api/campus/holidays', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-[#1E293B] mb-4 md:mb-6">공휴일 관리</h1>

      <div className="bg-white rounded-2xl p-4 md:p-6 border border-[#E2E8F0] shadow-sm mb-4">
        <h2 className="font-semibold text-[#1E293B] mb-4">공휴일 추가</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            required
            className="border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED] flex-1"
          />
          <input
            type="text"
            placeholder="공휴일 이름"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
            className="border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED] flex-1"
          />
          <button type="submit" className="bg-[#7C3AED] text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-[#6D28D9] transition-colors">추가</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-3 border-[#7C3AED] border-t-transparent rounded-full animate-spin" /></div>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-[#64748B] text-center py-10">등록된 공휴일이 없습니다.</p>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {holidays.map(h => (
              <div key={h.id} className="flex justify-between items-center px-4 md:px-6 py-3">
                <div>
                  <p className="font-medium text-sm">{h.name}</p>
                  <p className="text-xs text-[#64748B]">{h.date} {h.campus_id === null && <span className="text-[#7C3AED]">· 전국</span>}</p>
                </div>
                {h.campus_id !== null && (
                  <button onClick={() => handleDelete(h.id)} className="text-xs text-[#DC2626] hover:underline">삭제</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
