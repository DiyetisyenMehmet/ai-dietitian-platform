-- REVIEW ONLY. NOT EXECUTED. Requires an explicit database-role decision.
-- This file proposes DB privileges. It grants no Google Cloud IAM permission.
-- Execute only through the verified isolated staging migration connection.
-- The role stays NOLOGIN; this file contains/generates no password or URL.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';

DO $$
BEGIN
  IF current_database() <> 'diewish_staging'
     OR current_user <> 'diewish_staging_owner' THEN
    RAISE EXCEPTION 'Refusing a database or identity outside isolated staging';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'diewish_staging_app') THEN
    RAISE EXCEPTION 'Existing app role requires review; do not overwrite it';
  END IF;
  IF to_regclass('public.coach_sync_revisions') IS NULL THEN
    RAISE EXCEPTION 'Coach revision migration is missing';
  END IF;
END $$;

CREATE ROLE diewish_staging_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 32;
GRANT CONNECT ON DATABASE diewish_staging TO diewish_staging_app;
GRANT USAGE ON SCHEMA public TO diewish_staging_app;

DO $$
DECLARE item record;
BEGIN
  -- Existing application tables only; no new health access policy, RLS,
  -- user rows, consent, role membership or table ownership changes.
  FOR item IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND pg_get_userbyid(c.relowner) = 'diewish_staging_owner'
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO diewish_staging_app', item.relname);
  END LOOP;
  FOR item IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND pg_get_userbyid(c.relowner) = 'diewish_staging_owner'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO diewish_staging_app', item.relname);
  END LOOP;
  IF has_database_privilege('diewish_staging_app', 'diewish_staging', 'CREATE')
     OR has_schema_privilege('diewish_staging_app', 'public', 'CREATE')
     OR has_table_privilege('diewish_staging_app', 'public._prisma_migrations', 'SELECT')
     OR EXISTS (
       SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
       WHERE r.rolname = 'diewish_staging_app'
     ) THEN
    RAISE EXCEPTION 'Effective privileges exceed the proposed application scope';
  END IF;
END $$;

-- No default privileges on future tables are changed here.
-- A future approved credential step must verify LOGIN/password authentication,
-- direct endpoint/database matching and the current API's normal permissions.
COMMIT;
