-- Migration: 010 — 빈 정류장 마스터 (학생 배정 없이 정류장만 등록)
-- 좌표는 기존 campus_stop_coords에 그대로 저장 (이 테이블엔 lat/lng 없음)
-- Supabase 대시보드 SQL 에디터에서 실행

CREATE TABLE IF NOT EXISTS campus_registered_stops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id     UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  stop_name     TEXT NOT NULL,
  bus_name      TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('arr', 'dep')),
  default_time  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campus_id, stop_name, bus_name, direction)
);

CREATE INDEX IF NOT EXISTS idx_campus_registered_stops_campus ON campus_registered_stops(campus_id);

ALTER TABLE campus_registered_stops ENABLE ROW LEVEL SECURITY;

-- Service role bypass (API에서 service client 사용) — campus_stop_coords와 동일 스타일
CREATE POLICY "service_all_campus_registered_stops" ON campus_registered_stops USING (true) WITH CHECK (true);
