# 출석 시스템 설계 스펙

**날짜:** 2026-06-25  
**대상:** poly-system.vercel.app (leave-system, Next.js + Supabase)  
**목적:** 상담부가 자리에서 전체 반 출결 실시간 파악 — 교실 순회 제거

---

## 1. 핵심 원칙

- **기본값 출석**: 결석·지각만 표기, 전원 출석이 기본
- **출결 탭 = 시간 마스터**: 세션 시작시간 출결에서 설정 → `class_sessions.time_range` 업데이트 → 스마트보드 타이머 자동 반영
- **개설반 현황 ↔ 출결 실시간 동기**: 학생 추가/제거 즉시 출결에 반영
- **누적 데이터**: 일별 출결 기록 누적 → 월별 통계·그래프

---

## 2. 데이터 모델

### 신규 테이블 3개

```sql
-- 교실별 스마트보드 PC 등록
smartboard_devices (
  id UUID PK,
  class_id UUID FK → classes(id),
  campus_id UUID FK → campuses(id),
  last_seen TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT now()
)

-- 반+날짜 단위 출석 세션
attendance_sessions (
  id UUID PK,
  class_id UUID FK → classes(id),
  campus_id UUID FK → campuses(id),
  session_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,         -- null = 미완료
  completed_by TEXT,                -- 'teacher' | 'counselor'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, session_date)
)

-- 학생별 출결 기록
attendance_records (
  id UUID PK,
  attendance_session_id UUID FK → attendance_sessions(id),
  student_id UUID FK → campus_students(id),
  status TEXT CHECK (status IN ('present','absent','late')) DEFAULT 'present',
  pre_marked BOOLEAN DEFAULT false,  -- 상담부 사전 결석 처리
  recorded_by TEXT,                  -- 'teacher' | 'counselor'
  note TEXT,                         -- 지각 사유 등
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
)
```

### 기존 테이블 연결 (수정 없음)

```
class_sessions → time_range TEXT ("9:40~11:00")  ← 출결에서 수정 가능
classes → session_id FK → class_sessions
class_enrollments → class_id + student_id (학생 명단 소스)
campus_students → name (학생 이름)
```

### Realtime 활성화

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
```

---

## 3. 인증 — 교실 전용 계정

- Supabase auth user 1개/교실
- `user_metadata: { class_id, campus_id, role: "smartboard" }`
- 세션 영구지속 → 재부팅 후 자동 로그인 (localStorage 미의존)
- `/smartboard` 라우트만 접근, 기존 사이드바 전부 숨김

```
계정 예시:
  room-유치부a@jungkye  / 관리자 보관 비밀번호
  room-s1@jungkye       / ...
```

---

## 4. 스마트보드 흐름

```
PC 부팅
  → shell:startup: chrome.exe --app=https://poly-system.vercel.app/smartboard --start-minimized
  → Supabase 세션 자동 복원
  → user_metadata.class_id 확인
  → 30초마다 class_sessions.time_range 파싱
  → 시작 2분 전: fullscreen overlay 강제 표시

overlay 규칙:
  - position: fixed, z-index: 9999, 100vw × 100vh
  - ESC 차단
  - 닫기 버튼 없음
  - "출석 완료" 버튼 클릭 시에만 닫힘

overlay 내 UI:
  - 사전결석 학생: 이미 🔴 표시
  - 나머지: 기본 🟢
  - 클릭: 🟢 → 🔴(결석) → 🟡(지각) → 🟢 순환
  - [출석 완료] → attendance_session + records 저장 → 창 백그라운드
```

### time_range 파싱 규칙

```typescript
// "9:40~11:00" → "09:40"
// "3:10~4:30"  → "15:10" (hour < 9 → +12)
function parseStartTime(timeRange: string): string {
  const start = timeRange.split('~')[0].trim()
  const [h, m] = start.split(':').map(Number)
  const hour24 = h < 9 ? h + 12 : h
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
```

---

## 5. 출결 탭 구조

### 서브탭 1: 반별 출석현황 (기본)

세션별 카드 그룹 (개설반 현황 카드 스타일 동일):

```
┌─ 유치부  [09:40 ✏️] ─────────────────────┐
│  ┌──────────┐  ┌──────────┐              │
│  │ 유치부A  │  │ 유치부B  │              │
│  │ 완료 8/9 │  │  대기중  │              │
│  │🔴 김민준 │  │    —     │              │
│  └──────────┘  └──────────┘              │
└───────────────────────────────────────────┘
```

카드 클릭 → 학생 상세:

```
🟢 김민준  🔴 이서연(사전결석P)  🟡 박지호(지각)
🟢 최수아  🟢 강도현  🟢 윤하은

[출석완료 처리] ← 상담부 수동 완료
```

세션 시간 ✏️ 클릭 → 시작시간 수정 → `class_sessions.time_range` 업데이트

### 서브탭 2: 캘린더 / 누적

- **월 캘린더**: 날짜별 전체반 완료율 배지, 클릭 → 그날 상세
- **누적 그래프**: 월별 출결률 추이 (반별/전체)
- **학생 검색**: 개인 출결 이력 조회

### 사전 결석 등록 (우측 패널 또는 모달)

```
날짜 선택 → 세션 선택 → 학생 검색
결석 / 지각 선택 → 사유 입력(선택) → [저장]
→ attendance_session 없으면 자동 생성 (completed_at=null)
→ attendance_records에 pre_marked=true로 저장
→ 스마트보드 overlay에 즉시 반영 (Realtime)
```

---

## 6. 상태 정의

| 상태 | 값 | 색상 | 조건 |
|------|-----|------|------|
| 출석 | present | 🟢 초록 | 기본값 |
| 결석 | absent | 🔴 빨강 | 선생님/상담부 처리 |
| 지각 | late | 🟡 노랑 | 선생님/상담부 처리 |
| 사전결석 | absent + pre_marked | 🔴P | 상담부 사전 처리 |
| 미도래 | — | 회색 | 수업 시작 2분 전 미만 |
| 대기중 | — | 파랑 점멸 | 팝업 중, 미완료 |
| 완료 | — | 초록 배지 | completed_at 존재 |

---

## 7. 권한

| role | 스마트보드 | 출결 탭 (읽기) | 출결 탭 (쓰기) | 시간 수정 |
|------|-----------|--------------|--------------|---------|
| smartboard | ✅ | ❌ | ❌ | ❌ |
| 상담부 | ❌ | ✅ | ✅ | ✅ |
| campus_admin | ❌ | ✅ | ✅ | ✅ |
| 원장 | ❌ | ✅ | ✅ | ✅ |

기존 role: `employee`, `campus_admin`, `hq_admin`. 상담부/원장은 `campus_admin` role에 포함된 것으로 간주. 구현 시 실제 role 컬럼값 확인 후 조정.

---

## 8. 개설반 현황 연동

- 학생 명단: `class_enrollments` JOIN `campus_students` 실시간 반영
- 개설반 현황 카드: 오늘 출결 상태 배지 추가 (완료/대기중/미도래)
- 학생 추가/제거 → 당일 attendance_records 자동 추가/무효화

---

## 9. 구현 파일 목록

```
신규:
  supabase/migrations/005_attendance.sql
  app/smartboard/page.tsx
  app/smartboard/layout.tsx
  components/attendance/AttendanceOverlay.tsx
  components/attendance/StudentStatusToggle.tsx
  components/attendance/SessionCard.tsx
  components/attendance/PreAbsenceModal.tsx
  hooks/useAttendanceTimer.ts
  lib/attendance.ts
  app/(campus)/campus/attendance/page.tsx
  docs/SMARTBOARD_SETUP.md

수정:
  components/CampusSidebar.tsx         ← 출결 탭 추가
  app/(campus)/campus/class-roster/    ← 출결 배지 추가
```

---

## 10. 구현 순서

1. DB 마이그레이션 (005_attendance.sql)
2. `lib/attendance.ts` — 타입 + 쿼리 함수
3. `hooks/useAttendanceTimer.ts` — 30초 폴링 + time_range 파싱
4. `AttendanceOverlay` + `StudentStatusToggle` 컴포넌트
5. `/smartboard` 페이지 + layout
6. `CampusSidebar.tsx` — 출결 탭 추가
7. `/campus/attendance` 페이지 (서브탭 2개)
8. 개설반 현황 배지 연동
9. Windows 설치 가이드

---

## 11. 미결 사항 (2단계)

- 누적 그래프 라이브러리 (recharts 기존 설치 여부 확인)
- 원장 대시보드 위젯 형태
- 스마트보드 계정 일괄 생성 스크립트
