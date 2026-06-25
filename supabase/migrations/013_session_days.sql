-- 013_session_days.sql
-- class_sessions에 수업 요일 컬럼 추가

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS days TEXT;

-- 세션 이름 패턴으로 자동 초기값 설정
UPDATE class_sessions SET days = '월수금' WHERE name LIKE '%월수금%' AND days IS NULL;
UPDATE class_sessions SET days = '화목'   WHERE name LIKE '%화목%'   AND days IS NULL;
-- 나머지(유치부, 매일반 등)는 NULL → 전체 요일로 간주
