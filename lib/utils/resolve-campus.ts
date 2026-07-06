// 요청의 캠퍼스 ID 해석 (다중 캠퍼스 권한 일관 처리).
//
// hq_admin(본사): 선택한 캠퍼스(param)가 우선 — 홈 campus_id가 세팅돼 있어도 선택 캠퍼스를 봐야 한다.
//   (버그: Colin HQ 계정이 campus_id=중계라, 이전엔 `!campusId && hq_admin`만 param을 읽어
//    광교·수지를 선택해도 항상 중계 데이터가 떴다. → hq_admin은 param을 먼저 본다.)
// 일반 사용자: 항상 자기 campus_id만 (param 무시 = 타 캠퍼스 열람 차단, 보안).
export function resolveCampusId(
  role: string | null | undefined,
  homeCampusId: string | null | undefined,
  paramCampusId: string | null | undefined,
): string | null {
  if (role === 'hq_admin') return paramCampusId || homeCampusId || null
  return homeCampusId ?? null
}
