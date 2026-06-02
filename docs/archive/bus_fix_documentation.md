# 버스 배정 데이터 정합성 수정 - 작업 정리

작성일: 2026-05-09

---

## 1. 문제 개요

### 증상
- 차량관리 화면에서 특정 학생들이 잘못된 호차에 배정되어 표시됨
- 유치부 학생이 유치부 하원 버스에 중복 표시됨 (유치부 정규 + 방과후 세션 양쪽에 표시)
- 신규 탑승추가 시 "수강 데이터를 찾을 수 없습니다" 오류 발생

### 근본 원인
**4월 데이터를 5월로 복사할 때 스케줄이 그대로 넘어와 정리되지 않은 상태.**

Supabase `class_enrollments` 테이블의 `arr_schedule` / `dep_schedule` JSONB 컬럼에
4월 전체 5일치 호차 배정이 5월에도 그대로 남아있었으나,
Firebase 5월 데이터(실제 운행 기준)와는 다른 상태.

예시:
```
Supabase dep_schedule: {"월":"2호차","화":"2호차","수":"2호차","목":"2호차","금":"2호차"}
Firebase 5월 실제:      목요일 2호차만 탑승
```

---

## 2. 데이터 구조

### Supabase
- 테이블: `class_enrollments`
- 컬럼: `arr_schedule`, `dep_schedule` (JSONB)
- 형식:
  ```json
  {
    "월": "2호차",
    "화": "2호차",
    "_time": "09:13",
    "월_loc": "중계약국"
  }
  ```
- 세션명 → 버스 그룹 레이블 매핑: `getSessionLabel(sessionName, dir)` 함수
  - 유치부 정규 → `'유치부'`
  - 방과후 유치부 → `'유치부'` (dep), `'방과후'` (arr)
  - 방과후 매일반/3일반/2일반 → 각 레이블

### Firebase (진실의 원천)
- 경로: `jkpoly-bf6b4-default-rtdb.firebaseio.com/poly_class/months/2026년 5월/busRoutes[]`
- 구조: `busRoutes[].buses[].students[].days` (요일별 탑승 여부)

---

## 3. 분석 도구

### `fix_buses.mjs`
Firebase 5월 데이터와 Supabase 데이터를 비교하여 불일치 항목을 찾고,
Supabase에만 있고 Firebase에는 없는 배정(= 삭제 대상)을 자동 제거.

```bash
node fix_buses.mjs --dry-run  # 확인만
node fix_buses.mjs            # 실제 적용
```

결과: `fix_results.json` 저장

### `restore_buses.mjs`
`fix_buses.mjs`에서 잘못 삭제된 배정을 복원하는 2단계 스크립트.
- Part 1: 남은 잘못된 유치부 정규세션 dep_schedule 13건 제거
- Part 2: 잘못 삭제된 유치부 방과후 dep_schedule 6건 복원

---

## 4. 실행 내역

### 4-1. 유치부 (2026-05-09)

| 단계 | 작업 | 건수 |
|------|------|------|
| fix_buses.mjs 1차 실행 | 유치부 정규세션 잘못된 배정 제거 | 47건 |
| restore_buses.mjs Part 1 | 남은 유치부 정규세션 제거 | 13건 |
| restore_buses.mjs Part 2 | 잘못 삭제된 방과후 세션 복원 | 6건 |
| fix_buses.mjs 재실행 | 최종 불일치 정리 (안유비 화요일 배정) | 1건 |
| **합계** | **제거 61건, 복원 6건** | |

복원된 학생 (방과후 세션, Firebase 기준 올바른 배정):
- 김주안: 방과후 목 5호차, 방과후 화 5호차
- 김태안: 방과후 목 5호차, 방과후 화 5호차
- 박서준: 방과후 목 2호차
- 신동주: 방과후 화 2호차

### 4-2. 초등부 (2026-05-09)

유치부와 동일한 문제 패턴: 유치부 정규세션에 등록된 초등부 학생들의
dep_schedule이 전체 5일치로 세팅되어 있었으나 Firebase 기준은 1-2일.

인라인 Node.js 스크립트로 19건 수정:

| 학생 | 수정 내용 |
|------|----------|
| 김태이 | 금,목,수,월,화 → 목 |
| 신건우 | 금,목,수,월,화 → 목 |
| 박지아 | 금,목,수,월,화 → 목 |
| 박서진 | 금,목,수,월,화 → 목 |
| 안유비(유치부세션) | 금,목,수,월,화 → 목 |
| 이시연 | 금,목,수,월,화 → 화 |
| 이은서 | 금,목,수,월,화 → 화 |
| 이루아 | 금,목,수,월,화 → 화 |
| 박채원 | 금,목,수,월,화 → 화 |
| 이서아 | 금,목,수,월,화 → 화 |
| 강태진 | 금,목,수,월,화 → 목 |
| 임서윤 | 금,목,수,월,화 → 목 |
| 이준혁 | 금,목,수,월,화 → 목 |
| 손예린 | 금,목,수,월,화 → 목 |
| 최지아 | 금,목,수,월,화 → 목 |
| 김현서 | 금,목,수,월,화 → 목 |
| 박도현 | 금,목,수,월,화 → 화 |
| 정민서 | 금,목,수,월,화 → 화 |
| 이지율 | 금,목,수,월,화 → 화 |

---

## 5. 코드 버그 수정

### 5-1. 신규 탑승추가 오류 (`app/api/campus/vehicles/route.ts`)

**문제**: `add_rider` 액션에서 세션 필터 로직이 `getSessionLabel`과 다른 방식을 사용하여
유치부 방과후 세션의 학생 탑승 추가 시 "수강 데이터를 찾을 수 없습니다" 오류 발생.

**원인**: 세션 검색 시 세션명에 '유치부' 포함 여부를 직접 비교했으나,
`getSessionLabel`은 유치부 방과후 세션도 dep 방향에서는 `'유치부'`로 분류.

**수정 전**:
```js
const matched = allSessRows.filter(s => {
  if (session_name.includes('방과후')) return s.name.includes('방과후')
  if (session_name.includes('유치부')) return s.name.includes('유치부') && !s.name.includes('방과후')
  ...
})
```

**수정 후**:
```js
const targetLabel = getSessionLabel(session_name, dir)
const matched = allSessRows.filter(s => getSessionLabel(s.name, dir) === targetLabel)
```

### 5-2. 오늘 등하원 세션 필터 탭 추가 (`app/(campus)/campus/vehicles/page.tsx`)

버스 필터와 날짜 선택 사이에 유치부/매일반/3일반/2일반 탭 추가.
동적으로 현재 날짜의 그룹 레이블을 읽어 탭 생성 (레이블 1개이면 탭 미표시).

---

## 6. 미해결 항목 (주의)

아래 5명은 Firebase 5월 기준 매일반 하원 버스 배정이 있으나,
**Supabase에 초등부 매일반 세션 등록 자체가 없음** → dep_schedule 자동 수정 불가.

| 학생 | Firebase 배정 | 비고 |
|------|--------------|------|
| 박선하 | 매일반 3호차 목요일 | Supabase 매일반 enrollment 없음 |
| 지서율 | 매일반 3호차 목요일 | Supabase 매일반 enrollment 없음 |
| 이지아 | 매일반 5호차 목,화요일 | Supabase 매일반 enrollment 없음 |
| 김민선 | 매일반 6호차 목요일 | Supabase 매일반 enrollment 없음 |
| 안유비 | 매일반 2호차 목요일 | Supabase 매일반 enrollment 없음 |

**조치 필요**: 이 학생들은 Supabase에 초등부 매일반 세션 수강 등록을 먼저 생성한 후,
해당 enrollment에 dep_schedule을 설정해야 함.

---

## 7. 재발 방지 권고

1. **월별 데이터 복사 시** arr_schedule/dep_schedule을 빈 객체 `{}`로 초기화 후 복사
2. **Firebase 데이터 임포트 스크립트** 제작 시 Firebase를 source of truth로 사용
3. **`getSessionLabel` 함수**를 세션 관련 모든 로직(필터/그룹/탑승추가)에서 일관되게 사용
4. 월 초 데이터 세팅 후 `fix_buses.mjs --dry-run`으로 검증 후 배포 권장

---

## 8. 생성된 스크립트 목록

| 파일 | 용도 |
|------|------|
| `fix_buses.mjs` | Firebase vs Supabase 비교 및 잘못된 배정 자동 제거 |
| `restore_buses.mjs` | 잘못 제거된 배정 복원 (2026-05-09 1회용) |
| `fix_results.json` | fix_buses.mjs 실행 결과 로그 |
| `yuchibu_dep_fixes.json` | 초등부 수정 내역 로그 |
