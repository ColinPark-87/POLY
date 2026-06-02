# 차량관리 리모컨 최소화 + "앞으로 변경" 권한 정리 — 설계 문서

작업일: 2026-06-02 · 담당: Colin · 브랜치: `vehicle-remote-redesign`
복구 시점: 태그 `pre-remote-redesign-20260602`
관련: [[2026-06-02-vehicle-remote-redesign-design]]

## 1. 목표 / 문제

차량관리(`/campus/vehicles`) 후속 작업 두 건.

1. **리모컨 최소화** — 지도 위 플로팅 리모컨(`RouteMapView.tsx`)이 항상 320px 카드로 떠 있어 지도를 가린다. 접어서 지도를 넓게 볼 수단이 없다. (드래그 이동·위치기억은 이미 있음)
2. **모바일(오늘) 탭 "앞으로 변경" 저장이 안 됨** — `page.tsx handlePermChange()`가 저장에 실패해도 사용자에겐 성공처럼 보인다. 또한 영구변경 입구가 "앞으로 변경"과 "변경 승인 요청" 둘로 갈려 중복·혼동이 있다.

## 2. 핵심 결정 (확정)

- **자동 최소화는 이번 범위에서 제외.** 수동 최소화 버튼 + 선택요약 캡슐 복귀만 구현.
- **"앞으로 변경"의 동작을 권한(`vehiclesRestricted`) 기준으로 분리.**
  - **사유:** 차량선생님이 스케줄을 임의로 직접 바꾸면 운영상 문제가 된다. 본래 시스템은 *차량선생님 = 변경신청 / 데스크 직원 = 변경승인* 워크플로우로 설계됨. 이 분리가 그 의도와 일치하며, 두 입구 중복도 제거한다.
- **별도 "📋 변경 승인 요청" 접이식 폼 제거.** 영구변경 입구를 "앞으로 변경" 하나로 통합.
- **저장 버그는 어느 경로든 함께 수정** — `class_id`·`res.ok` 체크 누락 보강.

## 3. A. 리모컨 최소화 (RouteMapView.tsx)

- 상태 `remoteMinimized: boolean` + `localStorage('veh-remote-min-<campusId>')` 저장/복원 (기존 `remotePos` 패턴 동일).
- **최소화 버튼:** 드래그 그립 헤더 우측에 `–` 버튼. 클릭 → `remoteMinimized=true`.
- **최소화 모습(캡슐):** 320px 카드 대신 작은 알약 캡슐 렌더.
  - 노선 모드: `🗺️ {세션} · {등원/하원} · {호차요약}` (미선택 시 `세션 선택`).
  - 그 외 모드: 모드명 캡슐(`📅 오늘`, `🔁 변경` 등).
  - 우측에 펼치기 아이콘(`▢`). 캡슐 탭 → `remoteMinimized=false`.
  - 위치는 기존 `remotePos`(드래그 위치) 그대로 유지.
- 최소화/복귀 시 지도 `relayout` — 기존 `fullscreen` relayout effect 의존성에 `remoteMinimized` 추가.

## 4. B. "앞으로 변경" 권한 기반 단일 경로 (page.tsx)

override 모달(모바일/오늘 탭)의 영구변경 입구를 하나로 통합. 기존 "📋 변경 승인 요청 ▼" 섹션 제거.

| 권한 | "앞으로 변경" 동작 |
|---|---|
| **차량선생님** (`vehiclesRestricted=true`) | **변경신청 접수** → `submit_change_request` (to_bus=선택호차, days=permDays, location, pickup_time, from_bus=원호차). 변경탭 pending 으로 등록. **즉시 적용 안 함.** "변경 신청이 접수되었습니다. 데스크 승인 후 반영됩니다." 안내. |
| **데스크 직원** (`vehiclesRestricted=false`) | **즉시 영구 적용** `update_enrollment_schedule` + 성공 후 오늘 override 있으면 `clear_override`. 본인이 승인자이므로 바로 반영. |

- 버튼 라벨도 권한별: 차량="변경 신청", 데스크="영구 변경 저장".
- **중복 방지:** 신청은 1행만 생성, 승인 시 스케줄 1회 적용, 데스크 즉시적용은 pending 행을 만들지 않음 → 이중 쓰기/중복행 없음.

## 5. C. 저장 버그 수정

`handlePermChange`(및 신규 신청 경로) 모두:
- `overrideModal.student.class_id` 누락 시 `alert` 후 중단(데스크 즉시적용 경로).
- `res.ok` 및 응답 `d.error` 확인 → 실패 시 `alert(에러 메시지)` 후 **모달 유지**(닫지 않음).
- **성공 시에만** 모달 닫기 + `loadToday()` 재호출.
- 규약을 데스크톱 `handleSaveEditSched` / `RouteMapView.handleLeftEditSave`와 동일하게 맞춤.

## 6. D. 서버 추가 (route.ts)

- **`clear_override`** (신규 action): `pickup_overrides` 에서 `(student_id, date, direction)` 행 삭제. `campus_id` 일치 검증. 데스크 즉시적용 후 오늘 화면 반영용.
- **`submit_change_request`**: 서버는 이미 `location`·`pickup_time` 컬럼을 insert 함. 클라이언트 `submitChangeRequest`/신규 신청 호출에서 `location`·`pickup_time`을 함께 전송하도록 보강(승인 시 그대로 적용되게).

## 7. 범위 밖 (YAGNI)

- 리모컨 자동 최소화 — 이번 제외(요청에 따라).
- 데스크톱 학생설정 탭(master)·`RouteMapView` 편집 경로의 권한 분리 — 미요청. 모바일 override 모달만 대상.
- 변경탭 UI 자체 변경 — 기존 승인/거절 그대로.
- 알림/푸시 등 신청→승인 통지 — 미요청.

## 8. 검증

- 빌드 게이트: `npx tsc --noEmit` + `npm run build` (이 UI는 자동 테스트 없음 → 빌드 + 수동).
- 수동 왕복:
  1. 리모컨 `–` → 캡슐 → 탭 복귀, 새로고침 후 최소화 상태·위치 유지.
  2. 차량선생님 계정: 앞으로 변경 → "신청 접수" → 변경탭 pending 1건 → 데스크 승인 → 스케줄 반영(중복행 없음).
  3. 데스크 계정: 앞으로 변경 → 즉시 적용 + 오늘 override 있던 학생도 today 즉시 반영.
  4. 저장 실패 유도(예: 잘못된 시간) → `alert` 뜨고 모달 유지(silent 실패 없음).

## 9. 롤아웃

- 브랜치 `vehicle-remote-redesign` 계속 사용. 복구점 태그 `pre-remote-redesign-20260602`.
- 빌드 통과 후 사용자 확인 → `vercel --prod`. 문제 시 Vercel 즉시 롤백 또는 태그 reset.
