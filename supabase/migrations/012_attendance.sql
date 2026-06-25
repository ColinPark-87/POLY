-- supabase/migrations/012_attendance.sql

-- 반+날짜 단위 출석 세션
CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by TEXT CHECK (completed_by IN ('teacher', 'counselor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, session_date)
);

-- 학생별 출결 기록
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES campus_students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')) DEFAULT 'present',
  pre_marked BOOLEAN NOT NULL DEFAULT false,
  recorded_by TEXT CHECK (recorded_by IN ('teacher', 'counselor')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attendance_session_id, student_id)
);

-- 교실 PC 등록
CREATE TABLE smartboard_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id)
);

-- RLS
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartboard_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_attendance_sessions" ON attendance_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_attendance_records" ON attendance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_smartboard_devices" ON smartboard_devices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
