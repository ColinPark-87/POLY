-- 011_lock_rls_service_role.sql
-- ⚠️ 보안 핵심 수정 (CRITICAL): 공개 anon 키로 캠퍼스 학생 PII가 전 캠퍼스에서 노출되는 문제 차단.
--
-- 배경:
--   003_campus_tools.sql / 010_registered_stops.sql 의 정책이
--     CREATE POLICY ... USING (true) WITH CHECK (true)  -- 역할(role) 한정 없음
--   으로 정의되어, PERMISSIVE 정책이 anon · authenticated 까지 모두 적용됨.
--   NEXT_PUBLIC_SUPABASE_ANON_KEY 는 브라우저로 배포되는 공개 키이므로,
--   누구나 프로젝트 URL + anon 키로 이 테이블들을 직접 read/insert/update/delete 가능.
--   (service_role 은 RLS 를 우회하므로, 위 정책은 API 에는 아무 권한도 주지 않고
--    오직 anon/authenticated 의 접근만 넓혀 주는 순수한 보안 구멍이었음.)
--
-- 안전성 검증:
--   앱의 모든 서버 측 접근은 service-role 클라이언트(createServiceClient)를 사용.
--   브라우저 anon 클라이언트(lib/supabase/client.ts)는 로그인(signInWithPassword)에만 쓰이고
--   campus_* / class_* 테이블을 직접 조회하지 않음 → 정책을 service_role 한정으로 좁혀도
--   정상 기능에 영향 없음(동작 보존).
--
-- 적용 방법(이 파일은 자동 실행되지 않습니다):
--   Supabase 대시보드 → SQL Editor 에 본 파일 내용을 붙여넣어 실행하거나,
--   supabase db push 로 마이그레이션을 적용하세요.
--   적용 후, 권한 없는 계정으로 anon 키 직접 쿼리가 거부되는지 1회 확인 권장.

-- 003_campus_tools 의 권한 미한정 정책 → service_role 전용으로 교체
DROP POLICY IF EXISTS "service_all_campus_students"    ON campus_students;
DROP POLICY IF EXISTS "service_all_campus_buses"       ON campus_buses;
DROP POLICY IF EXISTS "service_all_class_sessions"     ON class_sessions;
DROP POLICY IF EXISTS "service_all_classes"            ON classes;
DROP POLICY IF EXISTS "service_all_class_enrollments"  ON class_enrollments;
DROP POLICY IF EXISTS "service_all_pickup_overrides"   ON pickup_overrides;
DROP POLICY IF EXISTS "service_all_class_change_log"   ON class_change_log;
DROP POLICY IF EXISTS "service_all_enrollment_history" ON enrollment_history;

CREATE POLICY "service_all_campus_students"    ON campus_students    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_campus_buses"       ON campus_buses       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_sessions"     ON class_sessions     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_classes"            ON classes            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_enrollments"  ON class_enrollments  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_pickup_overrides"   ON pickup_overrides   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_class_change_log"   ON class_change_log   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_enrollment_history" ON enrollment_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 010_registered_stops 의 권한 미한정 정책 → service_role 전용으로 교체
DROP POLICY IF EXISTS "service_all_campus_registered_stops" ON campus_registered_stops;
CREATE POLICY "service_all_campus_registered_stops" ON campus_registered_stops FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 좌표/스팟 테이블: 마이그레이션 파일에 정의가 없어(대시보드에서 직접 생성된 것으로 보임)
-- 운영 DB 에 동일한 USING(true) 정책이 있을 수 있음. 존재하면 동일하게 좁힘.
-- (테이블/정책이 없으면 IF EXISTS 로 무시되어 안전)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'campus_stop_coords') THEN
    EXECUTE 'ALTER TABLE campus_stop_coords ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "service_all_campus_stop_coords" ON campus_stop_coords';
    EXECUTE 'CREATE POLICY "service_all_campus_stop_coords" ON campus_stop_coords FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'campus_place_spots') THEN
    EXECUTE 'ALTER TABLE campus_place_spots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "service_all_campus_place_spots" ON campus_place_spots';
    EXECUTE 'CREATE POLICY "service_all_campus_place_spots" ON campus_place_spots FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
