-- enrollment_history에 변경자 정보 추가
ALTER TABLE enrollment_history
  ADD COLUMN IF NOT EXISTS changed_by_id   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS changed_by_name TEXT;
