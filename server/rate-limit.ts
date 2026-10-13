import { createHmac } from "crypto";
import type { Request } from "express";
import { pool } from "./db";

// Postgres-backed counters shared by every serverless instance. Each call is
// one atomic upsert, so N concurrent requests always see N distinct counts —
// no read-then-write race, and no in-memory state that resets per instance.
export async function incrementCounter(bucket: string, windowKey: string, by = 1): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `INSERT INTO rate_limit_counters (bucket, window_key, count, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (bucket, window_key)
     DO UPDATE SET count = rate_limit_counters.count + EXCLUDED.count, updated_at = now()
     RETURNING count`,
    [bucket, windowKey, by],
  );

  // Opportunistic cleanup instead of a cron job: expired windows are useless.
  if (Math.random() < 0.02) {
    await pool.query(`DELETE FROM rate_limit_counters WHERE updated_at < now() - interval '3 days'`)
      .catch((err) => console.warn("[rate-limit] prune failed:", err.message));
  }

  return rows[0].count;
}

// Denver-local calendar day, so "daily" limits reset at local midnight.
export function denverDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(now);
}

export function utcHourKey(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

export function secondsUntilNextUtcHour(now = new Date()): number {
  return 3600 - (Math.floor(now.getTime() / 1000) % 3600);
}

// Keyed hash of the client IP: lets us count per visitor without storing raw
// IP addresses. Vercel sets X-Forwarded-For, and `trust proxy` makes req.ip
// read it.
export function hashClientIp(req: Request): string {
  const secret = process.env.SESSION_SECRET || "dev-only-rate-limit-key";
  return createHmac("sha256", secret).update(req.ip || "unknown").digest("hex").slice(0, 24);
}
