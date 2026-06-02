# Poly Leave System — 기능 인벤토리

> 폴리어학원 통합 운영 시스템 — 연차·인사·반편성·차량 관리
> 최종 갱신: **2026-05-27**

## 개요

폴리어학원(중계 / 대치 / 정발 등 다수 캠퍼스 운영)의 연차·인사·반편성·차량 운행을 통합 관리하는 Next.js(App Router) + Supabase 사내 웹앱.

- **운영 URL**: https://poly-system.vercel.app
- **배포**: Vercel CLI 직접 배포 (GitHub 연동 없음) — `cd leave-system && npx vercel --prod`
- **스택**: Next.js 16 (Turbopack) + React 19 + Tailwind v4 + TypeScript + Supabase + Kakao Maps + TMAP + Chart.js + FullCalendar + xlsx + Brevo (이메일)
- **이용자 그룹**: 본사(HQ) / 원장 / 부원장(원장과 동등) / 캠퍼스 제한 직원(상담·KT·관리자·POLY안전) / 일반 직원(FT 등)

관련 문서:
- [BUGS.md](./BUGS.md) — 보안·버그 우선순위 리포트
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel/Supabase 배포 가이드
- [RESTORE.md](./RESTORE.md) — 데이터 복원 절차
- [AGENTS.md](./AGENTS.md) — 이 fork는 표준 Next.js와 다름 주의

---

## 인증 · 권한

### 인증 방식
- Supabase Auth (이메일/비밀번호)
- `name-login`: 이름 기반 임시 로그인 (이메일 미설정 사용자용)
- `setup-account`: 첫 로그인 시 이메일/비밀번호 설정
- `forgot-password` / `update-password`
- localStorage "아이디 저장" (비밀번호 제외)

### 라우팅 가드 (`proxy.ts`)
- `/hq/*` → `hq_admin`만
- `/campus/*` → `campus_admin` / 부원장 / 캠퍼스 제한 직원
- 제한 직원은 `/campus/class-roster`·`/campus/vehicles`만, 그 외는 홈으로 리다이렉트
- 루트(`/`)·`/login` 진입 시 `resolveHomePath()`로 역할별 자동 분기

### 권한 매트릭스

| role / position | classRoster | vehicles | analytics | enrollEdit | 비고 |
|---|---|---|---|---|---|
| `hq_admin` (본사) | ✓ | ✓ | ✓ | ✓ | HQ 사이드바 |
| `campus_admin` (원장) | ✓ | ✓ | ✓ | ✓ | 캠퍼스 풀권한 |
| 부원장 (position) | ✓ | ✓ | ✓ | ✓ | role=employee 라도 원장 동등 |
| 상담·관리자 | ✓ | ✓ | ✗ | ✓ | 제한 직원 — 개설반/차량만 |
| KT | ✓ | ✓ | ✗ | ✗ | 제한 직원 |
| POLY안전선생님 | ✗ | ✓ (restricted) | ✗ | ✗ | 자기 담당 버스만 |
| 일반 직원 (FT 등) | ✗ | ✗ | ✗ | ✗ | `/dashboard`·`/apply` |

### 개인별 권한 오버라이드
`perm_class_roster`, `perm_vehicles`, `perm_vehicles_restricted`, `perm_analytics`, `perm_enroll_edit` — null이면 직급 기본값, true/false면 개별 override. 캠퍼스 직원 현황 페이지 권한 탭에서 토글.

---

## 본사 (HQ) 기능

### 페이지

**`/hq/dashboard` — 통합 대시보드**
- 전 캠퍼스 학생 수 (유치부/초등부 분리, 전월 대비 증감 모달)
- KPI 5종 (활성 캠퍼스, 전체 직원, 총 부여/잔여 연차)
- 캠퍼스별 연차 사용률 막대그래프
- 오늘 연차자 목록, 오늘 등·하원 합계

**`/hq/campuses` — 캠퍼스 관리** (탭: 캠퍼스 목록 / 전체 직원)
- 캠퍼스 CRUD (생성 시 원장 임시 비번 발급 + 연차대장 Import)
- 비활성화 / 복구
- 전체 직원을 카테고리(관리자/KT/FT/상담부/POLY안전선생님)로 묶어 조회

**`/hq/campuses/[id]` — 캠퍼스 상세**
- 원장 화면 데이터를 HQ 모드로 조회
- 연차 Excel 내보내기 (연간/월별)
- 연차관리대장 Import

**`/hq/campuses/[id]/roster` · `/vehicles`** — 캠퍼스 개설반/차량 읽기 전용

**`/hq/roster` — 통합 개설반 현황** — 좌측 캠퍼스 패널 + 우측 `HqRosterView`

**`/hq/vehicles` — 캠퍼스 차량 운행현황** — 캠퍼스 탭으로 전환

**`/hq/calendar` — 통합 캘린더** — 전 캠퍼스 휴가 일정 FullCalendar

**`/hq/leaves` — 연차 신청 이력**
- 캠퍼스/상태/연도 필터, 서명 이미지 모달, 신청서 PDF 재다운로드

**`/hq/import` — 파일 업로드/다운로드** (탭: 연차 / 반편성 / 내보내기)
- 연차관리대장 Excel: 시트명 연도 자동 감지, 8행부터 직원 2행 1쌍 파싱
- 반편성 Excel
- 캠퍼스별 연차대장 다운로드

**`/hq/settings`** — HQ 본인 비밀번호 변경

### API 요약

| 경로 | 기능 |
|---|---|
| `GET/POST /api/hq/campuses` `[id]` | 캠퍼스 CRUD |
| `GET /api/hq/campuses/[id]/stats` | 단일 캠퍼스 통계 |
| `GET /api/hq/campuses/[id]/balances` | 직원 잔여 |
| `GET /api/hq/campuses/[id]/export` | 연차대장 Excel |
| `GET /api/hq/campuses/[id]/roster` | 개설반 데이터 |
| `*/employees`, `*/employees/[empId]` | HQ 모드 직원 CRUD |
| `GET /api/hq/stats` | 대시보드 데이터 |
| `GET /api/hq/leaves` | 연차 이력 (필터) |
| `GET /api/hq/calendar` | 통합 캘린더 |

---

## 캠퍼스 (Campus) 기능

캠퍼스 사이드바 (`components/CampusSidebar.tsx`) — 5개 섹션, 개인별 항목 표시/숨김 설정 (localStorage).

### 페이지

**`/campus/dashboard` — 캠퍼스 대시보드** (탭: 캠퍼스 현황 / 세부 분석 / 운영 현황)
- 학생 통계 (유치부/초등부, 사립초 비율, 학년/동/아파트/학교 Top 10, 레벨 분포)
- 호차별 정원 (BUS_MAX=17, 정원 임박/초과 강조)
- 이번 주 연차 위클리 그리드
- 승인 대기 카운트 배지

**`/campus/my-dashboard` — 원장 본인 대시보드** — 총/사용/잔여 연차, 승인 대기, 최근 내역

**`/campus/staff` — 캠퍼스 직원 현황**
- 직급별 카드 그리드 — **순서: 원장 → 부원장 → 관리자 → 상담부 → FT → KT → POLY안전 → 사서/미화/기타**
- 드래그 앤 드롭으로 직급 이동
- 직원 추가 (임시 비밀번호 발급)
- 상세 모달 (정보 / 권한 / 퇴직 탭)
- 권한 토글
- 퇴직자 별도 섹션
- 커스텀 직급 추가/이름변경/삭제 (FIXED_POSITIONS는 잠금)

**`/campus/overview` — 통합 연차관리** (탭: 연차 현황 / 잔여 관리 / 신청 관리 / 직접입력)
- 직급 카테고리별 잔여 막대·원형 게이지
- 승인 관리: 대기/승인 탭, 서명 미리보기, 승인·반려·취소·리뷰 노트, PDF 다운로드
- 직접입력: 직원 검색, 캘린더 미리보기, 휴가 유형(연차/반차/반반차/경조/공가/병가/이벤트) 즉시 등록

**`/campus/balances` — 잔여 관리** — 직원별 12개월 매트릭스, 기본/이월/추가 일수 편집, Excel export

**`/campus/my-history` — 나의 연차 내역** — 본인 신청 이력, 대기 건 취소

**`/campus/class-roster` — 개설반 현황** (최상위 탭: 반편성 현황관리 / 담임반 관리)

*반편성 탭:*
- **월별 탭 바**: `availableMonths[0]`(최신 월) 자동 선택, "+ 다음 월" 버튼으로 복사 생성
- 서브탭: 반편성 / 전체 학생 / 입퇴소 / 변경 기록
- 드래그앤드롭으로 학생 ↔ 반 이동
- 대기자 명단, 학생 추가, 세션·반 추가/수정/재정렬
- 백업 모달 (data_backups 테이블, 월별 복원)
- Undo/Redo 스택
- 시간 복원 (`restore-times` API)
- 동명이인 가드 (409 DUPLICATE_NAME → 기존사용/동명이인/취소 분기)

*담임반 관리 탭:*
- 월 + 카테고리 필터 (전체 / 원장 / 관리자 / 상담부 / KT / FT)
- 직원 카드: 레벨 그룹, 총 인원, 당월 입퇴소 +/- 변화량
- 방과후 세션 제외

**`/campus/vehicles` — 차량 관리** (탭: 차량관리 / 오늘 등하원 / **노선지도(기본)** / 차량 설정)

*노선지도 탭 (`RouteMapView`):*
- Kakao Maps SDK + 정류장 좌표 (DB + localStorage 머지)
- 호차별 색상 (1호차=주황, 2호차=파랑 …)
- 등원/하원 토글
- 정류장 검색
- TMAP 실제 도로 경로 + 도착지 트리밍
- 학교/아파트 spot 자동 지오코딩 + 오버라이드
- 정류장 핀 드래그로 좌표 조정

*차량관리 탭:*
- 등/하원 방향
- 호차별 시간 그룹
- 탑승자 추가 (영구 / 오늘)
- 일괄 시간 설정
- 시간 표준화 (요일별 override 제거)
- **KST 기준 다음 달 우선 자동 선택** (`pickTargetMonth`)

*오늘 등하원 탭:*
- 결석 학생
- 임시 변경 (override) — 차량/정류장/시간 즉석 변경
- 차량 변경 요청 제출

*차량 설정 탭:*
- 버스 추가/편집 (이름·정원·기사·기사 전화·안전선생님·안전 전화·KT명·KT 전화)
- 안전선생님 후보 자동 추출

*POLY안전선생님 모드 (`vehiclesRestricted`)*:
- 자기 담당 버스만 표시

**`/campus/calendar` — 캠퍼스 캘린더** (탭: 캘린더 / 나의 일정 / 공휴일)
- FullCalendar 월/리스트 뷰, 휴가 유형별 색상
- 공휴일 추가 / 국가 공휴일 일괄 import

**`/campus/import` — 업로드** (탭: 연차 업로드 / 반편성 업로드)
- 연차관리대장 Excel — XHR 진행률 추적 (uploading → processing)
- 반편성 Excel — 정류장 좌표 자동 localStorage 저장

**`/campus/settings` — 내 설정** — 본인 비밀번호 변경

**`/campus/approvals` · `/direct-entry` · `/holidays`** — `overview` 서브탭과 기능 중복, 직접 라우트도 유지 (즐겨찾기 호환)

### API 요약

| 경로 | 기능 |
|---|---|
| `GET /api/campus/me` | 현재 사용자 (캠퍼스/권한) |
| `GET /api/campus/dashboard` | 대시보드 통합 |
| `GET/POST /api/campus/employees` `[id]` `[id]/reset-password` | 직원 CRUD, 임시 비번 재발급 |
| `GET/PATCH /api/campus/balances` `/export` | 잔여 일수, Excel |
| `GET/PATCH /api/campus/approvals` `[id]` | 승인 목록/처리 |
| `POST /api/campus/direct-entry` | 연차 직접입력 |
| `POST /api/campus/leave-grants` | 부여 일수 설정 |
| `GET/POST /api/campus/holidays` `/national` | 공휴일 |
| `GET/POST/DELETE /api/campus/class-roster` | 세션/반/수강 (액션 디스패치) |
| `POST /api/campus/class-roster/import` | 반편성 Excel |
| `GET /api/campus/class-roster/history` | 입퇴소 로그 |
| `POST /api/campus/class-roster/restore-times` | 시간 복원 |
| `GET/POST /api/campus/vehicles` | 차량/탑승자/스케줄 (액션 디스패치) |
| `GET/POST /api/campus/stop-coords` | 정류장 좌표 |
| `GET/POST /api/campus/place-spots` | 장소 POI |
| `GET/POST /api/campus/students` | 학생 마스터 |
| `GET/POST /api/campus/analytics` `/kosis` | 통계 + 노원구 인구 |
| `GET/POST /api/campus/backup` | 백업 목록/생성/복원 |

---

## 일반 직원 (Employee) 기능

페이지: `/dashboard` · `/apply` · `/history` · `/calendar` · `/settings` · `/vehicles` (POLY안전 전용 `SafetyTodayView`)

API: `/api/leave`(목록/신청), `/api/leave/[id]`(취소), `/api/leave/summary`, `/api/calendar`(휴가·공휴일), `/api/user/email`, `/api/public/campuses`(로그인 전 캠퍼스 셀렉트)

---

## 공통 시스템

- **이메일 알림 (Brevo)**: 신청/승인/취소/반려 4종 템플릿. `BREVO_API_KEY` 미설정 시 조용히 스킵.
- **연차 신청서 PDF**: `lib/downloadLeaveForm.ts` — 서명 이미지 임베드.
- **서명 캔버스** (`components/SignatureCanvas.tsx`): 터치/마우스 + dataURL 추출.
- **데이터 백업**: `data_backups` 테이블 + 백업 모달.
- **카카오/TMAP**: `/api/geocode`, `/api/tmap-route`.
- **이메일 셋업 배너**: `@campus.internal` 더미 이메일 사용자에 실이메일 등록 유도.
- **사이드바 개인 설정**: 항목 숨김, localStorage `campus-sidebar-hidden`.

---

## 최근 변경 사항 (2026-05)

| 날짜 | 변경 | 비고 |
|---|---|---|
| 2026-05-27 | 개설반 월탭 기본값 = 최신 월 | `availableMonths[0]` |
| 2026-05-27 | 부원장 직급 추가 | 원장과 동등 권한 (route + sidebar + permissions) |
| 2026-05-27 | 캠퍼스 직원 현황 직급 순서 | 원장 → 부원장 → 관리자 → ... |
| 2026-05-19 | 개설반 학생 모달 리디자인 | poly-bus-system 별도 프로젝트 |
| 2026-05-18 | 차량관리 지도 버블 + 좌측 패널 저장 버그 수정 | |
| 2026-05-18 | 유치부 방과후 → 유치부 분류 보정 | `getRunColor` / `getRunLabel` |

---

## 알려진 이슈

상세는 [BUGS.md](./BUGS.md) 참고. 요약:

- **🚨 Critical**: `/api/admin/*` 무인증, setup-account 계정 탈취, employees PATCH mass-assignment, peer password reset, 신규 원장 공유 비밀번호 등 보안 핫픽스 필요
- **⚠️ High**: 차량 API cross-campus 검증 누락, GET/POST 권한 drift, 부원장 admin 미적용 API 다수, 연차 race condition
- **🔶 Medium**: parseTimeMinNorm 자동 PM 시프트, /api/tmap-route 무인증, 동명이인 single() 크래시
- **TMAP passList 5개 제한**: 정류장 7개 초과 시 중간 경유지 일부 생략 (API 한계)

---

## 핵심 개발 패턴

- `leave_requests`는 users FK 2개 → `users!user_id(...)` 명시
- GET API route: `export const dynamic = 'force-dynamic'`
- 서비스 클라이언트 `createServiceClient()` (RLS 우회) 사용 시 **호출 전 반드시 `auth.getUser()` 게이트**
- 캠퍼스 데이터는 항상 `.eq('campus_id', campusId)` 스코프
- HQ 업로드는 `?campus_id=` 쿼리로 캠퍼스 결정 (profile.campus_id null일 때)
- 부원장 admin 게이트: `role === 'campus_admin' || isViceAdmin(position)`
- `position.includes('원장')`은 부원장도 매치 — 구분 필요 시 `/원장/.test(p) && !/부원장/.test(p)`
