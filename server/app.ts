import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Server } from "http";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { log } from "./log";
import { pool } from "./db";
import { apiAccessPolicy, registerAuthRoutes } from "./auth";

// AI parsers accept a pasted screenshot; everything else is small JSON.
// Vercel caps request bodies at 4.5 MB regardless.
const LARGE_BODY_PATHS = new Set(["/api/ai/parse-blurb", "/api/ai/parse-art-blurb"]);
const jsonSmall = express.json({ limit: "1mb" });
const jsonLarge = express.json({ limit: "4.5mb" });

// Builds the Express app with all API routes registered but without any
// static/vite serving or listening — shared by the local server entry
// (server/index.ts) and the Vercel serverless entry (api/index.mjs).
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();

  // Trust proxy - required for deployments behind reverse proxy (Vercel, etc.)
  app.set("trust proxy", 1);

  app.use((req, res, next) => (LARGE_BODY_PATHS.has(req.path) ? jsonLarge : jsonSmall)(req, res, next));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // Never sign cookies with a fallback secret in production: the fallback is
  // in a public repo, so anyone could forge session cookies with it.
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }

  // Configure session middleware with PostgreSQL session store
  const PgSession = connectPgSimple(session);

  app.use(session({
    store: new PgSession({
      pool: pool,                // Connect to the same pool as our app
      tableName: 'session',     // Use a dedicated table for sessions
      createTableIfMissing: false, // Table exists; skip the per-instance ensure query
      // Serverless instances must not run background timers — each one would hold
      // pooler connections while frozen. Expired rows just sit in the table.
      pruneSessionInterval: false
    }),
    secret: process.env.SESSION_SECRET || 'setlist-social-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      // Not sent on cross-site POSTs (CSRF defense alongside the
      // X-Requested-With check in apiAccessPolicy).
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  // Deny-by-default authorization for /api. Runs after request logging (so
  // rejected attempts show up in logs) and before the anonymous-ID
  // middleware below (so rejected requests don't create session rows).
  app.use("/api", apiAccessPolicy);

  // Establish a user identity only when the client performs an action
  // (POST/PUT/PATCH/DELETE). Anonymous reads must not create or write
  // sessions — on serverless, a session write per request floods the
  // database pooler. Dirty sessions are persisted by express-session at
  // response end.
  app.use((req: Request & { session: any }, _res, next) => {
    if (req.method !== "GET" && !req.session.userId) {
      req.session.userId = randomUUID();
    }
    next();
  });

  registerAuthRoutes(app);
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) console.error("[express] unhandled error:", err);
    res.status(status).json({ message: status >= 500 ? "Internal Server Error" : message });
  });

  return { app, server };
}
