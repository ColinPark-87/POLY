'use client'
import { usePresence } from './usePresence'

function rel(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  return s < 20 ? '방금' : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`
}

/** 같은 캠퍼스 차량관리를 동시에 보는 다른 사용자를 캠퍼스 단위로 표시. */
export function PresenceBadge({ campusId }: { campusId?: string }) {
  const present = usePresence(campusId)
  if (!present.length) return null
  const first = present[0]
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold"
      title={present.map(p => `${p.user_name ?? '다른 사용자'} · ${rel(p.last_seen)}`).join('\n')}
    >
      <span>👤</span>
      <span>
        {first.user_name ?? '다른 사용자'}님 작업 중 · {rel(first.last_seen)}
        {present.length > 1 ? ` 외 ${present.length - 1}명` : ''}
      </span>
    </div>
  )
}
