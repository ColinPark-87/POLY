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

-- == Conflict (optimistic concurrency) ==
alter table public.campus_stop_coords     add column if not exists updated_by text;
alter table public.class_enrollments       add column if not exists updated_at timestamptz not null default now();
alter table public.class_enrollments       add column if not exists updated_by text;
alter table public.campus_buses            add column if not exists updated_at timestamptz not null default now();
alter table public.campus_buses            add column if not exists updated_by text;
alter table public.campus_registered_stops add column if not exists updated_at timestamptz not null default now();
alter table public.campus_registered_stops add column if not exists updated_by text;

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['class_enrollments','campus_buses','campus_registered_stops','campus_stop_coords']
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format('create trigger trg_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
