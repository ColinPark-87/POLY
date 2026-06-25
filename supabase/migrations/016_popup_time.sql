-- 교실별 팝업 정확한 시간 설정 (null이면 수업시작 - popup_minutes_before 계산)
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS popup_time TEXT; -- 'HH:MM' 형식

-- 반별 팝업 정확한 시간 (null이면 교실 설정 상속)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS popup_time TEXT; -- 'HH:MM' 형식
