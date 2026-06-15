# 백업 & 복구 가이드

## 백업 정보 (최신)

| 항목 | 내용 |
|---|---|
| 백업 일시 | 2026-06-15 |
| 백업 커밋 | `6b2aced` |
| 백업 브랜치 | `backup/pre-pwa-ios-20260615` (현재 작업트리 전체 스냅샷) |
| Vercel 롤백 대상 (이 변경 전 라이브) | `dpl_Cn2dXsSY5oLgB3AQWmw44ZE4v3zo` / https://poly-k64l37l0i-colinpark-87s-projects.vercel.app |
| 배포 URL | https://poly-system.vercel.app |
| 백업 이유 | PWA 아이폰 설치 수정(`apple-mobile-web-app-capable` 레거시 태그 추가) 배포 전 상태 보존 |

### 빠른 복구 (이번 배포가 잘못된 경우)

**Vercel 즉시 롤백 (라이브를 이 변경 전으로):**
```bash
cd "C:\Users\user\Desktop\Colin 작업폴더\leave-system"
vercel promote dpl_Cn2dXsSY5oLgB3AQWmw44ZE4v3zo
```

**iOS 변경만 코드에서 되돌리기:**
```bash
git checkout -- app/layout.tsx   # 또는 _archive/backups/layout_v1_pre-apple-capable_20260615.tsx 로 교체
```

**전체 작업트리 스냅샷 확인:**
```bash
git checkout backup/pre-pwa-ios-20260615   # 돌아오기: git checkout vehicle-remote-redesign
```

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
