// 세션명 → 그 학생이 실제 타는 요일. 차량 배정이 학생 수업요일을 벗어나지 않게 clamp하는 데 쓴다.
// (빈 정류장 첫 탑승자 추가 시 클라가 전(全)요일을 보내 월수금 학생에게 화·목이 박히던 버그 방지.)

// 월수금/화목이 아니면 null = 제한 없음(매일반·유치부 등 전 요일 가능).
export function sessionRideDays(name: string | null | undefined): string[] | null {
  if (!name) return null
  if (name.includes('월수금') || name.includes('3일')) return ['월', '수', '금']
  if (name.includes('화목') || name.includes('2일')) return ['화', '목']
  return null
}

// 요청 요일을 세션 실제 요일로 제한. 요일반이 아니면(=null) 요청 그대로.
// 제한 후 비면(요청이 세션요일과 전혀 안 겹침) 세션 요일 전체로 폴백해 "추가했는데 0일" 방지.
export function clampRideDaysToSession(
  requested: string[],
  sessionName: string | null | undefined,
): string[] {
  const allowed = sessionRideDays(sessionName)
  if (!allowed) return requested
  const clamped = requested.filter(d => allowed.includes(d))
  return clamped.length ? clamped : allowed
}
