/**
 * Read-only report: daily AI usage by outcome next to the number of events
 * actually created that day. A spike in anonymous parses (or limit hits)
 * without matching new events is the abuse signal to look for.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/ai-usage-report.ts [days=14]
 */
import "dotenv/config";
import { pool } from "../server/db";
import { aiLimits } from "../server/ai-guard";
import { denverDayKey } from "../server/rate-limit";

async function main() {
  const days = Math.max(1, Number(process.argv[2]) || 14);

  const { rows: usage } = await pool.query(
    `SELECT day,
            SUM(count) FILTER (WHERE actor = 'anonymous' AND outcome = 'succeeded')    AS anon_ok,
            SUM(count) FILTER (WHERE actor = 'anonymous' AND outcome = 'failed')       AS anon_failed,
            SUM(count) FILTER (WHERE outcome = 'rate_limited')                         AS rate_limited,
            SUM(count) FILTER (WHERE outcome = 'daily_limited')                        AS daily_limited,
            SUM(count) FILTER (WHERE outcome = 'rejected_input')                       AS rejected_input,
            SUM(count) FILTER (WHERE actor = 'admin')                                  AS admin_calls
       FROM ai_usage_daily
      WHERE day >= to_char((now() AT TIME ZONE 'America/Denver')::date - $1::int, 'YYYY-MM-DD')
      GROUP BY day ORDER BY day DESC`,
    [days],
  );

  // createdAt columns are stored as UTC-naive timestamps.
  const { rows: created } = await pool.query(
    `SELECT to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date, 'YYYY-MM-DD') AS day, COUNT(*) AS n
       FROM (
         SELECT created_at FROM events
         UNION ALL SELECT created_at FROM food_events
         UNION ALL SELECT created_at FROM art_events
       ) e
      WHERE created_at >= now() - ($1::int + 1) * interval '1 day'
      GROUP BY 1`,
    [days],
  );
  const createdByDay = new Map(created.map((r) => [r.day, Number(r.n)]));

  const { rows: budget } = await pool.query(
    `SELECT count FROM rate_limit_counters WHERE bucket = 'ai-anon-budget-cents' AND window_key = $1`,
    [denverDayKey()],
  );
  const { dailyBudgetCents, perVisitorHourly } = aiLimits();

  console.log(`Anonymous AI budget today: ${budget[0]?.count ?? 0}¢ reserved of ${dailyBudgetCents}¢ (per-visitor limit ${perVisitorHourly}/hour)\n`);
  console.table(usage.map((r) => ({
    day: r.day,
    "anon ok": Number(r.anon_ok ?? 0),
    "anon failed": Number(r.anon_failed ?? 0),
    "rate limited": Number(r.rate_limited ?? 0),
    "daily limited": Number(r.daily_limited ?? 0),
    "bad input": Number(r.rejected_input ?? 0),
    "admin calls": Number(r.admin_calls ?? 0),
    "events created": createdByDay.get(r.day) ?? 0,
  })));
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => pool.end());
