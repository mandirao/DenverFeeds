import type { Express, NextFunction, Request, Response } from "express";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { hashClientIp, incrementCounter, utcHourKey } from "./rate-limit";

declare module "express-session" {
  interface SessionData {
    // Anonymous visitor identity (maps to users.session_id); created on the
    // first non-GET request. Kept across login/logout so upvotes survive.
    userId?: string;
    // users.id of a signed-in account. Role is always re-read from the DB.
    authUserId?: number;
  }
}

// Who is making this request, resolved server-side only. "member" is
// reserved for a future signed-in non-admin; nothing grants it today.
export type Actor =
  | { kind: "anonymous" }
  | { kind: "member"; userId: number }
  | { kind: "admin"; userId: number };

const actorCache = new WeakMap<Request, Actor>();

export async function getActor(req: Request): Promise<Actor> {
  const cached = actorCache.get(req);
  if (cached) return cached;

  let actor: Actor = { kind: "anonymous" };
  const authUserId = req.session?.authUserId;
  if (typeof authUserId === "number") {
    const user = await storage.getUser(authUserId);
    if (user?.role === "admin") actor = { kind: "admin", userId: user.id };
    else if (user) actor = { kind: "member", userId: user.id };
  }
  actorCache.set(req, actor);
  return actor;
}

// ── Password hashing (Node's built-in scrypt; no extra dependency) ──────────

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

// Equalizes response time when the username doesn't exist.
const DUMMY_HASH = "scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:" + Buffer.alloc(64).toString("base64");

// ── Access policy ───────────────────────────────────────────────────────────
// Deny by default: every state-changing /api request requires an admin unless
// it is listed here. A new route is therefore admin-only until someone
// deliberately makes it public. Paths are relative to /api.
export const PUBLIC_WRITE_ROUTES: ReadonlyArray<readonly [string, RegExp]> = [
  ["POST", /^\/events$/],                                         // anonymous show submission
  ["POST", /^\/events\/\d+\/upvote$/],                            // anonymous upvote toggle
  ["POST", /^\/(food|art)-events$/],                              // anonymous food/art submission
  ["POST", /^\/ai\/(parse-blurb|parse-art-blurb|analyze-artist)$/], // AI-assisted submission (quota-limited)
  ["POST", /^\/auth\/(login|logout)$/],
];

// Reads that spend money or expose internal configuration.
const ADMIN_ONLY_READS: ReadonlyArray<RegExp> = [/^\/admin\//];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function isPublicWrite(method: string, path: string): boolean {
  const p = normalizePath(path);
  return PUBLIC_WRITE_ROUTES.some(([m, re]) => m === method && re.test(p));
}

// Mounted at /api, after the session middleware and before any route.
export async function apiAccessPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const path = normalizePath(req.path);
    if (SAFE_METHODS.has(req.method)) {
      if (!ADMIN_ONLY_READS.some((re) => re.test(path))) return next();
    } else {
      // CSRF guard: a cross-site form or image can't set custom headers, and
      // cross-origin fetch can't either without a CORS preflight we never allow.
      if (!req.get("X-Requested-With")) {
        return res.status(403).json({ message: "Missing X-Requested-With header", code: "CSRF_HEADER_REQUIRED" });
      }
      if (isPublicWrite(req.method, path)) return next();
    }

    const actor = await getActor(req);
    if (actor.kind === "admin") return next();
    return res.status(403).json({ message: "Admin access required", code: "ADMIN_REQUIRED" });
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await getActor(req);
    if (actor.kind === "admin") return next();
    res.status(403).json({ message: "Admin access required", code: "ADMIN_REQUIRED" });
  } catch (err) {
    next(err);
  }
}

// ── Login / logout / me ─────────────────────────────────────────────────────

function regenerateSession(req: Request, keep: { userId?: string; authUserId?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      if (keep.userId) req.session.userId = keep.userId;
      if (keep.authUserId !== undefined) req.session.authUserId = keep.authUserId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

function loginAttemptsPerHour(): number {
  return Number(process.env.LOGIN_ATTEMPTS_PER_HOUR) || 10;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || typeof password !== "string" || !username || !password
          || username.length > 100 || password.length > 200) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const attempts = await incrementCounter(`login:${hashClientIp(req)}`, utcHourKey());
      if (attempts > loginAttemptsPerHour()) {
        return res.status(429).json({ message: "Too many sign-in attempts. Try again later." });
      }

      const user = await storage.getUserByUsername(username);
      const passwordOk = await verifyPassword(password, user?.password || DUMMY_HASH);
      if (!user || user.role !== "admin" || !user.password || !passwordOk) {
        return res.status(401).json({ message: "Incorrect username or password" });
      }

      // New session ID on privilege change (prevents session fixation).
      await regenerateSession(req, { userId: req.session.userId, authUserId: user.id });
      res.json({ isAdmin: true });
    } catch (error) {
      console.error("Login error:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Sign-in failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await regenerateSession(req, { userId: req.session.userId });
      res.json({ isAdmin: false });
    } catch (error) {
      res.status(500).json({ message: "Sign-out failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const actor = await getActor(req);
      res.set("Cache-Control", "no-store");
      res.json({ isAdmin: actor.kind === "admin" });
    } catch (error) {
      res.status(500).json({ message: "Failed to load session" });
    }
  });
}
