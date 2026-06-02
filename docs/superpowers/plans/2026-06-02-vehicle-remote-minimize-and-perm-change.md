# 차량관리 리모컨 최소화 + "앞으로 변경" 권한 정리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (권장) 또는 superpowers:executing-plans 로 task 단위 실행. 각 Step 은 체크박스(`- [ ]`)로 추적.

**Goal:** 모바일(오늘) 탭의 "앞으로 변경" 저장 버그를 고치고 권한별(차량=신청/데스크=즉시적용)로 단일화하며, 지도 리모컨에 수동 최소화 버튼+캡슐 복귀를 추가한다.

**Architecture:** 기존 `RouteMapView.tsx`(지도+리모컨)·`page.tsx`(탭/오늘/모달)·`route.ts`(API) 패턴을 그대로 따른다. 서버에 `clear_override` 액션 1개 추가, 클라이언트 핸들러 1개 권한분기, override 모달의 중복 영구변경 입구 제거, 리모컨 래퍼에 최소화 상태 추가.

**Tech Stack:** Next.js(App Router, 커스텀)·React·Tailwind·Supabase. 배포 Vercel CLI.

**검증 게이트:** 이 지도/모달 UI는 자동 테스트 하네스가 없음 → 각 task 끝에 `npx tsc --noEmit` + `npm run build` 통과 + 수동확인. 복구점: 태그 `pre-remote-redesign-20260602`.

**설계 문서:** `docs/superpowers/specs/2026-06-02-vehicle-remote-minimize-and-perm-change-design.md`

---

## 파일 구조

- 수정: `app/api/campus/vehicles/route.ts` — `set_override` 블록 뒤에 `clear_override` 액션 추가
- 수정: `app/(campus)/campus/vehicles/page.tsx` — `handlePermChange` 권한분기+에러처리, 중복 신청폼·죽은코드 제거, 버튼 라벨 권한별
- 수정: `app/(campus)/campus/vehicles/RouteMapView.tsx` — `remoteMinimized` 상태 + 최소화 버튼 + 캡슐 + relayout 의존성

---

## Task 1: 서버 `clear_override` 액션 추가

**Files:** Modify `app/api/campus/vehicles/route.ts` (`set_override` 블록 끝 라인 534 직후)

- [ ] **Step 1: `set_override` 블록 바로 뒤에 `clear_override` 액션 삽입**

`route.ts` 의 다음 코드(534행 `}` 다음, 빈 줄 뒤 `if (action === 'search_students')` 앞)에 추가:

```ts
  if (action === 'clear_override') {
    const { student_id, date, direction } = body
    const { error } = await service.from('pickup_overrides')
      .delete()
      .eq('student_id', student_id).eq('campus_id', campusId)
      .eq('date', date).eq('direction', direction)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

```

- [ ] **Step 2: 빌드 게이트**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (exit 0)

- [ ] **Step 3: Commit**

```bash
git add "app/api/campus/vehicles/route.ts"
git commit -m "feat(vehicles): add clear_override action (delete today override)"
```

---

## Task 2: `handlePermChange` 권한 분기 + 저장 버그 수정

**Files:** Modify `app/(campus)/campus/vehicles/page.tsx` (`handlePermChange` 520-541)

- [ ] **Step 1: `handlePermChange` 함수 전체 교체**

기존 520-541행 함수를 아래로 교체:

```tsx
  async function handlePermChange() {
    if (!overrideModal || !overrideBus || permDays.length === 0) return
    const finalLoc = overrideLocMode === 'new' ? overrideLocNew : overrideLoc
    setSaving(true)

    // 차량선생님: 직접 변경 금지 → 변경 신청만 접수 (데스크 승인 후 반영)
    if (vehiclesRestricted) {
      const res = await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_change_request',
          student_id: overrideModal.student.student_id,
          student_name: overrideModal.student.name,
          class_id: overrideModal.student.class_id,
          direction: todayDir,
          from_bus: overrideModal.bus || null,
          to_bus: overrideBus,
          days: permDays,
          location: finalLoc || undefined,
          pickup_time: overrideTime || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok || d.error) { alert(`신청 실패: ${d.error ?? res.status}`); return }
      closeOverrideModal()
      setPendingCount(c => c + 1)
      alert('변경 신청이 접수되었습니다. 데스크 승인 후 반영됩니다.')
      return
    }

    // 데스크 직원: 즉시 영구 적용
    if (!overrideModal.student.class_id) {
      setSaving(false); alert('class_id 누락 — 새로고침 후 다시 시도해주세요.'); return
    }
    const res = await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_enrollment_schedule',
        student_id: overrideModal.student.student_id,
        class_id: overrideModal.student.class_id,
        direction: todayDir,
        days: permDays,
        bus_name: overrideBus,
        old_bus_name: overrideModal.bus || undefined,
        location: finalLoc,
        pickup_time: overrideTime,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || d.error) { setSaving(false); alert(`저장 실패: ${d.error ?? res.status}`); return }

    // 오늘 override가 있으면 제거 → 영구변경이 오늘 화면에 즉시 반영 (중복 그림자 제거)
    if (overrideModal.student.override) {
      await fetch('/api/campus/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_override',
          student_id: overrideModal.student.student_id,
          date: selectedDate,
          direction: todayDir,
        }),
      })
    }
    setSaving(false)
    closeOverrideModal()
    loadToday()
  }
```

- [ ] **Step 2: 빌드 게이트**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (이 시점엔 `submitChangeRequest`/`req*` 가 아직 존재해도 무방 — Task 3 에서 제거)

- [ ] **Step 3: Commit**

```bash
git add "app/(campus)/campus/vehicles/page.tsx"
git commit -m "fix(vehicles): perm change checks res.ok; role-split (teacher=request/desk=apply)+clear override"
```

---

## Task 3: 중복 "변경 승인 요청" 폼·죽은 코드 제거 + 버튼 라벨 권한별

**Files:** Modify `app/(campus)/campus/vehicles/page.tsx`

> 주의: 아래 편집은 **라인 번호가 위 Task 와 무관하게 현재 파일 기준**이다. 각 편집 후 다음 편집 전 저장된 파일에서 해당 문자열을 다시 찾는다(라인 이동됨).

- [ ] **Step 1: "영구 변경 저장" 버튼 라벨을 권한별로**

찾기(현재 1473-1476 근처):

```tsx
                  <button onClick={handlePermChange} disabled={saving || permDays.length===0 || !overrideBus}
                    className="w-full bg-[#10B981] text-white py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                    {saving ? '저장 중...' : '영구 변경 저장'}
                  </button>
```

교체:

```tsx
                  <button onClick={handlePermChange} disabled={saving || permDays.length===0 || !overrideBus}
                    className="w-full bg-[#10B981] text-white py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                    {saving ? '처리 중...' : (vehiclesRestricted ? '변경 신청 (데스크 승인)' : '영구 변경 저장')}
                  </button>
```

- [ ] **Step 2: 안내 문구도 권한별로**

찾기(현재 1460 근처):

```tsx
                  <p className="text-[10px] font-bold text-[#15803D]">적용 요일 선택 후 영구 변경</p>
```

교체:

```tsx
                  <p className="text-[10px] font-bold text-[#15803D]">{vehiclesRestricted ? '적용 요일 선택 후 변경 신청' : '적용 요일 선택 후 영구 변경'}</p>
```

- [ ] **Step 3: 중복 "변경 승인 요청" 섹션 전체 제거**

찾기 — 아래 블록 전체(현재 1494-1562, `{/* 변경 승인 요청 섹션 */}` 부터 닫는 `)}` 까지)를 **삭제**:

```tsx
              {/* 변경 승인 요청 섹션 */}
              <div className="border-t border-[#E2E8F0] pt-3 mt-1">
                <button
                  onClick={() => setReqFormOpen(o => !o)}
                  className="w-full text-left text-xs font-semibold text-[#004EA2] flex items-center gap-1.5 py-1">
                  📋 변경 승인 요청 {reqFormOpen ? '▲' : '▼'}
                </button>
                {reqFormOpen && (
```

…부터 그 섹션을 닫는 다음 지점까지:

```tsx
                    </button>
                  </div>
                )}
              </div>
```

> 정확 경계: `{/* 변경 승인 요청 섹션 */}` 주석이 붙은 `<div className="border-t border-[#E2E8F0] pt-3 mt-1">` 부터, `submitChangeRequest` 제출 버튼을 감싼 `{reqFormOpen && ( ... )}` 의 닫힘과 그 바깥 `</div>` 까지 한 덩어리를 제거한다. 바로 아래 줄은 `</div>`(모달 본문 닫기) 여야 한다.

- [ ] **Step 4: `submitChangeRequest` 함수 제거**

찾기 — 아래 함수 전체(현재 632-653)를 삭제:

```tsx
  async function submitChangeRequest() {
    if (!reqStudent || !reqBus || reqDays.length === 0) return
    setSaving(true)
    await fetch('/api/campus/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_change_request',
        student_id: reqStudent.student_id,
        student_name: reqStudent.name,
        class_id: reqStudent.class_id,
        direction: todayDir,
        from_bus: overrideModal?.bus || null,
        to_bus: reqBus,
        days: reqDays,
        note: reqNote || undefined,
      }),
    })
    setSaving(false)
    setReqFormOpen(false); setReqBus(''); setReqDays([]); setReqNote('')
    setPendingCount(c => c + 1)
    alert('변경 요청이 제출되었습니다.')
  }
```

- [ ] **Step 5: 죽은 `req*` 상태 5줄 제거**

찾기(현재 253-257)하여 **삭제**:

```tsx
  const [reqFormOpen, setReqFormOpen] = useState(false)
  const [reqBus, setReqBus] = useState('')
  const [reqDays, setReqDays] = useState<string[]>([])
  const [reqNote, setReqNote] = useState('')
  const [reqStudent, setReqStudent] = useState<StudentEntry | null>(null)
```

- [ ] **Step 6: `closeOverrideModal` 의 req 초기화 줄 제거**

찾기(현재 408):

```tsx
    setReqFormOpen(false); setReqBus(''); setReqDays([]); setReqNote('')
```

→ 이 줄 **삭제**. (함수에 다른 줄이 남아 빈 함수가 되지 않는지 확인 — `setOverrideModal(null)` 등 위 줄들은 유지)

- [ ] **Step 7: `openOverrideModal` 의 req 설정 2줄 제거**

찾기(현재 420-421):

```tsx
    setReqFormOpen(false); setReqBus(''); setReqDays([...student.days]); setReqNote('')
    setReqStudent(student)
```

→ 두 줄 모두 **삭제**.

- [ ] **Step 8: 빌드 게이트 (죽은 코드 없음 확인)**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공 (eslint `no-unused-vars` 에러 없음 — req* 전부 제거됨).

- [ ] **Step 9: Commit**

```bash
git add "app/(campus)/campus/vehicles/page.tsx"
git commit -m "refactor(vehicles): remove duplicate change-request form; single role-based 앞으로 변경 entry"
```

---

## Task 4: 리모컨 최소화 버튼 + 선택요약 캡슐 (자동축소 제외)

**Files:** Modify `app/(campus)/campus/vehicles/RouteMapView.tsx`

- [ ] **Step 1: `remoteMinimized` 상태 + localStorage 동기화 추가**

찾기(현재 236-241, `remotePos` 선언/로드 블록):

```tsx
  const [remotePos, setRemotePos] = useState<{ x: number; y: number } | null>(null)
  const vehRootRef = useRef<HTMLDivElement>(null)
  const remoteWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { const s = localStorage.getItem('veh-remote-pos'); if (s) setRemotePos(JSON.parse(s)) } catch {}
  }, [])
```

교체(아래로 — `remoteMinimized` 추가):

```tsx
  const [remotePos, setRemotePos] = useState<{ x: number; y: number } | null>(null)
  const [remoteMinimized, setRemoteMinimized] = useState(false)
  const vehRootRef = useRef<HTMLDivElement>(null)
  const remoteWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { const s = localStorage.getItem('veh-remote-pos'); if (s) setRemotePos(JSON.parse(s)) } catch {}
  }, [])
  useEffect(() => {
    try { const s = localStorage.getItem(`veh-remote-min-${campusId ?? 'default'}`); setRemoteMinimized(s === '1') } catch {}
  }, [campusId])
  useEffect(() => {
    try { localStorage.setItem(`veh-remote-min-${campusId ?? 'default'}`, remoteMinimized ? '1' : '0') } catch {}
  }, [remoteMinimized, campusId])
```

- [ ] **Step 2: relayout effect 의존성에 `remoteMinimized` 추가**

찾기(현재 767, 패널 접기/펼치기 relayout effect 의 닫는 의존성):

```tsx
  }, [fullscreen, mapReady])
```

> 주의: 이 `}, [fullscreen, mapReady])` 패턴이 파일에 여러 개 있을 수 있다. **758행 "패널 접기/펼치기 · 전체화면 토글 시 지도 리레이아웃" 주석이 달린 effect** 의 것만 교체할 것(앞뒤로 `mapRef.current?.relayout?.()` 호출이 있는 effect).

교체:

```tsx
  }, [fullscreen, mapReady, remoteMinimized])
```

- [ ] **Step 3: 드래그 그립 헤더에 최소화 버튼 추가**

찾기(현재 3311-3315):

```tsx
        {/* 드래그 그립 — 리모컨 이동 손잡이 */}
        <div onPointerDown={startRemoteDrag} className="flex items-center justify-center gap-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none shrink-0" style={{ touchAction: 'none' }}>
          <span className="text-[#475569] text-[12px] leading-none tracking-widest">⠿⠿</span>
          <span className="text-[#64748B] text-[9px] font-bold">드래그로 이동</span>
        </div>
```

교체:

```tsx
        {/* 드래그 그립 — 리모컨 이동 손잡이 + 최소화 */}
        <div className="flex items-center shrink-0">
          <div onPointerDown={startRemoteDrag} className="flex-1 flex items-center justify-center gap-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
            <span className="text-[#475569] text-[12px] leading-none tracking-widest">⠿⠿</span>
            <span className="text-[#64748B] text-[9px] font-bold">드래그로 이동</span>
          </div>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setRemoteMinimized(true)}
            title="최소화"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-[#5F6368] hover:bg-black/5 text-[15px] leading-none">−</button>
        </div>
```

- [ ] **Step 4: 캡슐 삽입 + 전체 카드를 `{!remoteMinimized && (...)}` 로 감싸기 (열기)**

찾기(현재 3306-3309):

```tsx
      <div ref={remoteWrapRef} className="absolute flex z-[1100]"
        style={{ ...(remotePos ? { left: remotePos.x, top: remotePos.y } : { right: 8, top: 8 }), maxHeight: 'calc(100% - 16px)' }}>
      {/* ── 우측 리모컨 (구글 라이트 셸 — 모드 탭 + 본문 한 덩어리) */}
      <div className="flex flex-col gap-2 shrink-0 overflow-hidden rounded-2xl border border-[#DADCE0]" style={{ width: 320, height: (sidebarPage === 1 || sidebarPage === 3) ? undefined : 'min(560px, calc(100vh - 190px))', background: '#FFFFFF', padding: 6, boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
```

교체(캡슐 추가 + 카드 앞에 `{!remoteMinimized && (`):

```tsx
      <div ref={remoteWrapRef} className="absolute flex z-[1100]"
        style={{ ...(remotePos ? { left: remotePos.x, top: remotePos.y } : { right: 8, top: 8 }), maxHeight: 'calc(100% - 16px)' }}>
      {/* ── 최소화 캡슐 (선택 요약 + 펼치기) */}
      {remoteMinimized && (
        <div className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white pl-3 pr-1.5 py-1.5 shrink-0"
          style={{ boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
          <div onPointerDown={startRemoteDrag} className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'none' }}>
            <span className="text-[#475569] text-[11px] leading-none tracking-widest">⠿</span>
            <span className="text-[12px] font-black text-[#202124] whitespace-nowrap">
              {sidebarPage === 1
                ? (selectedSession
                    ? `🗺️ ${selectedSession} · ${dir === 'arr' ? '등원' : '하원'}${selectedBuses.length ? ` · ${allSelected ? `전체 ${sessionBuses.length}호차` : selectedBuses.join(',')}` : ''}`
                    : '🗺️ 세션 선택')
                : sidebarPage === 2 ? '📅 오늘'
                : sidebarPage === 3 ? '🔁 변경'
                : sidebarPage === 4 ? '📍 탑승장소설정'
                : '🚌 호차설정'}
            </span>
          </div>
          <button onClick={() => setRemoteMinimized(false)} title="펼치기"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#1A73E8] hover:bg-[#E8F0FE] text-[13px] leading-none">▢</button>
        </div>
      )}
      {/* ── 우측 리모컨 (구글 라이트 셸 — 모드 탭 + 본문 한 덩어리) */}
      {!remoteMinimized && (
      <div className="flex flex-col gap-2 shrink-0 overflow-hidden rounded-2xl border border-[#DADCE0]" style={{ width: 320, height: (sidebarPage === 1 || sidebarPage === 3) ? undefined : 'min(560px, calc(100vh - 190px))', background: '#FFFFFF', padding: 6, boxShadow: '0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)' }}>
```

- [ ] **Step 5: 감싼 카드 닫기 `)}` 추가**

찾기(현재 3924-3926 — 카드 닫기 `</div>` + 래퍼 닫기 `</div>` + vehRoot 닫기 `</div>`):

```tsx
      </div>
      </div>
    </div>
```

교체(카드 닫는 `</div>` 다음에 `)}` 삽입):

```tsx
      </div>
      )}
      </div>
    </div>
```

> 검증: 첫 `</div>`(들여쓰기 6칸)는 리모컨 카드(`flex flex-col gap-2 ...`, Step4에서 `{!remoteMinimized && (` 로 연 것)의 닫힘, 그 뒤 `)}`, 다음 `</div>`(6칸)는 `remoteWrapRef`(3306) 닫힘, 마지막 `</div>`(4칸)는 `vehRootRef`(2724) 닫힘. 들여쓰기로 짝을 확인할 것.

- [ ] **Step 6: 빌드 게이트**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 7: Commit**

```bash
git add "app/(campus)/campus/vehicles/RouteMapView.tsx"
git commit -m "feat(vehicles): remote minimize button + selection-summary capsule"
```

---

## Task 5: 수동 검증 + 배포

- [ ] **Step 1: 로컬 수동 왕복 (`npm run dev`)**

확인 항목:
1. 시스템(지도) 탭 → 리모컨 헤더 `−` 클릭 → 캡슐로 축소(선택 요약 표시) → `▢` 클릭 → 원래 리모컨 복귀. 새로고침 후 최소화 상태·드래그 위치 유지.
2. 데스크 계정(무제한) → 모바일 탭 → 학생 클릭 → "앞으로 변경" → 요일 선택 → "영구 변경 저장" → 모달 닫히고 오늘 화면에 즉시 반영(오늘 override 있던 학생 포함).
3. 차량선생님 계정(`vehiclesRestricted`) → 같은 경로 → 버튼이 "변경 신청 (데스크 승인)" 으로 표기 → 클릭 → "신청 접수" alert, 즉시 적용 안 됨. 데스크 계정 변경탭에서 승인 → 스케줄 반영(중복행 없음).
4. 저장 실패 유도(예: 세션 시간 규칙 위반 시간 입력) → `alert(저장 실패...)` 뜨고 **모달 유지**(silent 실패 없음).

- [ ] **Step 2: 배포 (사용자 확인 후)**

```bash
vercel --prod --yes
```

문제 시: Vercel 대시보드 즉시 롤백, 또는 `git reset --hard pre-remote-redesign-20260602` 후 재배포.

- [ ] **Step 3: `last_session.json` 업데이트** (CLAUDE.md /session-update 규칙)

---

## Self-Review 메모

- **스펙 커버리지:** A.리모컨최소화(Task4)·B.권한분기(Task2)·C.저장버그(Task2 res.ok/class_id)·D.clear_override(Task1)·submit_change_request location/time 전송(Task2)·중복폼제거(Task3) 모두 task 존재.
- **타입 일관성:** `clear_override` body = `{student_id,date,direction}` (Task1 서버 ↔ Task2 클라 동일). `submit_change_request` 에 `location`/`pickup_time` 추가 — 서버 insert(route.ts:713-717)가 이미 받음. `vehiclesRestricted`·`pendingCount`·`selectedDate`·`todayDir` 모두 page.tsx 기존 상태.
- **죽은 코드:** Task3 에서 `submitChangeRequest`+`req*` 5상태+참조 3곳 제거 → eslint no-unused-vars 통과. `pendingCount` 는 restricted 경로에서 계속 사용하므로 유지.
- **위험:** Task4 Step5 의 `)}` 위치가 핵심. 들여쓰기 짝으로 검증. 빌드 실패 시 닫힘 위치 재확인.
