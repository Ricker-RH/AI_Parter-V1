-- Reassert safe attributes idempotently even when provisioning pre-created the
-- capability role before the application migration ran.
ALTER ROLE aifans_platform
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
