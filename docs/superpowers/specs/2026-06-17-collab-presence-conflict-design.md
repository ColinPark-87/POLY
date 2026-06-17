# 차량관리 동시편집 — Presence 표시 + 충돌 경고 설계

작성 2026-06-17 / 대상 앱: leave-system (https://poly-system.vercel.app) / 담당: Colin
스택: Next.js 16 (App Router) + Supabase(Postgres) + Vercel CLI 배포

---

## 1. 목적 / 비목적

**목적**
- 여러 명이 같은 캠퍼스 차량관리를 동시에 볼 때, **"누가 작업 중"인지 화면에 표시**(인지).
- 내가 저장하는 순간 **그 항목을 방금 다른 사람이 바꿨으면 경고**하고, 덮어쓸지/취소할지 **사용자가 선택**.

**비목적 (YAGNI)**
- 실시간 즉시 반영(Supabase Realtime) — 인지 목적엔 과함. 하트비트 방식 채택.
- 항목 단위 presence(어느 호차/정류장 보는지) — 캠퍼스 단위로 충분.
- 자동 잠금(lock) / 자동 차단 — 사용자 선택권 유지.
- 차량관리 외 화면(개설반·연차 등) — 1차 범위 밖(테이블 설계는 확장 대비만).

## 2. 핵심 결정 요약 (사용자 확정)
- Presence 단위 = **캠퍼스**.
- 충돌 처리 = **경고 후 선택**([덮어쓰기]/[취소·새로고침]).
- 방식 = **A안: 하트비트 presence + 낙관적 동시성(optimistic concurrency)**.
- 주기·배지 위치 등 세부는 구현자 재량(기본값 아래).

---

## 3. Presence (캠퍼스 단위 "작업 중" 표시)

### 3.1 데이터 모델 — 신규 테이블 `campus_presence`
```sql
create table public.campus_presence (
  campus_id  uuid not null,
  user_id    uuid not null,
  user_name  text,
  page       text,                              -- 'vehicles' (확장 대비)
  last_seen  timestamptz not null default now(),
  primary key (campus_id, user_id)
);
create index campus_presence_campus_idx on public.campus_presence (campus_id, last_seen);
```
- 행 1개 = "이 user가 이 campus의 page에 살아있음". `(campus_id, user_id)` upsert로 중복 없음(같은 사람 여러 탭이어도 1행).

### 3.2 API — `app/api/campus/presence/route.ts` (신규)
- `POST` (하트비트): 본문 `{ page }`. 서버가 로그인 user/profile로 `campus_id`(hq_admin은 `?campus_id`), `user_name=profile.name` 결정 → upsert `last_seen=now()`. 권한: 차량 접근권(`perm_vehicles`/원장 등) 보유자.
- `GET ?campus_id=X`: `last_seen >= now()-30s` 이고 **본인 제외**한 행 반환 → `[{user_name, last_seen}]`.
- `DELETE ?campus_id=X`: 본인 행 삭제(화면 이탈 시).

### 3.3 클라이언트 (RouteMapView 또는 차량 페이지 래퍼)
- 차량관리 화면 마운트~언마운트 동안 **하트비트 15초 간격** `POST`.
- **표시 갱신**: 하트비트 틱마다 + 탭 포커스(visibilitychange/focus, 기존 패턴 재사용) 시 `GET` → 배지 갱신.
- **배지**: 차량관리 상단(헤더 근처)에 "👤 Colin님 작업 중 · 방금 전" 칩. 복수면 "외 N명".
- 이탈: 언마운트/`beforeunload`에서 `DELETE`(best-effort; 실패해도 30초 윈도우로 자연 소멸).
- 본인 제외, last_seen 상대시간 표시("방금/N분 전").

### 3.4 기본값(구현자 재량, 변경 가능)
- 하트비트 주기 15s, 생존 윈도우 30s. 네트워크 절약 위해 탭이 백그라운드면 하트비트 일시중지.

---

## 4. 충돌 경고 (낙관적 동시성)

### 4.1 DB 마이그레이션 (Supabase SQL Editor 수동 — 1회)
편집 대상 테이블에 버전(시각)+수정자 추가. `campus_stop_coords`는 `updated_at` 기존 보유 → `updated_by`만.
```sql
-- updated_by 공통 추가
alter table public.campus_stop_coords       add column if not exists updated_by text;
alter table public.class_enrollments         add column if not exists updated_at timestamptz not null default now(),
                                              add column if not exists updated_by text;
alter table public.campus_buses              add column if not exists updated_at timestamptz not null default now(),
                                              add column if not exists updated_by text;
alter table public.campus_registered_stops   add column if not exists updated_at timestamptz not null default now(),
                                              add column if not exists updated_by text;

-- UPDATE 시 updated_at 자동 갱신 트리거 (updated_by는 앱이 명시)
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

-- 각 테이블에 트리거 (예시 1개; 4개 테이블 동일 패턴)
drop trigger if exists trg_touch_updated_at on public.class_enrollments;
create trigger trg_touch_updated_at before update on public.class_enrollments
  for each row execute function public.touch_updated_at();
```
> 트리거는 UPDATE 시 `updated_at`을 항상 now()로. `updated_by`는 서버 핸들러가 `profile.name`으로 set.
> ⚠️ 마이그레이션은 코드 배포와 별개로 **먼저** 적용해야 함(가이드 E항).

### 4.2 흐름 (낙관적 동시성)
1. 클라가 편집 대상 레코드를 로드할 때 그 레코드의 `updated_at`을 **baseVersion**으로 보관.
2. 저장 요청에 `baseVersion`(+레코드 식별자) 동봉.
3. 서버:
   - 현재 DB의 `updated_at` 조회.
   - `현재 > baseVersion` (그 사이 변경됨) → **409** `{ error:'conflict', updated_by, updated_at }` 반환, **쓰기 안 함**.
   - 아니면 진행 + `updated_by = profile.name`, (트리거가 `updated_at=now()`).
   - `force:true`가 오면 버전검사 생략(덮어쓰기).
4. 클라 409 처리: 모달 **"방금 {updated_by}님이 {상대시간} 이 항목을 바꿨어요"** → **[내 변경으로 덮어쓰기]**(동일 요청 `force:true` 재전송) / **[취소하고 최신본 불러오기]**(해당 데이터 refetch, 편집 폐기).

서버 `now()` 기준 비교 → 클라 시계차 무관. 비교 정밀도는 timestamptz(마이크로초) — 동일 ms 우연충돌 시 force로 해결.

### 4.3 적용 범위 (협업 충돌 위험 높은 차량관리 저장에만)
| 대상 | 테이블 | 식별자 | 엔드포인트(현행) |
|---|---|---|---|
| 학생 등하원 스케줄 | class_enrollments(arr/dep_schedule) | enrollment id | `/api/campus/vehicles` (PATCH/POST) |
| 정류장 좌표 | campus_stop_coords | (campus_id, stop_name) | `/api/campus/stop-coords` |
| 빈 정류장 추가/삭제 | campus_registered_stops | id | `/api/campus/registered-stops` |
| 호차 마스터 | campus_buses | id | `/api/campus/vehicles` (bus 편집) |

- `pickup_overrides`(당일변경)는 위험 낮아 **1차 제외**.
- 좌표 저장은 기존 upsert(전체삭제후재삽입 금지) 패턴 유지 + 버전검사 추가.

---

## 5. 엣지 케이스
- 브라우저 강제종료 → DELETE 누락 → presence 행 잔존: GET이 30초 윈도우로 필터하므로 자동 소멸. (선택: 주 1회 오래된 행 정리 cron 불필요.)
- 같은 사용자 여러 탭: `(campus_id,user_id)` PK라 1행 유지(마지막 하트비트 기준).
- HQ 관리자: presence/충돌 모두 `?campus_id` 폴백으로 동작(권한 그대로).
- 신규 컬럼 NULL `updated_by`(마이그레이션 직후 기존 행): 충돌 메시지에 "(이전 변경)" 폴백 표기.
- force 덮어쓰기 후에도 또 충돌 가능(3명 동시): 재시도 시 다시 경고 → 수렴.

## 6. 테스트
- **단위(vitest)**: ① 버전검사 — baseVersion < 현재 → 409, `force` 시 통과. ② presence GET 필터 — 윈도우 내·본인 제외. ③ 상대시간 포맷.
- **수동(두 브라우저)**: 동일 캠퍼스 동시 접속 → 배지 표시 확인 / 같은 학생 스케줄 동시수정 → 늦은 저장에 경고·덮어쓰기·취소 각각 확인.

## 7. 롤아웃 / 복구
- 순서: ① SQL 마이그레이션(테이블·컬럼·트리거) → ② 코드 배포(`vercel --prod`) → ③ RESTORE.md·last_session 갱신.
- 복구: 코드 롤백 `vercel promote {이전id}`. 신규 테이블/컬럼은 미사용 시 무해(드롭은 선택).
- presence 테이블은 부가 데이터(소실돼도 기능만 영향, 업무데이터 아님).

## 8. 미해결/추후
- pickup_overrides 충돌검사(필요 시 동일 패턴 확장).
- presence를 개설반·학생설정 등 타 화면으로 확장(`page` 컬럼 이미 대비).
- 실시간성이 더 필요해지면 B안(Supabase Realtime Presence)으로 교체 가능(테이블/충돌설계 재사용).
