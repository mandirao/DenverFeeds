// WP1 security suite: access policy, admin auth, session hardening, and the
// anonymous AI limits. Run with `npm test`. Uses a throwaway local Postgres
// and a fake Anthropic API — no production data, no paid calls.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { sign } from "cookie-signature";
import {
  Client, spawnServer, startDatabase, startFakeAnthropic,
  type FakeAnthropic, type TestDatabase, type TestServer,
} from "./support/harness";

const ADMIN_USER = "test-admin";
const ADMIN_PASSWORD = "correct horse battery staple";
const SESSION_SECRET = "test-session-secret";

let db: TestDatabase;
let fake: FakeAnthropic;
let main: TestServer;
const spawned: TestServer[] = [];
const ids: Record<string, number> = {};

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: db.url,
    SESSION_SECRET,
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_BASE_URL: fake.url,
    SERPER_API_KEY: "",
    // server/spotify.ts refuses to load without these; never used for real calls here.
    SPOTIFY_CLIENT_ID: "test", SPOTIFY_CLIENT_SECRET: "test",
    AI_ANON_HOURLY_LIMIT_PER_VISITOR: "100",
    AI_ANON_DAILY_BUDGET_CENTS: "100000",
    LOGIN_ATTEMPTS_PER_HOUR: "5",
    ...extra,
  };
}

async function startServer(extra: Record<string, string> = {}) {
  const s = await spawnServer(baseEnv(extra));
  spawned.push(s);
  return s;
}

async function resetLimits() {
  await db.pool.query("TRUNCATE rate_limit_counters, ai_usage_daily");
  fake.reset();
}

async function usage(outcome: string, actor = "anonymous"): Promise<number> {
  const { rows } = await db.pool.query(
    "SELECT COALESCE(SUM(count), 0)::int AS n FROM ai_usage_daily WHERE outcome = $1 AND actor = $2", [outcome, actor]);
  return rows[0].n;
}

// Fingerprint of every shared table, to prove rejected requests changed nothing.
async function sharedDataFingerprint(): Promise<string> {
  const tables = ["events", "food_events", "art_events", "restaurants", "playlists", "artists", "venues", "discovered_events", "discovered_artists", "users"];
  const parts: string[] = [];
  for (const t of tables) {
    const { rows } = await db.pool.query(`SELECT md5(COALESCE(string_agg(x::text, '|' ORDER BY x.id), '')) AS h FROM ${t} x`);
    parts.push(`${t}:${rows[0].h}`);
  }
  return parts.join(",");
}

async function loginAsAdmin(client: Client) {
  const res = await client.request("POST", "/api/auth/login", { body: { username: ADMIN_USER, password: ADMIN_PASSWORD } });
  assert.equal(res.status, 200, res.text);
  return res;
}

before(async () => {
  db = await startDatabase();
  fake = await startFakeAnthropic();

  // Seed one row of each kind of shared data.
  const one = async (sql: string) => (await db.pool.query(sql)).rows[0].id as number;
  ids.event = await one(`INSERT INTO events (emoji, artist, venue, date, summary, sounds_like, genre) VALUES ('🎸','Seed Band','Globe Hall', now() + interval '10 days','Seed summary','A, B','Rock & Alternative') RETURNING id`);
  ids.food = await one(`INSERT INTO food_events (name, venue, date_start, summary, requester) VALUES ('Seed Popup','Seed Venue','2099-01-01','Seed','Mandi') RETURNING id`);
  ids.art = await one(`INSERT INTO art_events (name, venue, date_start, summary, requester) VALUES ('Seed Talk','Seed Hall','2099-01-01','Seed','Mandi') RETURNING id`);
  ids.restaurant = await one(`INSERT INTO restaurants (name, description, cuisine, price_point, neighborhood) VALUES ('Seed Cafe','Seed', ARRAY['Other'],'$$','RiNo & Five Points') RETURNING id`);
  ids.playlist = await one(`INSERT INTO playlists (title, curator, spotify_url, spotify_id) VALUES ('Seed Mix','Mandi','https://open.spotify.com/playlist/x','x') RETURNING id`);
  ids.artist = await one(`INSERT INTO artists (name, source) VALUES ('Seed Artist','manual') RETURNING id`);
  ids.venue = await one(`INSERT INTO venues (name, source) VALUES ('Seed Venue Hall','manual') RETURNING id`);
  ids.discoveredEvent = await one(`INSERT INTO discovered_events (artist, venue, date, genre) VALUES ('Found Band','Globe Hall', now() + interval '20 days','Rock & Alternative') RETURNING id`);
  ids.discoveredArtist = await one(`INSERT INTO discovered_artists (name, genre, source) VALUES ('Found Artist','Rock','pitchfork') RETURNING id`);

  // Admin, provisioned the same way scripts/create-admin.ts does it. Set
  // env first: importing server code connects to DATABASE_URL.
  process.env.DATABASE_URL = db.url;
  process.env.SPOTIFY_CLIENT_ID = "test";
  process.env.SPOTIFY_CLIENT_SECRET = "test";
  const { hashPassword } = await import("../server/auth");
  await db.pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')`, [ADMIN_USER, await hashPassword(ADMIN_PASSWORD)]);
  // A non-admin account with a password: proves a login identity alone
  // never grants admin.
  await db.pool.query(`INSERT INTO users (username, password, role) VALUES ('regular-user', $1, 'visitor')`, [await hashPassword("regular user password")]);

  main = await startServer();
});

after(async () => {
  await Promise.all(spawned.map((s) => s.stop()));
  await fake?.stop();
  const { pool } = await import("../server/db");
  await pool.end().catch(() => {});
  await db?.stop();
});

// ── Anonymous browsing & contribution ──────────────────────────────────────

describe("anonymous visitors", () => {
  test("can browse every feed without registering", async () => {
    const c = new Client(main.url);
    for (const p of ["/api/events", "/api/food-events", "/api/art-events", "/api/restaurants", "/api/playlists",
                     "/api/upvoted-events", "/api/calendar/feed.ics", "/api/calendar/food-feed.ics", "/api/calendar/art-feed.ics"]) {
      const res = await c.request("GET", p);
      assert.equal(res.status, 200, `${p}: ${res.text}`);
    }
    const me = await c.request("GET", "/api/auth/me");
    assert.deepEqual(me.json, { isAdmin: false });
  });

  test("anonymous reads don't create sessions", async () => {
    const before = (await db.pool.query("SELECT count(*)::int AS n FROM session")).rows[0].n;
    const c = new Client(main.url);
    await c.request("GET", "/api/events");
    await c.request("GET", "/api/food-events");
    const after = (await db.pool.query("SELECT count(*)::int AS n FROM session")).rows[0].n;
    assert.equal(after, before);
    assert.equal(c.cookie, null);
  });

  test("can submit events manually on all three feeds", async () => {
    const c = new Client(main.url, "198.51.100.7");
    const music = await c.request("POST", "/api/events", { body: {
      emoji: "🎤", artist: "Manual Band", venue: "Globe Hall", date: "2099-05-01",
      summary: "Manual summary", soundsLike: "A, B", genre: "Rock & Alternative", requester: "Visitor",
    } });
    assert.equal(music.status, 201, music.text);
    const food = await c.request("POST", "/api/food-events", { body: {
      name: "Manual Popup", venue: "Somewhere", dateStart: "2099-05-02", summary: "Tacos", requester: "Visitor", cuisine: "Other",
    } });
    assert.equal(food.status, 201, food.text);
    const art = await c.request("POST", "/api/art-events", { body: {
      name: "Manual Talk", venue: "Library", dateStart: "2099-05-03", summary: "Books", requester: "Visitor", category: "Talks & Lectures",
    } });
    assert.equal(art.status, 201, art.text);
  });

  test("ownership/privilege fields in a submission are ignored", async () => {
    const c = new Client(main.url, "198.51.100.8");
    const res = await c.request("POST", "/api/events", { body: {
      emoji: "🎤", artist: "Sneaky Band", venue: "Globe Hall", date: "2099-06-01", summary: "s", soundsLike: "A, B",
      genre: "Rock & Alternative", requester: "Visitor", isScheduled: true, upvotes: 999, id: 424242, role: "admin",
    } });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.isScheduled, false);
    assert.equal(res.json.upvotes, 0);
    assert.notEqual(res.json.id, 424242);
  });

  test("upvote toggling still works per visitor", async () => {
    const c = new Client(main.url, "198.51.100.9");
    const up = await c.request("POST", `/api/events/${ids.event}/upvote`);
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.upvotes, 1);
    assert.deepEqual((await c.request("GET", "/api/upvoted-events")).json, [ids.event]);
    const down = await c.request("POST", `/api/events/${ids.event}/upvote`);
    assert.equal(down.json.upvotes, 0);
    assert.deepEqual((await c.request("GET", "/api/upvoted-events")).json, []);
  });
});

// ── Access policy ───────────────────────────────────────────────────────────

describe("access policy", () => {
  test("every non-GET route is either deliberately public or admin-only", async () => {
    const { createApp } = await import("../server/app");
    const { isPublicWrite } = await import("../server/auth");
    const { app } = await createApp();

    const routes: { method: string; path: string }[] = [];
    for (const layer of (app as any)._router.stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) routes.push({ method: m.toUpperCase(), path: layer.route.path });
      } else if (layer.name === "router" && layer.handle?.stack) {
        for (const inner of layer.handle.stack) {
          if (!inner.route) continue;
          for (const m of Object.keys(inner.route.methods)) routes.push({ method: m.toUpperCase(), path: "/api" + inner.route.path });
        }
      }
    }
    const writes = routes.filter((r) => r.method !== "GET");
    assert.ok(writes.length > 40, `expected to enumerate the write routes, found ${writes.length}`);

    // If this list changes, a route's exposure changed: review it on purpose.
    const publicWrites = writes.filter((r) => isPublicWrite(r.method, r.path.replace(/^\/api/, "").replace(/:id/g, "1")))
      .map((r) => `${r.method} ${r.path}`).sort();
    assert.deepEqual(publicWrites, [
      "POST /api/ai/analyze-artist",
      "POST /api/ai/parse-art-blurb",
      "POST /api/ai/parse-blurb",
      "POST /api/art-events",
      "POST /api/auth/login",
      "POST /api/auth/logout",
      "POST /api/events",
      "POST /api/events/:id/upvote",
      "POST /api/food-events",
    ]);

    // Everything else must reject an anonymous caller before doing anything.
    const before = await sharedDataFingerprint();
    const callsBefore = fake.calls();
    const c = new Client(main.url, "192.0.2.50");
    for (const r of writes) {
      const concrete = r.path.replace(/:id/g, "1");
      if (isPublicWrite(r.method, concrete.replace(/^\/api/, ""))) continue;
      const res = await c.request(r.method, concrete, { body: {} });
      assert.equal(res.status, 403, `${r.method} ${r.path} should be admin-only, got ${res.status}`);
      assert.equal(res.json?.code, "ADMIN_REQUIRED");
    }
    assert.equal(await sharedDataFingerprint(), before, "rejected requests must not modify shared data");
    assert.equal(fake.calls(), callsBefore, "rejected requests must not reach Anthropic");
  });

  test("anonymous visitors cannot edit, delete, duplicate, or schedule shared data", async () => {
    const c = new Client(main.url, "192.0.2.51");
    const attempts: [string, string, unknown?][] = [
      ["PATCH", `/api/events/${ids.event}`, { artist: "Hacked" }],
      ["DELETE", `/api/events/${ids.event}`],
      ["POST", `/api/events/${ids.event}/schedule`],
      ["POST", `/api/events/${ids.event}/unschedule`],
      ["POST", `/api/events/${ids.event}/decrease-upvote`],
      ["POST", "/api/events/bulk", [{ artist: "x" }]],
      ["PATCH", `/api/food-events/${ids.food}`, { upvotes: 9999 }],
      ["DELETE", `/api/food-events/${ids.food}`],
      ["POST", `/api/food-events/${ids.food}/duplicate`],
      ["POST", `/api/food-events/${ids.food}/upvote`],
      ["PATCH", `/api/art-events/${ids.art}`, { name: "Hacked" }],
      ["DELETE", `/api/art-events/${ids.art}`],
      ["POST", `/api/art-events/${ids.art}/duplicate`],
      ["PATCH", `/api/restaurants/${ids.restaurant}`, { name: "Hacked" }],
      ["DELETE", `/api/restaurants/${ids.restaurant}`],
      ["POST", "/api/restaurants", { name: "x" }],
      ["PATCH", `/api/playlists/${ids.playlist}`, { title: "Hacked" }],
      ["DELETE", `/api/playlists/${ids.playlist}`],
      ["POST", `/api/playlists/${ids.playlist}/refresh`],
      ["DELETE", `/api/artists/${ids.artist}`],
      ["PUT", `/api/venues/${ids.venue}`, { name: "Hacked" }],
      ["POST", `/api/discovered-events/${ids.discoveredEvent}/approve`],
      ["POST", `/api/discovered-artists/${ids.discoveredArtist}/approve`],
      ["POST", "/api/discovery/run", { limit: 10000 }],
      ["POST", "/api/discovery/artist-scan", {}],
      ["POST", "/api/discovery/venue-scan", {}],
    ];
    const before = await sharedDataFingerprint();
    for (const [method, p, body] of attempts) {
      const res = await c.request(method, p, { body });
      assert.equal(res.status, 403, `${method} ${p} → ${res.status}`);
    }
    assert.equal((await c.request("GET", "/api/admin/service-health")).status, 403);
    assert.equal(await sharedDataFingerprint(), before);
  });

  test("state-changing requests without the CSRF header are rejected", async () => {
    const c = new Client(main.url, "192.0.2.52");
    const res = await c.request("POST", "/api/events", { csrf: false, body: { artist: "x" } });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "CSRF_HEADER_REQUIRED");
  });
});

// ── Identity & sessions ─────────────────────────────────────────────────────

describe("admin identity", () => {
  test("client-supplied admin claims are ignored", async () => {
    const c = new Client(main.url, "192.0.2.60");
    const res = await c.request("POST", `/api/events/${ids.event}/schedule`, {
      body: { role: "admin", isAdmin: true, userId: 1 },
      headers: { "X-Admin": "true", "X-User-Role": "admin", Authorization: "Bearer admin" },
    });
    assert.equal(res.status, 403);
  });

  test("a cookie signed with the old public fallback secret is not honored", async () => {
    // Plant a session that claims the admin, then present it signed with the
    // fallback secret that used to be hardcoded (and is in the public repo).
    const { rows } = await db.pool.query("SELECT id FROM users WHERE username = $1", [ADMIN_USER]);
    const sid = "forged-session-id";
    await db.pool.query(
      `INSERT INTO session (sid, sess, expire) VALUES ($1, $2, now() + interval '1 day')`,
      [sid, JSON.stringify({ cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000), httpOnly: true, path: "/" }, authUserId: rows[0].id })],
    );
    const c = new Client(main.url, "192.0.2.61");
    c.cookie = `connect.sid=${encodeURIComponent("s:" + sign(sid, "setlist-social-dev-secret"))}`;
    assert.equal((await c.request("POST", `/api/events/${ids.event}/schedule`)).status, 403);
    assert.deepEqual((await c.request("GET", "/api/auth/me")).json, { isAdmin: false });
  });

  test("a non-admin account cannot sign in, and wrong passwords fail", async () => {
    const c = new Client(main.url, "192.0.2.62");
    assert.equal((await c.request("POST", "/api/auth/login", { body: { username: "regular-user", password: "regular user password" } })).status, 401);
    assert.equal((await c.request("POST", "/api/auth/login", { body: { username: ADMIN_USER, password: "wrong password" } })).status, 401);
    assert.equal((await c.request("POST", "/api/auth/login", { body: { username: "nobody", password: "whatever" } })).status, 401);
  });

  test("repeated sign-in attempts are throttled", async () => {
    const c = new Client(main.url, "192.0.2.63");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await c.request("POST", "/api/auth/login", { body: { username: ADMIN_USER, password: "nope" } })).status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429]);
  });

  test("admin can sign in, perform privileged actions, and sign out", async () => {
    const c = new Client(main.url, "192.0.2.64");
    // Get an anonymous session first (any POST), to check it is rotated.
    await c.request("POST", "/api/auth/logout");
    const anonCookie = c.cookie;
    assert.ok(anonCookie);

    const login = await loginAsAdmin(c);
    assert.notEqual(c.cookie, anonCookie, "session ID must change on login (fixation defense)");
    const setCookie = login.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    // (Secure is set only when NODE_ENV=production; tests run over plain HTTP.)
    assert.deepEqual((await c.request("GET", "/api/auth/me")).json, { isAdmin: true });

    const scheduled = await c.request("POST", `/api/events/${ids.event}/schedule`);
    assert.equal(scheduled.status, 200, scheduled.text);
    assert.equal(scheduled.json.isScheduled, true);
    const unscheduled = await c.request("POST", `/api/events/${ids.event}/unschedule`);
    assert.equal(unscheduled.json.isScheduled, false);

    const dup = await c.request("POST", `/api/food-events/${ids.food}/duplicate`);
    assert.equal(dup.status, 201, dup.text);
    assert.equal((await c.request("DELETE", `/api/food-events/${dup.json.id}`)).status, 200);
    assert.equal((await c.request("PATCH", `/api/art-events/${ids.art}`, { body: { soldOut: true } })).status, 200);
    assert.equal((await c.request("GET", "/api/admin/service-health")).status, 200);

    await c.request("POST", "/api/auth/logout");
    assert.deepEqual((await c.request("GET", "/api/auth/me")).json, { isAdmin: false });
    assert.equal((await c.request("POST", `/api/events/${ids.event}/schedule`)).status, 403);
  });

  test("production refuses to start without SESSION_SECRET", async () => {
    const { createApp } = await import("../server/app");
    const saved = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET };
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    try {
      await assert.rejects(createApp(), /SESSION_SECRET must be set in production/);
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.SESSION_SECRET !== undefined) process.env.SESSION_SECRET = saved.SESSION_SECRET;
    }
  });
});

// ── Anonymous AI contribution & limits ──────────────────────────────────────

describe("anonymous AI-assisted contribution", () => {
  test("anonymous visitors can use all three contribution parsers without registering", async () => {
    await resetLimits();
    const c = new Client(main.url, "198.51.100.20");
    const food = await c.request("POST", "/api/ai/parse-blurb", { body: { blurb: "Taco popup at Bar X, Nov 1, 6pm, $15" } });
    assert.equal(food.status, 200, food.text);
    const art = await c.request("POST", "/api/ai/parse-art-blurb", { body: { blurb: "Astronomy talk at the library Nov 2" } });
    assert.equal(art.status, 200, art.text);
    const artist = await c.request("POST", "/api/ai/analyze-artist", { body: { artist: "Big Thief" } });
    assert.equal(artist.status, 200, artist.text);
    assert.equal(fake.calls(), 5, "2 Opus calls per parse + 1 for artist analysis");
    assert.equal(await usage("succeeded"), 3);
  });

  test("admin-only AI endpoints stay protected", async () => {
    await resetLimits();
    const anon = new Client(main.url, "198.51.100.21");
    for (const p of ["/api/ai/redo-art-event-content", "/api/ai/redo-food-event-content", "/api/ai/fill-restaurant"]) {
      const res = await anon.request("POST", p, { body: { name: "Thing" } });
      assert.equal(res.status, 403, p);
    }
    assert.equal(fake.calls(), 0);

    const admin = new Client(main.url, "198.51.100.22");
    await loginAsAdmin(admin);
    const res = await admin.request("POST", "/api/ai/redo-food-event-content", { body: { name: "Thing" } });
    assert.equal(res.status, 200, res.text);
    assert.equal(await usage("succeeded", "admin"), 1);
  });

  test("admin AI use doesn't consume the anonymous budget", async () => {
    await resetLimits();
    const admin = new Client(main.url, "198.51.100.23");
    await loginAsAdmin(admin);
    assert.equal((await admin.request("POST", "/api/ai/parse-blurb", { body: { blurb: "Popup" } })).status, 200);
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM rate_limit_counters WHERE bucket LIKE 'ai-%'");
    assert.equal(rows[0].n, 0);
  });

  test("oversized or malformed input is rejected before any paid call or quota use", async () => {
    await resetLimits();
    const c = new Client(main.url, "198.51.100.24");
    const long = await c.request("POST", "/api/ai/parse-blurb", { body: { blurb: "x".repeat(5001) } });
    assert.equal(long.status, 400);
    assert.equal(long.json.code, "AI_INPUT_INVALID");
    const badType = await c.request("POST", "/api/ai/parse-art-blurb", { body: { imageBase64: "AAAA", imageMediaType: "application/pdf" } });
    assert.equal(badType.status, 400);
    const longArtist = await c.request("POST", "/api/ai/analyze-artist", { body: { artist: "a".repeat(101) } });
    assert.equal(longArtist.status, 400);
    const huge = await c.request("POST", "/api/ai/parse-blurb", { rawBody: JSON.stringify({ imageBase64: "A".repeat(5_000_000), imageMediaType: "image/png" }) });
    assert.equal(huge.status, 413);
    // Non-AI routes take much smaller bodies.
    const bigEvent = await c.request("POST", "/api/events", { rawBody: JSON.stringify({ artist: "x".repeat(1_100_000) }) });
    assert.equal(bigEvent.status, 413);

    assert.equal(fake.calls(), 0);
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM rate_limit_counters WHERE bucket LIKE 'ai-%'");
    assert.equal(rows[0].n, 0, "invalid input must not consume quota");
    assert.equal(await usage("rejected_input"), 3);
  });

  test("per-visitor hourly limit holds across instances and rejects before paid calls", async () => {
    await resetLimits();
    const [a, b] = await Promise.all([
      startServer({ AI_ANON_HOURLY_LIMIT_PER_VISITOR: "3" }),
      startServer({ AI_ANON_HOURLY_LIMIT_PER_VISITOR: "3" }),
    ]);
    const statuses: number[] = [];
    let last: any;
    for (let i = 0; i < 5; i++) {
      // Same visitor, alternating instances.
      const c = new Client(i % 2 ? b.url : a.url, "198.51.100.30");
      last = await c.request("POST", "/api/ai/parse-blurb", { body: { blurb: `Popup ${i}` } });
      statuses.push(last.status);
    }
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.equal(last.json.code, "AI_RATE_LIMITED");
    assert.match(last.json.message, /fill in the details yourself/);
    assert.ok(Number(last.headers.get("retry-after")) > 0);
    assert.equal(fake.calls(), 6, "only the 3 allowed parses reached Anthropic");

    // A different visitor is unaffected.
    const other = await new Client(a.url, "198.51.100.31").request("POST", "/api/ai/parse-blurb", { body: { blurb: "Popup" } });
    assert.equal(other.status, 200);
  });

  test("global daily ceiling holds under concurrent load across instances", async () => {
    await resetLimits();
    // 80¢ budget = exactly 10 parses at the 8¢ estimate.
    const [a, b] = await Promise.all([
      startServer({ AI_ANON_DAILY_BUDGET_CENTS: "80" }),
      startServer({ AI_ANON_DAILY_BUDGET_CENTS: "80" }),
    ]);
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      new Client(i % 2 ? b.url : a.url, `198.51.100.${100 + i}`)
        .request("POST", "/api/ai/parse-blurb", { body: { blurb: `Concurrent popup ${i}` } })));

    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429 && r.json?.code === "AI_DAILY_LIMIT").length;
    assert.equal(ok, 10, `exactly 10 should fit the budget, got ${ok}`);
    assert.equal(limited, 20);
    assert.equal(fake.calls(), 20, "2 Anthropic calls for each of the 10 allowed parses, none for rejected ones");
    assert.equal(await usage("succeeded"), 10);
    assert.equal(await usage("daily_limited"), 20);

    // Manual submission is unaffected by an exhausted AI budget.
    const manual = await new Client(a.url, "198.51.100.200").request("POST", "/api/food-events", { body: {
      name: "Manual After Limit", venue: "Somewhere", dateStart: "2099-07-01", summary: "s", requester: "Visitor", cuisine: "Other",
    } });
    assert.equal(manual.status, 201, manual.text);
  });

  test("AI parsing reports unavailable (not a crash) when the Anthropic key is missing", async () => {
    await resetLimits();
    const s = await startServer({ ANTHROPIC_API_KEY: "" });
    const res = await new Client(s.url, "198.51.100.40").request("POST", "/api/ai/parse-blurb", { body: { blurb: "Popup" } });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, "AI_UNAVAILABLE");
    assert.equal(fake.calls(), 0);
  });
});

// ── Client messaging & credential exposure ──────────────────────────────────

describe("client", () => {
  test("AI errors become friendly, actionable toasts", async () => {
    const { ApiError } = await import("../client/src/lib/queryClient");
    const { aiErrorToast } = await import("../client/src/lib/aiErrors");
    const err = (status: number, body: any) => new ApiError(`${status}: ${JSON.stringify(body)}`, status, body);

    const rate = aiErrorToast(err(429, { code: "AI_RATE_LIMITED", message: "Try again later, or fill in the details yourself." }), "Parse failed");
    assert.equal(rate.title, "AI helper is taking a break");
    assert.match(rate.description, /fill in the details yourself/);
    assert.equal(aiErrorToast(err(429, { code: "AI_DAILY_LIMIT", message: "limit for today" }), "x").description, "limit for today");
    assert.equal(aiErrorToast(err(503, { code: "AI_UNAVAILABLE", message: "unavailable" }), "x").title, "AI helper unavailable");
    assert.match(aiErrorToast(err(413, null), "x").description, /too large/);
    assert.match(aiErrorToast(new Error("network down"), "Parse failed").description, /fill in the details yourself/);
    assert.equal(aiErrorToast(new Error("x"), "Parse failed").title, "Parse failed");
  });

  test("Anthropic and Serper credentials are never referenced by browser code", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?|html)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.resolve(import.meta.dirname, "../client"));
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      // Key names, key material, or direct calls to the paid APIs.
      assert.doesNotMatch(src, /ANTHROPIC_API_KEY|SERPER_API_KEY|sk-ant-|api\.anthropic\.com|google\.serper\.dev/, f);
    }
    // Only VITE_-prefixed variables are bundled into the browser by Vite.
    const example = fs.readFileSync(path.resolve(import.meta.dirname, "../.env.example"), "utf8");
    assert.doesNotMatch(example, /VITE_\w*(ANTHROPIC|SERPER)/);
  });
});

// ── Admin provisioning script ───────────────────────────────────────────────

describe("admin provisioning (scripts/create-admin.ts)", () => {
  const userRow = async (username: string) =>
    (await db.pool.query("SELECT * FROM users WHERE username = $1", [username])).rows[0];

  test("creates a new admin that can sign in", async () => {
    const { provisionAdmin } = await import("../scripts/create-admin");
    const result = await provisionAdmin("second-admin", async () => "a sufficiently long password");
    assert.equal(result.action, "created");
    assert.equal((await userRow("second-admin")).role, "admin");
    const c = new Client(main.url, "192.0.2.80");
    const res = await c.request("POST", "/api/auth/login", { body: { username: "second-admin", password: "a sufficiently long password" } });
    assert.equal(res.status, 200);
  });

  test("refuses to touch existing non-admin users or reserved names", async () => {
    const { provisionAdmin } = await import("../scripts/create-admin");
    const before = await userRow("regular-user");
    let prompted = false;
    const getPassword = async () => { prompted = true; return "a sufficiently long password"; };
    await assert.rejects(provisionAdmin("regular-user", getPassword), /not an admin. Refusing/);
    await assert.rejects(provisionAdmin("regular-user", getPassword, { resetPassword: true }), /not an admin. Refusing/);
    await assert.rejects(provisionAdmin("user-1712345678901", getPassword), /reserved/);
    assert.equal(prompted, false, "refusals happen before asking for a password");
    assert.deepEqual(await userRow("regular-user"), before);
  });

  test("an existing admin's password changes only with --reset-password, and nothing else changes", async () => {
    const { provisionAdmin } = await import("../scripts/create-admin");
    const before = await userRow(ADMIN_USER);
    await assert.rejects(provisionAdmin(ADMIN_USER, async () => "another long password!!"), /--reset-password/);
    await assert.rejects(provisionAdmin(ADMIN_USER, async () => "short", { resetPassword: true }), /at least 16/);
    assert.deepEqual(await userRow(ADMIN_USER), before);

    await provisionAdmin(ADMIN_USER, async () => "a brand new admin password", { resetPassword: true });
    const after = await userRow(ADMIN_USER);
    assert.notEqual(after.password, before.password);
    assert.deepEqual({ ...after, password: null }, { ...before, password: null });

    // Restore the original password for any later tests.
    await provisionAdmin(ADMIN_USER, async () => ADMIN_PASSWORD, { resetPassword: true });
  });
});

// ── Migration ───────────────────────────────────────────────────────────────

describe("WP1 migration", () => {
  test("is additive and idempotent on the pre-WP1 schema", async () => {
    await db.createDatabase("migration_check");
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: db.urlFor("migration_check") });
    try {
      await pool.query(`CREATE TABLE users (id serial PRIMARY KEY, username text NOT NULL UNIQUE, password text, session_id text UNIQUE)`);
      await pool.query(`INSERT INTO users (username, session_id) VALUES ('user-1', 'anon-1')`);
      const { WP1_SECURITY_SQL } = await import("../scripts/migrate-wp1-security");
      await pool.query(WP1_SECURITY_SQL);
      await pool.query(WP1_SECURITY_SQL); // second run is a no-op
      const { rows } = await pool.query(`SELECT username, session_id, role FROM users`);
      assert.deepEqual(rows, [{ username: "user-1", session_id: "anon-1", role: "visitor" }]);
      const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('rate_limit_counters','ai_usage_daily') ORDER BY 1`);
      assert.deepEqual(tables.rows.map((r) => r.table_name), ["ai_usage_daily", "rate_limit_counters"]);
    } finally {
      await pool.end();
    }
  });
});
