# scripts/

Every script here connects to whatever `DATABASE_URL` points at, which in a normal `.env` is the **production** database. Read a script before running it.

## Operations (safe to use as documented)

| Script | Purpose |
|---|---|
| `create-admin.ts` | Creates the admin account or resets its password (hidden prompt). |
| `ai-usage-report.ts` | Read-only: daily AI usage next to events actually created. |
| `migrate-wp1-security.ts` | WP1 schema changes and Supabase Data API lockdown. Dry run by default; idempotent. Already applied. |
| `migrate-wp2-provenance.ts` | WP2 `created_via` provenance columns. Dry run by default; idempotent. Already applied. |

## One-time data migrations (already applied; do not re-run)

These were run once against production and are kept as a record of how the data got its current shape. Most contain hand-reviewed ID lists, so their header comments are the audit trail.

- `migrate-from-replit.ts`: Replit Postgres to Supabase copy (July 2026).
- `backfill-recurrence-rules.ts`, `normalize-recurrence-labels.ts`: structured recurrence for existing series.
- `introduce-topic-tags.ts`, `backfill-topic-tags.ts`, `simplify-topic-tags.ts`, `split-books-talks-category.ts`: Artistry/Nerdistry category and topic-tag redesign.
- `add-holiday-tag.ts`, `add-politics-tag.ts`, `add-sport-tech-tags.ts`, `add-wildlife-tag.ts`: hand-reviewed tag additions.

## Legacy 2025 imports (do not run)

`import-march-april.cjs`, `import-may-events.cjs`, `import-spring-summer-events.cjs`, `populate-august-september.cjs`, `populate-events-all.cjs`, `populate-events.js` and `seed-artists.js` loaded the 2025 music feed from CSV files in `attached_assets/`. That data is already in the database, and much of it has been edited since. Only some of these scripts guard against duplicates, and `populate-events-all.cjs` also deletes rows, so none of them should be run against production again.
