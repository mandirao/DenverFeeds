/**
 * WP2 Package B schema change: nullable created_via provenance on the three
 * event tables, in one transaction.
 *   - Additive: existing rows stay NULL (no backfill).
 *   - Constrained to the known values; NULL allowed.
 *   - Compatible with the WP1 code already deployed (it never names the
 *     column, so its inserts leave it NULL and its reads ignore it).
 *   - No new tables, so the WP1 Data API lockdown (RLS + revoked grants)
 *     already covers these columns.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/migrate-wp2-provenance.ts            # print SQL (dry run)
 *   npx tsx --env-file=.env scripts/migrate-wp2-provenance.ts --apply    # run it
 */
import "dotenv/config";
import { pool } from "../server/db";

export const WP2_PROVENANCE_SQL = `
BEGIN;

ALTER TABLE events      ADD COLUMN IF NOT EXISTS created_via text;
ALTER TABLE food_events ADD COLUMN IF NOT EXISTS created_via text;
ALTER TABLE art_events  ADD COLUMN IF NOT EXISTS created_via text;

DO $provenance$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'food_events', 'art_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_created_via_check') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (created_via IS NULL OR created_via IN (''anonymous'', ''admin'', ''csv'', ''discovery''))',
        t, t || '_created_via_check');
    END IF;
  END LOOP;
END
$provenance$;

COMMIT;
`;

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Dry run — would execute:\n" + WP2_PROVENANCE_SQL);
    console.log("Re-run with --apply to execute.");
    return;
  }
  await pool.query(WP2_PROVENANCE_SQL);
  console.log("WP2 provenance migration applied.");
}

if (process.argv[1]?.endsWith("migrate-wp2-provenance.ts")) {
  main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => pool.end());
}
