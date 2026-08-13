// Shared helpers for the Food (AmsueBouche) and Arts (ArtistryNerdery) feeds.
// These were byte-for-byte identical copies living in both page files —
// consolidated here so a fix/change only has to happen once.

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
