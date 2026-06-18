// 정류장명 정규화.
// 같은 정류장이 이중공백/표기차이로 여러 문자열로 저장돼 정확일치 매칭이 깨지는 문제 대응.

/** 비교용 정규화: 모든 공백 런을 한 칸으로 합치고 양끝 trim. (내부 이중공백 통일) */
export function normStop(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** 두 정류장명이 공백 차이만 빼고 같은지 */
export function sameStop(a: string | null | undefined, b: string | null | undefined): boolean {
  return normStop(a) === normStop(b) && normStop(a) !== ''
}

/**
 * '한진그랑빌' 정류장명 표준형. "한진그랑빌 N동"으로 통일(동 번호 N은 유지 → 다른 동은 별개).
 * - "한진그랑빌  109동"(이중공백) → "한진그랑빌 109동"
 * - "한진그랑빌 103"(동 누락)     → "한진그랑빌 103동"
 * - "한진그랑빌109동"(공백 없음)  → "한진그랑빌 109동"
 * - 그 외 형태(예 "한진그랑빌 정문")는 공백 정규화만 (강제로 동 붙이지 않음)
 */
export function canonHanjin(s: string | null | undefined): string {
  const n = normStop(s)
  const m = n.match(/^한진그랑빌\s*(\d+)\s*동?$/)
  return m ? `한진그랑빌 ${m[1]}동` : n
}
