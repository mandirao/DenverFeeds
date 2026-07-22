// Vercel serverless entry. ./_app.mjs is generated at build time by the
// build:vercel script (esbuild bundle of server/app.ts).
import { createApp } from "./_app.mjs";

// Built once per lambda instance and reused across invocations.
const appPromise = createApp();

export default async function handler(req, res) {
  const { app } = await appPromise;
  app(req, res);
}
