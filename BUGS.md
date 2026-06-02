# Poly Leave System — 버그 / 보안 리포트

> 최종 갱신: 2026-05-27 (정리 작업 반영)

## ✅ 해결됨

### Critical (모두 해결)
- ✅ `/api/admin/*` 3개 엔드포인트 무인증 → `hq_admin` 게이트 추가
- ✅ `/api/auth/setup-account` 계정 탈취 → `@campus.internal` 체크 + `maybeSingle()`
- ✅ `PATCH /api/campus/employees/[id]` mass-assignment → admin 게이트
- ✅ `POST /api/campus/employees` 무권한 생성 → admin 게이트 + CSPRNG 임시 비번
- ✅ `reset-password` 무권한 + 평문 응답 → admin 게이트 + CSPRNG
- ✅ 신규 원장 공유 비밀번호 `poly7659**` → 랜덤 (양쪽 다)
- ✅ `/api/auth/create-admin` 무인증 → 기존 hq_admin 있으면 차단 + CSPRNG
- ✅ `approvals/[id]` 동료 승인 가능 → admin 게이트
- ✅ `direct-entry` 무권한 + cross-campus → admin 게이트 + user_id 캠퍼스 검증
- ✅ `holidays` 무권한 DELETE + 무스코프 → admin 게이트 + campus 스코프

### High (대부분 해결)
- ✅ 부원장 admin drift (leave-grants, balances, class-roster/history DELETE, class-roster/import)
- ✅ `/api/campus/leave-grants` cross-campus 오염 → 대상 user_id 검증
- ✅ 차량 API GET vs POST 권한 drift → `resolvePermissions` 통일 + `vehiclesRestricted` 차단
- ✅ 차량 API cross-campus (`update_enrollment_schedule`, `remove_rider`, `submit_change_request`) → `assertClassInCampus` 헬퍼
- ✅ class-roster 담임반 카테고리: 부원장이 '원장' 그룹 잘못 분류 → `!/부원장/` 제외 추가

### Medium (해결)
- ✅ `/api/tmap-route` 무인증 → auth 게이트
- ✅ `/api/geocode` 무인증 → auth 게이트
- ✅ `/api/debug/me` 노출 → hq_admin 게이트
- ✅ `/api/test-kakao` 키 노출 → hq_admin 게이트
- ✅ 동명이인 `.single()` 크래시 (name-login, setup-account) → `maybeSingle()` / `limit(2)` 분기

### Low / 코드 스멜 (해결)
- ✅ 캠퍼스 레이아웃 디버그 쿼리스트링 노출 (`?cl_id=…&cl_email=…`) 제거
- ✅ `userName ?? '원장'` → `'직원'`
- ✅ `m.match(/\d+/g)!` 크래시 위험 6곳 모두 가드 추가
- ✅ `app/api/leave/route.ts` 중복 프로필 fetch 제거
- ✅ vehicles 페이지 `tab === 'settings'` 죽은 분기 + 트리거 useEffect + 차량추가/수정 모달 + 관련 state/함수 제거
- ✅ RouteMapView `{false && busSettingsOpen}` 80줄 죽은 블록 제거

---

## 남은 항목 (낮은 우선순위)

### 🔶 Medium

**13. 연차 신청 race condition**
`app/api/leave/route.ts:72-97`
- 잔여 일수 체크 → INSERT 사이 락 없음. 두 신청 동시 시 둘 다 통과.
- **Fix**: 승인 단계에서 재검증 또는 DB 트리거.

**15. `parseTimeMinNorm` 자동 PM 시프트**
`app/api/campus/vehicles/route.ts:54-61`
- 시 < 8이면 무조건 PM. 7:30 → 19:30 인식.
- 유치부 분기로 우회되지만 명시적 AM/PM 또는 세션별 임계값으로 리팩토링 권장.

**18. 캘린더 `sick`(병가) 전직원 노출**
`app/api/calendar/route.ts:74-81`
- 의도일 수 있으나 프라이버시 검토.

**22. `add_bus` race condition**
`app/api/campus/vehicles/route.ts:559-565`
- 중복 체크 → INSERT 사이 락 없음.
- **Fix**: DB `UNIQUE (campus_id, name)` 인덱스.

### 🔵 Low

**29. `backups/RouteMapView_v*.tsx` 리포 동봉**
- versioning_on_edit 원칙에 따라 의도적으로 보관. tsconfig `exclude`에 추가하면 타입체크 노이즈 줄어듦. (선택)

**30. `/api/campus/class-roster/restore/route.ts` 공개 Firebase RTDB URL**
- 권한 footgun은 아니지만 데이터 출처가 외부 fixed URL이라 다른 사람이 그 RTDB 변조하면 import에 영향.
- **Fix**: 환경변수로 이전 또는 Supabase Storage 백업 사용.

**27. `proxy.ts` middleware export 이름**
- AGENTS.md에 따르면 이 fork는 표준 Next.js와 다름. `proxy` export가 의도된 것으로 추정. 현재 정상 동작 중. (검증만 권장)

---

## 적용된 보안 가드 요약

### 권한 게이트 (admin-only)
| 엔드포인트 | 게이트 |
|---|---|
| `POST /api/admin/*` | hq_admin |
| `POST /api/auth/create-admin` | 첫 부트스트랩만 |
| `POST /api/auth/setup-account` | @campus.internal 사용자만 |
| `POST/PATCH /api/campus/employees(/[id])` | isCampusAdminLike |
| `POST /api/campus/employees/[id]/reset-password` | isCampusAdminLike + 같은 캠퍼스 |
| `PATCH /api/campus/approvals/[id]` | isCampusAdminLike |
| `POST /api/campus/direct-entry` | isCampusAdminLike + 대상 캠퍼스 검증 |
| `POST/DELETE /api/campus/holidays` | isCampusAdminLike + 캠퍼스 스코프 |
| `POST /api/campus/leave-grants` | isCampusAdminLike + 대상 캠퍼스 검증 |
| `GET /api/campus/balances` | isCampusAdminLike |
| `DELETE /api/campus/class-roster/history` | isCampusAdminLike |
| `POST /api/campus/class-roster/import` | isCampusAdminLike |
| `POST /api/campus/vehicles` | resolvePermissions().vehicles + !vehiclesRestricted + assertClassInCampus |
| `GET /api/debug/me`, `/api/test-kakao` | hq_admin |
| `POST/GET /api/tmap-route`, `/api/geocode` | 인증 필요 |

### 헬퍼 추가
- `lib/auth/routing.ts` → `isCampusAdminLike(role, position)` — 모든 mutating API의 공통 admin 게이트
- `app/api/campus/vehicles/route.ts` POST 내부 → `assertClassInCampus(classId)` — class_id가 자기 캠퍼스 소속인지 검증

### CSPRNG 임시 비밀번호 (3곳)
- `POST /api/campus/employees` (직원 추가)
- `POST /api/campus/employees/[id]/reset-password` (비번 재발급)
- `POST /api/hq/campuses` (신규 캠퍼스 원장 발급)
- `POST /api/auth/create-admin` (HQ 부트스트랩)

`Math.random().toString(36)` → `randomBytes(9~12).toString('base64url')` 변경. 응답 형식은 동일하므로 UI 영향 없음.
