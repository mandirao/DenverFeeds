// Test infrastructure for the security suite. Nothing here talks to the
// production database or to Anthropic/Serper:
//   - a throwaway real Postgres (embedded-postgres) per test run,
//   - a fake Anthropic API on localhost that counts /v1/messages calls,
//   - real server processes (tests/support/serve.ts) standing in for
//     separate serverless instances, so cross-instance limits are exercised
//     through separate Node processes and separate connection pools.
import EmbeddedPostgres from "embedded-postgres";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createRequire } from "module";
import * as schema from "../../shared/schema";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
// drizzle-kit's ESM API bundle can't load under tsx ("Dynamic require of fs");
// its CommonJS build works.
const { pushSchema } = createRequire(import.meta.url)("drizzle-kit/api") as typeof import("drizzle-kit/api");

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export interface TestDatabase {
  url: string;
  pool: pg.Pool;
  urlFor(dbName: string): string;
  createDatabase(dbName: string): Promise<void>;
  stop(): Promise<void>;
}

export async function startDatabase(): Promise<TestDatabase> {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "denverfeeds-test-pg-"));
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "test", port, persistent: false, onLog: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("denverfeeds_test");

  const urlFor = (db: string) => `postgresql://postgres:test@127.0.0.1:${port}/${db}`;
  const url = urlFor("denverfeeds_test");
  const pool = new pg.Pool({ connectionString: url, max: 4 });

  // Same schema the app declares, plus the session table that
  // connect-pg-simple owns (drizzle.config.ts excludes it from push).
  const { apply } = await pushSchema(schema as Record<string, unknown>, drizzle(pool) as any);
  await apply();
  await pool.query(fs.readFileSync(path.join(REPO_ROOT, "node_modules/connect-pg-simple/table.sql"), "utf8"));

  return {
    url,
    pool,
    urlFor,
    createDatabase: (name) => server.createDatabase(name),
    async stop() {
      await pool.end();
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface FakeAnthropic {
  url: string;
  calls(): number;
  reset(): void;
  stop(): Promise<void>;
}

// Answers every Messages API call with a JSON object that satisfies all the
// parsers in llm-service.ts.
export async function startFakeAnthropic(): Promise<FakeAnthropic> {
  let count = 0;
  const payload = JSON.stringify({
    emoji: "🎵", summary: "Test summary", soundsLike: "Artist One, Artist Two", genre: "Rock & Alternative",
    suggestedVenue: "", suggestedDate: "", name: "Test Popup", venue: "Test Venue", dateStart: "2026-11-01",
    cuisine: "Other", category: "Other", description: "Test", pricePoint: "$$", neighborhood: "RiNo & Five Points",
  });
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url?.startsWith("/v1/messages")) {
        count++;
        // Small delay so concurrent requests genuinely overlap.
        setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            id: `msg_test_${count}`, type: "message", role: "assistant", model: "fake",
            content: [{ type: "text", text: payload }],
            stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
          }));
        }, 40);
      } else {
        res.writeHead(404).end();
      }
    });
  });
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}`,
    calls: () => count,
    reset: () => { count = 0; },
    stop: () => new Promise((r) => server.close(() => r())),
  };
}

export interface TestServer {
  url: string;
  stop(): Promise<void>;
}

export async function spawnServer(env: Record<string, string>): Promise<TestServer> {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "tests/support/serve.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 30_000);
    child.stdout!.on("data", (d) => {
      output += d;
      if (output.includes("READY")) { clearTimeout(timer); resolve(); }
    });
    child.stderr!.on("data", (d) => (output += d));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}):\n${output}`)); });
  });
  child.removeAllListeners("exit");
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((r) => { child.once("exit", () => r()); child.kill(); }),
  };
}

// Minimal cookie-jar HTTP client. `ip` sets X-Forwarded-For, which the app
// trusts (trust proxy = 1) the same way it trusts Vercel's header.
export class Client {
  cookie: string | null = null;
  constructor(private baseUrl: string, private ip = "203.0.113.10") {}

  async request(method: string, urlPath: string, opts: { body?: unknown; rawBody?: string; headers?: Record<string, string>; csrf?: boolean } = {}) {
    const headers: Record<string, string> = { "X-Forwarded-For": this.ip, ...(opts.headers ?? {}) };
    if (opts.csrf !== false && method !== "GET") headers["X-Requested-With"] = "fetch";
    if (this.cookie) headers["Cookie"] = this.cookie;
    let body: string | undefined;
    if (opts.rawBody !== undefined) { body = opts.rawBody; headers["Content-Type"] = "application/json"; }
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["Content-Type"] = "application/json"; }

    const res = await fetch(this.baseUrl + urlPath, { method, headers, body });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}
