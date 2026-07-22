import { createApp } from "./app";
import { log } from "./log";
import { setupVite, serveStatic } from "./vite";

// Prevent transient database connection drops from crashing the process
process.on("uncaughtException", (err: any) => {
  if (err?.code === "57P01" || err?.message?.includes("terminating connection")) {
    console.warn("[db] connection terminated by server — will reconnect on next request.");
  } else {
    console.error("[uncaughtException]", err);
  }
});

process.on("unhandledRejection", (reason: any) => {
  if (reason?.code === "57P01" || reason?.message?.includes("terminating connection")) {
    console.warn("[db] connection rejection — will reconnect on next request.");
  } else {
    console.error("[unhandledRejection]", reason);
  }
});

(async () => {
  const { app, server } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
