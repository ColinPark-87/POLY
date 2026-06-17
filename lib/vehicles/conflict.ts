export interface ConflictInfo { error: 'conflict'; updated_by: string | null; updated_at: string }

/** 현재 DB updated_at이 클라가 들고 있던 baseVersion보다 최신이면 true(=그 사이 변경됨). */
export function isStale(current: string | null | undefined, baseVersion: string | null | undefined): boolean {
  if (!baseVersion || !current) return false
  return Date.parse(current) > Date.parse(baseVersion)
}

/** 라우트 핸들러용: 현재행 updated_at/by와 baseVersion으로 409 응답 본문을 만들거나 null(=충돌 없음). */
export function conflictBody(
  row: { updated_at?: string | null; updated_by?: string | null } | null,
  baseVersion: string | null | undefined,
): ConflictInfo | null {
  if (!row?.updated_at) return null
  if (!isStale(row.updated_at, baseVersion)) return null
  return { error: 'conflict', updated_by: row.updated_by ?? null, updated_at: row.updated_at }
}
