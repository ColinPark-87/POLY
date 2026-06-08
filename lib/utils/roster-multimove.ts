// 개설반 현황(반편성) 다중 선택·일괄 이동 순수 로직.
// UI/DB와 분리해 단위 테스트 가능하게 둔다.
//
// 클라이언트: Ctrl/Cmd+클릭=토글, Shift+클릭=범위 선택(같은 반 카드 내 순서 기준).
// 서버: 선택된 enrollment들을 한 반으로 옮길 때, 옮길 것/건너뛸 것을 분류(부분 성공).

// ── 클라이언트 선택 로직 ────────────────────────────────────

// Ctrl/Cmd+클릭 토글 — 선택에 있으면 빼고 없으면 더한 새 Set 반환.
export function toggleSelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// Shift+클릭 범위 — orderedIds(그 반 카드의 표시 순서)에서 anchor~target 사이 id들(양끝 포함).
// anchor가 없거나 orderedIds에 없으면 target 하나만.
export function rangeIds(
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): string[] {
  const ti = orderedIds.indexOf(targetId)
  if (ti === -1) return []
  const ai = anchorId ? orderedIds.indexOf(anchorId) : -1
  if (ai === -1) return [targetId]
  const [lo, hi] = ai <= ti ? [ai, ti] : [ti, ai]
  return orderedIds.slice(lo, hi + 1)
}

// 범위 선택을 기존 선택에 합친 새 Set.
export function applyRange(
  current: ReadonlySet<string>,
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): Set<string> {
  const next = new Set(current)
  for (const id of rangeIds(orderedIds, anchorId, targetId)) next.add(id)
  return next
}

// ── 서버 일괄 이동 분류 ────────────────────────────────────

export type BulkCandidate = {
  id: string // enrollment id
  student_id: string
  class_id: string
  name?: string
}

export type BulkSkip = { id: string; name?: string; reason: string }

export type BulkPartition = {
  movable: BulkCandidate[]
  skipped: BulkSkip[]
}

// 요청된 enrollment id들을 대상 반으로 옮길 때 분류한다.
// - 후보에 없음(타 캠퍼스/이미 삭제) → 건너뜀
// - 이미 대상 반 소속 → 건너뜀
// - 대상 반에 같은 학생이 이미 있음(기존 또는 이번 배치 내 중복) → 건너뜀
// 나머지는 movable. 같은 학생의 enrollment가 둘 이상 선택돼도 한 명만 이동(중복 삽입 방지).
export function partitionBulkMove(
  candidates: readonly BulkCandidate[],
  requestedIds: readonly string[],
  targetClassId: string,
  targetStudentIds: readonly string[],
): BulkPartition {
  const byId = new Map(candidates.map(c => [c.id, c]))
  const seenStudent = new Set(targetStudentIds)
  const movable: BulkCandidate[] = []
  const skipped: BulkSkip[] = []
  for (const id of requestedIds) {
    const c = byId.get(id)
    if (!c) { skipped.push({ id, reason: '없음/권한' }); continue }
    if (c.class_id === targetClassId) { skipped.push({ id, name: c.name, reason: '이미 대상 반' }); continue }
    if (seenStudent.has(c.student_id)) { skipped.push({ id, name: c.name, reason: '대상 반에 중복' }); continue }
    seenStudent.add(c.student_id)
    movable.push(c)
  }
  return { movable, skipped }
}
