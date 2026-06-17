export interface PresenceRow { user_id: string; user_name: string | null; last_seen: string; page?: string | null }

/** 윈도우(windowSec) 내 + 본인(selfId) 제외한 동시 접속자만 반환. page로 보는중/편집중 구분. */
export function filterPresent(rows: PresenceRow[], selfId: string, nowMs: number, windowSec: number) {
  const cutoff = nowMs - windowSec * 1000
  return rows
    .filter(r => r.user_id !== selfId && Date.parse(r.last_seen) >= cutoff)
    .map(r => ({ user_name: r.user_name, last_seen: r.last_seen, editing: !!r.page && r.page.includes('edit') }))
}
