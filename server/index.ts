import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import { randomUUID } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const app = express();

// Trust proxy - required for deployments behind reverse proxy (Replit, etc.)
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure session middleware with PostgreSQL session store
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    pool: pool,                // Connect to the same pool as our app
    tableName: 'session',     // Use a dedicated table for sessions
    createTableIfMissing: true // Auto-create the session table if it doesn't exist
  }),
  secret: process.env.SESSION_SECRET || 'setlist-social-dev-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Add user ID to session if not present
app.use((req: Request & { session: any }, res, next) => {
  // Initialize the session with a UUID if it doesn't have one
  if (!req.session.userId) {
    const newUserId = randomUUID();
    console.log(`Creating new session with userId: ${newUserId}`);
    req.session.userId = newUserId;
    // Save the session immediately to ensure it's persisted
    req.session.save((err: Error | null) => {
      if (err) {
        console.error('Error saving session:', err);
      } else {
        console.log(`Successfully saved session for userId: ${newUserId}`);
      }
      next();
    });
  } else {
    console.log(`Using existing session userId: ${req.session.userId}`);
    next();
  }
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

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
