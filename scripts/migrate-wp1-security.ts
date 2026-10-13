/**
 * WP1 security schema changes, in one transaction:
 *   1. users.role, rate_limit_counters, ai_usage_daily — additive; existing
 *      rows only gain the default role 'visitor'.
 *   2. Supabase Data API lockdown — RLS on (no policies) for every public
 *      table and anon/authenticated grants revoked. The app's role owns the
 *      tables and has BYPASSRLS, so Express is unaffected.
 * Idempotent — safe to re-run. Requires the app's role (table owner).
 *
 * Deliberately hand-written SQL instead of `drizzle-kit push`: push once
 * offered to drop the connect-pg-simple `session` table (see
 * drizzle.config.ts), which would sign everyone out and orphan upvotes.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/migrate-wp1-security.ts            # print SQL (dry run)
 *   npx tsx --env-file=.env scripts/migrate-wp1-security.ts --apply    # run it
 */
import "dotenv/config";
import { pool } from "../server/db";

export const WP1_SECURITY_SQL = `
BEGIN;

-- 1. WP1 schema (additive)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'visitor';

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket text NOT NULL,
  window_key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, window_key)
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day text NOT NULL,
  endpoint text NOT NULL,
  actor text NOT NULL,
  outcome text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, endpoint, actor, outcome)
);

-- 2. Close the Supabase Data API bypass. Express connects as the table
-- owner (postgres, BYPASSRLS), so none of this affects the app; it removes
-- the anon/authenticated (publishable-key) path to every public table.
DO $lockdown$
DECLARE t record;
BEGIN
  -- RLS with no policies: Data API/GraphQL requests see and change nothing.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- Remove the blanket grants too (TRUNCATE/REFERENCES/TRIGGER aren't
  -- governed by RLS), and stop future tables from being auto-granted.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END
$lockdown$;

COMMIT;
`;

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Dry run — would execute:\n" + WP1_SECURITY_SQL);
    console.log("Re-run with --apply to execute.");
    return;
  }
  await pool.query(WP1_SECURITY_SQL);
  console.log("WP1 security migration applied.");
}

if (process.argv[1]?.endsWith("migrate-wp1-security.ts")) {
  main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => pool.end());
}
