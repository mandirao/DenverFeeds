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

// A date safely inside the new-listing window (1 year back, 5 years ahead).
function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

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
      emoji: "🎤", artist: "Manual Band", venue: "Globe Hall", date: futureDate(200),
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
      emoji: "🎤", artist: "Sneaky Band", venue: "Globe Hall", date: futureDate(201), summary: "s", soundsLike: "A, B",
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

// ── WP2 Package A: validation and safety rails ──────────────────────────────

describe("WP2-A: edit allowlists and field limits", () => {
  const row = async (table: string, id: number) => (await db.pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];

  test("edits containing protected or unexpected fields are rejected with a clear 400, changing nothing", async () => {
    const admin = new Client(main.url, "192.0.2.90");
    await loginAsAdmin(admin);
    const forbidden = { id: 999999, upvotes: 4242, createdAt: "2000-01-01T00:00:00Z", createdVia: "discovery", created_via: "csv", somethingElse: 1 };
    const targets: [string, string, number, Record<string, unknown>][] = [
      ["food_events", "/api/food-events", ids.food, { name: "Renamed Listing" }],
      ["art_events", "/api/art-events", ids.art, { name: "Renamed Listing" }],
      ["restaurants", "/api/restaurants", ids.restaurant, { name: "Renamed Cafe" }],
      ["venues", "/api/venues", ids.venue, { notes: "checked" }],
    ];
    for (const [table, path, id, valid] of targets) {
      const method = table === "venues" ? "PUT" : "PATCH";
      for (const [key, value] of Object.entries(forbidden)) {
        const before = await row(table, id);
        const res = await admin.request(method, `${path}/${id}`, { body: { ...valid, [key]: value } });
        assert.equal(res.status, 400, `${table} + ${key}: ${res.text}`);
        assert.match(res.json.message, new RegExp(`can't be set in an edit: ${key}`));
        assert.deepEqual(await row(table, id), before, `${table} + ${key} must change nothing`);
      }
      const ok = await admin.request(method, `${path}/${id}`, { body: valid });
      assert.equal(ok.status, 200, `${table} valid edit: ${ok.text}`);
    }
    const ven = await admin.request("PUT", `/api/venues/${ids.venue}`, { body: { eventCount: "not a number" } });
    assert.equal(ven.status, 400, "a wrongly-typed field is rejected, not written");
  });

  test("music edits reject schedule/counter/identity fields; the form's own payload still saves", async () => {
    const admin = new Client(main.url, "192.0.2.89");
    await loginAsAdmin(admin);
    const ev = (await db.pool.query(`SELECT * FROM events WHERE id = $1`, [ids.event])).rows[0];
    // Exactly the 8 fields EventForm submits.
    const form = { emoji: ev.emoji, artist: ev.artist, venue: ev.venue, date: new Date(ev.date).toISOString(), summary: ev.summary, soundsLike: ev.sounds_like, genre: ev.genre, requester: ev.requester ?? "Mandi" };
    for (const [key, value] of Object.entries({ isScheduled: true, upvotes: 99, id: 1, createdAt: "2000-01-01T00:00:00Z", createdVia: "admin" })) {
      const res = await admin.request("PATCH", `/api/events/${ids.event}`, { body: { ...form, [key]: value } });
      assert.equal(res.status, 400, `${key}: ${res.text}`);
      assert.match(res.json.message, new RegExp(key));
    }
    const after = (await db.pool.query(`SELECT is_scheduled, upvotes FROM events WHERE id = $1`, [ids.event])).rows[0];
    assert.equal(after.is_scheduled, ev.is_scheduled);
    assert.equal(after.upvotes, ev.upvotes);
    assert.equal((await admin.request("PATCH", `/api/events/${ids.event}`, { body: form })).status, 200);
  });

  test("existing admin edit workflows still work", async () => {
    const admin = new Client(main.url, "192.0.2.91");
    await loginAsAdmin(admin);
    // Quick toggles and series management (ListingEventRow).
    for (const body of [{ soldOut: true }, { soldOut: false }, { seriesEndDate: "2099-12-31" }, { excludedDates: ["2099-02-01", "2099-03-01"] }]) {
      const res = await admin.request("PATCH", `/api/food-events/${ids.food}`, { body });
      assert.equal(res.status, 200, `${JSON.stringify(body)}: ${res.text}`);
    }
    // Full edit, shaped exactly like EditListingEventModal's payload.
    const full = {
      emoji: "🎨", name: "Seed Talk", venue: "Seed Hall", neighborhood: "", dateStart: "2099-01-01", dateEnd: "", startTime: "",
      summary: "Seed", category: "Talks & Lectures", price: "", ticketUrl: "", sourceUrl: "", requester: "Mandi", announcedAt: "",
      selloutRisk: undefined, isRecurring: true, recurrenceLabel: "1st Mondays",
      recurrenceRule: { freq: "monthly", byWeekday: 1, monthlyMode: "nth-weekday", weekdayOrdinal: 1 },
      excludedDates: [], verifiedThroughDate: null, activeWeekdays: null, tags: ["Science"],
      instanceNotes: { "2099-01-01": "First one" }, instanceTitles: { "2099-01-01": "Opening night" },
    };
    const res = await admin.request("PATCH", `/api/art-events/${ids.art}`, { body: full });
    assert.equal(res.status, 200, res.text);
    // "Split into dates": PATCH the original + POST the extra dates.
    const split = await admin.request("POST", "/api/art-events", { body: { ...full, instanceNotes: undefined, instanceTitles: undefined, dateStart: "2099-02-02", isRecurring: false, recurrenceRule: null, force: true } });
    assert.equal(split.status, 201, split.text);
    // Restaurant edit, shaped like RestaurantModal's 11 fields.
    const rest = await admin.request("PATCH", `/api/restaurants/${ids.restaurant}`, { body: {
      emoji: "🍽️", name: "Seed Cafe", description: "Cozy", cuisine: ["Other"], pricePoint: "$$", neighborhood: "RiNo & Five Points",
      hotNew: false, michelinStar: false, jamesBeard: false, fixture: true, foodTruck: false } });
    assert.equal(rest.status, 200, rest.text);
  });

  test("legacy-shaped rows (empty requester, old recurring anchor, very long raw blurb) can be re-saved", async () => {
    const admin = new Client(main.url, "192.0.2.92");
    await loginAsAdmin(admin);
    const legacy = (await db.pool.query(
      `INSERT INTO art_events (name, venue, date_start, summary, requester, raw_blurb, is_recurring, recurrence_label)
       VALUES ('Play Date','Stanley Marketplace','2020-09-07','Monthly play reading','', $1, true, '1st Mondays') RETURNING id`,
      ["x".repeat(26_635)])).rows[0].id;
    const res = await admin.request("PATCH", `/api/art-events/${legacy}`, { body: {
      name: "Play Date", venue: "Stanley Marketplace", dateStart: "2020-09-07", dateEnd: "", summary: "Monthly play reading",
      category: "Theater & Musicals", requester: "", isRecurring: true, recurrenceLabel: "1st Mondays" } });
    assert.equal(res.status, 200, res.text);
  });

  test("oversized or malformed public submissions and edits are rejected", async () => {
    const anon = new Client(main.url, "192.0.2.93");
    const base = { name: "Popup", venue: "Bar", dateStart: futureDate(30), summary: "s", requester: "Visitor", cuisine: "Other" };
    const cases: [string, Record<string, unknown>][] = [
      ["summary over 400", { summary: "x".repeat(401) }],
      ["name over 200", { name: "x".repeat(201) }],
      ["impossible date", { dateStart: "2026-02-30" }],
      ["non-date dateStart", { dateStart: "next friday" }],
      ["note over 500", { isRecurring: true, instanceNotes: { [futureDate(30)]: "x".repeat(501) } }],
      ["note keyed by non-date", { instanceNotes: { hello: "x" } }],
      ["too many excluded dates", { excludedDates: Array.from({ length: 501 }, () => futureDate(30)) }],
    ];
    for (const [label, override] of cases) {
      const res = await anon.request("POST", "/api/food-events", { body: { ...base, ...override } });
      assert.equal(res.status, 400, `${label}: ${res.status} ${res.text.slice(0, 120)}`);
    }
    const tags = await anon.request("POST", "/api/art-events", { body: { ...base, cuisine: undefined, category: "Games", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) } });
    assert.equal(tags.status, 400, "more than 20 tags");

    const admin = new Client(main.url, "192.0.2.94");
    await loginAsAdmin(admin);
    assert.equal((await admin.request("PATCH", `/api/food-events/${ids.food}`, { body: { name: "x".repeat(201) } })).status, 400);
    assert.equal((await admin.request("PATCH", `/api/restaurants/${ids.restaurant}`, { body: { description: "x".repeat(1001) } })).status, 400);
  });
});

describe("WP2-A: dates", () => {
  test("new-listing window moves with the calendar (year boundary)", async () => {
    const { checkNewListingDate, isCalendarDate } = await import("../server/date-rules");
    const dec31 = new Date("2026-12-31T12:00:00Z");
    const jan1 = new Date("2027-01-01T12:00:00Z");
    assert.equal(checkNewListingDate("2027-06-01", dec31), null);
    assert.equal(checkNewListingDate("2031-12-30", dec31), null);
    assert.match(checkNewListingDate("2032-01-02", dec31) ?? "", /future/);
    assert.equal(checkNewListingDate("2032-01-01", jan1), null, "a year later, the window has moved forward");
    assert.equal(checkNewListingDate("2026-01-02", jan1), null);
    assert.match(checkNewListingDate("2025-12-31", jan1) ?? "", /past/);
    assert.match(checkNewListingDate("0026-11-24", jan1) ?? "", /past/);
    assert.match(checkNewListingDate("2062-01-01", jan1) ?? "", /future/);
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "26-11-24", "2026/11/24"]) {
      assert.equal(isCalendarDate(bad), false, bad);
      assert.match(checkNewListingDate(bad, jan1) ?? "", /not a valid date/, bad);
    }
    assert.equal(isCalendarDate("2028-02-29"), true, "leap day");
  });

  test("music add, CSV import and edit apply the rules", async () => {
    const admin = new Client(main.url, "192.0.2.95");
    await loginAsAdmin(admin);
    const show = (date: string, artist: string) => ({ emoji: "🎸", artist, venue: "Globe Hall", date, summary: "s", soundsLike: "A, B", genre: "Rock & Alternative", requester: "Mandi" });
    const nextYear = new Date().getFullYear() + 1;

    // Single add: the form sends a serialized Date (ISO datetime).
    assert.equal((await admin.request("POST", "/api/events", { body: show(new Date(`${nextYear}-03-06T06:00:00.000Z`).toISOString(), "Next Year Band") })).status, 201);
    for (const bad of ["2062-01-01", "0026-11-24", "2026-02-30", "soon"]) {
      assert.equal((await admin.request("POST", "/api/events", { body: show(bad, `Bad ${bad}`) })).status, 400, bad);
    }

    // CSV bulk: next year imports; impossible/out-of-window rows are skipped with a reason.
    const bulk = await admin.request("POST", "/api/events/bulk", { body: [show(`${nextYear}-04-10`, "CSV Next Year"), show("2026-02-30", "CSV Bad Day"), show("2062-05-05", "CSV Far Future")] });
    assert.equal(bulk.status, 201, bulk.text);
    assert.equal(bulk.json.results.created, 1);
    assert.equal(bulk.json.results.skipped, 2);
    assert.match(bulk.json.results.errors.join(" "), /real YYYY-MM-DD/);

    // Edit: an old event keeps its unchanged date; moving it must be sensible.
    const old = (await db.pool.query(`INSERT INTO events (emoji, artist, venue, date, summary, sounds_like, genre) VALUES ('🎸','Old Show','Globe Hall', now() - interval '3 years','s','A, B','Rock & Alternative') RETURNING id, date`)).rows[0];
    const unchanged = await admin.request("PATCH", `/api/events/${old.id}`, { body: { ...show(new Date(old.date).toISOString(), "Old Show (renamed)") } });
    assert.equal(unchanged.status, 200, unchanged.text);
    assert.equal((await admin.request("PATCH", `/api/events/${old.id}`, { body: show("2062-01-01", "Old Show") })).status, 400);
    assert.equal((await admin.request("PATCH", `/api/events/${old.id}`, { body: show("2026-02-30", "Old Show") })).status, 400);
    assert.equal((await admin.request("PATCH", `/api/events/${old.id}`, { body: show(`${nextYear}-01-15`, "Old Show") })).status, 200);
  });
});

describe("WP2-A: restaurant AI fill and discovery", () => {
  test("restaurant AI fill never fetches a supplied URL", async () => {
    const http = await import("http");
    let hits = 0;
    const target = http.createServer((_req, res) => { hits++; res.end("<html>secret internal page</html>"); });
    await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
    const { port } = target.address() as { port: number };
    try {
      const admin = new Client(main.url, "192.0.2.96");
      await loginAsAdmin(admin);
      const before = fake.calls();
      const res = await admin.request("POST", "/api/ai/fill-restaurant", { body: { name: "Seed Cafe", sourceUrl: `http://127.0.0.1:${port}/internal` } });
      assert.equal(res.status, 200, res.text);
      assert.equal(fake.calls(), before + 1, "name-based enrichment still runs");
      assert.equal(hits, 0, "the supplied URL is never fetched");
    } finally {
      target.close();
    }
  });

  test("discovery and review-queue reads are admin-only", async () => {
    const anon = new Client(main.url, "192.0.2.97");
    const admin = new Client(main.url, "192.0.2.98");
    await loginAsAdmin(admin);
    for (const p of ["/api/discovered-events", "/api/discovered-artists", "/api/artists", "/api/venues", `/api/venues/${ids.venue}`, "/api/discovery/status", "/api/discovery/venue-stats", "/api/discovery/artist-stats"]) {
      assert.equal((await anon.request("GET", p)).status, 403, `anon ${p}`);
      assert.equal((await admin.request("GET", p)).status, 200, `admin ${p}`);
    }
    // Public feeds are unaffected.
    for (const p of ["/api/events", "/api/food-events", "/api/art-events", "/api/restaurants", "/api/playlists"]) {
      assert.equal((await anon.request("GET", p)).status, 200, p);
    }
  });
});

// ── WP2 Package B: anonymous participation guardrails and provenance ────────

describe("WP2-B: submission and upvote rate limits", () => {
  const food = (i: number) => ({ name: `Limit Popup ${i}`, venue: `Venue ${i}`, dateStart: futureDate(40 + i), summary: "s", requester: "Visitor", cuisine: "Other" });

  test("submission limit holds under concurrent load across instances, and is scoped", async () => {
    await resetLimits();
    const env = { SUBMISSIONS_PER_HOUR_PER_VISITOR: "5", UPVOTES_PER_HOUR_PER_VISITOR: "100" };
    const [a, b] = await Promise.all([startServer(env), startServer(env)]);
    const ip = "198.51.100.150";
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      new Client(i % 2 ? b.url : a.url, ip).request("POST", "/api/food-events", { body: food(i) })));
    const created = results.filter((r) => r.status === 201).length;
    const limited = results.filter((r) => r.status === 429);
    assert.equal(created, 5, `exactly 5 should get through, got ${created}`);
    assert.equal(limited.length, 5);
    assert.equal(limited[0].json.code, "RATE_LIMITED");
    assert.match(limited[0].json.message, /try again/i);
    assert.ok(Number(limited[0].headers.get("retry-after")) > 0);

    // Same visitor, other endpoints: unaffected.
    const sameIp = new Client(a.url, ip);
    assert.equal((await sameIp.request("POST", `/api/events/${ids.event}/upvote`)).status, 200, "upvotes have their own bucket");
    await sameIp.request("POST", `/api/events/${ids.event}/upvote`); // toggle back
    assert.equal((await sameIp.request("POST", "/api/ai/parse-blurb", { body: { blurb: "popup" } })).status, 200, "AI helper has its own limits");
    // Other visitors: unaffected. Admin on the same IP: exempt.
    assert.equal((await new Client(a.url, "198.51.100.151").request("POST", "/api/food-events", { body: food(50) })).status, 201);
    const admin = new Client(b.url, ip);
    await loginAsAdmin(admin);
    assert.equal((await admin.request("POST", "/api/food-events", { body: food(51) })).status, 201);
    // Manual music submissions share the submission bucket.
    const music = await new Client(a.url, ip).request("POST", "/api/events", { body: { emoji: "🎸", artist: "Late Band", venue: "Globe Hall", date: futureDate(60), summary: "s", soundsLike: "A, B", genre: "Rock & Alternative", requester: "V" } });
    assert.equal(music.status, 429);
  });

  test("limits follow the IP address, so clearing cookies doesn't reset them", async () => {
    await resetLimits();
    const s2 = await startServer({ UPVOTES_PER_HOUR_PER_VISITOR: "3", SUBMISSIONS_PER_HOUR_PER_VISITOR: "2" });
    const ip = "198.51.100.165";
    // A brand-new cookie jar for every request = a visitor clearing cookies each time.
    const fresh = () => new Client(s2.url, ip);
    const votes: number[] = [];
    for (let i = 0; i < 5; i++) votes.push((await fresh().request("POST", `/api/events/${ids.event}/upvote`)).status);
    assert.deepEqual(votes, [200, 200, 200, 429, 429]);
    const subs: number[] = [];
    for (let i = 0; i < 4; i++) subs.push((await fresh().request("POST", "/api/food-events", { body: food(90 + i) })).status);
    assert.deepEqual(subs, [201, 201, 429, 429]);
    // Reset the vote count left behind by the three fresh-visitor votes.
    await db.pool.query(`DELETE FROM upvotes WHERE event_id = $1`, [ids.event]);
    await db.pool.query(`UPDATE events SET upvotes = 0 WHERE id = $1`, [ids.event]);
  });

  test("upvote limit applies per visitor", async () => {
    await resetLimits();
    const s1 = await startServer({ UPVOTES_PER_HOUR_PER_VISITOR: "4" });
    const c = new Client(s1.url, "198.51.100.160");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await c.request("POST", `/api/events/${ids.event}/upvote`)).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429]);
    assert.equal((await new Client(s1.url, "198.51.100.161").request("POST", `/api/events/${ids.event}/upvote`)).status, 200);
    await new Client(s1.url, "198.51.100.161").request("POST", `/api/events/${ids.event}/upvote`);
  });
});

describe("WP2-B: upvote identity creation", () => {
  test("votes for missing or Scheduled events create no visitor records", async () => {
    const users = async () => (await db.pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n;
    const scheduled = (await db.pool.query(`INSERT INTO events (emoji, artist, venue, date, summary, sounds_like, genre, is_scheduled) VALUES ('🎸','Hosted Show','Globe Hall', now() + interval '9 days','s','A, B','Rock & Alternative', true) RETURNING id`)).rows[0].id;
    const before = await users();
    for (let i = 0; i < 3; i++) {
      // Fresh cookieless visitor each time — the worst case for record creation.
      assert.equal((await new Client(main.url, `198.51.100.${170 + i}`).request("POST", "/api/events/99999999/upvote")).status, 404);
      assert.equal((await new Client(main.url, `198.51.100.${175 + i}`).request("POST", `/api/events/${scheduled}/upvote`)).status, 400);
    }
    assert.equal(await users(), before, "no visitor records for rejected votes");
    const voter = new Client(main.url, "198.51.100.180");
    assert.equal((await voter.request("POST", `/api/events/${ids.event}/upvote`)).status, 200);
    assert.equal(await users(), before + 1, "a valid first vote creates exactly one");
    await voter.request("POST", `/api/events/${ids.event}/upvote`); // toggle back
    assert.equal(await users(), before + 1, "toggling reuses it");
  });
});

describe("WP2-B: provenance", () => {
  const via = async (table: string, where: string, params: any[]) =>
    (await db.pool.query(`SELECT created_via FROM ${table} WHERE ${where} ORDER BY id DESC LIMIT 1`, params)).rows[0]?.created_via;
  const spoof = { createdVia: "discovery", created_via: "discovery" };

  test("assigned by the server on every creation path, never from the client", async () => {
    await resetLimits();
    const anon = new Client(main.url, "198.51.100.190");
    const show = (artist: string) => ({ emoji: "🎸", artist, venue: "Globe Hall", date: futureDate(70), summary: "s", soundsLike: "A, B", genre: "Rock & Alternative", requester: "V", ...spoof });
    const listing = (name: string, extra: object) => ({ name, venue: `${name} venue`, dateStart: futureDate(71), summary: "s", requester: "V", ...extra, ...spoof });

    // Anonymous (manual, or after using the AI helper — parsing never creates anything).
    assert.equal((await anon.request("POST", "/api/ai/parse-blurb", { body: { blurb: "Taco popup" } })).status, 200);
    assert.equal((await anon.request("POST", "/api/events", { body: show("Anon Prov Band") })).status, 201);
    assert.equal((await anon.request("POST", "/api/food-events", { body: listing("Anon Prov Popup", { cuisine: "Other" }) })).status, 201);
    assert.equal((await anon.request("POST", "/api/art-events", { body: listing("Anon Prov Talk", { category: "Games" }) })).status, 201);
    assert.equal(await via("events", "artist = $1", ["Anon Prov Band"]), "anonymous");
    assert.equal(await via("food_events", "name = $1", ["Anon Prov Popup"]), "anonymous");
    assert.equal(await via("art_events", "name = $1", ["Anon Prov Talk"]), "anonymous");

    // Admin (including the duplicate action and AI-assisted entry).
    const admin = new Client(main.url, "198.51.100.191");
    await loginAsAdmin(admin);
    assert.equal((await admin.request("POST", "/api/events", { body: show("Admin Prov Band") })).status, 201);
    assert.equal((await admin.request("POST", "/api/food-events", { body: listing("Admin Prov Popup", { cuisine: "Other" }) })).status, 201);
    const dup = await admin.request("POST", `/api/art-events/${ids.art}/duplicate`);
    assert.equal(dup.status, 201, dup.text);
    assert.equal(await via("events", "artist = $1", ["Admin Prov Band"]), "admin");
    assert.equal(await via("food_events", "name = $1", ["Admin Prov Popup"]), "admin");
    assert.equal(await via("art_events", "id = $1", [dup.json.id]), "admin");

    // CSV import.
    const bulk = await admin.request("POST", "/api/events/bulk", { body: [{ ...show("CSV Prov Band"), date: futureDate(72) }] });
    assert.equal(bulk.json.results.created, 1, bulk.text);
    assert.equal(await via("events", "artist = $1", ["CSV Prov Band"]), "csv");

    // Discovery approval.
    const approved = await admin.request("POST", `/api/discovered-events/${ids.discoveredEvent}/approve`);
    assert.equal(approved.status, 200, approved.text);
    assert.equal(await via("events", "id = $1", [approved.json.event.id]), "discovery");

    // Edits can't change it.
    const onlyForbidden = await admin.request("PATCH", `/api/food-events/${ids.food}`, { body: { createdVia: "csv", created_via: "csv", id: 1, upvotes: 5 } });
    assert.equal(onlyForbidden.status, 400, "clear 400, not a server error");
    assert.match(onlyForbidden.json.message, /can't be set in an edit/);
    assert.equal((await admin.request("PATCH", `/api/food-events/${ids.food}`, { body: {} })).status, 400, "empty edit → 400");
    assert.equal(await via("food_events", "id = $1", [ids.food]), null, "historical rows stay null");
  });

  test("never appears in API responses", async () => {
    const anon = new Client(main.url, "198.51.100.192");
    const admin = new Client(main.url, "198.51.100.193");
    await loginAsAdmin(admin);
    const bodies: any[] = [];
    for (const p of ["/api/events", `/api/events/${ids.event}`, "/api/food-events", "/api/art-events"]) bodies.push((await anon.request("GET", p)).json);
    bodies.push((await anon.request("POST", "/api/food-events", { body: { name: "Resp Popup", venue: "Resp venue", dateStart: futureDate(80), summary: "s", requester: "V", cuisine: "Other" } })).json);
    bodies.push((await anon.request("POST", "/api/food-events", { body: { name: "Resp Popup 2", venue: "Resp venue", dateStart: futureDate(80), summary: "s", requester: "V", cuisine: "Other" } })).json); // possibleDuplicates
    bodies.push((await anon.request("POST", `/api/events/${ids.event}/upvote`)).json);
    await anon.request("POST", `/api/events/${ids.event}/upvote`);
    bodies.push((await admin.request("PATCH", `/api/food-events/${ids.food}`, { body: { soldOut: false } })).json);
    bodies.push((await admin.request("POST", `/api/events/${ids.event}/schedule`)).json);
    bodies.push((await admin.request("POST", `/api/events/${ids.event}/unschedule`)).json);
    const text = JSON.stringify(bodies);
    assert.ok(text.includes("possibleDuplicates"), "covered the duplicate-warning response");
    assert.doesNotMatch(text, /createdVia|created_via/);
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

  test("WP2 provenance migration is additive, idempotent, and constrained", async () => {
    await db.createDatabase("wp2_migration_check");
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: db.urlFor("wp2_migration_check") });
    try {
      for (const t of ["events", "food_events", "art_events"]) {
        await pool.query(`CREATE TABLE ${t} (id serial PRIMARY KEY, name text)`);
        await pool.query(`INSERT INTO ${t} (name) VALUES ('existing')`);
      }
      const { WP2_PROVENANCE_SQL } = await import("../scripts/migrate-wp2-provenance");
      await pool.query(WP2_PROVENANCE_SQL);
      await pool.query(WP2_PROVENANCE_SQL);
      for (const t of ["events", "food_events", "art_events"]) {
        assert.deepEqual((await pool.query(`SELECT name, created_via FROM ${t}`)).rows, [{ name: "existing", created_via: null }]);
        await pool.query(`INSERT INTO ${t} (name, created_via) VALUES ('new', 'anonymous')`);
        await assert.rejects(pool.query(`INSERT INTO ${t} (name, created_via) VALUES ('bad', 'bogus')`), /created_via_check/);
      }
    } finally {
      await pool.end();
    }
  });
});
