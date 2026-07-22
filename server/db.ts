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
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Idle pooled connections can be terminated by the server; log instead of crashing.
pool.on("error", (err) => {
  console.warn("[db] pool error — will reconnect on next request:", err.message);
});

export const db = drizzle({ client: pool, schema });
