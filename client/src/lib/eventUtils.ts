// Shared helpers for the Food (AmsueBouche) and Arts (ArtistryNerdery) feeds.
// These were byte-for-byte identical copies living in both page files —
// consolidated here so a fix/change only has to happen once.

import { format } from "date-fns";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type EventRegion = "denver" | "front_range" | "mountains";

// Art/Nerdistry and Amuse Bouche events carry a free-text `neighborhood`
// (captured by the AI blurb parser at add-time) instead of the fixed venue
// roster the music feed uses to tag regions — most venues here are one-off
// pop-ups/galleries/parks that only ever appear once, so a hand-maintained
// venue→region whitelist (like shared/schema.ts's venueOptions) isn't
// practical. Classify by keyword match on the neighborhood text instead,
// defaulting to Denver — same "unlisted defaults to Denver" fallback Home.tsx
// uses for custom venues. Word-boundary matching (not substring) matters:
// "Golden Triangle" is a downtown Denver neighborhood, not the city of Golden.
const MOUNTAINS_KEYWORDS = [
  "vail", "breckenridge", "aspen", "crested butte", "idaho springs",
  "georgetown", "evergreen", "winter park", "steamboat", "estes park",
  "leadville", "frisco", "silverthorne", "keystone", "dillon", "morrison",
];
const FRONT_RANGE_KEYWORDS = [
  // "golden" excludes "Golden Triangle" — that's a downtown Denver
  // neighborhood (Denver Art Museum, Clyfford Still Museum, etc.), not the
  // city of Golden.
  "boulder", "aurora", "westminster", "golden(?!\\s+triangle)", "lakewood",
  "arvada", "louisville", "lyons", "longmont", "broomfield", "littleton",
  "englewood", "centennial", "greenwood village", "erie", "colorado springs",
  "fort collins", "greeley", "loveland", "larkspur", "wheat ?ridge",
  "thornton", "commerce city",
];

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => new RegExp(`\\b${kw}\\b`, "i").test(text));
}

/** Classifies an event's `neighborhood` text into a region for the region
 * filter. Unmatched/missing text defaults to "denver". */
export function classifyRegion(neighborhood: string | null | undefined): EventRegion {
  const text = neighborhood ?? "";
  if (matchesAny(text, MOUNTAINS_KEYWORDS)) return "mountains";
  if (matchesAny(text, FRONT_RANGE_KEYWORDS)) return "front_range";
  return "denver";
}

/** Today (or the given Date) as a local YYYY-MM-DD string. Deliberately NOT
 * `d.toISOString().split('T')[0]` — that converts to UTC first, so for any
 * timezone behind UTC (Denver is UTC-6/-7) it silently rolls over to
 * tomorrow's date once local time + the UTC offset crosses midnight, i.e.
 * every evening from ~6pm on. That broke "today"/"tomorrow"/weekend
 * filtering and same-day event visibility for the back half of every day. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Mirrors the `filterDay` matching rules AmsueBouche/ArtistryNerdery apply to
// `dateStart` when building filteredEvents — but as a pure function of a date
// string, independent of whether any event actually falls on it. Lets a
// day-scroll view tell "this day is empty because nothing's on" apart from
// "this day was excluded by the filter on purpose" (e.g. "Mondays only").
export function dayMatchesFilter(dateStr: string, filterDay: string): boolean {
  if (filterDay === "all") return true;
  const todayStr = localDateStr();
  if (filterDay === "today") return dateStr === todayStr;
  if (filterDay === "tomorrow") {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return dateStr === localDateStr(d);
  }
  if (filterDay === "weekend") {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 6=Sat
    if (dow === 0) return dateStr === todayStr;
    const daysUntilSat = dow === 6 ? 0 : 6 - dow;
    const sat = new Date(today); sat.setDate(today.getDate() + daysUntilSat);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    return dateStr === localDateStr(sat) || dateStr === localDateStr(sun);
  }
  if (filterDay === "next-week") {
    const today = new Date();
    const daysSinceMonday = (today.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - daysSinceMonday);
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday = new Date(nextMonday); nextSunday.setDate(nextMonday.getDate() + 6);
    return dateStr >= localDateStr(nextMonday) && dateStr <= localDateStr(nextSunday);
  }
  if (filterDay === "next-month") {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return dateStr >= localDateStr(start) && dateStr <= localDateStr(end);
  }
  const [y, mo, dy] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, dy);
  if (filterDay.startsWith("month:")) return format(d, "MMMM yyyy") === filterDay.slice(6);
  return d.getDay().toString() === filterDay;
}

export const RISK_LABELS = ["", "Low", "Mild", "Moderate", "High", "Instant sellout"];

export function ensureHttps(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url;
}

export function riskPips(level: number | null | undefined): string | null {
  if (!level || level < 1 || level > 5) return null;
  return "●".repeat(level);
}

export function daysLive(announcedAt: string | null | undefined): string | null {
  if (!announcedAt) return null;
  const announced = new Date(announcedAt + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.floor((today.getTime() - announced.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function formatDateRange(dateStart: string, dateEnd?: string | null): string {
  const parse = (d: string) => new Date(d + "T12:00:00");
  const fmt = (d: string) =>
    parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dow = (d: string) => DAYS[parse(d).getDay()];

  if (!dateEnd || dateEnd === dateStart) return `${dow(dateStart)} ${fmt(dateStart)}`;
  const s = parse(dateStart);
  const e = parse(dateEnd);
  if (s.getMonth() === e.getMonth())
    return `${dow(dateStart)} ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}`;
  return `${dow(dateStart)} ${fmt(dateStart)} – ${dow(dateEnd)} ${fmt(dateEnd)}`;
}

/** Day-group header label for the day-boxed list view — "Fri, Aug 21".
 * Callers apply `uppercase` via CSS rather than baking it in here. */
export function formatDayHeaderLabel(dateStart: string): string {
  const d = new Date(dateStart + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Bare cadence words render lowercase ("monthly") while weekday-based labels
// stay as-is ("Fridays", "3rd Sundays" read as proper nouns) — matches the
// design handoff's mixed-case example rows.
const GENERIC_CADENCE_LABELS = new Set(["monthly", "weekly", "quarterly", "annually"]);
export function formatRecurrenceCadence(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return "monthly";
  return GENERIC_CADENCE_LABELS.has(trimmed.toLowerCase()) ? trimmed.toLowerCase() : trimmed;
}

// Threshold above which the shared "sellout likely" phrase shows on a row —
// kept in one place per the design handoff so it's easy to retune later.
export const SELLOUT_LIKELY_THRESHOLD = 3;

/** Tooltip copy for the "sellout likely" phrase: "Announced Jul 2 — 44 days
 * on the feed". Null when there's no announcedAt to derive it from. */
export function announcedTooltipText(announcedAt: string | null | undefined): string | null {
  if (!announcedAt) return null;
  const announced = new Date(announcedAt + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.max(0, Math.floor((today.getTime() - announced.getTime()) / (1000 * 60 * 60 * 24)));
  const dateLabel = announced.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Announced ${dateLabel} — ${days} day${days === 1 ? "" : "s"} on the feed`;
}

export function getMonthLabel(dateStart: string): string {
  const eventDate = new Date(dateStart + "T12:00:00");
  const now = new Date();
  const eventMonthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const displayDate = eventMonthStart < currentMonthStart ? now : eventDate;
  return displayDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${mStr} ${ampm}`;
}

/** True once a same-day, single-day event's start time has passed (local
 * wall-clock time) — used to drop it from the feed once it's already
 * underway. Multi-day spans are excluded (their true end is dateEnd, handled
 * by the "Still Time" bucket instead) and events without a valid HH:MM
 * startTime are never hidden this way, since there's nothing to compare. */
export function hasStartTimePassed(
  ev: { dateStart: string; dateEnd?: string | null; startTime?: string | null },
  todayStr: string,
): boolean {
  if (ev.dateStart !== todayStr) return false;
  if (ev.dateEnd && ev.dateEnd !== "" && ev.dateEnd !== ev.dateStart) return false;
  if (!ev.startTime || !/^\d{1,2}:\d{2}$/.test(ev.startTime)) return false;
  const [h, m] = ev.startTime.split(":").map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

// Structural shape shared by FoodEvent and ArtEvent (and anything else with
// the same "listing" fields) — kept independent of @shared/schema so this
// file has no feed-specific imports.
export interface ListingEventLike {
  name: string;
  venue: string;
  neighborhood?: string | null;
  dateStart: string;
  dateEnd?: string | null;
  startTime?: string | null;
  summary?: string | null;
  ticketUrl?: string | null;
  sourceUrl?: string | null;
}

export function createSearchUrl(event: ListingEventLike): string {
  const parts: string[] = [event.name, event.venue, "Denver"];
  if (event.dateStart) {
    const d = new Date(event.dateStart + "T12:00:00");
    parts.push(d.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
  }
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

export function createCalendarUrl(event: ListingEventLike): string {
  const toGCal = (d: string) => d.replace(/-/g, "");
  const text = encodeURIComponent(event.name);
  const loc = encodeURIComponent(`${event.venue}${event.neighborhood ? ", " + event.neighborhood : ""}, Denver CO`);
  const detailsParts: string[] = [];
  if (event.summary) detailsParts.push(event.summary);
  if (event.ticketUrl) detailsParts.push(`Tickets: ${event.ticketUrl}`);
  if (event.sourceUrl) detailsParts.push(`More info: ${event.sourceUrl}`);
  const details = encodeURIComponent(detailsParts.join("\n"));
  const hasTime = event.startTime && /^\d{1,2}:\d{2}$/.test(event.startTime);
  if (hasTime) {
    const [hStr, mStr] = event.startTime!.split(":");
    const startDT = `${toGCal(event.dateStart)}T${hStr.padStart(2, "0")}${mStr}00`;
    const endH = (parseInt(hStr) + 2) % 24;
    const endDT = `${toGCal(event.dateStart)}T${String(endH).padStart(2, "0")}${mStr}00`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&location=${loc}&details=${details}&dates=${startDT}/${endDT}`;
  }
  const endDate = event.dateEnd ? event.dateEnd : event.dateStart;
  const end = toGCal(new Date(new Date(endDate + "T12:00:00").getTime() + 86400000).toISOString().slice(0, 10));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&location=${loc}&details=${details}&dates=${toGCal(event.dateStart)}/${end}`;
}

// ── Recurring event helpers ───────────────────────────────────────────────────
// The actual expansion logic lives in @shared/recurrence (not here) so the
// server's .ics calendar-feed generation can reuse the exact same "which
// occurrences are upcoming" math instead of drifting out of sync with what
// the feed pages display. Re-exported here so existing client imports
// (`@/lib/eventUtils`) don't need to change.
export { classifyRecurrence, addCalDays, addCalMonths, expandRecurringEvents, type RecurringEventLike } from "@shared/recurrence";
