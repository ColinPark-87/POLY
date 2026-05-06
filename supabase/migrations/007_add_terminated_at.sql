-- 퇴사일 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS terminated_at DATE;
