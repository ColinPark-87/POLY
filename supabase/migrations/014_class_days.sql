-- 반별 개별 수업 요일 (null = 세션 요일 상속)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS days TEXT;
