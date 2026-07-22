# DenverFeeds (Setlist Social Feed)

A Denver events feed with three linked apps sharing one codebase and database, switchable via the title dropdown in each navbar:

- **Setlist Social Feed** (`/`) — indie music shows: chronological feed, filters by month/genre/location/recency, upvoting, Google Calendar / Maps / Spotify integrations, CSV bulk import, AI artist analysis, and an automated concert-discovery admin panel.
- **Amuse Bouche** (`/amuse-bouche`) — foodie popups with its own gold/cream design, AI blurb parser (paste an Instagram/social blurb → Claude extracts name/venue/dates/price/cuisine), and a curated "Best Of Denver" restaurant list.
- **Artistry & Nerdistry Live** (`/artistry-nerdistry`) — art, science, literary & cultural events with an AI screenshot/blurb parser and category filters.

## Architecture

Migrated off Replit in July 2026. The stack is now **GitHub + Vercel + Supabase**:

- **Frontend**: React 18 + TypeScript, Vite, Wouter routing, TanStack Query, Radix UI / shadcn-style components, Tailwind CSS. Built to static assets in `dist/public`.
- **Backend**: Express (TypeScript) with a RESTful API under `/api`. The app factory lives in `server/app.ts` and is shared by two entries:
  - `server/index.ts` — local dev/prod server (Vite middleware in dev, static serving in prod).
  - `api/index.mjs` — Vercel serverless function; `npm run build:vercel` bundles `server/app.ts` into `api/_app.mjs` (gitignored) with esbuild.
- **Database**: Supabase Postgres via Drizzle ORM (`drizzle-orm/node-postgres`, single `DATABASE_URL` consumed in `server/db.ts`). Schema is declared in `shared/schema.ts` and pushed with `npm run db:push`. Sessions are stored in the same database (`connect-pg-simple`).
- **AI features**: Anthropic API (`@anthropic-ai/sdk`) for blurb/screenshot parsing and artist analysis.
- **Analytics**: PostHog page-view tracking (`client/src/lib/posthog.ts`); events carry a `site` property (`setlist-social`, `amuse-bouche`, `artistry-nerdistry`).
- **Routing on Vercel**: `vercel.json` rewrites `/api/*` to the serverless function and everything else to `index.html` (SPA fallback).

### Data model

Tables (see `shared/schema.ts`): `users`, `events` (music shows), `upvotes`, `playlists`, `artists`, `discovered_events`, `discovered_artists`, `venues`, `food_events` (Amuse Bouche), `art_events` (Artistry & Nerdistry), `restaurants` (Best Of Denver), plus a `session` table auto-created by the session store.

### Known limitation

The automated venue-scraping/discovery services (`server/venue-scraper.ts`, `server/omr-headless-scraper.ts`) use Puppeteer and were designed for Replit's long-running VM. They still work locally, but headless-Chromium scraping is not supported inside the Vercel serverless function — the admin discovery endpoints will error in production. Core feeds, upvoting, adding events, and AI parsing are unaffected.

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Supabase Postgres connection string (Session pooler URI) |
| `SESSION_SECRET` | yes (prod) | Signs Express session cookies |
| `ANTHROPIC_API_KEY` | yes | AI blurb/screenshot parsers, artist analysis |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | optional | Artist lookup enrichment |
| `SERPER_API_KEY` | optional | Automated concert discovery web search |
| `VITE_POSTHOG_KEY` | optional | PostHog analytics |

Production values are set as Vercel environment variables (`vercel env add …`), never committed.

## Local setup

```bash
npm install
cp .env.example .env   # fill in values
npm run db:push        # create/sync schema in the database
npm run dev            # serves client + API on http://localhost:5000
```

Other scripts: `npm run check` (typecheck), `npm run build` (self-hosted prod build → `dist/`), `npm run build:vercel` (Vercel build: static client + serverless bundle), `npm start` (run self-hosted prod build).

## Deployment

Pushes to `main` deploy via the Vercel Git integration, or deploy manually with `vercel --prod`. The Vercel project uses `npm run build:vercel` (configured in `vercel.json`).
