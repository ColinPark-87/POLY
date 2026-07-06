-- 019_manual_routes.sql
-- 수동 노선그리기: 지도에 점 찍어 직접 그린 실제 운행 경로. 호차·세션·방향별 좌표점 배열.
-- TMAP 도로경로 대신 실제 노선을 저장해 노선 탭에서 렌더(예상시간은 TMAP 기준 유지).

CREATE TABLE IF NOT EXISTS campus_manual_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL,
  bus_name text NOT NULL,
  session_label text NOT NULL,   -- 세션 베이스 라벨(유치부/매일반/3일반/2일반 등)
  direction text NOT NULL,       -- 'arr' | 'dep'
  points jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [[lat,lng], ...]
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (campus_id, bus_name, session_label, direction)
);

CREATE INDEX IF NOT EXISTS idx_manual_routes_campus ON campus_manual_routes (campus_id);
