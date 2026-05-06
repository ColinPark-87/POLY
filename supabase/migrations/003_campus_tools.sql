-- ============================================================
-- 캠퍼스 운영 도구 — 반편성현황 + 등하원관리
-- Supabase SQL Editor에 붙여넣고 실행하세요
-- ============================================================

-- 1. 학생 (캠퍼스별 학원생, 직원과 별개)
CREATE TABLE IF NOT EXISTS campus_students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id     UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,         -- "김도현"
  english_name  TEXT,                  -- "Peter Kim"
  grade         TEXT,                  -- "초등부", "유치부"
  is_active     BOOLEAN NOT NULL DEFAULT true,
  enrolled_at   DATE,
  withdrawn_at  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 차량 (캠퍼스별)
CREATE TABLE IF NOT EXISTS campus_buses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,           -- "1호차", "마미버스", "직접"
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(campus_id, name)
);

-- 3. 반편성 세션 (월별 시간대 묶음)
CREATE TABLE IF NOT EXISTS class_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id   UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,           -- "초등부 매일반"
  time_range  TEXT,                    -- "3:10~4:30"
  month       TEXT NOT NULL,           -- "2026년 4월"
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 반 (세션 내 개별 반)
CREATE TABLE IF NOT EXISTS classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  campus_id   UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,           -- "GT2", "MAG1", "S1"
  room        TEXT,                    -- "Liz", "Christopher"
  teacher     TEXT,                    -- "Emily"
  color       TEXT DEFAULT '#3b82f6',  -- 반 색상
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- 5. 반 수강생 + 버스 스케줄
CREATE TABLE IF NOT EXISTS class_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES campus_students(id) ON DELETE CASCADE,
  campus_id       UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  arr_schedule    JSONB NOT NULL DEFAULT '{}',  -- {"월":"1호차","화":"1호차",...}
  dep_schedule    JSONB NOT NULL DEFAULT '{}',  -- 하원 버스 스케줄
  highlight_color TEXT,                          -- 학생 색상 마킹
  is_waitlist     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(class_id, student_id)
);

-- 6. 오늘 등하원 변경 (당일 override)
CREATE TABLE IF NOT EXISTS pickup_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES campus_students(id) ON DELETE CASCADE,
  campus_id   UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('arr', 'dep')),
  bus_name    TEXT,                    -- 변경된 버스 (NULL = 결석)
  is_absent   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date, direction)
);

-- 7. 반 변경 기록
CREATE TABLE IF NOT EXISTS class_change_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id       UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES campus_students(id),
  student_name    TEXT NOT NULL,
  from_class_id   UUID REFERENCES classes(id),
  from_class_name TEXT,
  to_class_id     UUID REFERENCES classes(id),
  to_class_name   TEXT,
  from_session    TEXT,
  to_session      TEXT,
  changed_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 입퇴소 이력
CREATE TABLE IF NOT EXISTS enrollment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id       UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES campus_students(id),
  student_name    TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('enrolled','withdrawn','transferred')),
  class_id        UUID REFERENCES classes(id),
  class_name      TEXT,
  effective_date  DATE NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_campus_students_campus ON campus_students(campus_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_campus_month ON class_sessions(campus_id, month);
CREATE INDEX IF NOT EXISTS idx_classes_session ON classes(session_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_pickup_overrides_date ON pickup_overrides(campus_id, date);

-- RLS
ALTER TABLE campus_students     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_buses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_overrides    ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_change_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_history  ENABLE ROW LEVEL SECURITY;

-- Service role bypass (API에서 service client 사용)
CREATE POLICY "service_all_campus_students"    ON campus_students    USING (true) WITH CHECK (true);
CREATE POLICY "service_all_campus_buses"       ON campus_buses       USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_sessions"     ON class_sessions     USING (true) WITH CHECK (true);
CREATE POLICY "service_all_classes"            ON classes            USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_enrollments"  ON class_enrollments  USING (true) WITH CHECK (true);
CREATE POLICY "service_all_pickup_overrides"   ON pickup_overrides   USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_change_log"   ON class_change_log   USING (true) WITH CHECK (true);
CREATE POLICY "service_all_enrollment_history" ON enrollment_history  USING (true) WITH CHECK (true);
