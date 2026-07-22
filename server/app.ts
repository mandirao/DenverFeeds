import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Server } from "http";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { log } from "./log";
import { pool } from "./db";

// Builds the Express app with all API routes registered but without any
// static/vite serving or listening — shared by the local server entry
// (server/index.ts) and the Vercel serverless entry (api/index.mjs).
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();

  // Trust proxy - required for deployments behind reverse proxy (Vercel, etc.)
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: false, limit: "20mb" }));

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
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  }));

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

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return { app, server };
}
