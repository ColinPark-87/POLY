# Vercel 배포 가이드

## 1. 사전 준비

### Supabase 프로젝트 설정

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. `supabase/migrations/` 폴더의 SQL 마이그레이션 파일을 순서대로 실행
   - Supabase Dashboard → SQL Editor에서 실행
3. Authentication → Settings에서:
   - Email auth 활성화
   - Site URL을 Vercel 배포 URL로 설정 (e.g. `https://your-app.vercel.app`)
   - Redirect URLs에 `https://your-app.vercel.app/**` 추가
4. Project Settings → API에서 아래 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Brevo 이메일 설정

1. [brevo.com](https://brevo.com) 에서 계정 생성 (무료 플랜: 월 9,000건)
2. Settings → SMTP & API → API Keys에서 API key 생성
3. Senders & IP → Senders에서 발신자 이메일 인증

---

## 2. Vercel 배포

### 방법 A: Vercel CLI (터미널)

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 루트에서 배포
cd leave-system
vercel

# 프로덕션 배포
vercel --prod
```

### 방법 B: GitHub 연동 (권장)

1. GitHub에 레포지토리 push
2. [vercel.com](https://vercel.com) → New Project → GitHub 레포 선택
3. Framework: Next.js (자동 감지)
4. Build Command: `next build` (기본값)
5. Output Directory: `.next` (기본값)
6. 환경변수 설정 후 Deploy 클릭

---

## 3. 환경변수 설정

Vercel Dashboard → Project → Settings → Environment Variables에서 아래 7개 변수 입력:

| 변수명 | 예시 값 | 설명 |
|--------|---------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Supabase service_role key (서버 전용) |
| `BREVO_API_KEY` | `xkeysib-...` | Brevo API key |
| `SYSTEM_EMAIL_FROM` | `noreply@yourdomain.com` | 발신자 이메일 |
| `SYSTEM_EMAIL_NAME` | `연차관리시스템` | 발신자 이름 |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | 배포된 앱 URL (이메일 링크에 사용) |

> **주의**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 `NEXT_PUBLIC_` prefix를 붙이지 말 것.
> 클라이언트에 노출되면 모든 RLS를 우회할 수 있음.

---

## 4. 초기 데이터 설정

배포 후 Supabase SQL Editor에서:

```sql
-- HQ 관리자 계정 생성 (Supabase Auth에서 먼저 유저 생성 후 아래 실행)
INSERT INTO users (id, campus_id, email, name, position, role, is_active)
VALUES (
  '<supabase-auth-user-id>',
  NULL,
  'hq@yourdomain.com',
  'HQ 관리자',
  '관리자',
  'hq_admin',
  true
);
```

---

## 5. 배포 확인

- `/login` — 로그인 페이지
- `/app/dashboard` — 직원 대시보드 (employee 계정)
- `/campus/dashboard` — 캠퍼스 원장 대시보드 (campus_admin 계정)
- `/hq/dashboard` — HQ 대시보드 (hq_admin 계정)

---

## 6. 커스텀 도메인 (선택)

Vercel Dashboard → Project → Settings → Domains에서 커스텀 도메인 추가.
도메인 추가 후 Supabase Site URL과 Redirect URL도 업데이트 필요.
