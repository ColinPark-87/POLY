-- Migration: 006 — pickup_overrides에 탑승지/시간 컬럼 추가
-- Supabase 대시보드 SQL 에디터에서 실행

ALTER TABLE pickup_overrides
  ADD COLUMN IF NOT EXISTS location    TEXT,
  ADD COLUMN IF NOT EXISTS pickup_time TEXT;
