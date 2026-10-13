import type { NextFunction, Request, Response } from "express";
import { getActor } from "./auth";
import { hashClientIp, incrementCounter, secondsUntilNextUtcHour, utcHourKey } from "./rate-limit";

// Per-visitor (IP) hourly limits for the public write routes, on the same
// Postgres counters as the AI limits. Generous on purpose: a person adding a
// batch of events, or a room of meetup attendees on one Wi-Fi network
// voting, stays well under them; a script doesn't. Each kind has its own
// bucket, so hitting one never blocks the other or the AI helpers.
type LimitKind = "submission" | "upvote";

const CONFIG: Record<LimitKind, { env: string; fallback: number; message: string }> = {
  submission: {
    env: "SUBMISSIONS_PER_HOUR_PER_VISITOR",
    fallback: 30,
    message: "You've added a lot of events in the last hour. Thank you! Please try again a little later.",
  },
  upvote: {
    env: "UPVOTES_PER_HOUR_PER_VISITOR",
    fallback: 120,
    message: "You're voting faster than we can count. Please try again in a little while.",
  },
};

export function hourlyLimit(kind: LimitKind): number {
  const raw = process.env[CONFIG[kind].env];
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : CONFIG[kind].fallback;
}

export function anonymousWriteLimit(kind: LimitKind) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if ((await getActor(req)).kind === "admin") return next();
      const count = await incrementCounter(`${kind}:${hashClientIp(req)}`, utcHourKey());
      if (count > hourlyLimit(kind)) {
        res.set("Retry-After", String(secondsUntilNextUtcHour()));
        return res.status(429).json({ message: CONFIG[kind].message, code: "RATE_LIMITED" });
      }
      next();
    } catch (err) {
      // Unlike the paid AI calls, these routes cost nothing extra: if the
      // counter itself fails, let the request through rather than block
      // contribution (the route needs the same database anyway).
      console.warn(`[abuse-limits] ${kind} limit check failed:`, err instanceof Error ? err.message : err);
      next();
    }
  };
}
