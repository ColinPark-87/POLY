// 아파트명 정규화 — 지도 마킹(지오코딩)을 위해 중계처럼 깔끔한 단지명으로 통일.
// 같은 단지가 동-호수/별표잡음/이중공백으로 여러 문자열이 되어 집계가 쪼개지고
// Kakao 키워드 검색이 깨지는 문제 대응. (저장 데이터는 건드리지 않고 표시/매칭 단계에서 정규화)

/** 표시·집계용 클린 단지명: 공백 정규화 + 잡음기호 제거 + 끝의 동/호수 제거 */
export function normalizeApt(s: string | null | undefined): string {
  let v = (s ?? '').replace(/[★☆◆●▶•]/g, ' ') // ★☆◆●▶•
                   .replace(/\s+/g, ' ').trim()
  if (!v) return ''
  // 끝에 붙은 동-호수/동/호수 제거 (동 번호가 이름 일부가 아닌 주소 꼬리일 때)
  v = v
    .replace(/\s*\d{1,4}\s*-\s*\d{1,4}\s*$/, '')            // "112-1503"
    .replace(/\s*\d{1,4}\s*동(\s*\d{1,4}\s*호)?\s*$/, '')   // "101동", "101동 1502호"
    .replace(/\s*\d{1,4}\s*호\s*$/, '')                      // "1502호"
    .trim()
  return v
}

/** 매칭용 키: 모든 공백 제거 + 소문자. 띄어쓰기/대소문자 차이를 무시하고 포함 비교. */
export function aptMatchKey(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s ]/g, '').toLowerCase()
}

/** Kakao 결과명(a)과 검색어(b)가 공백 무시 포함관계인지 */
export function aptNameMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = aptMatchKey(a), kb = aptMatchKey(b)
  if (!ka || !kb) return false
  return ka.includes(kb) || kb.includes(ka)
}
