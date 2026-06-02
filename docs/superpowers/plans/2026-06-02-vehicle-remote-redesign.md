# 차량관리 리모컨 재설계 — 구현 계획

> **For agentic workers:** 이 계획은 단계별로 실행한다. 각 단계 끝에 `npx tsc --noEmit` + `npm run build` 통과를 게이트로 삼는다(이 지도 UI는 자동 테스트 하네스가 없어 빌드+수동확인이 검증 게이트). 복구 시점: 태그 `pre-remote-redesign-20260602`.

**Goal:** 차량관리(`/campus/vehicles`)를 지도 중심 + 플로팅 "리모컨" 하나로 모든 세션·기능을 한 화면에서 다루도록 재설계.

**Architecture:** 위험 최소화를 위해 기존 `RouteMapView.tsx`의 지도 엔진·핸들러·상태를 **재사용**한다. 우측 도킹 패널을 플로팅 리모컨으로 전환하고, 데이터 많은 학생설정만 새 큰모달 컴포넌트로 분리한다. 전면 파일 분해(MapCanvas 등)는 위험 대비 효용이 낮아 **마지막 선택 단계로 연기**(작동 우선).

**Tech Stack:** Next.js(App Router, 커스텀), React, Tailwind, Kakao Maps SDK, Supabase. 배포 Vercel CLI(`vercel --prod`).

**설계 문서:** `docs/superpowers/specs/2026-06-02-vehicle-remote-redesign-design.md`

---

## 파일 구조

- 수정: `app/(campus)/campus/vehicles/RouteMapView.tsx` — 우측 패널 → 플로팅 컨테이너, 모드 통합, 학생 모달 연결
- 생성: `app/(campus)/campus/vehicles/VehicleRemote.tsx` — 플로팅 리모컨(상태화면·모드5·선택부·접기/드래그/위치기억). 순수 표시 + 콜백
- 생성: `app/(campus)/campus/vehicles/StudentEditModal.tsx` — 학생 큰모달(검색 + 호차별 그리드 드래그 이동·편집)
- 수정: `app/(campus)/campus/vehicles/page.tsx` — 상단 3탭(시스템/모바일/학생설정) 정리(최종 단계)

---

## Phase 1 — 우측 패널을 플로팅 리모컨 컨테이너로 전환

목표: 지도 full-bleed + 우측 패널이 지도 위에 떠서 끌어 옮기기·접기·위치 기억. 내부 내용/로직은 그대로(스타일·컨테이너만). 가장 큰 위험 없이 "리모컨" 골격 확보.

**Files:** Modify `RouteMapView.tsx` (사이드바 래퍼 ~3258, 루트 컨테이너)

- [ ] **Step 1.1** 루트 레이아웃을 지도 full-bleed + 오버레이로 변경. 현재 `flex`로 지도+사이드바 나란히인 구조에서, 사이드바를 `position:absolute`(우측, 드래그 가능)로 띄움. 지도가 가로 전체를 쓰도록.
- [ ] **Step 1.2** 사이드바 래퍼에 드래그 이동(헤더 잡고) + 위치 `localStorage`(`veh-remote-pos-<campusId>`) 저장/복원 추가. 접힘 상태도 저장.
- [ ] **Step 1.3** 리모컨 톤 적용: 다크 카드(#0B1220), 둥근 모서리, 그림자. 폭은 모드별 기존 값 유지(설정 468 등) 단 화면 넘치면 max로 제한.
- [ ] **Step 1.4** 빌드 게이트: `npx tsc --noEmit` + `npm run build` 통과. 수동: 패널이 지도 위에 뜨고 드래그/접기/새로고침 위치유지.
- [ ] **Step 1.5** Commit: `feat(vehicles): float the control panel over the map (remote shell)`

## Phase 2 — 학생 큰모달 + 검색 (StudentEditModal)

목표: 데이터 많은 학생설정을 큰모달로. 검색(이름/영문) + 호차별 학생 그리드 + 드래그 이동 + 카드 탭 편집. 변경은 영구(`update_enrollment_schedule`)·개설반 동기화. 기존 `master`(학생설정) 핸들러 로직 재사용.

**Files:** Create `StudentEditModal.tsx`; Modify `RouteMapView.tsx`(또는 page) 상태 연결

- [ ] **Step 2.1** `StudentEditModal.tsx` 생성: props = `{ open, sessionName, dir, sessions, buses, groups, onClose, onMutate }`. 본문: 상단 검색 input + 세션/방향 칩 + 호차별 컬럼(학생 카드). 카드 드래그 onDrop → `move`(호차 이동) 액션. 카드 탭 → 시간·요일·정류장 편집 인라인.
- [ ] **Step 2.2** 학생 데이터·편집 액션은 기존 `/api/campus/vehicles`(`update_enrollment_schedule`,`add_rider`,`remove_rider`) 재사용. 검색은 클라 필터(이름/영문 includes) + 매칭 카드 하이라이트.
- [ ] **Step 2.3** RouteMapView에 모달 상태(`studentModalOpen`) + 열기 트리거(임시 버튼). onMutate 시 `loadData`/`refreshBothDirGroups` 재호출로 지도·목록 갱신.
- [ ] **Step 2.4** 빌드 게이트 통과. 수동: 검색·드래그 이동·편집이 반영되고 개설반 현황에도 보임.
- [ ] **Step 2.5** Commit: `feat(vehicles): student edit modal with search and per-bus drag`

## Phase 3 — 모드 통합 (리모컨 5버튼) + 상단탭 정리

목표: 리모컨 모드 = 노선/오늘/학생/변경/설정. 기존 sidebarPage(1 노선/2 오늘/3 변경/4 탑승장소/5 호차)를 리모컨 모드에 매핑하고 "학생" 모드 추가(StudentEditModal). 상단 3탭(page.tsx 시스템/모바일/학생설정)을 제거하고 지도+리모컨 단일 화면으로.

**Files:** Modify `RouteMapView.tsx`, `page.tsx`

- [ ] **Step 3.1** 리모컨 모드 버튼 5개로 정리: 노선·오늘·학생·변경·설정. "설정"은 탑승장소/호차 2하위탭(현 Page4/5). "학생"은 StudentEditModal 오픈.
- [ ] **Step 3.2** 공용 선택부(등하원·세션·호차·전체)를 노선/오늘/학생에서 공유, 변경/설정에서는 숨김.
- [ ] **Step 3.3** page.tsx: 차량관리는 지도+리모컨 단일 화면으로(모바일/학생설정 탭 제거). 모바일(오늘) 기능은 리모컨 "오늘" 모드로 대체. (권한상 vehiclesRestricted는 "오늘" 모드 기본 진입 유지)
- [ ] **Step 3.4** 빌드 게이트 통과. 수동: 5개 모드 전환, 학생모달, 설정 2탭, 오늘/변경 동작.
- [ ] **Step 3.5** Commit: `feat(vehicles): unify tabs into remote 5 modes; drop top tabs`

## Phase 4 — 노선 모드 호차 명단 시트(좁게) (RosterSheet)

목표: 노선 모드에서 호차 탭 시 그 호차 명단을 좁은 시트로 지도 옆에. "크게 편집"→StudentEditModal.

**Files:** Create `RosterSheet.tsx`(또는 RouteMapView 내 경량 패널); Modify `RouteMapView.tsx`

- [ ] **Step 4.1** 호차 탭(리모컨/지도 마커) → `rosterSheet={bus}` 상태. 좁은 시트에 해당 호차 시간순 명단 + 빠른 [이동][삭제][탑승자추가]. "크게 편집" 버튼 → StudentEditModal.
- [ ] **Step 4.2** 빌드 게이트 통과. 수동: 호차 탭→시트, 지도 유지, 크게편집 연결.
- [ ] **Step 4.3** Commit: `feat(vehicles): per-bus roster sheet in route mode`

## Phase 5 — 정리 / (선택) 파일 분해

목표: 죽은 코드 제거(미사용 renderHeroEta 등), 필요 시 큰 블록을 컴포넌트로 분리(MapCanvas/SettingsPanel). 위험 대비 효용 보고 판단.

- [ ] **Step 5.1** 미사용 함수/상태 제거(`renderHeroEta` 등 이번 재설계로 안 쓰이는 것).
- [ ] **Step 5.2** (선택) 지도 렌더 effect군을 `MapCanvas.tsx`로, 설정 패널을 `SettingsPanel.tsx`로 추출 — 동작 동일 유지(빌드+수동 확인). 위험하면 생략하고 기록만.
- [ ] **Step 5.3** 빌드 게이트 통과. Commit: `refactor(vehicles): cleanup + optional decomposition`

---

## 배포

- 각 Phase 빌드 통과 후, 사용자 확인 받고 `vercel --prod --yes`로 배포(중간 검증). 문제 시 `git reset --hard pre-remote-redesign-20260602` + 재배포 또는 Vercel 즉시 롤백.

## Self-Review 메모

- 스펙 커버리지: 플로팅(P1)·학생모달+검색(P2)·모드통합/상단탭제거(P3)·명단시트(P4)·정리/분해(P5)·데이터연동(기존 액션 재사용으로 유지). M1·세션=개설반기준은 기존 selectedSession/세션버튼 그대로라 충족.
- 연기 결정: 전면 파일분해는 P5 선택사항으로(작동 우선, 위험 최소화). 스펙의 분해 의도는 유지하되 단계 뒤로.
- 타입 일관성: 기존 상태명(dir/selectedSession/selectedBuses/sidebarPage/bothDir) 재사용, 신규 상태(studentModalOpen/rosterSheet/remote pos) 명시.
