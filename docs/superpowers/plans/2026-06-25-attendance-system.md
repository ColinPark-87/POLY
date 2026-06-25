# 출석 시스템 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poly-system에 스마트보드 연동 출결 시스템 추가 — 교실별 수업 시작 2분 전 강제 팝업 출결 체크, 상담부/관리자/원장이 자리에서 실시간 전체 반 출결 확인

**Architecture:** `class_sessions.time_range`("9:40~11:00") 파싱으로 시작 2분 전 스마트보드 overlay 강제 표시 → 선생님 출결 완료 → Supabase Realtime → 출결 탭 즉시 반영. 교실별 Supabase auth 계정(`user_metadata.role='smartboard'`)으로 세션 영구 유지, 재부팅 후 자동 로그인. 기본값 전원 출석, 결석·지각만 표기. 상담부 사전 결석 등록 → 스마트보드 overlay에 미리 반영.

**Tech Stack:** Next.js 16.2.4, React 19, Supabase (PostgreSQL + Realtime + SSR), TypeScript, Chart.js 4 (기존 설치), date-fns 4 (기존 설치)

> ⚠️ **Next.js 16 주의**: AGENTS.md 지시대로 `node_modules/next/dist/docs/` 확인. Route Handler, Server Component API가 훈련 데이터와 다를 수 있음 — 기존 파일 패턴을 최우선 참조.

---

## 파일 맵

```
신규:
  supabase/migrations/012_attendance.sql
  lib/attendance.ts
  hooks/useAttendanceTimer.ts
  components/attendance/AttendanceOverlay.tsx
  components/attendance/StudentStatusToggle.tsx
  components/attendance/SessionCard.tsx
  components/attendance/PreAbsenceModal.tsx
  app/smartboard/layout.tsx
  app/smartboard/page.tsx
  app/(campus)/campus/attendance/page.tsx
  app/api/campus/attendance/route.ts
  app/api/campus/attendance/records/route.ts
  app/api/campus/attendance/pre-absence/route.ts
  app/api/campus/attendance/time/route.ts
  app/api/smartboard/attendance/route.ts
  docs/SMARTBOARD_SETUP.md

수정:
  lib/permissions.ts                    ← attendance 권한 추가
  app/(campus)/layout.tsx               ← smartboard 리다이렉트 + permAttendance
  components/CampusSidebar.tsx          ← 출결 탭 + needsAttendance 플래그
```

---

## Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/012_attendance.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- supabase/migrations/012_attendance.sql

-- 반+날짜 단위 출석 세션
CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by TEXT CHECK (completed_by IN ('teacher', 'counselor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, session_date)
);

-- 학생별 출결 기록
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES campus_students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')) DEFAULT 'present',
  pre_marked BOOLEAN NOT NULL DEFAULT false,
  recorded_by TEXT CHECK (recorded_by IN ('teacher', 'counselor')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
);

-- 교실 PC 등록
CREATE TABLE smartboard_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id)
);

-- RLS
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartboard_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_attendance_sessions" ON attendance_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_attendance_records" ON attendance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_smartboard_devices" ON smartboard_devices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
```

- [ ] **Step 2: Supabase 대시보드 SQL Editor에 붙여넣고 실행**

Expected: 테이블 3개 생성, "Success" 메시지. Table Editor에서 `attendance_sessions`, `attendance_records`, `smartboard_devices` 확인.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_attendance.sql
git commit -m "feat: add attendance system DB schema (3 tables + RLS + Realtime)"
```

---

## Task 2: lib/attendance.ts — 타입 + 유틸

**Files:**
- Create: `lib/attendance.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/attendance.ts

export type AttendanceStatus = 'present' | 'absent' | 'late'
export type CompletedBy = 'teacher' | 'counselor'
export type UiSessionStatus = '미도래' | '대기중' | '완료'

export interface AttendanceSession {
  id: string
  class_id: string
  campus_id: string
  session_date: string
  completed_at: string | null
  completed_by: CompletedBy | null
  created_at: string
}

export interface AttendanceRecord {
  id: string
  attendance_session_id: string
  student_id: string
  status: AttendanceStatus
  pre_marked: boolean
  recorded_by: 'teacher' | 'counselor' | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface StudentAttendance {
  student_id: string
  student_name: string
  status: AttendanceStatus
  pre_marked: boolean
  note: string | null
}

export interface ClassWithAttendance {
  class_id: string
  campus_id: string               // ← API에서 profile.campus_id 로 채움
  class_level: string
  class_room: string | null
  class_teacher: string | null
  class_color: string
  class_session_id: string
  class_session_name: string
  class_session_time_range: string
  start_time_parsed: string       // "09:40" 형식
  ui_status: UiSessionStatus
  attendance_session: AttendanceSession | null
  students: StudentAttendance[]
  absent_count: number
  late_count: number
}

/**
 * "9:40~11:00"  → "09:40"
 * "3:10~4:30"   → "15:10"  (hour < 9 → PM)
 * "12:00~13:00" → "12:00"  (정오 그대로)
 */
export function parseStartTime(timeRange: string): string {
  const raw = timeRange.split('~')[0].trim()
  const [h, m] = raw.split(':').map(Number)
  const hour24 = h < 9 ? h + 12 : h
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "09:40" → minutes from midnight */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function resolveUiStatus(
  completedAt: string | null,
  startTimeParsed: string,
  nowMinutes: number
): UiSessionStatus {
  if (completedAt) return '완료'
  const diff = toMinutes(startTimeParsed) - nowMinutes
  return diff <= 2 ? '대기중' : '미도래'
}
```

- [ ] **Step 2: TypeScript 체크**

```bash
cd leave-system && npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add lib/attendance.ts
git commit -m "feat: add attendance types and time utilities"
```

---

## Task 3: lib/permissions.ts — attendance 권한 추가

**Files:**
- Modify: `lib/permissions.ts`

- [ ] **Step 1: UserPermissions에 attendance 추가**

`lib/permissions.ts`의 `UserPermissions` 인터페이스:
```typescript
export interface UserPermissions {
  classRoster: boolean
  vehicles: boolean
  vehiclesRestricted: boolean
  analytics: boolean
  enrollEdit: boolean
  attendance: boolean   // ← 추가
}
```

- [ ] **Step 2: getPositionDefaults에 attendance 추가**

`campus_admin` / `hq_admin` / 부원장 분기:
```typescript
return { classRoster: true, vehicles: true, vehiclesRestricted: false, analytics: true, enrollEdit: true, attendance: true }
```

`FULL_ACCESS_POSITIONS` 분기 (상담/KT/관리자/원장):
```typescript
return { classRoster: true, vehicles: true, vehiclesRestricted: false, analytics: false, enrollEdit: pos.includes('상담') || pos.includes('관리자') || pos.includes('원장'), attendance: true }
```

`SAFETY_POSITION` 분기:
```typescript
return { classRoster: false, vehicles: true, vehiclesRestricted: true, analytics: false, enrollEdit: false, attendance: false }
```

기본값 (일반 직원):
```typescript
return { classRoster: false, vehicles: false, vehiclesRestricted: false, analytics: false, enrollEdit: false, attendance: false }
```

- [ ] **Step 3: resolvePermissions에 attendance 추가**

`UserProfile` 인터페이스에 `perm_attendance?: boolean | null` 추가:
```typescript
interface UserProfile {
  role: string
  position: string | null
  perm_class_roster: boolean | null
  perm_vehicles: boolean | null
  perm_vehicles_restricted: boolean | null
  perm_analytics?: boolean | null
  perm_enroll_edit?: boolean | null
  perm_attendance?: boolean | null   // ← 추가
}
```

`resolvePermissions` 반환값:
```typescript
return {
  classRoster: profile.perm_class_roster ?? defaults.classRoster,
  vehicles: profile.perm_vehicles ?? defaults.vehicles,
  vehiclesRestricted: profile.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
  analytics: profile.perm_analytics ?? defaults.analytics,
  enrollEdit: profile.perm_enroll_edit ?? defaults.enrollEdit,
  attendance: profile.perm_attendance ?? defaults.attendance,   // ← 추가
}
```

- [ ] **Step 4: TypeScript 체크**

```bash
npx tsc --noEmit
```

Expected: 오류 없음 (UserPermissions에 attendance 필드 없는 곳에서 오류 나오면 Step 5에서 해결)

- [ ] **Step 5: TypeScript 오류 있으면 해결**

`npx tsc --noEmit 2>&1 | head -40` 으로 오류 확인. `attendance` 필드 없다는 오류 → 해당 위치에 `attendance: false` 또는 적절한 기본값 추가.

- [ ] **Step 6: Commit**

```bash
git add lib/permissions.ts
git commit -m "feat: add attendance permission to permission system"
```

---

## Task 4: app/(campus)/layout.tsx — smartboard 리다이렉트 + permAttendance

**Files:**
- Modify: `app/(campus)/layout.tsx`

- [ ] **Step 1: smartboard 리다이렉트 추가**

`getUser()` 직후, users 테이블 조회 전에 추가:
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')

// smartboard 계정은 전용 라우트로 분기
if (user.user_metadata?.role === 'smartboard') {
  redirect('/smartboard')
}
```

- [ ] **Step 2: users 테이블 select에 perm_attendance 추가**

기존:
```typescript
.select('name, campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics')
```

변경 (두 곳 모두):
```typescript
.select('name, campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics, perm_attendance')
```

- [ ] **Step 3: resolvePermissions 호출에 perm_attendance 추가**

```typescript
const permissions = resolvePermissions({
  role: profile?.role ?? 'campus_admin',
  position: profile?.position ?? null,
  perm_class_roster: profile?.perm_class_roster ?? null,
  perm_vehicles: profile?.perm_vehicles ?? null,
  perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  perm_analytics: profile?.perm_analytics ?? null,
  perm_attendance: profile?.perm_attendance ?? null,   // ← 추가
})
```

- [ ] **Step 4: CampusSidebar에 permAttendance prop 전달**

```typescript
<CampusSidebar
  userName={userName}
  campusName={campusName}
  role={profile?.role ?? 'campus_admin'}
  position={profile?.position ?? ''}
  permClassRoster={permissions.classRoster}
  permVehicles={permissions.vehicles}
  permAnalytics={permissions.analytics}
  permAttendance={permissions.attendance}   // ← 추가
  staffOnly={isCampusStaffOnly(role, position)}
/>
```

- [ ] **Step 5: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/\(campus\)/layout.tsx
git commit -m "feat: add smartboard redirect and attendance permission to campus layout"
```

---

## Task 5: CampusSidebar — 출결 탭 추가

**Files:**
- Modify: `components/CampusSidebar.tsx`

- [ ] **Step 1: NavDef에 needsAttendance 추가**

기존:
```typescript
interface NavDef { href: string; label: string; required?: boolean; employeeOnly?: boolean; staffLeave?: boolean; needsClassRoster?: boolean; needsVehicles?: boolean; needsAnalytics?: boolean }
```

변경:
```typescript
interface NavDef { href: string; label: string; required?: boolean; employeeOnly?: boolean; staffLeave?: boolean; needsClassRoster?: boolean; needsVehicles?: boolean; needsAnalytics?: boolean; needsAttendance?: boolean }
```

- [ ] **Step 2: TOOLS_NAV에 출결 추가**

```typescript
const TOOLS_NAV: NavDef[] = [
  { href: '/campus/class-roster', label: '개설반 현황', needsClassRoster: true },
  { href: '/campus/vehicles', label: '차량 관리', needsVehicles: true },
  { href: '/campus/attendance', label: '출결 관리', needsAttendance: true },   // ← 추가
  { href: '/campus/calendar', label: '캠퍼스 캘린더' },
]
```

- [ ] **Step 3: STAFF_ONLY_ALLOWED에 /campus/attendance 추가**

```typescript
const STAFF_ONLY_ALLOWED = new Set<string>([
  '/campus/class-roster',
  '/campus/vehicles',
  '/campus/attendance',   // ← 추가
])
```

- [ ] **Step 4: 컴포넌트 props에 permAttendance 추가**

```typescript
export default function CampusSidebar({ userName, campusName, role, position, permClassRoster, permVehicles, permAnalytics, permAttendance, staffOnly = false }: {
  userName: string; campusName: string; role: string; position?: string
  permClassRoster: boolean; permVehicles: boolean; permAnalytics: boolean
  permAttendance: boolean   // ← 추가
  staffOnly?: boolean
}) {
```

- [ ] **Step 5: Section 필터에 needsAttendance 조건 추가**

기존 필터 마지막 줄:
```typescript
!(item.needsAnalytics && !permAnalytics)
```

변경:
```typescript
!(item.needsAnalytics && !permAnalytics) &&
!(item.needsAttendance && !permAttendance)
```

- [ ] **Step 6: TypeScript 체크 + 개발서버 확인**

```bash
npx tsc --noEmit
```

브라우저에서 campus_admin 계정으로 `/campus/dashboard` → 사이드바에 "출결 관리" 탭 표시 확인.  
상담부 계정으로 로그인 → "출결 관리" 탭 표시 확인.

- [ ] **Step 7: Commit**

```bash
git add components/CampusSidebar.tsx
git commit -m "feat: add attendance tab to campus sidebar"
```

---

## Task 6: API Routes

**Files:**
- Create: `app/api/campus/attendance/route.ts`
- Create: `app/api/campus/attendance/records/route.ts`
- Create: `app/api/campus/attendance/pre-absence/route.ts`
- Create: `app/api/campus/attendance/time/route.ts`
- Create: `app/api/smartboard/attendance/route.ts`

### 6-A: GET /api/campus/attendance

- [ ] **Step 1: 오늘 세션 현황 API**

```typescript
// app/api/campus/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseStartTime, resolveUiStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users')
    .select('campus_id, role, position')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = req.nextUrl.searchParams
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  // 캠퍼스의 현재 활성 세션에 속한 모든 반 조회
  const { data: classes, error } = await serviceClient
    .from('classes')
    .select(`
      id, level, room, teacher, color,
      class_sessions!inner(id, name, time_range, is_active)
    `)
    .eq('campus_id', profile.campus_id)
    .eq('class_sessions.is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 오늘 출석 세션 + 기록 조회
  const classIds = (classes ?? []).map((c: any) => c.id)
  const { data: sessions } = classIds.length > 0
    ? await serviceClient
        .from('attendance_sessions')
        .select('*, attendance_records(student_id, status, pre_marked, note, campus_students(name))')
        .in('class_id', classIds)
        .eq('session_date', date)
    : { data: [] }

  const sessionMap = new Map((sessions ?? []).map((s: any) => [s.class_id, s]))

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  const result = (classes ?? []).map((c: any) => {
    const session = sessionMap.get(c.id) ?? null
    const records: any[] = session?.attendance_records ?? []
    const startTimeParsed = parseStartTime(c.class_sessions.time_range)

    return {
      class_id: c.id,
      campus_id: profile.campus_id,
      class_level: c.level,
      class_room: c.room,
      class_teacher: c.teacher,
      class_color: c.color ?? '#3b82f6',
      class_session_id: c.class_sessions.id,
      class_session_name: c.class_sessions.name,
      class_session_time_range: c.class_sessions.time_range,
      start_time_parsed: startTimeParsed,
      ui_status: resolveUiStatus(session?.completed_at ?? null, startTimeParsed, nowMinutes),
      attendance_session: session ? {
        id: session.id,
        class_id: session.class_id,
        campus_id: session.campus_id,
        session_date: session.session_date,
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        created_at: session.created_at,
      } : null,
      students: records.map((r: any) => ({
        student_id: r.student_id,
        student_name: r.campus_students?.name ?? '',
        status: r.status,
        pre_marked: r.pre_marked,
        note: r.note,
      })),
      absent_count: records.filter((r: any) => r.status === 'absent').length,
      late_count: records.filter((r: any) => r.status === 'late').length,
    }
  })

  return NextResponse.json(result)
}
```

### 6-B: PUT /api/campus/attendance/records

- [ ] **Step 2: 출결 기록 업서트 API**

```typescript
// app/api/campus/attendance/records/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id, session_date, records, mark_complete } = await req.json() as {
    class_id: string
    session_date: string
    records: { student_id: string; status: AttendanceStatus; pre_marked?: boolean; note?: string }[]
    mark_complete?: boolean
  }

  const serviceClient = createServiceClient()

  // campus_id는 body가 아닌 user profile에서 (보안)
  const { data: profile } = await serviceClient
    .from('users').select('campus_id').eq('id', user.id).maybeSingle()
  const campus_id = profile?.campus_id
  if (!campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 세션 upsert
  const { data: session, error: sessionError } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  // 기록 upsert
  if (records.length > 0) {
    const { error: recError } = await serviceClient
      .from('attendance_records')
      .upsert(
        records.map(r => ({
          attendance_session_id: session.id,
          student_id: r.student_id,
          status: r.status,
          pre_marked: r.pre_marked ?? false,
          recorded_by: 'counselor' as const,
          note: r.note ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'attendance_session_id,student_id' }
      )
    if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })
  }

  // 완료 처리
  if (mark_complete) {
    await serviceClient
      .from('attendance_sessions')
      .update({ completed_at: new Date().toISOString(), completed_by: 'counselor' })
      .eq('id', session.id)
  }

  return NextResponse.json({ ok: true, session_id: session.id })
}
```

### 6-C: POST /api/campus/attendance/pre-absence

- [ ] **Step 3: 사전 결석 API**

```typescript
// app/api/campus/attendance/pre-absence/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id, campus_id, session_date, student_id, status, note } = await req.json() as {
    class_id: string
    campus_id: string
    session_date: string
    student_id: string
    status: 'absent' | 'late'
    note?: string
  }

  const serviceClient = createServiceClient()

  // 세션 없으면 생성 (사전 등록)
  const { data: session, error: sessErr } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  const { error: recErr } = await serviceClient
    .from('attendance_records')
    .upsert(
      {
        attendance_session_id: session.id,
        student_id,
        status,
        pre_marked: true,
        recorded_by: 'counselor',
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'attendance_session_id,student_id' }
    )

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

### 6-D: PATCH /api/campus/attendance/time

- [ ] **Step 4: 세션 시작시간 수정 API**

```typescript
// app/api/campus/attendance/time/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_session_id, time_range } = await req.json() as {
    class_session_id: string
    time_range: string  // "9:40~11:00"
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('class_sessions')
    .update({ time_range })
    .eq('id', class_session_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

### 6-E: POST /api/smartboard/attendance

- [ ] **Step 5: 스마트보드 출결 완료 API**

```typescript
// app/api/smartboard/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AttendanceStatus } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // smartboard 역할만 허용
  if (user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const class_id: string = user.user_metadata.class_id
  const campus_id: string = user.user_metadata.campus_id
  const session_date = new Date().toISOString().split('T')[0]

  const { records } = await req.json() as {
    records: { student_id: string; status: AttendanceStatus }[]
  }

  const serviceClient = createServiceClient()

  // 세션 upsert
  const { data: session, error: sessErr } = await serviceClient
    .from('attendance_sessions')
    .upsert(
      { class_id, campus_id, session_date },
      { onConflict: 'class_id,session_date', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  // 기존 pre_marked 기록 보존하면서 teacher 기록 upsert
  // pre_marked 가 true 인 경우 teacher 덮어쓰기 허용 (교사가 현장 확인 우선)
  const { error: recErr } = await serviceClient
    .from('attendance_records')
    .upsert(
      records.map(r => ({
        attendance_session_id: session.id,
        student_id: r.student_id,
        status: r.status,
        pre_marked: false,
        recorded_by: 'teacher' as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'attendance_session_id,student_id' }
    )

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // 완료 처리
  const { error: completeErr } = await serviceClient
    .from('attendance_sessions')
    .update({ completed_at: new Date().toISOString(), completed_by: 'teacher' })
    .eq('id', session.id)

  if (completeErr) return NextResponse.json({ error: completeErr.message }, { status: 500 })

  // 스마트보드 last_seen 업데이트
  await serviceClient
    .from('smartboard_devices')
    .upsert(
      { class_id, campus_id, last_seen: new Date().toISOString() },
      { onConflict: 'class_id' }
    )

  return NextResponse.json({ ok: true, session_id: session.id })
}
```

- [ ] **Step 6: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/api/campus/attendance/ app/api/smartboard/
git commit -m "feat: add attendance API routes (campus + smartboard)"
```

---

## Task 7: hooks/useAttendanceTimer.ts

**Files:**
- Create: `hooks/useAttendanceTimer.ts`

- [ ] **Step 1: 훅 생성**

```typescript
// hooks/useAttendanceTimer.ts
'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseStartTime, toMinutes } from '@/lib/attendance'

export interface StudentForOverlay {
  student_id: string
  student_name: string
  pre_marked_absent: boolean
}

export function useAttendanceTimer(classId: string, campusId: string) {
  const [showOverlay, setShowOverlay] = useState(false)
  const [students, setStudents] = useState<StudentForOverlay[]>([])
  const triggeredRef = useRef<Set<string>>(new Set())

  const fetchStudents = useCallback(async () => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    // 학생 명단 (class_enrollments → campus_students)
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id, campus_students(name)')
      .eq('class_id', classId)
      .eq('is_waitlist', false)

    // 오늘 사전 결석 기록
    const studentIds = (enrollments ?? []).map((e: any) => e.student_id)
    let preAbsentIds = new Set<string>()
    if (studentIds.length > 0) {
      const { data: session } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', classId)
        .eq('session_date', today)
        .maybeSingle()
      if (session) {
        const { data: records } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('attendance_session_id', session.id)
          .eq('pre_marked', true)
          .eq('status', 'absent')
        preAbsentIds = new Set((records ?? []).map((r: any) => r.student_id))
      }
    }

    setStudents(
      (enrollments ?? []).map((e: any) => ({
        student_id: e.student_id,
        student_name: e.campus_students?.name ?? '',
        pre_marked_absent: preAbsentIds.has(e.student_id),
      }))
    )
  }, [classId])

  useEffect(() => {
    if (!classId) return
    fetchStudents()
  }, [classId, fetchStudents])

  useEffect(() => {
    if (!classId) return

    async function checkTime() {
      const supabase = createClient()
      const { data: classData } = await supabase
        .from('classes')
        .select('class_sessions(time_range)')
        .eq('id', classId)
        .single()

      const timeRange = (classData?.class_sessions as any)?.time_range
      if (!timeRange) return

      const startTime = parseStartTime(timeRange)
      const now = new Date()
      const nowMin = toMinutes(`${now.getHours()}:${now.getMinutes()}`)
      const diff = toMinutes(startTime) - nowMin
      const today = now.toISOString().split('T')[0]
      const key = `${today}-${startTime}`

      if (diff <= 2 && diff >= -60 && !triggeredRef.current.has(key)) {
        // 이미 완료된 세션이면 패스
        const { data: existing } = await supabase
          .from('attendance_sessions')
          .select('completed_at')
          .eq('class_id', classId)
          .eq('session_date', today)
          .maybeSingle()

        if (existing?.completed_at) return

        triggeredRef.current.add(key)
        await fetchStudents()  // 최신 사전결석 반영
        setShowOverlay(true)
        window.focus()
      }
    }

    checkTime()
    const id = setInterval(checkTime, 30_000)
    return () => clearInterval(id)
  }, [classId, fetchStudents])

  function dismissOverlay() {
    setShowOverlay(false)
    window.blur()
  }

  return { showOverlay, students, dismissOverlay }
}
```

- [ ] **Step 2: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add hooks/useAttendanceTimer.ts
git commit -m "feat: add useAttendanceTimer hook with 30s polling and pre-absence sync"
```

---

## Task 8: 출결 컴포넌트 — Overlay + Toggle

**Files:**
- Create: `components/attendance/StudentStatusToggle.tsx`
- Create: `components/attendance/AttendanceOverlay.tsx`

- [ ] **Step 1: StudentStatusToggle 컴포넌트**

```tsx
// components/attendance/StudentStatusToggle.tsx
'use client'
import type { AttendanceStatus } from '@/lib/attendance'

interface Props {
  studentId: string
  name: string
  status: AttendanceStatus
  preMarked?: boolean
  onStatusChange: (studentId: string, status: AttendanceStatus) => void
}

const STATUS_CYCLE: AttendanceStatus[] = ['present', 'absent', 'late']
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-green-50 border-green-400 text-green-800',
  absent: 'bg-red-50 border-red-400 text-red-800',
  late: 'bg-yellow-50 border-yellow-400 text-yellow-800',
}
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
}
const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: '🟢',
  absent: '🔴',
  late: '🟡',
}

export function StudentStatusToggle({ studentId, name, status, preMarked, onStatusChange }: Props) {
  function cycle() {
    const idx = STATUS_CYCLE.indexOf(status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(studentId, next)
  }

  return (
    <button
      onClick={cycle}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl text-lg font-medium border-2 transition-colors select-none ${STATUS_STYLE[status]}`}
    >
      <span className="text-xl">{STATUS_ICON[status]}</span>
      <span>{name}</span>
      {preMarked && status === 'absent' && (
        <span className="text-xs font-bold bg-red-200 text-red-700 px-1 rounded">사전</span>
      )}
      <span className="text-sm font-normal opacity-70">{STATUS_LABEL[status]}</span>
    </button>
  )
}
```

- [ ] **Step 2: AttendanceOverlay 컴포넌트**

```tsx
// components/attendance/AttendanceOverlay.tsx
'use client'
import { useEffect, useState } from 'react'
import { StudentStatusToggle } from './StudentStatusToggle'
import type { AttendanceStatus } from '@/lib/attendance'
import type { StudentForOverlay } from '@/hooks/useAttendanceTimer'

interface Props {
  classId: string
  campusId: string
  students: StudentForOverlay[]
  onComplete: () => void
}

export function AttendanceOverlay({ classId, campusId, students, onComplete }: Props) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)

  // 초기화: 사전 결석 반영, 나머지 전원 출석
  useEffect(() => {
    const init: Record<string, AttendanceStatus> = {}
    students.forEach(s => {
      init[s.student_id] = s.pre_marked_absent ? 'absent' : 'present'
    })
    setStatuses(init)
  }, [students])

  // ESC 차단
  useEffect(() => {
    const block = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault() }
    window.addEventListener('keydown', block, true)
    return () => window.removeEventListener('keydown', block, true)
  }, [])

  function handleStatusChange(studentId: string, status: AttendanceStatus) {
    setStatuses(prev => ({ ...prev, [studentId]: status }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const records = students.map(s => ({
        student_id: s.student_id,
        status: statuses[s.student_id] ?? 'present',
      }))
      const res = await fetch('/api/smartboard/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      if (!res.ok) throw new Error('저장 실패')
      onComplete()
    } catch (e) {
      console.error('출결 저장 실패:', e)
      setSubmitting(false)
    }
  }

  const absentCount = Object.values(statuses).filter(s => s === 'absent').length
  const lateCount = Object.values(statuses).filter(s => s === 'late').length

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col"
      style={{ zIndex: 9999, width: '100vw', height: '100vh' }}
    >
      {/* 헤더 */}
      <div className="bg-[#004EA2] text-white px-8 py-6 flex-shrink-0">
        <h1 className="text-3xl font-bold">출석 체크</h1>
        <p className="text-blue-200 mt-1 text-lg">결석·지각 학생을 탭하여 표시하세요. 완료 버튼을 눌러야 저장됩니다.</p>
      </div>

      {/* 학생 목록 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {students.map(s => (
            <StudentStatusToggle
              key={s.student_id}
              studentId={s.student_id}
              name={s.student_name}
              status={statuses[s.student_id] ?? 'present'}
              preMarked={s.pre_marked_absent}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </div>

      {/* 하단 완료 버튼 */}
      <div className="flex-shrink-0 p-8 border-t bg-gray-50 flex items-center justify-between">
        <p className="text-gray-600 text-lg">
          결석 <strong className="text-red-600">{absentCount}</strong>명 &nbsp;
          지각 <strong className="text-yellow-600">{lateCount}</strong>명
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-[#004EA2] hover:bg-blue-800 disabled:opacity-50 text-white text-2xl font-bold px-16 py-5 rounded-2xl transition-colors"
        >
          {submitting ? '저장 중...' : '출석 완료'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/attendance/StudentStatusToggle.tsx components/attendance/AttendanceOverlay.tsx
git commit -m "feat: add AttendanceOverlay and StudentStatusToggle components"
```

---

## Task 9: /smartboard 페이지

**Files:**
- Create: `app/smartboard/layout.tsx`
- Create: `app/smartboard/page.tsx`

- [ ] **Step 1: 스마트보드 전용 레이아웃**

```tsx
// app/smartboard/layout.tsx
export default function SmartboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
```

> ⚠️ Next.js 16에서 중첩 html/body 관련 경고 발생 시 `node_modules/next/dist/docs/` 의 layout 가이드 참조

- [ ] **Step 2: 스마트보드 메인 페이지**

```tsx
// app/smartboard/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer'
import { AttendanceOverlay } from '@/components/attendance/AttendanceOverlay'

export default function SmartboardPage() {
  const [classId, setClassId] = useState<string>('')
  const [campusId, setCampusId] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [notAuthorized, setNotAuthorized] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.user_metadata?.role !== 'smartboard') {
        setNotAuthorized(true)
        setAuthChecked(true)
        return
      }
      setClassId(user.user_metadata.class_id ?? '')
      setCampusId(user.user_metadata.campus_id ?? '')
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  const { showOverlay, students, dismissOverlay } = useAttendanceTimer(classId, campusId)

  if (!authChecked) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-xl">로딩 중...</div>
  }

  if (notAuthorized) {
    return <SmartboardLogin />
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400 text-xl select-none">대기 중...</p>
      {showOverlay && classId && (
        <AttendanceOverlay
          classId={classId}
          campusId={campusId}
          students={students}
          onComplete={dismissOverlay}
        />
      )}
    </div>
  )
}

function SmartboardLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('로그인 실패: ' + authError.message)
      setLoading(false)
      return
    }
    if (data.user?.user_metadata?.role !== 'smartboard') {
      await supabase.auth.signOut()
      setError('스마트보드 전용 계정이 아닙니다')
      setLoading(false)
      return
    }
    window.location.reload()
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center text-[#004EA2]">스마트보드 로그인</h1>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#004EA2] text-white text-xl font-bold py-4 rounded-xl disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: 개발서버에서 /smartboard 접속 확인**

```
http://localhost:3000/smartboard
→ 로그인 폼 표시 (미인증)
→ 스마트보드 계정으로 로그인 → "대기 중..." 표시
```

스마트보드 테스트 계정 생성 방법 (Supabase 대시보드 → Authentication → Add user):
- Email: `room-test@test.com`
- Password: `test1234`
- User metadata: `{"role": "smartboard", "class_id": "<실제 class id>", "campus_id": "<실제 campus id>"}`

- [ ] **Step 4: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/smartboard/
git commit -m "feat: add /smartboard page with auth guard and attendance overlay"
```

---

## Task 10: /campus/attendance 페이지 — Tab 1 (반별 출석현황)

**Files:**
- Create: `components/attendance/SessionCard.tsx`
- Create: `components/attendance/PreAbsenceModal.tsx`
- Create: `app/(campus)/campus/attendance/page.tsx`

- [ ] **Step 1: SessionCard 컴포넌트**

```tsx
// components/attendance/SessionCard.tsx
'use client'
import type { ClassWithAttendance } from '@/lib/attendance'

const UI_STATUS_STYLE: Record<string, string> = {
  '미도래': 'bg-gray-100 text-gray-500',
  '대기중': 'bg-blue-100 text-blue-700 animate-pulse',
  '완료': 'bg-green-100 text-green-700',
}

interface Props {
  classData: ClassWithAttendance
  onClick: (classData: ClassWithAttendance) => void
}

export function SessionCard({ classData, onClick }: Props) {
  const totalStudents = classData.students.length
  const presentCount = totalStudents - classData.absent_count - classData.late_count

  return (
    <button
      onClick={() => onClick(classData)}
      className="w-full text-left bg-white rounded-xl border-2 border-gray-100 hover:border-[#004EA2] hover:shadow-md transition-all p-4 space-y-2"
      style={{ borderLeftColor: classData.class_color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-800">{classData.class_level}{classData.class_room ? ` / ${classData.class_room}` : ''}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${UI_STATUS_STYLE[classData.ui_status]}`}>
          {classData.ui_status === '완료'
            ? `완료 ${presentCount}/${totalStudents}`
            : classData.ui_status}
        </span>
      </div>
      {classData.class_teacher && (
        <p className="text-sm text-gray-500">{classData.class_teacher}</p>
      )}
      {classData.absent_count > 0 && (
        <p className="text-sm text-red-600">
          결석: {classData.students.filter(s => s.status === 'absent').map(s => s.student_name).join(', ')}
        </p>
      )}
      {classData.late_count > 0 && (
        <p className="text-sm text-yellow-600">
          지각: {classData.students.filter(s => s.status === 'late').map(s => s.student_name).join(', ')}
        </p>
      )}
    </button>
  )
}
```

- [ ] **Step 2: PreAbsenceModal 컴포넌트**

```tsx
// components/attendance/PreAbsenceModal.tsx
'use client'
import { useState } from 'react'
import type { ClassWithAttendance } from '@/lib/attendance'

interface Props {
  classes: ClassWithAttendance[]
  onClose: () => void
  onSaved: () => void
}

export function PreAbsenceModal({ classes, onClose, onSaved }: Props) {
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [status, setStatus] = useState<'absent' | 'late'>('absent')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const selectedClass = classes.find(c => c.class_id === selectedClassId)

  async function handleSave() {
    if (!selectedClassId || !selectedStudentId) {
      setError('반과 학생을 선택해주세요')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campus/attendance/pre-absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClassId,
          campus_id: selectedClass?.class_session_id, // campus_id는 API에서 profile로 처리
          session_date: today,
          student_id: selectedStudentId,
          status,
          note: note || undefined,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      onSaved()
    } catch (e) {
      setError('저장에 실패했습니다')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-800">사전 결석/지각 등록</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-600">반 선택</label>
          <select
            value={selectedClassId}
            onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId('') }}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">반을 선택하세요</option>
            {classes.map(c => (
              <option key={c.class_id} value={c.class_id}>
                {c.class_session_name} — {c.class_level}{c.class_room ? `/${c.class_room}` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedClass && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-600">학생 선택</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">학생을 선택하세요</option>
              {selectedClass.students.map(s => (
                <option key={s.student_id} value={s.student_id}>{s.student_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStatus('absent')}
            className={`flex-1 py-2 rounded-lg font-bold border-2 transition-colors ${status === 'absent' ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-500'}`}
          >
            결석
          </button>
          <button
            onClick={() => setStatus('late')}
            className={`flex-1 py-2 rounded-lg font-bold border-2 transition-colors ${status === 'late' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'border-gray-200 text-gray-500'}`}
          >
            지각
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-600">사유 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="예: 병원 방문, 가족 행사"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium">취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-[#004EA2] text-white rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: PreAbsenceModal의 campus_id 처리 수정**

`/api/campus/attendance/pre-absence/route.ts`에서 `campus_id`를 body가 아닌 user profile에서 가져오도록 이미 설계됨. PreAbsenceModal의 body에서 `campus_id` 필드 제거:

```tsx
body: JSON.stringify({
  class_id: selectedClassId,
  session_date: today,
  student_id: selectedStudentId,
  status,
  note: note || undefined,
}),
```

그리고 `/api/campus/attendance/pre-absence/route.ts`에서:
```typescript
const { class_id, session_date, student_id, status, note } = await req.json()

// campus_id는 user profile에서
const { data: profile } = await serviceClient
  .from('users')
  .select('campus_id')
  .eq('id', user.id)
  .maybeSingle()
const campus_id = profile?.campus_id
if (!campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

- [ ] **Step 4: 출결 탭 메인 페이지**

```tsx
// app/(campus)/campus/attendance/page.tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClassWithAttendance } from '@/lib/attendance'
import { SessionCard } from '@/components/attendance/SessionCard'
import { StudentStatusToggle } from '@/components/attendance/StudentStatusToggle'
import { PreAbsenceModal } from '@/components/attendance/PreAbsenceModal'
import type { AttendanceStatus } from '@/lib/attendance'

export default function AttendancePage() {
  const [tab, setTab] = useState<'roster' | 'calendar'>('roster')
  const [classes, setClasses] = useState<ClassWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<ClassWithAttendance | null>(null)
  const [editStatuses, setEditStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [showPreAbsence, setShowPreAbsence] = useState(false)
  const [editingTime, setEditingTime] = useState<string | null>(null)  // class_session_id
  const [timeInput, setTimeInput] = useState('')

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const loadData = useCallback(async () => {
    const res = await fetch('/api/campus/attendance')
    if (res.ok) {
      const data = await res.json()
      setClasses(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()

    // Realtime 구독
    const supabase = createClient()
    const channel = supabase
      .channel('attendance-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, loadData)
      .subscribe()

    const interval = setInterval(loadData, 60_000)  // 1분마다 ui_status 재계산

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [loadData])

  function handleCardClick(classData: ClassWithAttendance) {
    setSelectedClass(classData)
    const init: Record<string, AttendanceStatus> = {}
    classData.students.forEach(s => { init[s.student_id] = s.status })
    setEditStatuses(init)
  }

  async function handleSaveAttendance() {
    if (!selectedClass) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const records = selectedClass.students.map(s => ({
      student_id: s.student_id,
      status: editStatuses[s.student_id] ?? 'present',
    }))
    await fetch('/api/campus/attendance/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: selectedClass.class_id,
        session_date: today,
        records,
        mark_complete: true,
      }),
    })
    setSaving(false)
    setSelectedClass(null)
    loadData()
  }

  async function handleTimeEdit(classSessionId: string, currentRange: string) {
    setEditingTime(classSessionId)
    setTimeInput(currentRange)
  }

  async function handleTimeSave() {
    if (!editingTime || !timeInput) return
    await fetch('/api/campus/attendance/time', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_session_id: editingTime, time_range: timeInput }),
    })
    setEditingTime(null)
    loadData()
  }

  // 세션별 그룹
  const sessionGroups = classes.reduce((acc, c) => {
    const key = c.class_session_id
    if (!acc[key]) acc[key] = { name: c.class_session_name, time_range: c.class_session_time_range, session_id: key, classes: [] }
    acc[key].classes.push(c)
    return acc
  }, {} as Record<string, { name: string; time_range: string; session_id: string; classes: ClassWithAttendance[] }>)

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>

  return (
    <div className="max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">출결 관리</h1>
          <p className="text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => setShowPreAbsence(true)}
          className="bg-[#004EA2] text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-800 transition-colors"
        >
          사전 결석 등록
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('roster')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'roster' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          반별 출석현황
        </button>
        <button
          onClick={() => setTab('calendar')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'calendar' ? 'border-[#004EA2] text-[#004EA2]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          캘린더 / 누적
        </button>
      </div>

      {/* Tab 1: 반별 출석현황 */}
      {tab === 'roster' && (
        <div className="space-y-8">
          {Object.values(sessionGroups).map(group => (
            <div key={group.session_id}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold text-gray-800">{group.name}</h2>
                {editingTime === group.session_id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={timeInput}
                      onChange={e => setTimeInput(e.target.value)}
                      placeholder="9:40~11:00"
                      className="border rounded-lg px-2 py-1 text-sm w-32"
                    />
                    <button onClick={handleTimeSave} className="text-sm text-[#004EA2] font-bold">저장</button>
                    <button onClick={() => setEditingTime(null)} className="text-sm text-gray-400">취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleTimeEdit(group.session_id, group.time_range)}
                    className="text-sm text-gray-400 hover:text-[#004EA2] transition-colors"
                    title="시작 시간 수정"
                  >
                    {group.time_range} ✏️
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {group.classes.map(c => (
                  <SessionCard key={c.class_id} classData={c} onClick={handleCardClick} />
                ))}
              </div>
            </div>
          ))}
          {Object.keys(sessionGroups).length === 0 && (
            <div className="py-16 text-center text-gray-400">오늘 등록된 수업이 없습니다</div>
          )}
        </div>
      )}

      {/* Tab 2: 캘린더 / 누적 (Phase 2) */}
      {tab === 'calendar' && (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">캘린더 / 누적 통계는 Phase 2에서 구현 예정입니다</p>
        </div>
      )}

      {/* 반 클릭 → 학생별 출결 편집 */}
      {selectedClass && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => setSelectedClass(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold">
                {selectedClass.class_level}{selectedClass.class_room ? ` / ${selectedClass.class_room}` : ''} 출결
              </h3>
              <button onClick={() => setSelectedClass(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {selectedClass.students.map(s => (
                <StudentStatusToggle
                  key={s.student_id}
                  studentId={s.student_id}
                  name={s.student_name}
                  status={editStatuses[s.student_id] ?? s.status}
                  preMarked={s.pre_marked}
                  onStatusChange={(id, st) => setEditStatuses(prev => ({ ...prev, [id]: st }))}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedClass(null)} className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600">닫기</button>
              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="flex-1 py-3 bg-[#004EA2] text-white rounded-xl font-bold disabled:opacity-50"
              >
                {saving ? '저장 중...' : '출석 완료 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사전 결석 모달 */}
      {showPreAbsence && (
        <PreAbsenceModal
          classes={classes}
          onClose={() => setShowPreAbsence(false)}
          onSaved={() => { setShowPreAbsence(false); loadData() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: TypeScript 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: 개발서버에서 /campus/attendance 접속 확인**

```
campus_admin 계정으로 /campus/attendance 접속
→ 사이드바에 "출결 관리" 탭 활성화 확인
→ 오늘 수업 없으면 "오늘 등록된 수업이 없습니다" 표시
→ 수업 있으면 세션별 카드 그룹 표시
```

- [ ] **Step 7: Commit**

```bash
git add components/attendance/ app/\(campus\)/campus/attendance/
git commit -m "feat: add attendance tab page with real-time updates and pre-absence modal"
```

---

## Task 11: 개설반 현황 — 오늘 출결 배지

**Files:**
- Modify: `app/(campus)/campus/class-roster/page.tsx`

- [ ] **Step 1: 출결 상태 fetch 추가**

`page.tsx` 상단 import 추가:
```typescript
import type { ClassWithAttendance } from '@/lib/attendance'
```

`useEffect` 블록 안에 오늘 출결 데이터 fetch 추가 (기존 class-roster 데이터 로드와 별개):
```typescript
const [attendanceMap, setAttendanceMap] = useState<Map<string, ClassWithAttendance>>(new Map())

useEffect(() => {
  fetch('/api/campus/attendance')
    .then(r => r.json())
    .then((data: ClassWithAttendance[]) => {
      setAttendanceMap(new Map(data.map(c => [c.class_id, c])))
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 2: 반 카드에 배지 추가**

기존 코드에서 반 카드(class card)를 렌더링하는 부분을 찾아 (`class.id`를 key로 쓰는 곳) 다음 배지 추가:

```tsx
{(() => {
  const att = attendanceMap.get(cls.id)
  if (!att) return null
  const badgeStyle = att.ui_status === '완료'
    ? 'bg-green-100 text-green-700'
    : att.ui_status === '대기중'
    ? 'bg-blue-100 text-blue-700 animate-pulse'
    : 'bg-gray-100 text-gray-400'
  const label = att.ui_status === '완료'
    ? `완료 ${att.students.length - att.absent_count - att.late_count}/${att.students.length}`
    : att.ui_status
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>{label}</span>
  )
})()}
```

- [ ] **Step 3: TypeScript 체크 + 동작 확인**

```bash
npx tsc --noEmit
```

개설반 현황 페이지에서 각 반 카드에 오늘 출결 배지 표시 확인.

- [ ] **Step 4: Commit**

```bash
git add app/\(campus\)/campus/class-roster/
git commit -m "feat: add today attendance badge to class-roster cards"
```

---

## Task 12: Windows 스마트보드 설치 가이드

**Files:**
- Create: `docs/SMARTBOARD_SETUP.md`

- [ ] **Step 1: 가이드 작성**

```markdown
# 스마트보드 PC 설치 가이드

반마다 1회만 설정하면 됩니다.

---

## 0단계: 교실 계정 발급 (관리자)

Supabase 대시보드 → Authentication → Users → "Add user":
- Email: `room-<반이름>@poly.jungkye` (예: `room-s1@poly.jungkye`)
- Password: 관리자 보관
- User metadata (JSON):
```json
{
  "role": "smartboard",
  "class_id": "<classes 테이블의 해당 반 UUID>",
  "campus_id": "<campuses 테이블의 캠퍼스 UUID>"
}
```

---

## 1단계: Chrome 시작프로그램 등록

1. `Win + R` → `shell:startup` 입력 → Enter
2. 빈 곳 우클릭 → 새로 만들기 → 바로가기
3. 위치에 붙여넣기:
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=https://poly-system.vercel.app/smartboard --start-minimized
```
4. 이름: `출석시스템` → 마침

---

## 2단계: 최초 로그인

1. 바탕화면의 `출석시스템` 바로가기 더블클릭
2. 해당 교실 계정으로 로그인
3. "대기 중..." 화면 → 설정 완료

이후 PC 재부팅 시 자동 실행 + 자동 로그인.

---

## 작동 방식

- 수업 시작 2분 전 자동으로 화면이 올라옵니다
- 결석·지각 학생을 탭하여 표시
- 나머지는 자동으로 출석
- [출석 완료] 버튼을 눌러야 저장 및 화면이 내려갑니다

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| 팝업이 안 뜸 | 작업표시줄에서 Chrome 확인, 없으면 바로가기 더블클릭 |
| 로그인 화면이 뜸 | 해당 교실 계정으로 다시 로그인 |
| 학생 명단이 다름 | 개설반 현황에서 학생 수정 → 자동 반영 |
```

- [ ] **Step 2: Commit**

```bash
git add docs/SMARTBOARD_SETUP.md
git commit -m "docs: add smartboard Windows setup guide"
```

---

## Task 13: 최종 검증 + 배포

- [ ] **Step 1: TypeScript 전체 체크**

```bash
npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 2: E2E 기능 검증**

```
1. 개발서버: npm run dev

2. campus_admin 계정 로그인
   → 사이드바 "출결 관리" 탭 확인
   → /campus/attendance 접속 → 반별 카드 표시

3. 상담부 계정 (position: '상담') 로그인
   → "출결 관리" 탭 표시 확인

4. 스마트보드 계정 로그인
   → 자동으로 /smartboard 리다이렉트
   → "대기 중..." 표시

5. [타이머 테스트] hooks/useAttendanceTimer.ts에서
   checkTime() 함수 내 diff 조건을 임시로 `diff <= 999`로 변경
   → /smartboard 접속 → overlay 강제 표시 확인
   → 학생 클릭 → 상태 변경 확인
   → [출석 완료] 클릭 → overlay 닫힘
   → /campus/attendance에서 완료 상태 확인
   → 테스트 후 조건 원복

6. 사전 결석 테스트
   → /campus/attendance → [사전 결석 등록]
   → 반 + 학생 선택 + 결석 선택 → 저장
   → /smartboard overlay에 해당 학생 🔴 표시 확인

7. 개설반 현황 배지 확인
   → /campus/class-roster → 각 반 카드에 출결 배지 표시
```

- [ ] **Step 3: Vercel 배포**

```bash
vercel --prod
```

Expected: 배포 URL 출력, https://poly-system.vercel.app/campus/attendance 접속 확인

- [ ] **Step 4: 배포 후 검증**

라이브 환경에서 Step 2 기능 목록 재확인.

- [ ] **Step 5: 최종 Commit**

```bash
git add -A
git commit -m "feat: attendance system complete - smartboard + counselor dashboard"
```

---

## 완료 체크리스트

- [ ] DB 테이블 3개 생성 (Supabase 대시보드 확인)
- [ ] 사이드바에 "출결 관리" 탭 표시 (campus_admin + 상담부)
- [ ] /campus/attendance 반별 카드 표시
- [ ] /campus/attendance 세션 시간 수정 기능
- [ ] 사전 결석 등록 → 즉시 반영
- [ ] /smartboard 자동 로그인 (재부팅 후)
- [ ] 스마트보드 overlay ESC 차단
- [ ] 출결 완료 → /campus/attendance Realtime 반영
- [ ] 개설반 현황 카드 출결 배지
- [ ] Vercel 배포 완료

---

## Phase 2 (미구현)

- `/campus/attendance` Tab 2: 월별 캘린더 + 누적 그래프 (Chart.js)
- 학생별 출결 이력 조회 페이지
- 스마트보드 계정 일괄 생성 스크립트
- `perm_attendance` DB 컬럼 추가 (개인 권한 override)
