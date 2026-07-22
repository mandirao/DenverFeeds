/**
 * One-time data migration: Replit Postgres → Supabase Postgres.
 *
 * Copies every app table row-for-row (preserving primary keys), resets serial
 * sequences, and verifies row counts match between source and target.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<replit postgres url> \
 *   TARGET_DATABASE_URL=<supabase postgres url> \
 *   npx tsx scripts/migrate-from-replit.ts
 *
 * Run `npm run db:push` against the target first so the schema exists.
 * Safe to re-run: each table is truncated on the target before copying.
 */
import pg from "pg";

// Parent tables before children (upvotes references users + events).
const TABLES = [
  "users",
  "events",
  "upvotes",
  "playlists",
  "artists",
  "discovered_events",
  "discovered_artists",
  "venues",
  "food_events",
  "art_events",
  "restaurants",
];

const BATCH_SIZE = 500;

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
  }

  const source = new pg.Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
  const target = new pg.Client({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });
  await source.connect();
  await target.connect();

  const results: { table: string; sourceCount: number; targetCount: number }[] = [];

  try {
    // Children are truncated before parents in reverse order via CASCADE.
    for (const table of [...TABLES].reverse()) {
      await target.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }

    for (const table of TABLES) {
      const { rows } = await source.query(`SELECT * FROM "${table}" ORDER BY 1`);
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map((c) => `"${c}"`).join(", ");
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const values: unknown[] = [];
          const placeholders = batch
            .map((row, r) => {
              const ps = columns.map((c, ci) => {
                values.push(row[c]);
                return `$${r * columns.length + ci + 1}`;
              });
              return `(${ps.join(", ")})`;
            })
            .join(", ");
          await target.query(`INSERT INTO "${table}" (${colList}) VALUES ${placeholders}`, values);
        }
        // Bump the serial sequence past the max copied id, if the table has one.
        await target.query(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`,
        ).catch(() => {});
      }

      const [{ count: sourceCount }] = (await source.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows;
      const [{ count: targetCount }] = (await target.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows;
      results.push({ table, sourceCount, targetCount });
      console.log(`${table}: copied ${targetCount}/${sourceCount}`);
    }
  } finally {
    await source.end();
    await target.end();
  }

  console.log("\n=== Verification ===");
  let ok = true;
  for (const r of results) {
    const match = r.sourceCount === r.targetCount;
    ok &&= match;
    console.log(`${match ? "✓" : "✗ MISMATCH"} ${r.table}: source=${r.sourceCount} target=${r.targetCount}`);
  }
  if (!ok) {
    console.error("\nRow counts do NOT match — investigate before cutting over.");
    process.exit(1);
  }
  console.log("\nAll row counts match.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
