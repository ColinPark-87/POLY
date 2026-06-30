# 백업 & 복구 가이드

## 백업 정보 (최신)

| 항목 | 내용 |
|---|---|
| 백업 일시 | 2026-06-30 (차량관리 '호차별 정류장' 탭 신설[중계 전용] + 로그인 컴퓨터 다운로드 세팅 삭제) |
| 백업 브랜치 | `backup/pre-busstop-tab-20260630` (=커밋 `29d7a3e`, 직전 라이브) |
| 변경 커밋 | `d8ea76f` (호차별 정류장 탭) |
| Vercel 롤백 대상 (직전 라이브) | `poly-gxfkflq58-colinpark-87s-projects.vercel.app` |
| 현재 라이브 | `dpl_HTvFzaYxt8XDTEZu3Lm9nEnyPLGX` / https://poly-system.vercel.app (2026-06-30) |
| 롤백 방법 | `vercel promote poly-gxfkflq58-colinpark-87s-projects.vercel.app` 또는 `git checkout backup/pre-busstop-tab-20260630` 후 재배포 |
| DB 의존 | 없음(스키마 변경 없음). 기존 `campus_registered_stops`/`class_enrollments` 사용. 시간 저장 시 `bulk_update_location_time`이 학생 스케줄 시간 실제 변경 |

### (이전) 2026-06-18 백업 정보
| 항목 | 내용 |
|---|---|
| 백업 일시 | 2026-06-18 (정류장명 변경 ✅해결완료 — 단계별로그·에러노출 배포) |
| 백업 브랜치 | `backup/pre-stopname-fix-20260618` (직전들: pre-usage-stats / pre-email-sync-fix …) |
| 백업 커밋 | `469fdfb` (정류장명 즉시반영 = 직전 라이브) |
| Vercel 롤백 대상 (직전 라이브) | `dpl_HMs7CwzxTuRAehAp98jDhf7sRn92` (= 정류장명 즉시반영) |
| 최근 배포 (현재 라이브) | `dpl_9EtkdjaTxaH76AZ91xrj7rHejpSC` (정류장명 변경 단계별로그·에러노출, 2026-06-18) / https://poly-system.vercel.app — **✅사용자 확인 "지금 된대"** |
| 롤백 방법 | `vercel promote dpl_HMs7CwzxTuRAehAp98jDhf7sRn92` (즉시 라이브 롤백) 또는 `git checkout backup/pre-stopname-fix-20260618` 후 재배포 |
| DB 의존(이번 배포) | 없음(스키마 변경 없음). 정류장명 변경 PATCH가 단계별 에러를 응답·`[RENAME]` 로그로 노출(향후 디버깅용) |

---
### (이전) 2026-06-16 백업 정보
| 항목 | 내용 |
|---|---|
| 백업 커밋 | 직전 라이브 `254af41` · 수정 `a09a3f7`(호차 시간 전체적용 덮어쓰기) |
| Vercel 롤백 | `poly-qgacg41ep-colinpark-87s-projects.vercel.app` (= dpl 254af41) |
| 데이터 변경(2026-06-16, 버스적용) | campus_buses·class_enrollments(arr/dep_schedule)·class_sessions.time_range·campus_stop_coords (목동매그넷·송도·송파·광명) + campus_students 동(detail_address/address) 4캠 + 광명 비재원 339 삭제. 스냅샷 `_archive/backups/bus-apply-2026-06-16/`(중계 포함)·`gwangmyeong-cleanup-2026-06-16/` |
| 배포 URL | https://poly-system.vercel.app |
| 백업 이유 | 호차 시간 전체적용 버그수정 배포 직전 상태(254af41) 보존 |

### 빠른 복구 (이번 배포가 잘못된 경우)

**Vercel 즉시 롤백 (라이브를 이 변경 전으로):**
```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
vercel promote dpl_FDSXf6dAgymJoMBugfvhqkssxxfg
```

**전체 작업트리 스냅샷으로 돌아가기:**
```bash
git checkout backup/pre-hq-pwd-20260615   # 돌아오기: git checkout vehicle-remote-redesign
```

**개별 파일만 되돌리기 (예시):**
```bash
# 캠퍼스 삭제 라우트 / 반편성 import / HQ 캠퍼스 상세 페이지 등
git checkout 14fc091 -- "app/api/hq/campuses/[id]/route.ts"
# 또는 _archive/backups/*_v1_*_20260615.{ts,tsx} 사본으로 교체
```

> 이전 PWA 백업: 커밋 `6b2aced` / 브랜치 `backup/pre-pwa-ios-20260615` / Vercel `dpl_Cn2dXsSY5oLgB3AQWmw44ZE4v3zo`

---

## 백업 정보 (이전)

| 항목 | 내용 |
|---|---|
| 백업 일시 | 2026-05-11 |
| 백업 커밋 | `0f1af78` |
| 백업 브랜치 | `backup/pre-design-update-20260511` |
| 배포 URL | https://leave-system-eta-ten.vercel.app |
| 백업 이유 | Poly 디자인 시스템 적용 전 현재 상태 보존 |

---

## 복구 방법

### 방법 1 — 브랜치로 되돌리기 (작업 중인 경우)

현재 작업을 버리지 않고 백업 시점 코드를 확인:

```bash
git checkout backup/pre-design-update-20260511
```

원래 master로 돌아오기:

```bash
git checkout master
```

### 방법 2 — master를 백업 시점으로 완전 복구

**주의: 백업 이후 작업이 모두 사라짐**

```bash
git reset --hard 0f1af78
```

### 방법 3 — 특정 파일만 복구

특정 파일 하나만 백업 시점으로 되돌리기:

```bash
git checkout 0f1af78 -- app/(campus)/campus/dashboard/page.tsx
```

---

## Vercel 재배포 (복구 후)

로컬 코드를 복구한 뒤 Vercel에 반영하려면:

```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
vercel --prod
```

---

## 백업 당시 포함된 주요 파일

- 권한부여 시스템 (`lib/permissions.ts`, `lib/auth/routing.ts`)
- 유치부 버스 분류 버그 수정 (유치부 방과후 → 유치부 하원)
- 리다이렉팅 페이지 (`app/redirecting/`)
- 차량 시스템 (`app/(hq)/hq/campuses/[id]/vehicles/`)
- Supabase 마이그레이션 (`supabase/migrations/008_add_kt_teacher.sql`)

---

## 다음 작업: Poly 디자인 적용

백업 완료 후 Poly 디자인 시스템 설치 순서:

1. `0511/claude-code-skill/` 폴더 내용을 `leave-system/` 루트에 복사
2. `claude` 명령으로 Claude Code 실행
3. 프롬프트: `"poly-design 스킬을 사용해서 dashboard 페이지를 Poly 디자인으로 리팩토링해줘. 기능은 그대로."`
