# 직원 현황 통합 + 권한 설정 설계

**날짜:** 2026-05-11
**상태:** 승인됨

---

## 개요

두 개로 분리된 직원 관리 페이지(`/campus/staff`, `/campus/employees`)를 하나로 통합하고, 직원별로 **개설반 현황**과 **차량관리** 메뉴 접근 권한을 설정할 수 있는 기능을 추가한다.

---

## 1. 데이터베이스

### 추가 컬럼 (`users` 테이블)

```sql
ALTER TABLE users ADD COLUMN perm_class_roster boolean DEFAULT null;
ALTER TABLE users ADD COLUMN perm_vehicles boolean DEFAULT null;
ALTER TABLE users ADD COLUMN perm_vehicles_restricted boolean DEFAULT null;
```

- `null` = 직급 기본값 적용
- `true/false` = 개별 override

### 직급별 기본값

| 직급 | perm_class_roster | perm_vehicles | perm_vehicles_restricted |
|------|:-----------------:|:-------------:|:------------------------:|
| 원장 | true | true | false |
| 관리자 | true | true | false |
| 상담부 | true | true | false |
| KT | true | true | false |
| POLY안전선생님 | false | true | true |
| FT | false | false | false |
| 사서 | false | false | false |
| 미화 | false | false | false |
| 기타 | false | false | false |

### 실제 권한 계산 (lib/permissions.ts)

```typescript
function resolvePermissions(user: { position: string; role: string; perm_class_roster: boolean | null; ... }) {
  const defaults = getPositionDefaults(user.position, user.role)
  return {
    classRoster: user.perm_class_roster ?? defaults.classRoster,
    vehicles: user.perm_vehicles ?? defaults.vehicles,
    vehiclesRestricted: user.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
  }
}
```

---

## 2. 직원 현황 페이지 통합

### 통합 대상
- `/campus/staff/page.tsx` → 메인 페이지 (유지 + 기능 추가)
- `/campus/employees/page.tsx` → `/campus/staff`로 redirect 후 삭제

### 통합 후 기능
- 직급별 카드 그룹 + 드래그로 직급 변경
- 커스텀 직급 추가/이름변경/삭제
- 재직자 요약 카드 (인원수/부서)
- 퇴사자 목록 + 복구 (접힘)
- `+` 버튼으로 직원 추가 / 직급 추가

### 직원 상세 모달 — 3개 탭

#### 탭 1: 기본 정보
- 이름, 직급, 역할(권한), 캠퍼스 입사일, 최초 입사일, 이메일 수정

#### 탭 2: 권한 설정
```
개설반 현황   [직급 기본값: OFF]  ○━━● (토글)
차량관리      [직급 기본값: ON]   ●━━○ (토글)
  └ 제한 뷰  [직급 기본값: ON]   ●━━○ (토글)  ← 차량관리 ON일 때만 표시
              (제한: 본인 호차·오늘 등하원·변경기록·노선지도만)
[기본값으로 초기화] 버튼
```
- 각 토글 옆에 "직급 기본값: ON/OFF" 표시
- override 상태면 토글 색상 강조
- 초기화 버튼 클릭 시 perm 컬럼을 null로 리셋

#### 탭 3: 퇴사 처리
- 퇴사일 입력 후 처리

---

## 3. 사이드바 권한 적용

### CampusSidebar.tsx

사용자 프로필 로드 시 `resolvePermissions()` 호출 후 메뉴 show/hide:

| 메뉴 | 표시 조건 |
|------|---------|
| 개설반 현황 | `permissions.classRoster === true` |
| 차량관리 | `permissions.vehicles === true` |
| 연차신청 등 직원 메뉴 | 기존과 동일 (모든 직원) |

---

## 4. 차량관리 제한 뷰

### 프론트엔드 (`/campus/vehicles/page.tsx`)

`permissions.vehiclesRestricted === true`이면 제한 뷰 렌더링:
- 본인 배정 호차 정보만 표시
- 오늘 등하원 현황 (본인 호차)
- 변경기록 (본인 호차)
- 노선지도

전체 뷰 기능(다른 호차 조회, 학생 편집 등) 숨김.

### API 보안

- `/api/campus/vehicles` — restricted 사용자가 다른 호차 요청 시 403
- `/api/campus/class-roster` — perm_class_roster 없는 사용자 요청 시 403

---

## 5. 변경 파일 목록

| 파일 | 작업 |
|------|------|
| `supabase/migrations/XXX_add_permissions.sql` | 컬럼 3개 추가 |
| `lib/permissions.ts` | 직급별 기본값 계산 유틸 (신규) |
| `app/(campus)/campus/staff/page.tsx` | 통합 페이지 + 권한 탭 추가 |
| `app/(campus)/campus/employees/page.tsx` | staff로 redirect |
| `app/api/campus/employees/[id]/route.ts` | perm 컬럼 PATCH 지원 |
| `components/CampusSidebar.tsx` | 권한 기반 메뉴 show/hide |
| `app/(campus)/campus/vehicles/page.tsx` | 제한 뷰 분기 처리 |
| `app/api/campus/vehicles/route.ts` | 제한 뷰 API 보안 |
| `app/api/campus/class-roster/route.ts` | 권한 검증 추가 |
