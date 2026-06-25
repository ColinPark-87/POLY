-- 교실 임시 팝업: 세팅에서 누르면 해당 반 출석판을 시간 무관 강제 표시
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS force_popup_class_id TEXT;
