# HQ 차량 운행 현황 — 일부 캠퍼스만 학교/아파트 마킹 표시되는 버그 (2026-06-17)

## 증상
HQ → 차량 운행 현황 지도에서 **일부 캠퍼스만** 학교/아파트 마킹이 뜨고 나머지는 안 뜸.

## 근본 원인 (데이터 문제 아님 — 프런트엔드 버그)
지도 마킹(버블)의 좌표는 두 경로에서 나온다:
1. **자동 지오코딩** (`schoolSpots`/`aptSpots`) — `RouteMapView.tsx`의 지오코딩 effect가
   `/api/campus/students?schools=1` · `?apartments=1` 를 호출해 명단을 받고 Kakao 지오코딩.
2. **수동 place-spot 오버라이드** (`campus_place_spots`, `/api/campus/place-spots`) — `campus_id` 전달함.

문제: **(1) 자동 지오코딩 fetch가 `campus_id`를 안 넘김** (RouteMapView.tsx ~527·533행).
- `/api/campus/students` GET은 hq_admin이 `?campus_id`를 줘야만 동작하고, 없으면 **400 "캠퍼스 없음"** (route.ts:28-29).
- HQ 계정은 자기 campus_id가 없음 → 이 fetch가 400 → 지오코딩 0 → 마킹 0.
- 형제 fetch(454-460행, `schoolRaw`/`aptRaw` 인원수용)는 2026-06-10에 `cq`를 추가했으나,
  **실제 지도 버블을 그리는 지오코딩 fetch는 누락된 채 남아 있었음** (2026-06-15 정규화 리라이트에서도 그대로).

### "일부만 보이는" 이유 = place-spot 오버라이드 유무
읽기전용 점검(`scripts/verify-campus-map-setup.mjs`) 결과:
- **place_spots 보유 캠퍼스만 HQ에서 표시됨**: 대치(60)·중계(37)·정발(1) → (2) 경로가 campus_id를 넘기므로 정상.
- **place_spots 0인 12개 캠퍼스**(광교·광명·대전·목동·목동매그넷·분당·송도·송파·수지·운정·위례·유성)
  → 자동 지오코딩에만 의존 → (1) 경로 400 → 마킹 0.
- (캐시 `school-spots-v4-{campusId}`는 spots>0일 때만 기록되므로 빈 캐시 오염은 없음.)

## 세팅 점검 (READ-ONLY — 데이터 무변경)
`node scripts/verify-campus-map-setup.mjs` — **전 15개 캠퍼스 모두 정상 세팅 확인**:
- 아파트/학교 데이터 있음: 15/15
- 센터좌표(campus_stop_coords 중 캠퍼스명 매칭): 15/15 ✅ (운정 포함, 2026-06-15 1행 upsert 반영됨)
- 센터좌표 없어 마킹 0인 캠퍼스: **0개**
→ 데이터/센터좌표 세팅은 완벽. 표시 누락은 전적으로 프런트엔드 `campus_id` 누락 때문.

## 수정 (코드 1곳 — 세팅 데이터 무변경)
`app/(campus)/campus/vehicles/RouteMapView.tsx` 지오코딩 effect:
```ts
fetch(`/api/campus/students?schools=1${cqs}`)      // cqs = campusId ? `&campus_id=${campusId}` : ''
fetch(`/api/campus/students?apartments=1${cqs}`)
// deps: [campusId, coords, cqs]
```
- 형제 fetch(458-459행)·place-spots와 동일 패턴. 일반 캠퍼스 사용자는 route가 `?campus_id`를 무시(권한 우회 불가),
  기본 중계뷰는 `cqs=''`로 URL 불변 → 3가지 뷰 모두 안전.

## 검증
- `tsc --noEmit` 0 에러 / `vitest run` 111 passed.
- 점검 스크립트로 전 캠퍼스 데이터·센터좌표 세팅 완비 확인.
- ⚠️ 라이브 검증(HQ에서 12개 캠퍼스 마킹 표시)은 **배포 후** 확인 필요.

## 백업
- `_archive/backups/RouteMapView_v26_pre-hq-geocode-campusid_20260617.tsx`

## 배포
✅ **배포 완료 (2026-06-17)** — `vercel --prod`, https://poly-system.vercel.app
(dpl_GiUgD6S8xZT2xP2cifKYuCBXiMjh, READY, build exit 0).
확인: HQ에서 광교·목동 등 place-spot 없는 캠퍼스 마킹 표시되는지 점검
(브라우저 캐시 `school-spots-v4-{campusId}`는 첫 로드 후 자동 채워짐 — 안 보이면 새로고침).
