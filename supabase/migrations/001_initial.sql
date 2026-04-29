-- ============================================================
-- 캠퍼스
-- ============================================================
CREATE TABLE IF NOT EXISTS campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 사용자
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  position text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee', 'campus_admin', 'hq_admin')),
  company_hired_at date,
  campus_hired_at date,
  is_active boolean DEFAULT true,
  needs_password_change boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 연차 부여 (연도별)
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year int NOT NULL,
  total_days numeric(4,1) NOT NULL DEFAULT 0,
  carried_over numeric(4,1) NOT NULL DEFAULT 0,
  extra_days numeric(4,1) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year)
);

-- ============================================================
-- 연차 신청
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('annual','half_am','half_pm','quarter','sick','event','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_used numeric(4,1) NOT NULL,
  reason text,
  signature_data_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 연차 사용 이력 (날짜 단위)
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year int NOT NULL,
  date date NOT NULL,
  type text NOT NULL,
  source text NOT NULL DEFAULT 'request'
    CHECK (source IN ('request','excel_import','direct_entry')),
  leave_request_id uuid REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 공휴일 (campus_id NULL = 전국 공휴일)
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_campus ON leave_requests(campus_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_records_user_year ON leave_records(user_id, year);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- campuses: 인증된 사용자는 본인 캠퍼스 정보 읽기
CREATE POLICY "campus_read_own" ON campuses FOR SELECT
  USING (
    id IN (SELECT campus_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'hq_admin')
  );

-- users: 같은 캠퍼스 직원끼리 읽기 허용
CREATE POLICY "users_read_same_campus" ON users FOR SELECT
  USING (
    campus_id IN (SELECT campus_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'hq_admin')
  );

CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- leave_grants: 본인 읽기 + campus_admin 전체 읽기
CREATE POLICY "leave_grants_read" ON leave_grants FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
      AND (role IN ('campus_admin','hq_admin') OR campus_id = leave_grants.campus_id)
    )
  );

-- leave_requests: 본인 읽기/쓰기 + campus_admin 캠퍼스 전체 읽기
CREATE POLICY "leave_requests_read" ON leave_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (u.role = 'hq_admin' OR (u.role = 'campus_admin' AND u.campus_id = leave_requests.campus_id))
    )
  );

CREATE POLICY "leave_requests_insert_own" ON leave_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- leave_records: 본인 읽기 + campus_admin 전체 읽기
CREATE POLICY "leave_records_read" ON leave_records FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND (u.role = 'hq_admin' OR (u.role = 'campus_admin' AND u.campus_id = leave_records.campus_id))
    )
  );

-- holidays: 인증 사용자 전체 읽기
CREATE POLICY "holidays_read" ON holidays FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- JWT Custom Claim Hook
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (event->>'user_id')::uuid;
  RETURN jsonb_set(
    jsonb_set(event, '{claims,user_role}', to_jsonb(COALESCE(v_user.role, 'employee'))),
    '{claims,campus_id}',
    to_jsonb(COALESCE(v_user.campus_id::text, ''))
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- 샘플 데이터 (개발용)
-- ============================================================
INSERT INTO campuses (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', '중계캠퍼스', 'jungye')
ON CONFLICT DO NOTHING;
