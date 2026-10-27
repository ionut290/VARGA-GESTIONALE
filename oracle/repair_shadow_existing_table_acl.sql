-- Minimal existing-table privileges for shadow; no schema CREATE.
-- First inspect the role and its rights; change only after verified.
BEGIN;
DO $$
DECLARE target_role text := 'varga_reader';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=target_role AND rolcanlogin)
 THEN RAISE EXCEPTION 'Expected role missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public'
   AND tablename='varga_gestionale_shadow' AND tableowner='varga')
 THEN RAISE EXCEPTION 'Shadow table owner mismatch'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO varga_reader;
GRANT SELECT,INSERT,UPDATE ON TABLE public.varga_gestionale_shadow TO varga_reader;
COMMIT;
