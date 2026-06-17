'use client'
import { usePresence } from './usePresence'

function rel(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  return s < 20 ? '방금' : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`
}

/** 같은 캠퍼스 차량관리를 동시에 보는 사용자 표시. 편집 중이면 주황 강조, 단순 접속은 회색. */
export function PresenceBadge({ campusId, editing = false }: { campusId?: string; editing?: boolean }) {
  const present = usePresence(campusId, editing)
  if (!present.length) return null
  // 편집 중인 사람을 우선 노출
  const editors = present.filter(p => p.editing)
  const lead = editors[0] ?? present[0]
  const isEditing = !!editors.length
  const cls = isEditing
    ? 'bg-amber-100 border-amber-400 text-amber-900'
    : 'bg-slate-100 border-slate-300 text-slate-600'
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cls}`}
      title={present.map(p => `${p.user_name ?? '다른 사용자'} · ${p.editing ? '편집 중' : '보는 중'} · ${rel(p.last_seen)}`).join('\n')}
    >
      <span>{isEditing ? '✏️' : '👤'}</span>
      <span>
        {lead.user_name ?? '다른 사용자'}님 {isEditing ? '편집 중' : '보는 중'} · {rel(lead.last_seen)}
        {present.length > 1 ? ` 외 ${present.length - 1}명` : ''}
      </span>
    </div>
  )
}
