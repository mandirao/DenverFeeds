import type { NextFunction, Request, Response } from "express";
import { pool } from "./db";
import { getActor } from "./auth";
import {
  denverDayKey, hashClientIp, incrementCounter, secondsUntilNextUtcHour, utcHourKey,
} from "./rate-limit";

// Every Anthropic-backed route goes through aiGuard(). Anonymous visitors may
// use the contribution parsers, within shared limits enforced in Postgres;
// everything else is admin-only (also enforced by apiAccessPolicy).
//
// estCostCents is a worst-case per-call estimate used for the anonymous
// daily budget, derived from the current calls in llm-service.ts (Serper at
// ~$1 per 1,000 queries, the small-pack price):
//   parse-blurb / parse-art-blurb: 2× Opus 4.5 ($5/$25 per MTok). Pass-1 and
//     pass-2 prompts (~5K tokens together) + a 5,000-char blurb (~1.3K) + an
//     image (≤~1.6K) + search context and pass-1 JSON (~1K) ≈ 9K tokens in
//     (~4.4¢); output capped at 800 + 400 tokens (≤3¢); 3 Serper queries
//     (0.3¢) ≈ 7.7¢ → 8¢.
//   analyze-artist: 1× Sonnet 4.5 ($3/$15) with ≈2.5K tokens in (~0.8¢) and
//     ≤1,024 out (≤1.5¢), plus up to 7 Serper queries (0.7¢) ≈ 3¢.
// Typical calls cost less, so the budget errs toward stopping early.
export const AI_ENDPOINTS = {
  "parse-blurb":             { estCostCents: 8, anonymous: true },
  "parse-art-blurb":         { estCostCents: 8, anonymous: true },
  "analyze-artist":          { estCostCents: 3, anonymous: true },
  "redo-art-event-content":  { estCostCents: 5, anonymous: false },
  "redo-food-event-content": { estCostCents: 5, anonymous: false },
  "fill-restaurant":         { estCostCents: 5, anonymous: false },
} as const;
export type AiEndpoint = keyof typeof AI_ENDPOINTS;

// Thresholds are env vars so they can change without a code change (a
// redeploy is needed for Vercel to pick up new values). Defaults: ~20 AI
// calls per visitor per hour covers several submissions with retries; $2/day
// (≈25 worst-case parses) caps unattended abuse at ≈$60/month even if
// sustained every day.
export function aiLimits() {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    perVisitorHourly: num(process.env.AI_ANON_HOURLY_LIMIT_PER_VISITOR, 20),
    dailyBudgetCents: num(process.env.AI_ANON_DAILY_BUDGET_CENTS, 200),
  };
}

// Input caps, applied before any counting or paid call. The image cap keeps
// the whole request under Vercel's 4.5 MB body limit; the client downsizes
// screenshots well below it, and Claude resizes larger images anyway.
export const AI_INPUT_LIMITS = {
  blurbChars: 5_000,
  imageBase64Chars: 4_000_000, // ≈3 MB decoded
  fileNameChars: 200,
  artistChars: 100,
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function validateInput(endpoint: AiEndpoint, body: any): string | null {
  if (endpoint === "analyze-artist") {
    const artist = body?.artist;
    if (typeof artist !== "string" || !artist.trim()) return "Artist name is required";
    if (artist.length > AI_INPUT_LIMITS.artistChars) return `Artist name must be under ${AI_INPUT_LIMITS.artistChars} characters`;
    return null;
  }
  if (endpoint === "parse-blurb" || endpoint === "parse-art-blurb") {
    const { blurb, imageBase64, imageMediaType, fileName } = body ?? {};
    if (blurb !== undefined && blurb !== null && typeof blurb !== "string") return "Description must be text";
    if (imageBase64 !== undefined && imageBase64 !== null && typeof imageBase64 !== "string") return "Invalid image";
    if (!blurb && !imageBase64) return "blurb or image is required";
    if (blurb && blurb.length > AI_INPUT_LIMITS.blurbChars) {
      return `Please shorten the description to under ${AI_INPUT_LIMITS.blurbChars.toLocaleString()} characters`;
    }
    if (imageBase64) {
      if (imageBase64.length > AI_INPUT_LIMITS.imageBase64Chars) return "That image is too large. Please use a smaller screenshot.";
      if (!IMAGE_TYPES.has(imageMediaType)) return "Images must be JPEG, PNG, GIF, or WebP";
    }
    if (fileName !== undefined && (typeof fileName !== "string" || fileName.length > AI_INPUT_LIMITS.fileNameChars)) {
      return "Invalid file name";
    }
  }
  return null;
}

// Aggregate counters only: day × endpoint × actor × outcome.
async function recordUsage(endpoint: AiEndpoint, actor: "anonymous" | "admin", outcome: string) {
  try {
    await pool.query(
      `INSERT INTO ai_usage_daily (day, endpoint, actor, outcome, count) VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (day, endpoint, actor, outcome) DO UPDATE SET count = ai_usage_daily.count + 1`,
      [denverDayKey(), endpoint, actor, outcome],
    );
  } catch (err) {
    console.warn("[ai-guard] usage record failed:", err instanceof Error ? err.message : err);
  }
}

// Records succeeded/failed once the handler responds. The write is awaited
// before the body goes out, so it can't be lost when a serverless instance
// freezes after the response.
function recordOutcomeOnResponse(res: Response, endpoint: AiEndpoint, actor: "anonymous" | "admin") {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const outcome = res.statusCode < 400 ? "succeeded" : "failed";
    recordUsage(endpoint, actor, outcome).finally(() => originalJson(body));
    return res;
  }) as Response["json"];
}

export const AI_MESSAGES = {
  unavailable: "The AI helper is temporarily unavailable. You can still add the event by filling in the details yourself.",
  rateLimited: "You've used the AI helper a lot in the last hour. Please try again a bit later, or fill in the details yourself.",
  dailyLimit: "The AI helper has reached its limit for today. You can still add the event by filling in the details yourself.",
};

export function aiGuard(endpoint: AiEndpoint) {
  const config = AI_ENDPOINTS[endpoint];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = await getActor(req);
      const actorLabel = actor.kind === "admin" ? "admin" : "anonymous";

      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ message: AI_MESSAGES.unavailable, code: "AI_UNAVAILABLE" });
      }

      const inputError = validateInput(endpoint, req.body);
      if (inputError) {
        await recordUsage(endpoint, actorLabel, "rejected_input");
        return res.status(400).json({ message: inputError, code: "AI_INPUT_INVALID" });
      }

      if (actor.kind === "admin") {
        recordOutcomeOnResponse(res, endpoint, "admin");
        return next();
      }
      if (!config.anonymous) {
        return res.status(403).json({ message: "Admin access required", code: "ADMIN_REQUIRED" });
      }

      const limits = aiLimits();

      // Per-visitor throttle first, so one visitor can't drain the shared
      // daily budget for everyone else.
      const visitorCount = await incrementCounter(`ai-visitor:${hashClientIp(req)}`, utcHourKey());
      if (visitorCount > limits.perVisitorHourly) {
        await recordUsage(endpoint, "anonymous", "rate_limited");
        res.set("Retry-After", String(secondsUntilNextUtcHour()));
        return res.status(429).json({ message: AI_MESSAGES.rateLimited, code: "AI_RATE_LIMITED" });
      }

      // Reserve this call's estimated cost against today's shared budget. The
      // increment is atomic, so concurrent requests can't overshoot it.
      const spentCents = await incrementCounter("ai-anon-budget-cents", denverDayKey(), config.estCostCents);
      if (spentCents > limits.dailyBudgetCents) {
        if (spentCents - config.estCostCents <= limits.dailyBudgetCents) {
          // First request over the line: one greppable log line per day.
          console.warn(`[ai-guard] anonymous AI daily budget reached (${limits.dailyBudgetCents}¢)`);
        }
        await recordUsage(endpoint, "anonymous", "daily_limited");
        return res.status(429).json({ message: AI_MESSAGES.dailyLimit, code: "AI_DAILY_LIMIT" });
      }

      recordOutcomeOnResponse(res, endpoint, "anonymous");
      next();
    } catch (err) {
      // Fail closed: if we can't verify the limits, don't make paid calls.
      console.error("[ai-guard] limit check failed:", err instanceof Error ? err.message : err);
      res.status(503).json({ message: AI_MESSAGES.unavailable, code: "AI_UNAVAILABLE" });
    }
  };
}
