import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // `session` is managed separately by connect-pg-simple, not declared in
  // shared/schema.ts — without this, drizzle-kit push sees it as an "extra"
  // table and offers to drop it (it did, with 135 live rows, during the
  // structured-recurrence work). Exclude it from introspection entirely so
  // it can never show up in a push diff again.
  tablesFilter: ["!session"],
});
