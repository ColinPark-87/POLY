-- ============================================================
-- 멀티캠퍼스 연차관리시스템 — 초기 스키마
-- Supabase SQL Editor에 붙여넣고 실행하세요
-- ============================================================

-- 1. 캠퍼스
CREATE TABLE campuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  principal_id UUID,                        -- users.id (나중에 FK 추가)
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 사용자
CREATE TABLE users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id        UUID REFERENCES campuses(id),
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  position         TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL CHECK (role IN ('employee','campus_admin','hq_admin')),
  company_hired_at DATE,
  campus_hired_at  DATE,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- principal_id FK (users 생성 후 추가)
ALTER TABLE campuses
  ADD CONSTRAINT campuses_principal_id_fkey
  FOREIGN KEY (principal_id) REFERENCES users(id);

-- 3. 연차 부여 (연도별)
CREATE TABLE leave_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id    UUID NOT NULL REFERENCES campuses(id),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year         INT NOT NULL,
  total_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over NUMERIC(5,1) NOT NULL DEFAULT 0,
  extra_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

-- 4. 연차 신청
CREATE TABLE leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id        UUID NOT NULL REFERENCES campuses(id),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,        -- '연차'|'반차(오전)'|'반차(오후)'|'반반차'|'병가'|'경조사'|'기타'
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  days_used        NUMERIC(5,1) NOT NULL DEFAULT 1,
  reason           TEXT NOT NULL DEFAULT '',
  signature_data_url TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  reviewer_note    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 연차 사용 이력 (날짜 단위)
CREATE TABLE leave_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id        UUID NOT NULL REFERENCES campuses(id),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year             INT NOT NULL,
  date             DATE NOT NULL,
  type             TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('request','excel_import','direct_entry')),
  leave_request_id UUID REFERENCES leave_requests(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. 공휴일
CREATE TABLE holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id  UUID REFERENCES campuses(id),   -- NULL = 전국 공휴일
  date       DATE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. 알림
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX idx_users_campus_id        ON users(campus_id);
CREATE INDEX idx_leave_requests_campus  ON leave_requests(campus_id, status);
CREATE INDEX idx_leave_requests_user    ON leave_requests(user_id);
CREATE INDEX idx_leave_records_user     ON leave_records(user_id, year);
CREATE INDEX idx_leave_grants_user_year ON leave_grants(user_id, year);
CREATE INDEX idx_holidays_date          ON holidays(date);

-- ============================================================
-- RLS 활성화
-- ============================================================
ALTER TABLE campuses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_grants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책
-- ============================================================

-- campuses: 모두 읽기, service_role만 쓰기
CREATE POLICY "campuses_read_all"   ON campuses FOR SELECT USING (true);
CREATE POLICY "campuses_write_service" ON campuses FOR ALL USING (auth.role() = 'service_role');

-- users: 본인 또는 같은 campus_id
CREATE POLICY "users_read_own_campus" ON users FOR SELECT
  USING (
    auth.uid() = id
    OR campus_id IN (
      SELECT campus_id FROM users WHERE id = auth.uid()
    )
  );
CREATE POLICY "users_write_service" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

-- leave_requests: 같은 campus_id
CREATE POLICY "leave_requests_campus" ON leave_requests FOR SELECT
  USING (
    campus_id IN (SELECT campus_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "leave_requests_insert_own" ON leave_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave_requests_write_service" ON leave_requests FOR ALL
  USING (auth.role() = 'service_role');

-- leave_grants: 같은 campus_id
CREATE POLICY "leave_grants_campus" ON leave_grants FOR SELECT
  USING (
    campus_id IN (SELECT campus_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "leave_grants_write_service" ON leave_grants FOR ALL
  USING (auth.role() = 'service_role');

-- leave_records: 같은 campus_id
CREATE POLICY "leave_records_campus" ON leave_records FOR SELECT
  USING (
    campus_id IN (SELECT campus_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "leave_records_write_service" ON leave_records FOR ALL
  USING (auth.role() = 'service_role');

-- holidays: 모두 읽기
CREATE POLICY "holidays_read_all"        ON holidays FOR SELECT USING (true);
CREATE POLICY "holidays_write_service"   ON holidays FOR ALL USING (auth.role() = 'service_role');

-- notifications: 본인만
CREATE POLICY "notifications_own" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_write_service" ON notifications FOR ALL USING (auth.role() = 'service_role');
