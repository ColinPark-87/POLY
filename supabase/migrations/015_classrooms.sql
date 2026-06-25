-- 015_classrooms.sql

CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  account_email TEXT,
  popup_minutes_before INT NOT NULL DEFAULT 2
);

-- RLS
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_classrooms" ON classrooms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 반에 교실 배정 컬럼
ALTER TABLE classes ADD COLUMN IF NOT EXISTS classroom_id TEXT REFERENCES classrooms(id);

-- 중계 캠퍼스 교실 시드 (campus_id는 수동 설정 필요)
-- Supabase SQL Editor에서 SELECT id FROM campuses; 로 확인 후 아래 삽입
-- INSERT INTO classrooms (id, display_name, campus_id) VALUES
--   ('classroom_america', 'America', 'YOUR_CAMPUS_ID'),
--   ('classroom_belgium', 'Belgium', 'YOUR_CAMPUS_ID'),
--   ('classroom_canada',  'Canada',  'YOUR_CAMPUS_ID'),
--   ('classroom_denmark', 'Denmark', 'YOUR_CAMPUS_ID'),
--   ('classroom_england', 'England', 'YOUR_CAMPUS_ID'),
--   ('classroom_france',  'France',  'YOUR_CAMPUS_ID'),
--   ('classroom_germany', 'Germany', 'YOUR_CAMPUS_ID'),
--   ('classroom_hungary', 'Hungary', 'YOUR_CAMPUS_ID'),
--   ('classroom_italy',   'Italy',   'YOUR_CAMPUS_ID'),
--   ('classroom_sweden',  'Sweden',  'YOUR_CAMPUS_ID'),
--   ('classroom_norway',  'Norway',  'YOUR_CAMPUS_ID');
