# HQ 전체 개설반 현황 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HQ 사이드바에 "개설반 현황" 메뉴를 추가하고, `/hq/roster` 페이지에서 캠퍼스를 선택해 해당 캠퍼스의 개설반 현황(세션·반·학생 목록)을 확인할 수 있도록 한다.

**Architecture:** 기존 `/api/hq/campuses/[id]/roster` API와 `/api/hq/campuses` API를 그대로 재활용한다. 새 페이지 `/hq/roster`는 좌측에 캠퍼스 목록, 우측에 선택된 캠퍼스의 개설반 현황을 렌더링하는 2-패널 레이아웃으로 구성된다. 모바일에서는 상단 드롭다운으로 캠퍼스를 선택하고 아래에 현황을 표시한다.

**Tech Stack:** Next.js App Router (client component), Tailwind CSS, 기존 Supabase API 재활용

---

## File Map

| 파일 | 변경 종류 | 역할 |
|------|-----------|------|
| `components/HqSidebar.tsx` | Modify | "개설반 현황" nav item 추가 |
| `components/HqBottomNav.tsx` | Modify | 모바일 하단 네비에 "개설반" 탭 추가 (있을 경우) |
| `app/(hq)/hq/roster/page.tsx` | Create | 전체 개설반 현황 페이지 |

---

### Task 1: HqSidebar에 "개설반 현황" 메뉴 추가

**Files:**
- Modify: `components/HqSidebar.tsx`

- [ ] **Step 1: 현재 파일 확인 (이미 읽었으면 생략)**

파일 경로: `components/HqSidebar.tsx`
현재 `navSections` 배열의 "캠퍼스" 섹션에 두 항목이 있음:
```
{ href: '/hq/campuses', label: '캠퍼스 관리', icon: '🏫' },
{ href: '/hq/vehicles', label: '차량 운행현황', icon: '🚌' },
```

- [ ] **Step 2: "개설반 현황" 항목을 캠퍼스 섹션에 추가**

`navSections` 배열에서 캠퍼스 섹션 items에 아래 항목을 추가:
```ts
{ href: '/hq/roster', label: '개설반 현황', icon: '📋' },
```

수정 후 캠퍼스 섹션:
```ts
{
  title: '캠퍼스',
  items: [
    { href: '/hq/campuses', label: '캠퍼스 관리', icon: '🏫' },
    { href: '/hq/roster', label: '개설반 현황', icon: '📋' },
    { href: '/hq/vehicles', label: '차량 운행현황', icon: '🚌' },
  ],
},
```

- [ ] **Step 3: active 판별 로직 확인**

기존 코드:
```ts
const active = pathname === item.href || (item.href !== '/hq/dashboard' && pathname.startsWith(item.href))
```
`/hq/roster`는 `/hq/campuses`의 startsWith에 걸리지 않으므로 추가 수정 불필요. 그대로 사용.

- [ ] **Step 4: HqBottomNav 확인**

`components/HqBottomNav.tsx` 파일을 읽어서 "개설반" 탭 추가가 필요한지 확인.
- 모바일 하단 nav가 4개 이하로 제한되어 있으면 가장 덜 중요한 항목과 교체 또는 스킵.
- 이미 4개 탭이 꽉 차 있고 여유 없으면 사이드바 메뉴만으로도 충분 (HQ는 주로 데스크탑 사용).

- [ ] **Step 5: commit**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
git add components/HqSidebar.tsx
git commit -m "feat: add 개설반 현황 nav item to HQ sidebar"
```

---

### Task 2: `/hq/roster` 페이지 생성

**Files:**
- Create: `app/(hq)/hq/roster/page.tsx`

**동작 흐름:**
1. 마운트 시 `/api/hq/campuses` 호출 → 캠퍼스 목록 로드
2. 첫 번째 캠퍼스 자동 선택
3. 캠퍼스 선택 변경 시 `/api/hq/campuses/[id]/roster?month=` 호출 → 개설반 데이터 로드
4. 월 변경 시 같은 API 재호출

- [ ] **Step 1: 파일 생성**

`app/(hq)/hq/roster/page.tsx` 를 아래 내용으로 생성:

```tsx
'use client'

import { useEffect, useState } from 'react'

// ── 타입 ──────────────────────────────────────────────────────────
interface Campus { id: string; name: string; code: string; is_active: boolean }
interface Session { id: string; name: string; time_range: string | null; sort_order: number }
interface Class {
  id: string; session_id: string; level: string
  teacher: string | null; kt_teacher: string | null
  room: string | null; color: string | null; sort_order: number
}
interface Enrollment {
  id: string; class_id: string; student_id: string
  campus_students: { id: string; name: string; english_name: string | null; grade: string | null } | null
}
interface RosterData {
  campus: { id: string; name: string }
  sessions: Session[]
  classes: Class[]
  enrollments: Enrollment[]
  availableMonths: string[]
  currentMonth: string
}

// ── 스피너 ────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#004EA2] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── 개설반 뷰 (세션→반→학생) ──────────────────────────────────────
function RosterView({ data }: { data: RosterData }) {
  const { sessions, classes, enrollments, currentMonth } = data

  const classBySession: Record<string, Class[]> = {}
  for (const c of classes) {
    if (!classBySession[c.session_id]) classBySession[c.session_id] = []
    classBySession[c.session_id].push(c)
  }
  const enrByClass: Record<string, Enrollment[]> = {}
  for (const e of enrollments) {
    if (!enrByClass[e.class_id]) enrByClass[e.class_id] = []
    enrByClass[e.class_id].push(e)
  }
  const totalStudents = classes.reduce((s, c) => s + (enrByClass[c.id]?.length ?? 0), 0)

  if (sessions.length === 0) {
    return (
      <div className="text-center py-20 text-[#94A3B8]">
        <p className="text-2xl mb-2">📋</p>
        <p className="text-sm">{currentMonth ? `${currentMonth}의 수업 데이터가 없습니다.` : '데이터가 없습니다.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#94A3B8]">총 {totalStudents}명 · {classes.length}반 · {sessions.length}세션</p>
      {sessions.map(sess => {
        const sessClasses = classBySession[sess.id] ?? []
        const sessTotal = sessClasses.reduce((s, c) => s + (enrByClass[c.id]?.length ?? 0), 0)
        return (
          <div key={sess.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            {/* 세션 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#F7F8FA] border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1E293B]">{sess.name}</span>
                {sess.time_range && (
                  <span className="text-xs text-white bg-[#004EA2] px-2 py-0.5 rounded-full">{sess.time_range}</span>
                )}
              </div>
              <span className="text-xs text-[#94A3B8]">{sessTotal}명 · {sessClasses.length}반</span>
            </div>

            {/* 반 목록 */}
            {sessClasses.length === 0 ? (
              <p className="text-center text-[#CBD5E1] text-sm py-6">반 없음</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#F1F5F9]">
                {sessClasses.map(cls => {
                  const students = enrByClass[cls.id] ?? []
                  const color = cls.color ?? '#004EA2'
                  return (
                    <div key={cls.id} className="bg-white p-3">
                      {/* 반 헤더 */}
                      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#F1F5F9]">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="font-bold text-sm text-[#1E293B]">{cls.level}</span>
                        {cls.teacher && <span className="text-[10px] text-[#94A3B8]">{cls.teacher}</span>}
                        {cls.kt_teacher && <span className="text-[10px] text-[#60A5FA]">{cls.kt_teacher}</span>}
                        {cls.room && <span className="text-[10px] text-[#94A3B8]">{cls.room}</span>}
                        <span className="ml-auto text-[10px] font-bold" style={{ color }}>{students.length}명</span>
                      </div>
                      {/* 학생 목록 */}
                      {students.length === 0 ? (
                        <p className="text-[11px] text-[#CBD5E1] text-center py-2">수강생 없음</p>
                      ) : (
                        <div className="space-y-0.5">
                          {students.map((enr, i) => {
                            const stu = enr.campus_students
                            return (
                              <div key={enr.id} className="flex items-center gap-2 py-0.5">
                                <span className="text-[9px] text-[#CBD5E1] w-4 text-right flex-shrink-0">{i + 1}</span>
                                <span className="text-[11px] font-semibold text-[#1E293B]">{stu?.name ?? '-'}</span>
                                {stu?.english_name && (
                                  <span className="text-[9px] text-[#94A3B8] truncate">{stu.english_name}</span>
                                )}
                                {stu?.grade && (
                                  <span className="ml-auto text-[9px] text-[#94A3B8] flex-shrink-0">{stu.grade}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function HqRosterOverviewPage() {
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [rosterData, setRosterData] = useState<RosterData | null>(null)
  const [campusLoading, setCampusLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)

  // 1) 캠퍼스 목록 로드
  useEffect(() => {
    fetch('/api/hq/campuses')
      .then(r => r.json())
      .then(d => {
        const list: Campus[] = (d.campuses ?? []).filter((c: Campus) => c.is_active)
        setCampuses(list)
        if (list.length > 0) setSelectedId(list[0].id)
        setCampusLoading(false)
      })
  }, [])

  // 2) 캠퍼스/월 변경 시 개설반 데이터 로드
  useEffect(() => {
    if (!selectedId) return
    setRosterLoading(true)
    setRosterData(null)
    const params = new URLSearchParams(month ? { month } : {})
    fetch(`/api/hq/campuses/${selectedId}/roster?${params}`)
      .then(r => r.json())
      .then(d => {
        setRosterData(d)
        if (!month && d.currentMonth) setMonth(d.currentMonth)
        setRosterLoading(false)
      })
  }, [selectedId, month])

  // 캠퍼스 선택 변경 시 월 초기화
  function selectCampus(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    setMonth('')
  }

  if (campusLoading) return <Spinner />

  if (campuses.length === 0) {
    return (
      <div className="text-center py-20 text-[#94A3B8]">
        <p className="text-2xl mb-2">🏫</p>
        <p className="text-sm">등록된 활성 캠퍼스가 없습니다.</p>
      </div>
    )
  }

  const selectedCampus = campuses.find(c => c.id === selectedId)

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-0">
      {/* ── 좌측: 캠퍼스 목록 (데스크탑) / 상단 드롭다운 (모바일) ── */}

      {/* 모바일: 드롭다운 */}
      <div className="md:hidden">
        <label className="block text-xs font-semibold text-[#64748B] mb-1">캠퍼스 선택</label>
        <select
          value={selectedId}
          onChange={e => selectCampus(e.target.value)}
          className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004EA2]"
        >
          {campuses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* 데스크탑: 좌측 사이드 패널 */}
      <aside className="hidden md:flex flex-col w-44 shrink-0 gap-1">
        <p className="text-[10px] font-bold text-[#CBD5E1] uppercase tracking-widest px-2 mb-1">캠퍼스</p>
        {campuses.map(c => (
          <button
            key={c.id}
            onClick={() => selectCampus(c.id)}
            className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors truncate ${
              c.id === selectedId
                ? 'bg-[#EAF2FB] text-[#002F65] font-semibold'
                : 'text-[#6B7687] hover:bg-[#F7F8FA] hover:text-[#0C1220]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </aside>

      {/* ── 우측: 개설반 현황 ──────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-[#1E293B]">
              {selectedCampus?.name ?? ''} 개설반 현황
            </h1>
            <p className="text-xs text-[#94A3B8] mt-0.5">읽기 전용 · HQ 전용</p>
          </div>
          {/* 월 선택 */}
          {rosterData && rosterData.availableMonths.length > 0 && (
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              {rosterData.availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>

        {/* 개설반 콘텐츠 */}
        {rosterLoading ? <Spinner /> : rosterData ? <RosterView data={rosterData} /> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 브라우저에서 `/hq/roster` 접속해 동작 확인**

확인 항목:
- 좌측 캠퍼스 목록이 표시되는가
- 클릭 시 우측 개설반 현황이 변경되는가
- 월 드롭다운이 표시되고 변경 시 데이터가 바뀌는가
- 모바일 뷰(<768px)에서 드롭다운이 표시되는가

- [ ] **Step 3: commit**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
git add app/(hq)/hq/roster/page.tsx
git commit -m "feat: add HQ 전체 개설반 현황 페이지 /hq/roster"
```

---

### Task 3: Vercel 배포

- [ ] **Step 1: 프로덕션 배포**

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
npx vercel --prod
```

- [ ] **Step 2: 운영 환경에서 최종 확인**

https://poly-system.vercel.app/hq/roster 접속 → 캠퍼스 목록 확인 → 개설반 현황 정상 표시 확인

---

## Self-Review

**Spec coverage 체크:**
- [x] HQ 사이드바에 "개설반 현황" 메뉴 추가 → Task 1
- [x] 캠퍼스별 개설반 현황 뷰 → Task 2 (`RosterView` 컴포넌트)
- [x] 캠퍼스 선택 UI (사이드바 패널 + 모바일 드롭다운) → Task 2
- [x] 월 선택 → Task 2
- [x] 배포 → Task 3

**Placeholder 스캔:** 없음. 모든 코드 포함.

**Type 일관성:**
- `Class` 인터페이스에 `kt_teacher` 포함 (기존 `/campuses/[id]/roster` 페이지에는 없었으나 DB 컬럼 존재)
- `RosterData` 타입이 API 응답과 일치 (API route 코드 확인)
- `selectCampus` 함수가 `selectedId`, `setMonth` 모두 처리

**주의사항:**
- 기존 `/hq/campuses/[id]/roster` 페이지는 그대로 유지 (캠퍼스 상세 페이지 링크용)
- 신규 `/hq/roster` 페이지는 별도 API 없이 기존 API 재사용
