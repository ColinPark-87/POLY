# Poly Leave System

폴리어학원 통합 운영 시스템 — 연차·인사·반편성·차량 관리

🌐 **운영**: https://poly-system.vercel.app
🏗️ **스택**: Next.js 16 (App Router) + Supabase + Vercel + Kakao Maps + TMAP + Brevo

## 문서

| 문서 | 내용 |
|---|---|
| [FEATURES.md](./FEATURES.md) | 기능 인벤토리 — 페이지/API/권한 매트릭스 |
| [BUGS.md](./BUGS.md) | 보안·버그 우선순위 리포트 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel/Supabase 배포 가이드 |
| [RESTORE.md](./RESTORE.md) | 데이터 복원 절차 |
| [AGENTS.md](./AGENTS.md) | ⚠️ 이 fork는 표준 Next.js와 다름 |

## 로컬 개발

```bash
npm install
npm run dev
# → http://localhost:3000
```

`.env.local`에 필요한 키:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BREVO_API_KEY=                    # (선택) 이메일 알림
NEXT_PUBLIC_KAKAO_API_KEY=        # 지도
TMAP_API_KEY=                     # 노선 경로
```

## 배포

```bash
npx vercel --prod
```

GitHub 연동 없이 Vercel CLI 직접 배포. 자세한 절차는 [DEPLOYMENT.md](./DEPLOYMENT.md).

## 사용자 그룹

| 그룹 | 진입 화면 | 비고 |
|---|---|---|
| 본사 (`hq_admin`) | `/hq/dashboard` | 전 캠퍼스 통합 |
| 원장 (`campus_admin`) | `/campus/dashboard` | 캠퍼스 풀권한 |
| **부원장** (position) | `/campus/dashboard` | 원장 동등 권한 |
| 캠퍼스 제한 직원 (상담·KT·관리자·POLY안전) | `/campus/class-roster` | 개설반/차량만 |
| 일반 직원 (FT 등) | `/dashboard` | 본인 연차만 |

## 핵심 기능

- **연차 관리** — 신청/승인/캘린더/잔여 매트릭스/Excel 내보내기
- **개설반 현황** — 세션·반·학생 드래그앤드롭, 월별 백업, 담임반 관리
- **차량 관리** — Kakao Maps 노선 지도, TMAP 경로, 호차별 정류장
- **캠퍼스 직원 관리** — 직급·권한 매트릭스, 임시 비밀번호 발급
- **통계 대시보드** — 학생 수, 호차 정원, 연차 사용률

상세는 [FEATURES.md](./FEATURES.md).
