/**
 * Creates the admin account, or resets its password. There is intentionally
 * no signup or admin-management UI: admin status only comes from this
 * script, run by someone who already holds DATABASE_URL.
 *
 * The password is read from a hidden prompt (never from argv, so it stays
 * out of shell history) and stored as a scrypt hash.
 *
 * Never touches an account it didn't create: an existing non-admin username
 * (e.g. an anonymous "user-<timestamp>" upvote identity) is refused, and an
 * existing admin's password changes only with --reset-password.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/create-admin.ts <username>                    # create
 *   npx tsx --env-file=.env scripts/create-admin.ts <username> --reset-password   # reset an admin's password
 */
import "dotenv/config";
import readline from "readline";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";
import { hashPassword } from "../server/auth";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Suppress echo of typed characters.
    (rl as any)._writeToOutput = (s: string) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

export const MIN_PASSWORD_LENGTH = 16;

// Validates before any write, then touches at most one row: a brand-new admin
// row, or the password of a row that is already an admin.
export async function provisionAdmin(
  username: string,
  getPassword: () => Promise<string>,
  opts: { resetPassword?: boolean } = {},
): Promise<{ action: "created" | "reset"; id: number }> {
  if (!username || username.startsWith("--")) throw new Error("Usage: create-admin.ts <username> [--reset-password]");
  if (/^user-\d+$/.test(username)) throw new Error("That name pattern is reserved for anonymous visitor records");

  const [existing] = await db.select().from(users).where(eq(users.username, username));
  if (existing && existing.role !== "admin") {
    throw new Error(`"${username}" already exists and is not an admin. Refusing to modify it; choose another username.`);
  }
  if (existing && !opts.resetPassword) {
    throw new Error(`Admin "${username}" already exists. Re-run with --reset-password to change its password.`);
  }
  if (!existing && opts.resetPassword) throw new Error(`No admin named "${username}" to reset.`);

  const password = await getPassword();
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const passwordHash = await hashPassword(password);

  if (existing) {
    await db.update(users).set({ password: passwordHash }).where(eq(users.id, existing.id));
    return { action: "reset", id: existing.id };
  }
  const [created] = await db.insert(users).values({ username, password: passwordHash, role: "admin" }).returning();
  return { action: "created", id: created.id };
}

async function main() {
  const username = process.argv[2]?.trim() ?? "";
  const resetPassword = process.argv.includes("--reset-password");
  const result = await provisionAdmin(username, async () => {
    const password = await promptHidden(`Password for ${username} (min ${MIN_PASSWORD_LENGTH} chars): `);
    const confirm = await promptHidden("Confirm password: ");
    if (confirm !== password) throw new Error("Passwords do not match");
    return password;
  }, { resetPassword });
  console.log(result.action === "created"
    ? `Created admin ${username} (id ${result.id}).`
    : `Reset password for admin ${username} (id ${result.id}).`);
}

if (process.argv[1]?.endsWith("create-admin.ts")) {
  main().catch((err) => { console.error(err.message || err); process.exitCode = 1; }).finally(() => pool.end());
}
