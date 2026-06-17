'use client'

export interface Conflict {
  updated_by: string | null
  updated_at: string
  onOverwrite: () => void
  onReload: () => void
}

function rel(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`
}

/** 저장 충돌(409) 시 표시: 다른 사람이 방금 바꿈 → 덮어쓰기/취소 선택. */
export function ConflictModal({ c, onClose }: { c: Conflict | null; onClose: () => void }) {
  if (!c) return null
  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-[#0F172A] mb-2">⚠️ 다른 변경이 감지됐어요</h3>
        <p className="text-sm text-[#475569] mb-4 leading-relaxed">
          방금 <b className="text-[#0F172A]">{c.updated_by ?? '다른 사용자'}</b>님이 이 항목을 바꿨어요({rel(c.updated_at)}). 어떻게 할까요?
        </p>
        <div className="flex gap-2">
          <button onClick={() => { c.onReload(); onClose() }}
            className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] text-[#475569] text-sm font-semibold hover:bg-[#F1F5F9]">
            취소 · 최신본 불러오기
          </button>
          <button onClick={() => { c.onOverwrite(); onClose() }}
            className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-sm font-semibold hover:bg-[#B91C1C]">
            내 변경으로 덮어쓰기
          </button>
        </div>
      </div>
    </div>
  )
}
