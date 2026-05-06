-- Migration: 005 — 학생 전화번호 + 버스 기사 정보 추가
-- Supabase 대시보드 SQL 에디터에서 실행

-- 1. campus_students에 phone 컬럼 추가
ALTER TABLE campus_students ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. campus_buses에 기사/안전교사 정보 추가
ALTER TABLE campus_buses
  ADD COLUMN IF NOT EXISTS driver        TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone  TEXT,
  ADD COLUMN IF NOT EXISTS safety        TEXT,
  ADD COLUMN IF NOT EXISTS safety_phone  TEXT,
  ADD COLUMN IF NOT EXISTS kt_name       TEXT,
  ADD COLUMN IF NOT EXISTS kt_phone      TEXT;
