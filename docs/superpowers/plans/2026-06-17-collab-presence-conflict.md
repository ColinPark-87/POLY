# 차량관리 동시편집 Presence + 충돌경고 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 차량관리에서 동시 작업자를 캠퍼스 단위로 표시하고, 저장 시 그 사이 변경된 항목이면 경고 후 [덮어쓰기]/[취소] 선택하게 한다.

**Architecture:** (A안) 하트비트 presence 테이블 + 낙관적 동시성(updated_at 버전검사). 새 실시간 인프라 없음. Next.js API 라우트는 기존 `createClient→getUser→service→profile→권한→campusId` 패턴을 그대로 따른다.

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres), @supabase/supabase-js(service role), vitest. 배포 Vercel CLI. DB 마이그레이션은 Supabase SQL Editor 수동.

스펙: `docs/superpowers/specs/2026-06-17-collab-presence-conflict-design.md`

---

## 파일 구조

- 신규 `app/api/campus/presence/route.ts` — presence GET/POST/DELETE
- 신규 `lib/vehicles/conflict.ts` — 버전검사 순수 헬퍼(`checkVersion`) + 타입
- 신규 `components/campus/PresenceBadge.tsx` — "작업 중" 배지
- 신규 `components/campus/usePresence.ts` — 하트비트+조회 훅
- 신규 `components/campus/ConflictModal.tsx` — 충돌 모달
- 수정 `app/api/campus/stop-coords/route.ts`, `registered-stops/route.ts`, `vehicles/route.ts` — 버전검사 + updated_by 기록
- 수정 `app/(campus)/campus/vehicles/RouteMapView.tsx` — 배지 마운트 + 저장 호출에 baseVersion/충돌처리
- 신규 테스트 `tests/conflict.test.ts`, `tests/presence-filter.test.ts`
- 신규 `docs/migrations/2026-06-17-presence-conflict.sql` — 마이그레이션 정본(사용자 수동 실행)

> **두 단계 마이그레이션이 선행 조건**: 코드 동작 전 Supabase SQL Editor에서 §Task 1, §Task 6 SQL을 먼저 실행. (가이드 E항: 스키마 변경은 코드와 별개 수동.)

---

## Phase 1 — Presence (독립적, 먼저 배포 가능)

### Task 1: presence 테이블 마이그레이션 SQL 작성

**Files:** Create `docs/migrations/2026-06-17-presence-conflict.sql`

- [ ] **Step 1: SQL 파일 생성 (presence 부분)**

```sql
-- == Presence ==
create table if not exists public.campus_presence (
  campus_id  uuid not null,
  user_id    uuid not null,
  user_name  text,
  page       text,
  last_seen  timestamptz not null default now(),
  primary key (campus_id, user_id)
);
create index if not exists campus_presence_campus_idx
  on public.campus_presence (campus_id, last_seen);
```

- [ ] **Step 2: 커밋**

```bash
git add docs/migrations/2026-06-17-presence-conflict.sql
git commit -m "chore: presence/conflict 마이그레이션 SQL(presence)"
```

- [ ] **Step 3: 사용자에게 실행 요청 (구현 중단점)**

> 이 SQL의 presence 블록을 Supabase SQL Editor에서 실행했는지 확인 후 Task 2 진행. (테이블 없으면 라우트가 500)

---

### Task 2: presence API 라우트

**Files:** Create `app/api/campus/presence/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

const PERM_SELECT = 'campus_id, name, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'
function canView(p: any) {
  return resolvePermissions({
    role: p?.role ?? 'employee', position: p?.position ?? null,
    perm_class_roster: p?.perm_class_roster ?? null,
    perm_vehicles: p?.perm_vehicles ?? null,
    perm_vehicles_restricted: p?.perm_vehicles_restricted ?? null,
  }).vehicles
}
async function ctx(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: '인증 필요' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canView(profile)) return { err: NextResponse.json({ error: '권한 없음' }, { status: 403 }) }
  let campusId: string | null | undefined = profile?.campus_id
  const sp = new URL(request.url).searchParams
  if (!campusId && profile?.role === 'hq_admin') campusId = sp.get('campus_id')
  if (!campusId) return { err: NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 }) }
  return { user, service, profile, campusId, sp }
}

const WINDOW_SEC = 30

export async function POST(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  const body = await request.json().catch(() => ({}))
  const { error } = await c.service.from('campus_presence').upsert({
    campus_id: c.campusId, user_id: c.user.id, user_name: c.profile?.name ?? null,
    page: body.page ?? 'vehicles', last_seen: new Date().toISOString(),
  }, { onConflict: 'campus_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  const cutoff = new Date(Date.now() - WINDOW_SEC * 1000).toISOString()
  const { data } = await c.service.from('campus_presence')
    .select('user_id, user_name, last_seen')
    .eq('campus_id', c.campusId).gte('last_seen', cutoff)
  const others = (data ?? []).filter(r => r.user_id !== c.user.id)
    .map(r => ({ user_name: r.user_name, last_seen: r.last_seen }))
  return NextResponse.json({ present: others })
}

export async function DELETE(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  await c.service.from('campus_presence').delete()
    .eq('campus_id', c.campusId).eq('user_id', c.user.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/api/campus/presence/route.ts
git commit -m "feat: 캠퍼스 presence 라우트(하트비트/조회/이탈)"
```

---

### Task 3: presence 필터 단위 테스트

**Files:** Create `tests/presence-filter.test.ts`

라우트의 GET 필터 로직(윈도우 내·본인 제외)을 순수함수로 추출해 테스트한다. 먼저 `lib/vehicles/presence.ts`에 순수함수를 만든다.

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { filterPresent } from '@/lib/vehicles/presence'

describe('filterPresent', () => {
  const now = Date.parse('2026-06-17T10:00:00Z')
  const iso = (sBack: number) => new Date(now - sBack * 1000).toISOString()
  it('30초 윈도우 내, 본인 제외', () => {
    const rows = [
      { user_id: 'me', user_name: 'Me', last_seen: iso(5) },
      { user_id: 'a', user_name: 'Alice', last_seen: iso(10) },
      { user_id: 'b', user_name: 'Bob', last_seen: iso(40) }, // 윈도우 밖
    ]
    const out = filterPresent(rows, 'me', now, 30)
    expect(out.map(r => r.user_name)).toEqual(['Alice'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/presence-filter.test.ts`
Expected: FAIL (filterPresent not found)

- [ ] **Step 3: 순수함수 구현**

Create `lib/vehicles/presence.ts`:
```ts
export interface PresenceRow { user_id: string; user_name: string | null; last_seen: string }
export function filterPresent(rows: PresenceRow[], selfId: string, nowMs: number, windowSec: number) {
  const cutoff = nowMs - windowSec * 1000
  return rows.filter(r => r.user_id !== selfId && Date.parse(r.last_seen) >= cutoff)
    .map(r => ({ user_name: r.user_name, last_seen: r.last_seen }))
}
```

- [ ] **Step 4: 라우트 GET이 이 함수를 쓰도록 리팩터**

`app/api/campus/presence/route.ts` GET 내부 필터를 교체:
```ts
import { filterPresent } from '@/lib/vehicles/presence'
// ...
const { data } = await c.service.from('campus_presence')
  .select('user_id, user_name, last_seen').eq('campus_id', c.campusId)
const present = filterPresent(data ?? [], c.user.id, Date.now(), WINDOW_SEC)
return NextResponse.json({ present })
```

- [ ] **Step 5: 통과 확인 + 타입체크**

Run: `npx vitest run tests/presence-filter.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors

- [ ] **Step 6: 커밋**

```bash
git add lib/vehicles/presence.ts tests/presence-filter.test.ts app/api/campus/presence/route.ts
git commit -m "feat: presence 필터 순수함수 + 테스트"
```

---

### Task 4: usePresence 훅 + PresenceBadge

**Files:** Create `components/campus/usePresence.ts`, `components/campus/PresenceBadge.tsx`

- [ ] **Step 1: 훅 작성**

```ts
'use client'
import { useEffect, useState, useRef } from 'react'

interface Present { user_name: string | null; last_seen: string }
const HEARTBEAT_MS = 15000

export function usePresence(campusId?: string) {
  const [present, setPresent] = useState<Present[]>([])
  const cq = campusId ? `?campus_id=${campusId}` : ''
  const beat = useRef(() => {})
  beat.current = () => {
    fetch(`/api/campus/presence${cq}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'vehicles' }) }).catch(() => {})
    fetch(`/api/campus/presence${cq}`).then(r => r.ok ? r.json() : { present: [] }).then(d => setPresent(d.present ?? [])).catch(() => {})
  }
  useEffect(() => {
    beat.current()
    const id = setInterval(() => { if (document.visibilityState === 'visible') beat.current() }, HEARTBEAT_MS)
    const onFocus = () => beat.current()
    window.addEventListener('focus', onFocus)
    const leave = () => { navigator.sendBeacon?.(`/api/campus/presence${cq}`) || fetch(`/api/campus/presence${cq}`, { method: 'DELETE' }).catch(() => {}) }
    window.addEventListener('beforeunload', leave)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); window.removeEventListener('beforeunload', leave); fetch(`/api/campus/presence${cq}`, { method: 'DELETE' }).catch(() => {}) }
  }, [campusId]) // eslint-disable-line react-hooks/exhaustive-deps
  return present
}
```
> 주: `sendBeacon`은 DELETE를 지원하지 않으므로 이탈은 fetch DELETE만 사용. 위 `leave`는 단순화 — 구현 시 `fetch(...,{method:'DELETE',keepalive:true})`로 작성.

- [ ] **Step 2: 배지 작성**

```tsx
'use client'
import { usePresence } from './usePresence'
function rel(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  return s < 20 ? '방금' : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`
}
export function PresenceBadge({ campusId }: { campusId?: string }) {
  const present = usePresence(campusId)
  if (!present.length) return null
  const first = present[0]
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold">
      <span>👤</span>
      <span>{first.user_name ?? '다른 사용자'}님 작업 중 · {rel(first.last_seen)}{present.length > 1 ? ` 외 ${present.length - 1}명` : ''}</span>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
```bash
git add components/campus/usePresence.ts components/campus/PresenceBadge.tsx
git commit -m "feat: presence 훅 + 작업중 배지"
```

---

### Task 5: 차량관리 화면에 배지 마운트

**Files:** Modify `app/(campus)/campus/vehicles/RouteMapView.tsx` (상단 헤더 영역)

- [ ] **Step 1: import 추가** (파일 상단 import 블록)

```tsx
import { PresenceBadge } from '@/components/campus/PresenceBadge'
```

- [ ] **Step 2: 렌더 상단에 배지 삽입**

RouteMapView 최상위 반환 JSX의 헤더/툴바 영역(지도 위 컨트롤 근처)에 추가:
```tsx
<PresenceBadge campusId={campusId} />
```
> 정확한 위치: 기존 상단 컨트롤 컨테이너 안. 적당한 헤더 div를 찾아 첫 자식으로.

- [ ] **Step 3: dev 렌더 확인 + 커밋**

Run: `npm run build` (빌드 통과 확인)
```bash
git add "app/(campus)/campus/vehicles/RouteMapView.tsx"
git commit -m "feat: 차량관리 상단에 presence 배지"
```

> **Phase 1 배포 가능 지점**: presence만 먼저 `vercel --prod` 배포해 검증 가능(충돌 기능과 독립).

---

## Phase 2 — 충돌 감지 기반

### Task 6: updated_at/updated_by 마이그레이션 SQL

**Files:** Modify `docs/migrations/2026-06-17-presence-conflict.sql` (append)

- [ ] **Step 1: SQL append**

```sql
-- == Conflict (optimistic concurrency) ==
alter table public.campus_stop_coords     add column if not exists updated_by text;
alter table public.class_enrollments       add column if not exists updated_at timestamptz not null default now();
alter table public.class_enrollments       add column if not exists updated_by text;
alter table public.campus_buses            add column if not exists updated_at timestamptz not null default now();
alter table public.campus_buses            add column if not exists updated_by text;
alter table public.campus_registered_stops add column if not exists updated_at timestamptz not null default now();
alter table public.campus_registered_stops add column if not exists updated_by text;

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['class_enrollments','campus_buses','campus_registered_stops','campus_stop_coords']
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format('create trigger trg_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
```

- [ ] **Step 2: 커밋 + 사용자 실행 요청 (중단점)**

```bash
git add docs/migrations/2026-06-17-presence-conflict.sql
git commit -m "chore: 충돌검사용 updated_at/updated_by 마이그레이션"
```
> 사용자가 Supabase SQL Editor에서 이 블록 실행 확인 후 Task 7 진행.

---

### Task 7: 버전검사 헬퍼 + 테스트

**Files:** Create `lib/vehicles/conflict.ts`, `tests/conflict.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { isStale } from '@/lib/vehicles/conflict'

describe('isStale', () => {
  it('현재가 baseVersion보다 최신이면 stale', () => {
    expect(isStale('2026-06-17T10:00:01Z', '2026-06-17T10:00:00Z')).toBe(true)
  })
  it('동일/이전이면 not stale', () => {
    expect(isStale('2026-06-17T10:00:00Z', '2026-06-17T10:00:00Z')).toBe(false)
    expect(isStale('2026-06-17T09:59:59Z', '2026-06-17T10:00:00Z')).toBe(false)
  })
  it('baseVersion 없으면(최초/force) not stale', () => {
    expect(isStale('2026-06-17T10:00:00Z', null)).toBe(false)
    expect(isStale('2026-06-17T10:00:00Z', undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/conflict.test.ts`
Expected: FAIL (isStale not found)

- [ ] **Step 3: 헬퍼 구현**

```ts
// lib/vehicles/conflict.ts
export interface ConflictInfo { error: 'conflict'; updated_by: string | null; updated_at: string }

/** 현재 DB updated_at이 클라가 들고 있던 baseVersion보다 최신이면 true(=그 사이 변경됨). */
export function isStale(current: string | null | undefined, baseVersion: string | null | undefined): boolean {
  if (!baseVersion || !current) return false
  return Date.parse(current) > Date.parse(baseVersion)
}

/** 라우트 핸들러용: 현재행 updated_at/by와 baseVersion으로 409 응답 본문을 만들거나 null. */
export function conflictBody(row: { updated_at?: string | null; updated_by?: string | null } | null, baseVersion: string | null | undefined): ConflictInfo | null {
  if (!row?.updated_at) return null
  if (!isStale(row.updated_at, baseVersion)) return null
  return { error: 'conflict', updated_by: row.updated_by ?? null, updated_at: row.updated_at }
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npx vitest run tests/conflict.test.ts && npx tsc --noEmit`
```bash
git add lib/vehicles/conflict.ts tests/conflict.test.ts
git commit -m "feat: 낙관적 동시성 버전검사 헬퍼 + 테스트"
```

---

## Phase 3 — 엔드포인트별 충돌 통합 + 클라 모달

> 공통 규약: 클라가 저장 요청 본문/쿼리에 `baseVersion`(편집 시작 시 읽은 updated_at)을 동봉. `force:true`면 검사 생략. 서버가 stale이면 `409 { error:'conflict', updated_by, updated_at }`. 성공 시 `updated_by = profile.name` set(트리거가 updated_at 갱신).

### Task 8: stop-coords 단건 충돌검사 (대표 구현)

**Files:** Modify `app/api/campus/stop-coords/route.ts` PATCH (정류장명/좌표 변경)

PATCH는 단일 정류장 단위라 충돌검사 적합. POST(전체 upsert)는 1차 제외(전량 동기화 성격).

- [ ] **Step 1: PATCH에 baseVersion 검사 추가**

`PATCH` 본문 구조분해를 `const { oldName, newName, lat, lng, baseVersion, force } = await request.json()`로 바꾸고, PERM_SELECT에 `name` 추가, 좌표 변경 직전 검사 삽입:
```ts
import { conflictBody } from '@/lib/vehicles/conflict'
// PERM_SELECT = '... , name'
// oldName 행 조회 후 검사:
if (!force) {
  const { data: cur } = await service.from('campus_stop_coords')
    .select('updated_at, updated_by').eq('campus_id', campusId).eq('stop_name', oldName).maybeSingle()
  const cf = conflictBody(cur, baseVersion)
  if (cf) return NextResponse.json(cf, { status: 409 })
}
// 새 이름 upsert 시 updated_by 기록
await service.from('campus_stop_coords').upsert(
  { campus_id: campusId, stop_name: newName, lat, lng, updated_at: new Date().toISOString(), updated_by: profile?.name ?? null },
  { onConflict: 'campus_id,stop_name' })
```

- [ ] **Step 2: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
```bash
git add app/api/campus/stop-coords/route.ts
git commit -m "feat: 정류장 PATCH 충돌검사(409)"
```

---

### Task 9: registered-stops 충돌검사

**Files:** Modify `app/api/campus/registered-stops/route.ts`

- [ ] **Step 1: 라우트 현황 확인**

Run: `sed -n '1,60p' app/api/campus/registered-stops/route.ts` 로 POST/DELETE 시그니처 파악(추가/삭제 단위).

- [ ] **Step 2: 추가/삭제 핸들러에 updated_by 기록 + (수정형이면) baseVersion 검사**

빈 정류장은 추가/삭제 위주(부분수정 적음)라 **updated_by 기록만** 하고, 동일 (stop_name,bus,direction) 중복추가 시 기존 행 updated_at 반환. 삭제는 검사 불필요. 구체 코드는 Task 8 패턴(conflictBody) 동일 적용.

- [ ] **Step 3: 타입체크 + 커밋**

```bash
git add app/api/campus/registered-stops/route.ts
git commit -m "feat: 빈 정류장 updated_by 기록"
```

---

### Task 10: campus_buses(호차 마스터) 충돌검사

**Files:** Modify `app/api/campus/vehicles/route.ts` (호차 driver/safety/capacity 수정 action)

- [ ] **Step 1: 호차 수정 action 식별**

Run: `grep -n "campus_buses" app/api/campus/vehicles/route.ts` 로 update 지점 확인.

- [ ] **Step 2: update 직전 baseVersion 검사 + updated_by**

```ts
import { conflictBody } from '@/lib/vehicles/conflict'
// 호차 update action 내부:
if (!force) {
  const { data: cur } = await service.from('campus_buses').select('updated_at, updated_by').eq('id', busId).maybeSingle()
  const cf = conflictBody(cur, baseVersion); if (cf) return NextResponse.json(cf, { status: 409 })
}
await service.from('campus_buses').update({ /* fields */, updated_by: profile?.name ?? null }).eq('id', busId)
```
> POST 핸들러 profile select에 `name` 추가 필요(현재 미포함).

- [ ] **Step 3: 타입체크 + 커밋**

```bash
git add app/api/campus/vehicles/route.ts
git commit -m "feat: 호차 마스터 충돌검사(409)"
```

---

### Task 11: class_enrollments 스케줄 충돌검사

**Files:** Modify `app/api/campus/vehicles/route.ts` (`add_rider` 및 기타 enrollment update action)

스케줄은 merge(read-modify-write)라 enrollment 단위 updated_at 검사. action 본문에 `baseVersion`(해당 enrollment의 updated_at) 동봉.

- [ ] **Step 1: enrollment update 전 검사 헬퍼 호출**

`class_enrollments`를 update하는 각 action(add_rider, remove/이동 등)에서, 대상 enrollment를 update하기 직전:
```ts
if (!force) {
  const { data: cur } = await service.from('class_enrollments').select('updated_at, updated_by').eq('id', enr.id).maybeSingle()
  const cf = conflictBody(cur, baseVersion); if (cf) return NextResponse.json(cf, { status: 409 })
}
await service.from('class_enrollments').update({ [schedKey]: finalSched, updated_by: profile?.name ?? null }).eq('id', enr.id)
```
> add_rider는 현재 `.eq('student_id').eq('class_id')`로 update — `enr.id` 기준으로 바꿔 단건 보장.

- [ ] **Step 2: 타입체크 + 빌드 + 커밋**

Run: `npx tsc --noEmit && npm run build`
```bash
git add app/api/campus/vehicles/route.ts
git commit -m "feat: 스케줄 enrollment 충돌검사(409)"
```

---

### Task 12: 클라 충돌 모달 + 저장 경로 연결

**Files:** Create `components/campus/ConflictModal.tsx`; Modify `app/(campus)/campus/vehicles/RouteMapView.tsx`

- [ ] **Step 1: 모달 컴포넌트**

```tsx
'use client'
export interface Conflict { updated_by: string | null; updated_at: string; onOverwrite: () => void; onReload: () => void }
function rel(iso: string){const s=Math.max(0,Math.floor((Date.now()-Date.parse(iso))/1000));return s<60?`${s}초 전`:`${Math.floor(s/60)}분 전`}
export function ConflictModal({ c, onClose }: { c: Conflict | null; onClose: () => void }) {
  if (!c) return null
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold text-[#0F172A] mb-2">⚠️ 다른 변경 감지</h3>
        <p className="text-sm text-[#475569] mb-4">방금 <b>{c.updated_by ?? '다른 사용자'}</b>님이 이 항목을 바꿨어요({rel(c.updated_at)}). 어떻게 할까요?</p>
        <div className="flex gap-2">
          <button onClick={()=>{c.onReload();onClose()}} className="flex-1 py-2 rounded-xl border border-[#E2E8F0] text-[#475569] text-sm font-semibold">취소·최신본 불러오기</button>
          <button onClick={()=>{c.onOverwrite();onClose()}} className="flex-1 py-2 rounded-xl bg-[#DC2626] text-white text-sm font-semibold">내 변경으로 덮어쓰기</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 저장 래퍼 — 409 처리**

RouteMapView에 `conflict` state와 저장 헬퍼 추가. 기존 저장 fetch들을 이 헬퍼 경유로:
```tsx
const [conflict, setConflict] = useState<Conflict | null>(null)
async function saveWithConflict(url: string, init: RequestInit, baseVersion: string | null, onReload: () => void) {
  const withBV = (force: boolean) => fetch(url, { ...init, body: JSON.stringify({ ...(JSON.parse(String(init.body ?? '{}'))), baseVersion, force }) })
  let res = await withBV(false)
  if (res.status === 409) {
    const c = await res.json()
    return new Promise<Response>((resolve) => {
      setConflict({ updated_by: c.updated_by, updated_at: c.updated_at,
        onOverwrite: async () => resolve(await withBV(true)),
        onReload: () => { onReload(); resolve(res) } })
    })
  }
  return res
}
```
> 각 편집 진입 시 그 항목의 updated_at을 캡처해 `baseVersion`으로 전달(스케줄=enrollment.updated_at, 좌표=stop의 updated_at). 데이터 로드 응답에 updated_at 포함되도록 해당 GET select에 `updated_at` 추가.

- [ ] **Step 3: 모달 렌더 + 빌드 + 커밋**

JSX 하단에 `<ConflictModal c={conflict} onClose={()=>setConflict(null)} />` 추가.
Run: `npm run build`
```bash
git add components/campus/ConflictModal.tsx "app/(campus)/campus/vehicles/RouteMapView.tsx"
git commit -m "feat: 충돌 모달 + 저장 경로 409 처리"
```

---

### Task 13: 수동 통합 검증 + 배포

- [ ] **Step 1: 전체 테스트/빌드**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0, 전체 테스트 PASS, build 통과.

- [ ] **Step 2: 두 브라우저 수동 검증**

같은 캠퍼스 동시 접속 → 배지 표시 / 같은 정류장·스케줄 동시수정 → 늦은 저장에 모달 → 덮어쓰기·취소 각각 동작 확인.

- [ ] **Step 3: 배포 + 기록**

Run: `vercel --prod`
RESTORE.md(commit/deployment id)·last_session 갱신. 마이그레이션 적용 완료 재확인.

---

## 미해결/추후 (스펙 §8)
- pickup_overrides 충돌검사(동일 패턴 확장).
- presence 타 화면 확장(page 컬럼 대비됨).
- 실시간성 필요 시 B안(Realtime)으로 교체.
