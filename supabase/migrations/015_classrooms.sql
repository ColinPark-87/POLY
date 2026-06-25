-- 015_classrooms.sql

CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,             -- 'classroom_a' ~ 'classroom_j'
  display_name TEXT NOT NULL,      -- 'A' ~ 'J'
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  account_email TEXT,              -- 스마트보드 PC 계정 이메일
  popup_minutes_before INT NOT NULL DEFAULT 2  -- 팝업 시작 시간 (분 전)
);

-- 중계 캠퍼스 시드 (campus name 기준 자동 매칭)
DO $$
DECLARE v_campus_id UUID;
BEGIN
  SELECT id INTO v_campus_id FROM campuses WHERE name LIKE '%중계%' LIMIT 1;
  IF v_campus_id IS NOT NULL THEN
    INSERT INTO classrooms (id, display_name, campus_id) VALUES
      ('classroom_a', 'A', v_campus_id),
      ('classroom_b', 'B', v_campus_id),
      ('classroom_c', 'C', v_campus_id),
      ('classroom_d', 'D', v_campus_id),
      ('classroom_e', 'E', v_campus_id),
      ('classroom_f', 'F', v_campus_id),
      ('classroom_g', 'G', v_campus_id),
      ('classroom_h', 'H', v_campus_id),
      ('classroom_i', 'I', v_campus_id),
      ('classroom_j', 'J', v_campus_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- RLS
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_classrooms" ON classrooms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 반에 교실 배정 컬럼
ALTER TABLE classes ADD COLUMN IF NOT EXISTS classroom_id TEXT REFERENCES classrooms(id);
