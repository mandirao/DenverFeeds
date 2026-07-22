import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase's connection pooler terminates TLS with a certificate that isn't in
// Node's default CA bundle, so opt out of CA verification rather than SSL itself.
// Keep the per-instance pool small and release idle clients quickly: Supabase's
// pooler caps concurrent clients, and on serverless many instances share that cap.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
});

// Idle pooled connections can be terminated by the server; log instead of crashing.
pool.on("error", (err) => {
  console.warn("[db] pool error — will reconnect on next request:", err.message);
});

export const db = drizzle({ client: pool, schema });
