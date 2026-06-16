# Poly Leave System — 버그 / 보안 리포트

> 최종 갱신: 2026-06-16 (호차 시간 "전체 적용"이 다른 호차 요일 시간 덮어쓰기 수정)

## 2026-06-16 — 호차 시간 "전체 적용"이 다른 호차 요일 시간까지 덮어씀
상세: [docs/2026-06-16-차량-호차시간-전체적용-덮어쓰기-수정.md](./docs/2026-06-16-차량-호차시간-전체적용-덮어쓰기-수정.md)
- ✅ **원인(HIGH, 사용자 보고: 중계 3호차 한휘)**: 요일별 다른 호차 학생(월=3호차/화수목금=6호차)이 3호차 시간을 "전체 적용"하면, 핸들러가 무조건 공유 `_time`을 덮고 요일별 시간을 삭제(`clearPerDayTimes`)해 **공유 `_time`이 모든 요일에 적용→6호차 요일 시간까지 동일하게 변경**. 시간 불변식("공유 `_time` XOR 요일별 `{요일}_time")을 `update_enrollment_schedule`만 지키고 일괄/추가 핸들러 4곳(`bulk_update_location_time`·`bulk_set_time`·`add_rider`·`approve_change_request`)엔 누락돼 있었음.
- ✅ **수정**: 순수함수 `applyBulkTimeToSchedule()` 신설(`lib/utils/vehicle-schedule.ts`) — 대상 호차 요일만 시간 적용, 다른 호차 요일은 공유 `_time`을 요일별로 이관해 보존(요일별 모드 전환). 4개 핸들러 모두 교체. 죽은 `clearPerDayTimes`·`getClassDays` 제거.
- ✅ **검증**: 신규 유닛테스트 4(한휘 케이스). tsc0·eslint0·vitest 111/111. 라이브 한휘 시뮬 확인.
- ⚠️ **데이터**: 이미 덮인 한휘 6호차 시간은 자동복구 안 됨 → 배포 후 6호차(화목) 하차시간 1회 재입력 필요. 시스템 공통이라 전 캠퍼스 적용.

## 2026-06-08 — 노선 도로경로가 하차 정류장(우리은행)을 통과하지 않고 직행
상세: [docs/2026-06-08-차량관리-노선경로-정류장미통과-수정.md](./docs/2026-06-08-차량관리-노선경로-정류장미통과-수정.md)
- ✅ **원인(HIGH)**: 렌더 직전 후처리 `removeRouteLoops`가 "≈30m 내로 되돌아오면 루프로 보고 접음" 규칙이라, 차량이 큰길에서 빠져 하차하고 다시 합류하는 **정당한 하차 진입 구간을 루프로 오인해 접음** → 경로가 정류장을 직행. 마커 번호는 정류장 좌표에서 따로 찍혀 정상(②) → "마커는 ②인데 경로 미통과". (06-05 chunkStops/passList 수정과는 별개 원인 — 서버는 정확히 보냈고 프론트 후처리가 망가뜨림.)
- ✅ **수정**: 후처리를 순수함수 `lib/utils/route-geometry.ts`로 분리. `foldSpuriousLoops`=접을 구간에 실제 정류장(≈50m) 있으면 보존, `trimRouteToDestination`=꼬리(마지막 15%)에서만 절단. 메인/등하원동시보기 호출부 2곳에 `cleanRoutePolyline(pts,dest,stopCoords)` 적용. 전 노선·전 호차 공통 해결.
- ✅ **부수 수정(MED)**: Page 2(오늘 노선) ETA가 브라우저에서 TMAP 직접호출+`passList.slice(0,5)` → CORS/한국IP로 거리·시간 안 뜨고 5개 초과 과소계산. `/api/tmap-route` 서버 프록시로 단일화(분할·합산).
- 🔎 기록(보류): 좌표 5자리 중복제거는 두 정류장 좌표가 실수로 동일하면 한쪽 경로 제외 가능(마커 겹침으로 식별) · 서버 `partial` 부분경로 플래그 프론트 무시(드문 구간누락 시 경고 배지 후보).
- 검증: tsc 0 / vitest 55/55(신규 route-geometry 8) / build ✓. 백업 `RouteMapView_v7_pre-routeloop-fix_20260608.tsx`. ✅배포완료(poly-system.vercel.app, 2026-06-08).

## 2026-06-04 — 학생설정 변경이 모바일 미반영 = 방향 기본값 불일치

## 2026-06-04 — 학생설정 변경이 모바일 미반영 = 방향 기본값 불일치
- ✅ **원인**: 학생설정(master) 탭 `masterDir` 기본 **등원(arr)**, 모바일(오늘) `todayDir` 기본 **하원(dep)**. arr/dep_schedule은 별개라, 학생설정을 등원 기본으로 열어 편집하면 등원만 저장→모바일 하원에서 안 보임. (update_enrollment_schedule 자체·동일방향 동기화는 정상)
- 수정: masterDir 기본값 'arr'→'dep'(모바일과 동일). editSched 모달에 방향 색배지(등원파랑/하원빨강)+'이 방향에만 적용'+'반대 방향은 따로' 안내. (양방향 동시편집은 미구현 — 추후 후보)
- 보조 가능성(보류): 그 날짜 pickup_override가 today뷰를 가림(editSched는 override 미삭제) / 다른 기기 staleness.

## 2026-06-04 — 탑승 추가(add_rider) 위치 잔존 + 엉뚱한 날 override
- ✅ **add_rider 위치 잔존 (HIGH)**: 다른 호차로 옮기며 추가할 때 `pickup_location` 미지정이면 `수_loc`를 갱신 안 해 **옛 호차 위치(태릉해린턴)가 2호차에 그대로** 남음. 수정: `else if (busChanged) delete currentSched[d+'_loc']`로 호차 변경 시 옛 위치 제거(미설정으로). (현재 이지아 데이터는 신안동진으로 이미 정상.)
- ✅ **add_rider 엉뚱한 날 override (MED)**: 영구 추가 시 보고 있는 날짜에 **무조건** today-override 생성 → 수요일만 추가해도 목요일 화면에 2호차로 보일 수 있었음. 수정: 보는 날짜 요일이 dayList에 포함될 때만 override 생성.
- 참고: '8호차에 수요일 남음'은 데이터 아니라 직전 DayDots 표시버그(아래)였고 이미 수정·배포됨 → Ctrl+F5 필요. 실데이터 시뮬 확인: 수→2호차(신안동진), 8호차 요일불=[월화목금].

## 2026-06-04 — 모바일 '오늘' 탭 DayDots가 모든 요일 켜짐 (요일별 다른 호차 학생)
- ✅ **today 모드 scheduleDays 버그 (HIGH, 사용자 정확 지적)**: route.ts today 모드가 entry.days(요일 불)를 `sched[day]가 있는 모든 요일`로 계산 → 8호차 카드에서도 수요일(실제 2호차) 불이 켜져 "8호차에 월~금 다 들어옴"으로 보였음. master 모드는 `sched[day]===busName`(호차별 요일)이라 학생설정 탭은 정상이었음(사용자가 두 탭 차이로 정확히 짚음).
  - 수정: today 모드도 `scheduleDays = allDays.filter(d => sched[d] === busName)`로 변경 → 8호차 카드엔 8호차 요일(월화목금)만, 2호차 카드엔 수요일만 불. 실데이터 시뮬레이션 검증 완료(목요일→8호차[월화목금], 수요일→2호차[수]).

## 2026-06-04 — 요일별 다른 호차: 복수 등록 학생 저장 안 됨 (이지아 유치부 하원)
- ✅ **복수 enrollment 학생의 요일별 호차 변경이 반영 안 됨 (HIGH, 기존 H5)**: 유치부 하원은 보통 한 학생이 **유치부 정규 + 유치부 방과후** 2개 enrollment로 등록됨. `update_enrollment_schedule`이 단일 class_id만 갱신해, 수요일만 2호차로 바꿔도 **다른 enrollment에 수요일 8호차가 남아** 수요일에 2호차·8호차 양쪽에 중복 노출 → "저장 안 됨/8호차가 남음"으로 보였음.
  - 수정: 갱신 후 **같은 학생의 같은 방향 다른 enrollment에서 변경 대상 요일(dayList)을 제거**(`delete sched[d]/_loc/_time`)해 해당 요일 탑승을 단일 호차로 통일. `update_enrollment_schedule`·`approve_change_request` 모두 적용. (Supabase 타입 추론 위해 select는 리터럴 컬럼 사용.)
  - 직전 수정(호차 이동 시 미선택 요일 보존)과 함께, 이제 "평소 8호차·수요일만 2호차"가 정상 저장·표시.

## 2026-06-04 — 요일별 다른 호차 저장 버그 (이지아: 평소 8호차·수요일만 2호차)
- ✅ **요일 이동 시 다른 요일 배정이 삭제됨 (HIGH)**: `update_enrollment_schedule`이 호차 이동(old≠new) 시에도 `dayList`에 없는 옛 호차 요일을 전부 delete → "수만 2호차"로 바꾸면 8호차였던 월화목금이 모두 사라짐. 또 직전 추가한 `approve_change_request`(차량선생님 승인)에도 동일 버그 존재.
  - 수정: 제거는 **같은 호차에서 요일 축소(old===new 또는 old 없음)일 때만** 수행. 호차 이동 시엔 선택 안 한 요일의 기존 호차 배정을 보존 → 요일별 다른 호차 지원(선택 요일만 새 호차로 덮어씀). 두 핸들러 모두 적용.
  - UI: '앞으로 변경' 안내문을 "{호차}로 바꿀 요일만 선택 (나머지 요일은 그대로 유지)"로 명확화.
  - GET은 이미 요일별 `sched[dayKey]`로 호차를 계산하므로 저장만 고치면 표시는 정상.

## 2026-06-04 — 오류/보안/죽은코드 감사 정리 (병렬 에이전트 5)
- ✅ **저장형 XSS (HIGH)**: 차량 지도 RouteMapView CustomOverlay HTML에 정류장명·학생명·학교/아파트명이 미이스케이프 보간(1073/1074/1139/1149/1151/1252/1389/1490) → 엑셀/DB 악성 문자열 시 지도 보는 사용자 브라우저에서 스크립트 실행 가능. `esc()` 헬퍼로 전부 이스케이프.
- ✅ **이메일 HTML 인젝션 (MED)**: lib/email.ts 사유·검토메모·이름 미이스케이프 → `escHtml()` 적용.
- ✅ **cross-campus 무결성 (MED)**: class-roster `enroll`/`add_class`가 대상 class_id/session_id 캠퍼스 소유권 미검증 → 소유권 체크(403) 추가.
- ✅ **mergeGroupsByLabel 상태변형 버그 (HIGH)**: 첫 group의 원본 state 배열 공유→push로 렌더마다 인원 중복 누적. busMap/busLocations 내부 배열까지 깊은 복사로 분리.
- ✅ loadMaster/loadToday `res.ok` 미확인 → 403/500 시 알림 + 기존 데이터 미손상.
- ✅ geocode x/y/radius 숫자 검증(쿼리 주입 방지).
- ✅ 죽은코드 제거: lib/utils/date.ts(미사용), app/api/_archive·admin/_archive 일회성 마이그레이션 라우트, RouteMapView tmapLoading state.
- ✅ 2차 정리: 죽은 analytics 라우트(import·kosis) 제거 → **하드코딩 KOSIS 키 소스에서 제거**(단 git 이력엔 남으므로 키 폐기·재발급은 별도 필요). page.tsx '차량변경요청' 죽은 클러스터(ChangeRequest 인터페이스+changeRequests/requestsLoading/pendingCount state+loadRequests+approveRequest/rejectRequest+setPendingCount) 전부 제거(실제 승인 UI는 RouteMapView Page3에 존재). `.next` stale 캐시로 빌드 실패 → 클린 리빌드로 해결.
- ⏳ 잔여(코스메틱, 런타임 무해): debug/me 진단 엔드포인트(게이트됨, 의도적 보존) · dashboard/hq-dashboard/balances/staff 등 eslint 미사용 상수·변수 다수 · add_rider month 무시(기능 버그, 별도) · ⚠️ KOSIS 키 git 이력 잔존 → 외부에서 키 폐기/재발급 권장.

## 2026-06-04 — 모바일 호차/요일/탑승장소 "저장 불명확" 검증
상세: [docs/2026-06-04-모바일-변경저장-검증.md](./docs/2026-06-04-모바일-변경저장-검증.md) (병렬 에이전트 5 + 직접 교차검증)
- ✅ H1 저장 후 busFilter/sessionFilter 미초기화 → 변경 학생 사라짐: 성공 시 필터 '전체' 리셋.
- ✅ H2 데스크 영구변경 성공 알림 부재: 성공 토스트 추가.
- ✅ H3 `clear_override` 결과 미확인: 응답 검증 + 실패 시 명시 alert.
- ✅ H4 데스크톱 5분 캐시 크로스디바이스 미무효화: 탭 재활성화(focus/visible) 시 vc-arr/vc-dep 캐시 비우고 재조회(4초 throttle, RouteMapView.tsx).
- ✅ S1 bulk_* 부분실패 silent: 서버 per-row 오류 failed 집계 반환 + 클라 res.ok/failed 확인 alert.
- ✅ S2 approve_change_request 옛 요일/요일별 손실: update_enrollment_schedule과 동일 정리(from_bus 빠진요일 삭제 + clearPerDayTimes).
- ⏳ 보류: H5 update_enrollment_schedule 단일 class_id만 갱신(route.ts:710) — 복수 등록 학생은 enrollment별 요일이 정당히 다를 수 있어 일괄 덮어쓰기 위험. 실제 케이스 확보 후 day 단위 처리 권장. · 차량 pickTargetMonth vs 개설반 availableMonths[0] 월 불일치.

## 2026-06-04 — 차량관리 / 탑승장소 UI 개선 점검
상세: [docs/2026-06-04-차량관리-탑승장소-UI개선.md](./docs/2026-06-04-차량관리-탑승장소-UI개선.md)
- ✅ 학교/아파트 위치 보정 드래그 핀 잔존: 관리 패널 닫힘/종류 전환 시 `cancelPlaceAdjust` effect로 핀·상태 자동 정리.
- 🔎 경미(보류): 미설정 정류장은 수정 팝업 강조 핀 없음(좌표 부재) · 좌표 부분입력 시 핀 즉시 이동으로 약간 튐 · 컴포넌트 언마운트 시 마커 정리 미보장.

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
