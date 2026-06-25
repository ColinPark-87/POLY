-- 스마트보드 교실 변경 코드 (campus별)
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS smartboard_change_code TEXT DEFAULT '7659';
