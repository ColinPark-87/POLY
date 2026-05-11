-- 008: classes 테이블에 kt_teacher 컬럼 추가
ALTER TABLE classes ADD COLUMN IF NOT EXISTS kt_teacher TEXT;
