# 차량관리 시스템 구조 문서

작성일: 2026-05-09
대상 파일:
- `app/(campus)/campus/vehicles/page.tsx` — 캠퍼스 관리자 차량관리 메인 페이지
- `app/api/campus/vehicles/route.ts` — 차량 데이터 GET/POST API
- `app/(campus)/campus/vehicles/RouteMapView.tsx` — 노선지도 컴포넌트
- `app/(employee)/vehicles/SafetyTodayView.tsx` — 안전선생님 전용 뷰
- `app/api/campus/class-roster/import/route.ts` — 엑셀 업로드 API

---

## 1. 데이터 구조

### Supabase 테이블 관계

```
class_sessions (세션: "유치부", "초등부 매일반" 등, month 별)
  └── classes (반: session_id + level + teacher)
        └── class_enrollments (수강: student_id + class_id)
              ├── arr_schedule (JSONB) → 등원 호차/위치/시간
              └── dep_schedule (JSONB) → 하원 호차/위치/시간

campus_students  (학생 기본 정보)
campus_buses     (호차 정보: 기사, 안전선생님 등)
pickup_overrides (오늘 하루 임시 변경: 결석/호차변경)
bus_change_requests (변경 요청 워크플로우)
stop_coords      (정류장 GPS 좌표 — Kakao 지도용)
```

### arr_schedule / dep_schedule JSONB 형식

```json
{
  "월": "2호차",
  "화": "2호차",
  "월_loc": "중계약국",
  "화_loc": "중계약국",
  "_time": "09:13"
}
```

- 요일 키 (`월`~`금`): 탑승 호차명
- `{요일}_loc`: 승하차 정류장
- `_time`: 개인 승차 시간 (전체 요일 공통, 세션 기본 시간보다 우선)
- `{요일}_time`: 요일별 개별 시간 (일부 데이터에만 존재)

### 세션 레이블 매핑 (`getSessionLabel`)

| 세션명 패턴 | arr 방향 | dep 방향 |
|------------|---------|---------|
| 유치부 | 유치부 | 유치부 |
| 유치부 방과후 | 유치부 | 유치부 |
| 초등부 방과후 | 방과후 | 매일반 |
| 초등부 매일반 | 매일반 | 매일반 |
| 월수금 / 3일반 | 3일반 | 3일반 |
| 화목 / 2일반 | 2일반 | 2일반 |

---

## 2. 엑셀 업로드 (좌측 메뉴 → 업로드 파일)

### 경로
`app/(campus)/campus/class-roster/page.tsx`
`app/api/campus/class-roster/import/route.ts`

### 엑셀 시트 구성

| 시트 | 내용 |
|------|------|
| ①세션설정 | 세션명, 월, 시작시간, 종료시간, sort_order |
| ②반편성_차량 | 학생별 반 + 등하원 호차/장소/시간 |
| ③차량정보 | 호차별 기사/안전선생님 연락처 |
| ④정류장좌표 | 정류장명 + 위도/경도 (또는 주소 입력 시 자동 지오코딩) |

### ②반편성_차량 컬럼 매핑

| 컬럼 인덱스 | 내용 |
|------------|------|
| 0 | 세션명 |
| 1 | 레벨 |
| 2 | 담당교사 |
| 3 | 학생이름 |
| 4 | 영어이름 |
| 5~14 | 등원 (월~금) 호차, 정류장 × 5일 |
| 15~24 | 하원 (월~금) 호차, 정류장 × 5일 |
| 25 | 등원 공통 _time |
| 26 | 하원 공통 _time |
| 27 | 대기 여부 ("대기" 입력 시 is_waitlist=true) |

### 업로드 처리 흐름

1. 인증 확인 (campus_admin / hq_admin만 허용)
2. XLSX 파싱 (`xlsx` 라이브러리)
3. 시트 1: 세션 upsert (이름+월로 중복 체크)
4. 시트 2: 반 upsert → 학생 upsert → enrollment upsert (arr/dep schedule 포함)
5. 시트 3: 호차 정보 upsert
6. 시트 4: 정류장 좌표 저장 (`stop_coords` 테이블) — 주소만 입력 시 Kakao 지오코딩 API 호출
7. 결과 통계 반환 (생성 건수, 오류 목록)

### 주의사항
- 동일 학생(이름 기준)은 기존 ID 재사용 (공백 무시 정규화)
- enrollment는 `student_id, class_id` unique constraint로 upsert — **arr/dep schedule 전체 덮어쓰기**
- 기존 월에 같은 세션명 있으면 time_range, sort_order만 업데이트
- 연동 상태: **정상** — 4개 시트 모두 처리, 지오코딩 fallback 포함

---

## 3. 차량관리 (master 탭)

### API 호출
```
GET /api/campus/vehicles?direction=arr|dep&master=true&month=2026년 5월
```

### 동작
- `master=true` 파라미터 → 오늘 날짜 무관, 해당 월 전체 스케줄 집계
- `pickup_overrides` 미적용 (마스터 스케줄이므로)
- 결과: `timeGroups[]` (세션별 그룹) + `busMap` (호차별 전체 학생)

### 화면 기능
- 등원/하원 탭 전환
- 세션 필터 (유치부/매일반/3일반/2일반/전체)
- 호차별 학생 목록 (접기/펼치기)
- 개별 학생 클릭 → 스케줄 편집 모달
  - 호차, 요일, 정류장, 시간 수정
  - `update_enrollment_schedule` POST 액션 → `class_enrollments` 영구 저장
- 호차 카드 상단 시계 아이콘 → 호차 전체 일괄 시간 설정
  - `bulk_set_time` POST 액션
- 탑승자 추가 버튼 → 학생 검색 후 배정
  - `add_rider` POST 액션 → enrollment 영구 업데이트 + 오늘 override 생성

### 정렬
- 그룹 정렬: **시간 오름차순** → 동일 시간은 세션 우선순위 (유치부1 → 매일반2 → 3일반3 → 2일반4)
- 학생 정렬: 개인 pickup_time → 세션 default time 오름차순

---

## 4. 오늘 등하원 (today 탭)

### API 호출
```
GET /api/campus/vehicles?date=YYYY-MM-DD&direction=arr|dep&month=2026년 5월
```

### 동작
- 해당 날짜의 요일(`dayKey`) 계산
- `pickup_overrides`에서 오늘 임시 변경 조회 → 적용
- 결석(is_absent=true): 해당 학생 `absentStudents` 목록으로 분리
- override된 학생: 호차/장소/시간 덮어쓰기

### pickup_time 유효성 필터 (방향별 자동 null 처리)

| 방향 | 조건 | null 처리 이유 |
|------|------|---------------|
| 하원(dep) | `_time < getMinDepTime(세션)` | 등원 시간이 잘못 저장된 것 |
| 등원(arr) | `_time < 13:00` (초등부) | 하원 시간이 잘못 저장된 것 |
| 등원(arr) | `_time > 세션 시작 시간` | 하원 시간이 잘못 저장된 것 (2026-05-09 추가) |
| 유치부 등원 | `_time >= 13:00` | 하원 시간으로 판단 |

세션별 최소 하원 시간:
- 유치부: 14:30 / 매일반·방과후: 16:30 / 3일반: 18:05 / 2일반: 18:50

### 화면 기능
- 날짜 선택 달력
- 세션 탭 (유치부/매일반/3일반/2일반/전체)
- 호차 필터 버튼
- 학생 클릭 → override 모달
  - 오늘만 호차/장소/시간 변경: `set_override` 액션 → `pickup_overrides` 저장
  - 앞으로 변경 (permanent): `update_enrollment_schedule` 액션
  - 결석 처리: is_absent=true override
  - 변경 요청 제출: `submit_change_request` 액션

---

## 5. 변경승인 (approval 탭)

### API 호출
```
GET /api/campus/vehicles?requests=true
```

### 동작
- `bus_change_requests` 테이블에서 status 기준 정렬 조회 (최대 200건)
- `pendingCount` 반환 → 탭 배지 표시용

### 승인 처리 (`approve_change_request`)
1. `bus_change_requests` 조회 (status=pending 체크)
2. `class_enrollments`의 해당 방향 schedule 영구 업데이트 (요일별 호차/장소/_time)
3. `bus_change_requests.status = 'approved'` 업데이트

### 거절 처리 (`reject_change_request`)
- `bus_change_requests.status = 'rejected'` 업데이트만
- enrollment 변경 없음

---

## 6. 변경기록 (history 탭)

- 동일한 `GET /api/campus/vehicles?requests=true` 응답 재사용
- 승인/거절된 기록 + 대기 중 기록 전체 표시
- UI에서 status 필터로 구분 표시

---

## 7. 노선지도 (map 탭)

### 컴포넌트
`app/(campus)/campus/vehicles/RouteMapView.tsx`

### API 호출
```
GET /api/campus/vehicles?direction=arr&master=true
GET /api/campus/vehicles?direction=dep&master=true
GET /api/campus/stop-coords
```

### 동작
- Kakao Maps API 사용 (window.kakao 로드)
- 좌표 2단계 로드: localStorage 캐시 → DB (`stop_coords` 테이블) 덮어쓰기
- 학교(중계폴리어학원) 고정 좌표: lat 37.6556, lng 127.0686

### 기능
- 등원/하원 전환
- 세션 선택, 호차 선택 → 해당 노선만 지도에 표시
- 노선뷰: 정류장 순서, 학생 수, 시간 표시
- 좌표 설정 뷰:
  - 정류장명 검색 → Kakao 장소 검색 API → 후보 좌표 선택
  - 지도 클릭으로 직접 좌표 설정
  - `POST /api/campus/stop-coords` → DB 저장 + localStorage 갱신
- 배치 지오코딩: 전체 정류장 일괄 주소→좌표 변환

---

## 8. 차량설정 (settings 탭)

### API 액션

| 액션 | 내용 |
|------|------|
| `add_bus` | 새 호차 추가 (`campus_buses` insert) |
| `delete_bus` | 호차 삭제 |
| `update_bus` | 호차 정보 수정 (기사, 안전선생님, KT담당자 등) |
| `reorder_buses` | 호차 순서 변경 (`sort_order` 업데이트) |

### update_bus 이름 변경 시 연쇄 처리
호차 이름 변경 시 자동으로:
1. `pickup_overrides` 내 bus_name 전체 업데이트
2. `class_enrollments` arr_schedule, dep_schedule 내 모든 요일 키 값 업데이트

### 안전선생님 배정
- `campus_buses.safety` 컬럼: 안전선생님 이름 저장
- `campus_buses.safety_phone`: 연락처
- `campus_buses.kt_name`, `kt_phone`: KT 담당자
- 배정된 안전선생님은 직원(employee) 뷰에서 자신의 호차만 볼 수 있음

---

## 9. POLY안전선생님 뷰

### 컴포넌트
`app/(employee)/vehicles/SafetyTodayView.tsx`

### 접근
- 직원 권한 (`/vehicles` 경로)
- `campus_buses.safety` 이름으로 배정된 호차 자동 필터링

### API 호출
```
GET /api/campus/vehicles?date=YYYY-MM-DD&direction=arr|dep
```
(캠퍼스 관리자와 동일한 엔드포인트, 본인 호차만 UI에서 필터)

### 기능
- 등원/하원 전환, 날짜 선택
- 자신이 담당하는 호차만 표시
- 학생 클릭 → 변경 요청 제출 (`submit_change_request` 액션)
  - 다른 호차로 변경 요청만 가능 (직접 수정 불가)
  - 요청은 캠퍼스 관리자가 변경승인 탭에서 승인/거절

---

## 10. 연동 상태 요약

| 기능 | 연동 상태 | 비고 |
|------|----------|------|
| 엑셀 업로드 | 정상 | 4개 시트 처리, 지오코딩 포함 |
| 차량관리 (마스터) | 정상 | 세션 필터, 시간순 정렬 |
| 오늘 등하원 | 정상 | override 반영, 시간 유효성 필터 |
| 변경승인 | 정상 | 승인 시 enrollment 영구 반영 |
| 변경기록 | 정상 | 동일 API 응답 재사용 |
| 노선지도 | 정상 | Kakao Maps, 좌표 DB+캐시 2단계 |
| 차량설정 | 정상 | 이름 변경 시 연쇄 업데이트 포함 |
| POLY안전선생님 | 정상 | 담당 호차만 필터, 요청 제출만 가능 |

---

## 11. 알려진 주의사항

1. **등원 시간 상한 검증** (2026-05-09 추가):
   `arr_schedule._time > 세션 시작 시간`이면 자동 null 처리 (잘못 저장된 하원 시간 방어)
   → 저장 시에도 API에서 동일 검증 후 400 반환

2. **월별 데이터 복사 시 주의**:
   arr/dep schedule을 `{}`로 초기화 후 복사해야 스테일 데이터 방지
   → 미초기화 시 이전 달 5일치 호차 배정이 잔존함 (`fix_buses.mjs` 참고)

3. **동명이인**:
   `campus_students`는 이름 기준 upsert → 동명이인은 수동 구분 필요
   예: 중계 김채아 2명 (유치부 Chloe Kim / 초등부 Ella Kim)

4. **방과후 세션 레이블 이중 매핑**:
   초등 방과후 arr → `'방과후'` / dep → `'매일반'`
   유치부 방과후 arr/dep 모두 → `'유치부'`
   → `getSessionLabel()` 함수를 모든 필터/그룹/탑승추가 로직에서 일관 사용 필수
