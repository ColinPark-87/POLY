-- 차량관리 동시편집 presence + 충돌경고 마이그레이션 (2026-06-17)
-- Supabase SQL Editor에서 수동 실행. presence 블록 → conflict 블록 순서.

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
