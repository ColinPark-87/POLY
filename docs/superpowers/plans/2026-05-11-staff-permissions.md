# 직원 현황 통합 + 권한 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 직원 페이지를 하나로 통합하고, 직급별 기본값 + 개별 override 방식으로 개설반 현황/차량관리 접근 권한을 관리한다.

**Architecture:** Supabase `users` 테이블에 `perm_class_roster`, `perm_vehicles`, `perm_vehicles_restricted` 컬럼을 추가하고, `lib/permissions.ts` 유틸로 직급 기본값을 계산한다. CampusLayout에서 권한을 계산해 사이드바에 전달하고, 직원 상세 모달에 권한 탭을 추가한다.

**Tech Stack:** Next.js App Router, Supabase, TypeScript, Tailwind CSS

---

## 파일 목록

| 파일 | 작업 |
|------|------|
| `supabase/migrations/005_add_permissions.sql` | 신규: 컬럼 3개 추가 |
| `lib/permissions.ts` | 신규: 직급 기본값 계산 유틸 |
| `app/(campus)/layout.tsx` | 수정: perm 컬럼 select + 사이드바에 전달 |
| `components/CampusSidebar.tsx` | 수정: permissions props 기반 메뉴 필터링 |
| `app/(campus)/campus/staff/page.tsx` | 수정: 권한 탭 추가 + employees 기능 통합 |
| `app/(campus)/campus/employees/page.tsx` | 수정: /campus/staff로 redirect |
| `app/(campus)/campus/vehicles/page.tsx` | 수정: restricted 뷰 분기 처리 |
| `app/api/campus/class-roster/route.ts` | 수정: GET에 권한 검증 추가 |
| `app/api/campus/vehicles/route.ts` | 수정: GET에 권한 검증 추가 |

---

## Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/005_add_permissions.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/005_add_permissions.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS perm_class_roster boolean DEFAULT null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS perm_vehicles boolean DEFAULT null;
ALTER TABLE users ADD COLUMN IF NOT EXISTS perm_vehicles_restricted boolean DEFAULT null;
```

- [ ] **Step 2: Supabase 대시보드 SQL Editor에서 실행**

위 SQL을 Supabase 대시보드 → SQL Editor에 붙여넣고 실행한다.
실행 후 `users` 테이블에 3개 컬럼이 추가됐는지 확인:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name LIKE 'perm_%';
```
Expected: `perm_class_roster`, `perm_vehicles`, `perm_vehicles_restricted` 3행 반환

---

## Task 2: permissions.ts 유틸 생성

**Files:**
- Create: `lib/permissions.ts`

- [ ] **Step 1: lib/permissions.ts 작성**

```typescript
// lib/permissions.ts

export interface UserPermissions {
  classRoster: boolean
  vehicles: boolean
  vehiclesRestricted: boolean
}

interface UserProfile {
  role: string
  position: string | null
  perm_class_roster: boolean | null
  perm_vehicles: boolean | null
  perm_vehicles_restricted: boolean | null
}

const FULL_ACCESS_POSITIONS = ['원장', '관리자', '상담부', 'KT']
const SAFETY_POSITION = 'POLY안전선생님'

export function getPositionDefaults(role: string, position: string | null): UserPermissions {
  if (role === 'campus_admin' || role === 'hq_admin') {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false }
  }
  const pos = position ?? ''
  if (FULL_ACCESS_POSITIONS.some(p => pos.includes(p))) {
    return { classRoster: true, vehicles: true, vehiclesRestricted: false }
  }
  if (pos.includes(SAFETY_POSITION)) {
    return { classRoster: false, vehicles: true, vehiclesRestricted: true }
  }
  return { classRoster: false, vehicles: false, vehiclesRestricted: false }
}

export function resolvePermissions(profile: UserProfile): UserPermissions {
  const defaults = getPositionDefaults(profile.role, profile.position)
  return {
    classRoster: profile.perm_class_roster ?? defaults.classRoster,
    vehicles: profile.perm_vehicles ?? defaults.vehicles,
    vehiclesRestricted: profile.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
  }
}
```

- [ ] **Step 2: TypeScript 오류 없는지 확인**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && npx tsc --noEmit 2>&1 | head -20
```
Expected: 오류 없음 (또는 기존 오류만)

---

## Task 3: CampusLayout에서 perm 컬럼 읽기

**Files:**
- Modify: `app/(campus)/layout.tsx`

- [ ] **Step 1: layout.tsx 수정 — perm 컬럼 select 추가 + sidebar에 전달**

현재 코드:
```typescript
const { data: profile } = await serviceClient
  .from('users')
  .select('name, campus_id, role, position')
  .eq('id', user.id)
  .single()
```

아래로 교체:
```typescript
import { resolvePermissions } from '@/lib/permissions'

// ...layout 함수 내부

const { data: profile } = await serviceClient
  .from('users')
  .select('name, campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
  .eq('id', user.id)
  .single()

// isCampusStaff 검사 아래에 추가:
const permissions = resolvePermissions({
  role: profile?.role ?? 'employee',
  position: profile?.position ?? null,
  perm_class_roster: profile?.perm_class_roster ?? null,
  perm_vehicles: profile?.perm_vehicles ?? null,
  perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
})
```

- [ ] **Step 2: CampusSidebar에 permissions 전달**

```tsx
<CampusSidebar
  userName={userName}
  campusName={campusName}
  role={profile?.role ?? 'campus_admin'}
  position={profile?.position ?? ''}
  permClassRoster={permissions.classRoster}
  permVehicles={permissions.vehicles}
/>
```

---

## Task 4: CampusSidebar 권한 기반 필터링

**Files:**
- Modify: `components/CampusSidebar.tsx`

- [ ] **Step 1: props 타입 수정 + 필터링 로직 변경**

현재 props:
```typescript
export default function CampusSidebar({ userName, campusName, role, position }: { userName: string; campusName: string; role: string; position?: string })
```

아래로 교체:
```typescript
export default function CampusSidebar({ userName, campusName, role, position, permClassRoster, permVehicles }: {
  userName: string; campusName: string; role: string; position?: string
  permClassRoster: boolean; permVehicles: boolean
})
```

- [ ] **Step 2: NavDef 타입과 Section 필터링 수정**

현재 NavDef:
```typescript
interface NavDef { href: string; label: string; required?: boolean; employeeOnly?: boolean; counselorAllowed?: boolean }
```

아래로 교체:
```typescript
interface NavDef { href: string; label: string; required?: boolean; employeeOnly?: boolean; needsClassRoster?: boolean; needsVehicles?: boolean }
```

TOOLS_NAV 수정:
```typescript
const TOOLS_NAV: NavDef[] = [
  { href: '/campus/class-roster', label: '개설반 현황', needsClassRoster: true },
  { href: '/campus/vehicles', label: '차량 관리', needsVehicles: true },
  { href: '/campus/calendar', label: '캠퍼스 캘린더' },
]
```

- [ ] **Step 3: Section 컴포넌트의 visibleItems 필터 수정**

현재:
```typescript
const visibleItems = items.filter(item =>
  !hiddenHrefs.includes(item.href) &&
  !(isAdmin && item.employeeOnly) &&
  !(isCounselor && !item.counselorAllowed)
)
```

아래로 교체:
```typescript
const visibleItems = items.filter(item =>
  !hiddenHrefs.includes(item.href) &&
  !(isAdmin && item.employeeOnly) &&
  !(item.needsClassRoster && !permClassRoster) &&
  !(item.needsVehicles && !permVehicles)
)
```

- [ ] **Step 4: 사이드바 설정 모드의 필터도 동일하게 수정**

설정 모드의 `sec.items.filter(...)` 부분:
```typescript
// 현재
sec.items.filter(item => !(isAdmin && item.employeeOnly) && !(isCounselor && !item.counselorAllowed))

// 교체
sec.items.filter(item =>
  !(isAdmin && item.employeeOnly) &&
  !(item.needsClassRoster && !permClassRoster) &&
  !(item.needsVehicles && !permVehicles)
)
```

- [ ] **Step 5: `isCounselor` 변수 사용 제거 확인**

`isCounselor` 변수가 더 이상 사용되지 않으면 해당 줄 삭제:
```typescript
// 삭제
const isCounselor = !isAdmin && (position?.includes('상담') ?? false)
const roleLabel = isCounselor ? '상담부' : (role === 'hq_admin' ? '본사 관리자' : '원장')
```
roleLabel은 아래로 단순화:
```typescript
const roleLabel = role === 'hq_admin' ? '본사 관리자' : (role === 'campus_admin' ? '원장' : (position ?? '직원'))
```

- [ ] **Step 6: 빌드 확인**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && npx tsc --noEmit 2>&1 | head -30
```
Expected: 오류 없음

---

## Task 5: 직원 현황 + 직원 관리 페이지 통합

**Files:**
- Modify: `app/(campus)/campus/staff/page.tsx`
- Modify: `app/(campus)/campus/employees/page.tsx`

### 5-1: employees 페이지를 staff로 redirect

- [ ] **Step 1: employees/page.tsx 전체를 redirect로 교체**

```typescript
// app/(campus)/campus/employees/page.tsx
import { redirect } from 'next/navigation'

export default function EmployeesPage() {
  redirect('/campus/staff')
}
```

### 5-2: staff 페이지에 권한 탭 추가

- [ ] **Step 2: staff/page.tsx — 상태 변수 추가**

Employee 인터페이스에 perm 컬럼 추가 (기존 interface Employee 찾아서):
```typescript
interface Employee {
  id: string; name: string; email: string; position: string; role: string
  is_active: boolean; campus_hired_at: string | null; company_hired_at: string | null
  terminated_at: string | null
  perm_class_roster: boolean | null; perm_vehicles: boolean | null; perm_vehicles_restricted: boolean | null
}
```

- [ ] **Step 3: load() 함수가 perm 컬럼을 포함하도록 API가 반환하는지 확인**

`/api/campus/employees?all=true` 응답에 perm 컬럼이 포함되는지 확인.
employees API GET 라우트를 찾아 select 쿼리 확인:

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && grep -n "select(" app/api/campus/employees/route.ts
```

만약 `select('*')` 이면 자동으로 포함. `select('id, name, ...')` 처럼 명시적이면 perm 컬럼 추가 필요.

- [ ] **Step 4: 모달 상태에 activeTab 추가**

`useState` 상태 목록에 추가:
```typescript
const [detailTab, setDetailTab] = useState<'info' | 'permissions' | 'terminate'>('info')
```

`openDetail` 함수에 탭 초기화 추가:
```typescript
function openDetail(emp: Employee) {
  setSelected(emp)
  setDetailTab('info')
  setEditForm({ ... }) // 기존 코드 유지
  setEditError('')
}
```

- [ ] **Step 5: 권한 계산 헬퍼 함수 추가 (staff/page.tsx 최상단 import 옆)**

```typescript
import { getPositionDefaults } from '@/lib/permissions'

function getEffectivePerms(emp: Employee) {
  const defaults = getPositionDefaults(emp.role, emp.position)
  return {
    classRoster: emp.perm_class_roster ?? defaults.classRoster,
    vehicles: emp.perm_vehicles ?? defaults.vehicles,
    vehiclesRestricted: emp.perm_vehicles_restricted ?? defaults.vehiclesRestricted,
    classRosterOverridden: emp.perm_class_roster !== null,
    vehiclesOverridden: emp.perm_vehicles !== null,
    vehiclesRestrictedOverridden: emp.perm_vehicles_restricted !== null,
  }
}
```

- [ ] **Step 6: 직원 상세 모달에 탭 UI 추가**

모달 form 시작 부분(`<form onSubmit={handleSave}...>`) 바로 위에 탭 헤더 삽입:

현재:
```tsx
<form onSubmit={handleSave} className="p-5 space-y-4">
```

아래로 교체:
```tsx
{/* 탭 헤더 */}
<div className="flex border-b border-[#F1F5F9] px-5">
  {(['info', 'permissions', 'terminate'] as const).map((tab) => {
    const labels = { info: '기본 정보', permissions: '권한 설정', terminate: '퇴사 처리' }
    return (
      <button key={tab} type="button"
        onClick={() => setDetailTab(tab)}
        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
          detailTab === tab
            ? 'border-[#004EA2] text-[#004EA2]'
            : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
        }`}>
        {labels[tab]}
      </button>
    )
  })}
</div>

<form onSubmit={handleSave} className="p-5 space-y-4">
```

- [ ] **Step 7: 기본 정보 탭 — 기존 내용을 조건부로 감싸기**

현재 form 내용을 `{detailTab === 'info' && (...)}` 로 감싸기:

```tsx
<form onSubmit={handleSave} className="p-5 space-y-4">
  {detailTab === 'info' && (
    <>
      {/* 기존 정보 표시 + 수정 폼 전체 */}
      <div className="bg-[#F8FAFC] rounded-xl p-3 space-y-2 text-sm">
        {/* ... 기존 코드 유지 ... */}
      </div>
      {/* ... 이름/직급/역할/입사일/이메일 수정 폼 ... */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setSelected(null)} ...>취소</button>
        <button type="submit" disabled={saving} ...>{saving ? '저장 중...' : '저장'}</button>
      </div>
    </>
  )}

  {detailTab === 'permissions' && selected && (
    <PermissionsTab
      emp={selected}
      onSave={async (perms) => {
        setSaving(true)
        await fetch(`/api/campus/employees/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(perms),
        })
        setSaving(false)
        setSelected(null)
        load()
      }}
      saving={saving}
    />
  )}

  {detailTab === 'terminate' && selected && (
    <div className="pt-1">
      <button type="button"
        onClick={() => { setTerminateModal(selected); setTerminateDate('') }}
        className="w-full border border-[#FCA5A5] text-[#EF4444] py-2.5 rounded-xl text-sm font-semibold hover:bg-[#FEF2F2] transition-colors">
        퇴사 처리
      </button>
    </div>
  )}
</form>
```

- [ ] **Step 8: PermissionsTab 컴포넌트 추가 (staff/page.tsx 하단)**

```typescript
function PermissionsTab({ emp, onSave, saving }: {
  emp: Employee
  onSave: (perms: { perm_class_roster: boolean | null; perm_vehicles: boolean | null; perm_vehicles_restricted: boolean | null }) => Promise<void>
  saving: boolean
}) {
  const defaults = getPositionDefaults(emp.role, emp.position)
  const [classRoster, setClassRoster] = useState<boolean | null>(emp.perm_class_roster)
  const [vehicles, setVehicles] = useState<boolean | null>(emp.perm_vehicles)
  const [vehiclesRestricted, setVehiclesRestricted] = useState<boolean | null>(emp.perm_vehicles_restricted)

  const effectiveClassRoster = classRoster ?? defaults.classRoster
  const effectiveVehicles = vehicles ?? defaults.vehicles
  const effectiveVehiclesRestricted = vehiclesRestricted ?? defaults.vehiclesRestricted

  function reset() {
    setClassRoster(null)
    setVehicles(null)
    setVehiclesRestricted(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">메뉴 접근 권한</p>

      {/* 개설반 현황 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">개설반 현황</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.classRoster ? 'ON' : 'OFF'}
            {classRoster !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClassRoster(prev => {
            const current = prev ?? defaults.classRoster
            return current === defaults.classRoster ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveClassRoster ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveClassRoster ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 차량 관리 */}
      <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl">
        <div>
          <p className="text-sm font-medium text-[#1E293B]">차량 관리</p>
          <p className="text-[10px] text-[#94A3B8]">
            직급 기본값: {defaults.vehicles ? 'ON' : 'OFF'}
            {vehicles !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVehicles(prev => {
            const current = prev ?? defaults.vehicles
            return current === defaults.vehicles ? !current : null
          })}
          className={`relative w-12 h-6 rounded-full transition-colors ${effectiveVehicles ? 'bg-[#004EA2]' : 'bg-[#E2E8F0]'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveVehicles ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 차량 제한 뷰 (차량 ON일 때만) */}
      {effectiveVehicles && (
        <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-xl ml-4 border-l-2 border-[#E2E8F0]">
          <div>
            <p className="text-sm font-medium text-[#1E293B]">제한 뷰</p>
            <p className="text-[10px] text-[#94A3B8]">
              ON: 오늘 등하원·변경기록·노선지도만 | OFF: 전체
            </p>
            <p className="text-[10px] text-[#94A3B8]">
              직급 기본값: {defaults.vehiclesRestricted ? 'ON' : 'OFF'}
              {vehiclesRestricted !== null && <span className="ml-1 text-[#004EA2] font-semibold">(개별 설정됨)</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVehiclesRestricted(prev => {
              const current = prev ?? defaults.vehiclesRestricted
              return current === defaults.vehiclesRestricted ? !current : null
            })}
            className={`relative w-12 h-6 rounded-full transition-colors ${effectiveVehiclesRestricted ? 'bg-[#F59E0B]' : 'bg-[#004EA2]'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${effectiveVehiclesRestricted ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={reset}
          className="flex-1 border border-[#E2E8F0] text-[#64748B] py-2.5 rounded-xl text-sm hover:bg-[#F7F8FA]">
          기본값으로 초기화
        </button>
        <button type="button" disabled={saving}
          onClick={() => onSave({ perm_class_roster: classRoster, perm_vehicles: vehicles, perm_vehicles_restricted: vehiclesRestricted })}
          className="flex-1 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: 탭 관련 기존 퇴사 버튼 중복 제거**

기존 form 내 퇴사 버튼 섹션(탭 이전에 있던 것) 삭제:
```tsx
// 삭제 대상
<div className="pt-1 border-t border-[#F1F5F9]">
  <button type="button"
    onClick={() => { setTerminateModal(selected); setTerminateDate('') }}
    ...>
    퇴사 처리
  </button>
</div>
```

- [ ] **Step 10: 빌드 확인**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && npx tsc --noEmit 2>&1 | head -30
```
Expected: 오류 없음

---

## Task 6: 차량관리 제한 뷰

**Files:**
- Modify: `app/(campus)/campus/vehicles/page.tsx`
- Modify: `app/(campus)/layout.tsx`

- [ ] **Step 1: layout.tsx에서 vehicles 페이지에 restricted 정보 전달**

layout은 서버 컴포넌트이므로 vehicles 페이지에 직접 props를 전달할 수 없다.
대신 vehicles 페이지 자체에서 현재 사용자 프로필을 읽어오는 API를 추가한다.

`/api/campus/me` 라우트 생성:

```typescript
// app/api/campus/me/route.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id)
    .single()

  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })

  return NextResponse.json({ permissions })
}
```

- [ ] **Step 2: vehicles/page.tsx 최상단에 권한 fetch 추가**

파일 최상단 `useEffect` 영역에 권한 로드 추가:

```typescript
const [vehiclesRestricted, setVehiclesRestricted] = useState(false)

useEffect(() => {
  fetch('/api/campus/me')
    .then(r => r.json())
    .then(d => { if (d.permissions) setVehiclesRestricted(d.permissions.vehiclesRestricted) })
}, [])
```

- [ ] **Step 3: 제한 뷰 분기 — 탭 렌더링 조건 추가**

vehicles/page.tsx에서 탭 목록이나 메인 뷰를 렌더링하는 부분을 찾아서,
`vehiclesRestricted`가 true이면 관리 기능(학생 편집, 전체 스케줄 등)을 숨긴다.

탭 버튼 렌더링 부분에서 관리 탭 조건부 표시:
```typescript
// 기존 탭 목록에서 관리 기능 관련 탭은 restricted일 때 숨김
// 탭이 '오늘 등하원', '변경기록', '노선지도', '전체 스케줄' 등으로 구성돼 있다면
// vehiclesRestricted가 true일 때 전체 스케줄 탭 및 관리 버튼 숨김
```

vehicles 페이지의 실제 탭/뷰 구조를 확인해서 적용:
```bash
grep -n "tab\|Tab\|탭\|뷰\|view" "app/(campus)/campus/vehicles/page.tsx" | head -30
```

확인 후 `vehiclesRestricted && <관리UI>` 패턴으로 관리 기능 감싸기.

---

## Task 7: API 권한 검증

**Files:**
- Modify: `app/api/campus/class-roster/route.ts`
- Modify: `app/api/campus/vehicles/route.ts`

- [ ] **Step 1: class-roster GET에 권한 검증 추가**

`app/api/campus/class-roster/route.ts`의 GET 핸들러에서 `campus_id` 확인 직후에 추가:

```typescript
// campus_id 확인 이후
import { resolvePermissions } from '@/lib/permissions'

// profile select에 perm 컬럼 추가
const { data: profile } = await service
  .from('users')
  .select('campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
  .eq('id', user.id)
  .single()

const permissions = resolvePermissions({
  role: profile?.role ?? 'employee',
  position: profile?.position ?? null,
  perm_class_roster: profile?.perm_class_roster ?? null,
  perm_vehicles: profile?.perm_vehicles ?? null,
  perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
})
if (!permissions.classRoster) {
  return NextResponse.json({ error: '권한 없음' }, { status: 403 })
}
```

- [ ] **Step 2: vehicles GET에 권한 검증 추가**

`app/api/campus/vehicles/route.ts`의 GET 핸들러에서 동일 패턴 적용:

```typescript
import { resolvePermissions } from '@/lib/permissions'

// profile select에 perm 컬럼 추가 (campus_id 확인 직후)
const { data: profile } = await service
  .from('users')
  .select('campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
  .eq('id', user.id)
  .single()

const permissions = resolvePermissions({
  role: profile?.role ?? 'employee',
  position: profile?.position ?? null,
  perm_class_roster: profile?.perm_class_roster ?? null,
  perm_vehicles: profile?.perm_vehicles ?? null,
  perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
})
if (!permissions.vehicles) {
  return NextResponse.json({ error: '권한 없음' }, { status: 403 })
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && npx tsc --noEmit 2>&1 | head -30
```
Expected: 오류 없음

---

## Task 8: 배포 및 검증

- [ ] **Step 1: 배포**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system" && npx vercel --prod
```

- [ ] **Step 2: alias 갱신**

배포 완료 후 출력된 새 deployment URL로 교체:
```bash
npx vercel alias set poly-system.vercel.app
```

- [ ] **Step 3: 동작 검증 체크리스트**

- [ ] 원장으로 로그인 → 개설반 현황, 차량관리 모두 사이드바에 보임
- [ ] FT 직원으로 로그인 → 개설반 현황, 차량관리 사이드바에 없음
- [ ] POLY안전선생님으로 로그인 → 차량관리만 보임 (개설반 없음)
- [ ] 원장이 직원 현황에서 FT 직원 클릭 → 권한 탭에서 개설반 현황 ON → 저장
- [ ] 해당 FT 직원 재로그인 → 개설반 현황 사이드바에 나타남
- [ ] 권한 탭 "기본값으로 초기화" 클릭 → FT 기본값(OFF)으로 복귀
