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
| `AI_ANON_HOURLY_LIMIT_PER_VISITOR` | optional (default 20) | AI parser calls per visitor (IP) per hour |
| `AI_ANON_DAILY_BUDGET_CENTS` | optional (default 200) | Estimated anonymous AI spend per Denver day; `0` turns anonymous AI off |
| `LOGIN_ATTEMPTS_PER_HOUR` | optional (default 10) | Admin sign-in attempts per IP per hour |
| `SUBMISSIONS_PER_HOUR_PER_VISITOR` | optional (default 30) | Anonymous manual event submissions per IP per hour (all three feeds) |
| `UPVOTES_PER_HOUR_PER_VISITOR` | optional (default 120) | Anonymous upvote actions per IP per hour |

Production values are set as Vercel environment variables (`vercel env add …`), never committed.

## Security model

Three kinds of caller, resolved server-side on every request (`server/auth.ts`):

- **Anonymous visitors** browse everything, upvote, and submit events (manually or with the AI parsers). No account needed.
- **Admin**: one account, provisioned with `npx tsx --env-file=.env scripts/create-admin.ts <username>` (no signup UI). Sign in at `/admin` on each domain. Admin status is read from `users.role` in the database, never from the client.
- **Members**: reserved for later; nothing grants this today.

Every non-GET `/api` request requires admin **unless** it is on the public allowlist in `server/auth.ts` (`PUBLIC_WRITE_ROUTES`), and must send an `X-Requested-With` header (CSRF guard). `npm test` fails if a route's exposure changes.

Anonymous submissions and upvotes have their own generous per-visitor hourly limits (`server/abuse-limits.ts`); admins are exempt. Edits go through explicit allowlists (`update*Schema` in `shared/schema.ts`), so ids, counters and timestamps can't be written through the API. Every new event records how it was created in an internal `created_via` column (`anonymous`, `admin`, `csv`, `discovery`) that is never returned by the API.

Anonymous AI parsing (`/api/ai/parse-blurb`, `/parse-art-blurb`, `/analyze-artist`) is limited per visitor and by a shared daily budget, both counted in Postgres so limits hold across serverless instances (`server/ai-guard.ts`). `npx tsx --env-file=.env scripts/ai-usage-report.ts` shows daily AI usage next to events actually created.

## Tests

`npm test` runs the security suite against a throwaway local Postgres (`embedded-postgres`) and a fake Anthropic API. It never touches the real database or makes paid calls.

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
