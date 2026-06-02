# Stop Search Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating stop-search box to the top-right of the Kakao Map in `RouteMapView.tsx` — user types a stop name, sees which buses serve it with direction, session, and time.

**Architecture:** Extract the pure data-lookup logic into a testable utility (`lib/utils/stop-search.ts`). Wire state + useMemo + overlay UI all inside `RouteMapView.tsx`. No new API routes.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, Kakao Maps SDK, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/utils/stop-search.ts` | Pure function: given `bothDirGroups` + query → `StopSearchRow[]` |
| Create | `tests/stop-search.test.ts` | Vitest unit tests for the pure function |
| Modify | `app/(campus)/campus/vehicles/RouteMapView.tsx` | State, useMemo, overlay JSX, map-highlight logic |

---

## Task 1: Pure search utility + tests

**Files:**
- Create: `lib/utils/stop-search.ts`
- Create: `tests/stop-search.test.ts`

### Types

```ts
// lib/utils/stop-search.ts

export interface StopSearchRow {
  stopName: string
  busName: string
  dir: 'arr' | 'dep'
  sessionLabel: string
  time: string | null
  count: number
}

interface TimeGroup {
  session_name: string
  time_range: string
  busMap: Record<string, Array<{ student_id: string; name: string; location: string | null; pickup_time: string | null; days: string[] }>>
}
```

- [ ] **Step 1: Write failing tests**

```ts
// tests/stop-search.test.ts
import { describe, it, expect } from 'vitest'
import { buildStopSearchResults, getRunLabel } from '@/lib/utils/stop-search'

const mockGroups = [
  {
    group: {
      session_name: '매일반',
      time_range: '08:10~14:30',
      busMap: {
        '1호차': [
          { student_id: 's1', name: '홍길동', location: '동아청솔', pickup_time: '14:30', days: ['월','화','수','목','금'] },
          { student_id: 's2', name: '김철수', location: '동아청솔', pickup_time: '14:35', days: ['월','화','수','목','금'] },
          { student_id: 's3', name: '이영희', location: '중계역', pickup_time: '14:45', days: ['월','화','수','목','금'] },
        ],
        '2호차': [
          { student_id: 's4', name: '박민수', location: '동아청솔', pickup_time: '14:20', days: ['월','화','수','목','금'] },
        ],
      },
    },
    dir: 'dep' as const,
  },
  {
    group: {
      session_name: '유치부',
      time_range: '08:00~13:00',
      busMap: {
        '1호차': [
          { student_id: 's5', name: '최지우', location: '동아청솔', pickup_time: '08:10', days: ['월','화','수','목','금'] },
        ],
      },
    },
    dir: 'arr' as const,
  },
]

describe('buildStopSearchResults', () => {
  it('빈 쿼리면 빈 배열 반환', () => {
    expect(buildStopSearchResults(mockGroups, '')).toHaveLength(0)
  })

  it('동아청솔 검색 시 3개 행 반환 (1호차 dep, 2호차 dep, 1호차 arr)', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    expect(rows).toHaveLength(3)
  })

  it('중계역은 검색되지 않음', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    expect(rows.every(r => r.stopName === '동아청솔')).toBe(true)
  })

  it('1호차 dep 행: count=2, time=14:30', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '1호차' && r.dir === 'dep')
    expect(row).toBeDefined()
    expect(row!.count).toBe(2)
    expect(row!.time).toBe('14:30')
  })

  it('2호차 dep 행: count=1, time=14:20', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '2호차' && r.dir === 'dep')
    expect(row).toBeDefined()
    expect(row!.count).toBe(1)
    expect(row!.time).toBe('14:20')
  })

  it('1호차 arr 행: count=1, time=08:10', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const row = rows.find(r => r.busName === '1호차' && r.dir === 'arr')
    expect(row).toBeDefined()
    expect(row!.count).toBe(1)
    expect(row!.time).toBe('08:10')
  })

  it('부분 문자열 매칭: "청솔"로 검색해도 동아청솔 나옴', () => {
    const rows = buildStopSearchResults(mockGroups, '청솔')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].stopName).toBe('동아청솔')
  })

  it('대소문자/공백 무시: " 동아청솔 " 도 매칭', () => {
    const rows = buildStopSearchResults(mockGroups, ' 동아청솔 ')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('dep 행이 arr 행보다 먼저 정렬', () => {
    const rows = buildStopSearchResults(mockGroups, '동아청솔')
    const firstArr = rows.findIndex(r => r.dir === 'arr')
    const lastDep = rows.map((r, i) => r.dir === 'dep' ? i : -1).filter(i => i >= 0).pop() ?? -1
    expect(lastDep).toBeLessThan(firstArr)
  })
})

describe('getRunLabel', () => {
  it('매일반 dep → 매일반', () => expect(getRunLabel('매일반', 'dep')).toBe('매일반'))
  it('유치부 arr → 유치부', () => expect(getRunLabel('유치부', 'arr')).toBe('유치부'))
  it('월수금 → 3일반', () => expect(getRunLabel('월수금반', 'dep')).toBe('3일반'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "C:/Users/user/Desktop/Colin 작업폴더/leave-system"
npx vitest run tests/stop-search.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/utils/stop-search'`

- [ ] **Step 3: Implement `lib/utils/stop-search.ts`**

```ts
// lib/utils/stop-search.ts

export interface StopSearchRow {
  stopName: string
  busName: string
  dir: 'arr' | 'dep'
  sessionLabel: string
  time: string | null
  count: number
}

interface StudentEntry {
  student_id: string
  name: string
  location: string | null
  pickup_time: string | null
  days: string[]
}

interface TimeGroup {
  session_name: string
  time_range: string
  busMap: Record<string, StudentEntry[]>
}

export function getRunLabel(sessName: string, dir: 'arr' | 'dep'): string {
  if (sessName.includes('방과후')) {
    if (sessName.includes('유치부')) return '유치부'
    return dir === 'dep' ? '매일반' : '방과후'
  }
  if (sessName.includes('매일반')) return '매일반'
  if (sessName.includes('월수금') || sessName.includes('3일반')) return '3일반'
  if (sessName.includes('화목') || sessName.includes('2일반')) return '2일반'
  if (sessName.includes('유치부')) return '유치부'
  return sessName
}

function parseTimeMin(t: string | null | undefined): number {
  if (!t) return 9999
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}

export function buildStopSearchResults(
  bothDirGroups: Array<{ group: TimeGroup; dir: 'arr' | 'dep' }>,
  query: string
): StopSearchRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  // key: `${stopName}||${busName}||${dir}||${sessionLabel}`
  const map = new Map<string, StopSearchRow>()

  for (const { group, dir } of bothDirGroups) {
    const sessionLabel = getRunLabel(group.session_name, dir)
    for (const [busName, students] of Object.entries(group.busMap)) {
      for (const s of students) {
        if (!s.location) continue
        const loc = s.location.trim()
        if (!loc.toLowerCase().includes(q)) continue

        const key = `${loc}||${busName}||${dir}||${sessionLabel}`
        if (!map.has(key)) {
          map.set(key, { stopName: loc, busName, dir, sessionLabel, time: s.pickup_time, count: 0 })
        }
        const row = map.get(key)!
        row.count++
        // keep earliest time
        if (s.pickup_time && parseTimeMin(s.pickup_time) < parseTimeMin(row.time)) {
          row.time = s.pickup_time
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    // dep before arr
    if (a.dir !== b.dir) return a.dir === 'dep' ? -1 : 1
    // then by time
    return parseTimeMin(a.time) - parseTimeMin(b.time)
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/stop-search.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/stop-search.ts tests/stop-search.test.ts
git commit -m "feat: add stop-search utility with tests"
```

---

## Task 2: Wire state + useMemo into RouteMapView

**Files:**
- Modify: `app/(campus)/campus/vehicles/RouteMapView.tsx`

The import and two additions go near the existing state block (around line 148).

- [ ] **Step 1: Add import for `buildStopSearchResults` at top of file**

Find the existing imports block at the top of `RouteMapView.tsx` (lines 1–10). Add:

```ts
import { buildStopSearchResults, type StopSearchRow } from '@/lib/utils/stop-search'
```

Add this line immediately after the existing `import Script from 'next/script'` line (line 4).

- [ ] **Step 2: Add state and ref after line 148 (after `kakaoSdkReady` state)**

Find this line (line ~148):
```ts
  const [kakaoSdkReady, setKakaoSdkReady] = useState(false)
```

Add immediately after it:
```ts
  const [stopSearchQuery, setStopSearchQuery] = useState('')
  const highlightMarkerRef = useRef<any>(null)
```

- [ ] **Step 3: Add `stopSearchResults` useMemo after the existing `allStops` useMemo**

Find this block (lines ~468–483):
```ts
  const allStops = useMemo(() => {
    // ...
  }, [bothDirGroups])

  const setStopsCount = allStops.filter(s => coords[s.name]).length
```

Add the new useMemo between `allStops` and `setStopsCount`:
```ts
  const stopSearchResults = useMemo<StopSearchRow[]>(
    () => buildStopSearchResults(bothDirGroups, stopSearchQuery),
    [bothDirGroups, stopSearchQuery]
  )
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors related to the new code.

- [ ] **Step 5: Commit**

```bash
git add app/(campus)/campus/vehicles/RouteMapView.tsx
git commit -m "feat: wire stop-search state and memo into RouteMapView"
```

---

## Task 3: Add search overlay UI

**Files:**
- Modify: `app/(campus)/campus/vehicles/RouteMapView.tsx` (JSX section)

The overlay goes inside the map div (`<div className="flex-1 relative rounded-2xl overflow-hidden ...">` at line 1669), after the existing map canvas `<div ref={mapContainerRef} .../>` at line 1677.

- [ ] **Step 1: Add helper `handleStopResultClick` function**

Find the comment `// ── 검색 함수들` (around line 1074). Add a new function just before it:

```ts
  function handleStopResultClick(row: StopSearchRow) {
    const coord = coords[row.stopName]
    if (!coord || !mapRef.current) return
    const kakao = (window as any).kakao
    if (!kakao?.maps) return

    // Pan map to stop
    mapRef.current.panTo(new kakao.maps.LatLng(coord.lat, coord.lng))

    // Remove previous highlight
    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.setMap(null)
      highlightMarkerRef.current = null
    }

    // Place animated highlight overlay
    const busIdx = buses.findIndex(b => b.name === row.busName)
    const color = getBusColor(row.busName, busIdx)

    const content = document.createElement('div')
    content.style.cssText = `
      width:40px;height:40px;border-radius:50%;
      border:3px solid ${color};
      animation:pulse-ring 1.2s ease-out infinite;
      pointer-events:none;
    `
    // Inject keyframe if not already present
    if (!document.getElementById('stop-search-pulse-style')) {
      const style = document.createElement('style')
      style.id = 'stop-search-pulse-style'
      style.textContent = `@keyframes pulse-ring{0%{transform:scale(0.8);opacity:1}100%{transform:scale(2.2);opacity:0}}`
      document.head.appendChild(style)
    }

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(coord.lat, coord.lng),
      content,
      zIndex: 500,
    })
    overlay.setMap(mapRef.current)
    highlightMarkerRef.current = overlay

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (highlightMarkerRef.current === overlay) {
        overlay.setMap(null)
        highlightMarkerRef.current = null
      }
    }, 3000)
  }
```

- [ ] **Step 2: Add the overlay JSX after `<div ref={mapContainerRef} ... />` (line 1677)**

Find:
```tsx
        <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
```

Add immediately after it:
```tsx
        {/* ── 정류장 검색 오버레이 — 지도 우상단 */}
        <div className="absolute top-3 right-3 z-[1000] w-72 pointer-events-auto">
          <div className="bg-white rounded-2xl shadow-lg border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                placeholder="정류장 검색..."
                value={stopSearchQuery}
                onChange={e => setStopSearchQuery(e.target.value)}
                className="flex-1 text-xs outline-none text-[#0F172A] placeholder-[#CBD5E1] bg-transparent"
              />
              {stopSearchQuery && (
                <button
                  onClick={() => {
                    setStopSearchQuery('')
                    if (highlightMarkerRef.current) {
                      highlightMarkerRef.current.setMap(null)
                      highlightMarkerRef.current = null
                    }
                  }}
                  className="text-[#CBD5E1] hover:text-[#94A3B8] text-sm leading-none font-bold shrink-0">×</button>
              )}
            </div>

            {stopSearchQuery.trim() && (
              <div className="border-t border-[#F1F5F9] max-h-72 overflow-y-auto">
                {stopSearchResults.length === 0 ? (
                  <p className="text-xs text-[#CBD5E1] text-center py-4">일치하는 정류장 없음</p>
                ) : (
                  <>
                    {/* Group rows by stopName */}
                    {Array.from(new Set(stopSearchResults.map(r => r.stopName))).map(stopName => {
                      const rows = stopSearchResults.filter(r => r.stopName === stopName)
                      const hasCoord = !!coords[stopName]
                      return (
                        <div key={stopName} className="px-3 pt-2.5 pb-1.5 border-b border-[#F8FAFC] last:border-b-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[10px] font-bold text-[#0F172A]">{stopName}</span>
                            {!hasCoord && (
                              <span className="text-[9px] text-[#F59E0B] bg-[#FFFBEB] px-1.5 py-0.5 rounded font-semibold">좌표 미설정</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {rows.map((row, i) => {
                              const busIdx = buses.findIndex(b => b.name === row.busName)
                              const color = getBusColor(row.busName, busIdx)
                              const dirLabel = row.dir === 'dep' ? '하원' : '등원'
                              const timeStr = row.time
                                ? (() => {
                                    const m = row.time.match(/(\d{1,2}):(\d{2})/)
                                    if (!m) return row.time
                                    let h = parseInt(m[1]); if (h < 8) h += 12
                                    return `${String(h).padStart(2,'0')}:${m[2]}`
                                  })()
                                : '시간미정'
                              return (
                                <button
                                  key={i}
                                  onClick={() => hasCoord && handleStopResultClick(row)}
                                  className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${hasCoord ? 'hover:bg-[#F8FAFC] cursor-pointer' : 'cursor-default opacity-60'}`}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                  <span className="text-[11px] font-bold text-[#1E293B] shrink-0">{row.busName}</span>
                                  <span className="text-[10px] font-semibold shrink-0"
                                    style={{ color: row.dir === 'dep' ? '#2196F3' : '#FF6B35' }}>{dirLabel}</span>
                                  <span className="text-[10px] text-[#64748B] font-mono shrink-0">{timeStr}</span>
                                  <span className="text-[9px] text-[#94A3B8] shrink-0">{row.sessionLabel}</span>
                                  <span className="ml-auto text-[9px] text-[#CBD5E1] shrink-0">{row.count}명</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/(campus)/campus/vehicles/RouteMapView.tsx
git commit -m "feat: add stop search overlay to vehicles map"
```

---

## Task 4: Deploy and verify

- [ ] **Step 1: Deploy to Vercel**

```bash
vercel --prod
```

Expected: Deployment URL printed.

- [ ] **Step 2: Manual verification checklist**

Open https://poly-system.vercel.app/campus/vehicles and verify:

1. Search box appears at top-right of map (not overlapping left panel)
2. Typing "동아청솔" shows matching stop with bus rows (호차, 방향, 시간, 세션, 인원)
3. Clicking a row with coordinates → map pans to that stop + pulse animation appears for ~3 sec
4. Clicking a row with "좌표 미설정" badge → no map action, no error
5. Pressing `×` clears search query and removes highlight
6. Partial match: "청솔" also finds "동아청솔"
7. No interference with existing BusCard overlay (page 2), sidebar panels, or route polylines

- [ ] **Step 3: Commit session update**

```bash
# Update last_session.json then commit
git add last_session.json
git commit -m "chore: update last_session for stop-search feature"
```
