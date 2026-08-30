// Shared helpers for the Food (AmsueBouche) and Arts (ArtistryNerdery) feeds.
// These were byte-for-byte identical copies living in both page files —
// consolidated here so a fix/change only has to happen once.

import { format } from "date-fns";
import {
  denverProperNeighborhoods, denverMetroSuburbs, frontRangeCities,
  type DenverProperNeighborhood, type DenverMetroSuburb, type FrontRangeCity, type MetroBroadRegion,
} from "@shared/schema";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Art/Nerdistry and Amuse Bouche events carry a free-text `neighborhood`
// (captured by the AI blurb parser at add-time) instead of the fixed venue
// roster the music feed uses to tag regions — most venues here are one-off
// pop-ups/galleries/parks that only ever appear once, so a hand-maintained
// venue→region whitelist (like shared/schema.ts's venueOptions) isn't
// practical. Classify by keyword match on the neighborhood text instead.
// Word-boundary matching (not substring) matters: "Golden Triangle" is a
// downtown Denver neighborhood, not the city of Golden.
const MOUNTAINS_KEYWORDS = [
  "vail", "breckenridge", "aspen", "crested butte", "idaho springs",
  "georgetown", "evergreen", "winter park", "steamboat", "estes park",
  "leadville", "frisco", "silverthorne", "keystone", "dillon", "morrison",
];

// Each Front Range city and each Denver suburb gets its own keyword rule
// (rather than one flat keyword list per broad tier) so the *specific* city/
// suburb can be reported too, not just the broad tier — these double as the
// options nested under "Front Range" / "Suburbs" in the filter dropdown.
const FRONT_RANGE_CITY_RULES: [FrontRangeCity, string[]][] = [
  ["Boulder", ["boulder"]],
  ["Broomfield", ["broomfield"]],
  ["Colorado Springs", ["colorado springs"]],
  ["Erie", ["erie"]],
  ["Fort Collins", ["fort collins"]],
  // "golden" excludes "Golden Triangle" — that's a downtown Denver
  // neighborhood (Denver Art Museum, Clyfford Still Museum, etc.), not the
  // foothills city of Golden.
  ["Golden", ["golden(?!\\s+triangle)"]],
  ["Greeley", ["greeley"]],
  ["Larkspur", ["larkspur"]],
  ["Longmont", ["longmont"]],
  ["Louisville", ["louisville"]],
  ["Loveland", ["loveland"]],
  ["Lyons", ["lyons"]],
];
const SUBURB_RULES: [DenverMetroSuburb, string[]][] = [
  ["Arvada", ["arvada"]],
  ["Aurora", ["aurora"]],
  ["Centennial", ["centennial"]],
  ["Commerce City", ["commerce city"]],
  ["DTC & Tech Center", ["\\bdtc\\b", "tech center"]],
  ["Englewood", ["englewood"]],
  ["Greenwood Village", ["greenwood village"]],
  ["Lakewood", ["lakewood"]],
  ["Littleton", ["littleton"]],
  ["Thornton", ["thornton"]],
  ["Westminster", ["westminster"]],
  ["Wheat Ridge", ["wheat ?ridge"]],
];

// The 12 named Denver-proper neighborhoods. Built from the actual
// neighborhood strings logged against food/art events — first match wins,
// and anything that doesn't clear a bar of real confidence (e.g. "City
// Park", "Golden Triangle", "Congress Park" — genuinely distinct areas none
// of these 12 buckets cover) is left unmatched rather than guessing at the
// nearest-sounding neighborhood. Unmatched text still counts as the broad
// "Denver" region (see classifyBroadRegion below) — it just doesn't get
// sorted into one of these 12.
const DENVER_PROPER_RULES: [DenverProperNeighborhood, string[]][] = [
  ["Downtown & LoDo", ["lodo", "downtown(?!\\s+boulder)", "union station", "larimer square", "denver performing arts center", "civic center"]],
  ["RiNo & Five Points", ["rino", "five points", "curtis park", "cole", "arapahoe square"]],
  ["Highlands & LoHi", ["highlands?", "lohi", "jefferson park"]],
  ["Capitol Hill & Uptown", ["capitol hill", "uptown", "cheese?man park"]],
  ["Cherry Creek & Glendale", ["cherry creek", "glendale"]],
  ["Baker & South Broadway", ["baker", "south broadway", "s\\.? broadway", "santa fe arts? district", "art district on santa fe", "navajo street arts district", "santa fe", "lincoln park"]],
  ["Sloan's Lake", ["sloan'?s? lake", "edgewater", "west colfax"]],
  ["Sunnyside & Berkeley", ["sunnyside", "berkeley"]],
  ["Stapleton & Central Park", ["stapleton", "central park"]],
  ["Wash Park & Platt Park", ["wash park", "washington park", "platt park"]],
  ["Federal Blvd", ["federal blvd", "north federal", "little saigon"]],
  ["University Hills", ["university hills", "university of denver", "university"]],
];

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => new RegExp(`\\b${kw}\\b`, "i").test(text));
}

function firstMatch<T extends string>(text: string, rules: [T, string[]][]): T | null {
  for (const [bucket, keywords] of rules) {
    if (matchesAny(text, keywords)) return bucket;
  }
  return null;
}

/** Classifies an event's `neighborhood` text into a broad region. Front
 * Range/Suburbs/Mountains require a real keyword match; "denver" is the
 * genuine default for everything else (bare "Denver", "Various", "City
 * Park" — text that's presumably in Denver but not confidently one of the
 * 12 named neighborhoods still belongs in the broad Denver bucket). */
export function classifyBroadRegion(neighborhood: string | null | undefined): MetroBroadRegion {
  const text = neighborhood ?? "";
  if (matchesAny(text, MOUNTAINS_KEYWORDS)) return "mountains";
  if (firstMatch(text, FRONT_RANGE_CITY_RULES)) return "front_range";
  if (firstMatch(text, SUBURB_RULES)) return "suburbs";
  return "denver";
}

/** Precise, no-fallback classification into one of the 12 named Denver-proper
 * neighborhoods — null if the text isn't confidently one of them (it may
 * still be broadly "Denver", see classifyBroadRegion). */
export function classifyDenverProperNeighborhood(neighborhood: string | null | undefined): DenverProperNeighborhood | null {
  return firstMatch(neighborhood ?? "", DENVER_PROPER_RULES);
}

/** Whether `neighborhood` satisfies a Region filter value, which may be
 * "all", a broad tier ("denver"/"suburbs"/"front_range"/"mountains"), or one
 * of the specific neighborhoods/cities nested under those tiers. */
export function matchesRegionFilter(neighborhood: string | null | undefined, filterValue: string): boolean {
  if (filterValue === "all") return true;
  const text = neighborhood ?? "";
  if (filterValue === "denver" || filterValue === "suburbs" || filterValue === "front_range" || filterValue === "mountains") {
    return classifyBroadRegion(text) === filterValue;
  }
  if ((denverProperNeighborhoods as readonly string[]).includes(filterValue)) {
    return classifyDenverProperNeighborhood(text) === filterValue;
  }
  if ((denverMetroSuburbs as readonly string[]).includes(filterValue)) {
    return firstMatch(text, SUBURB_RULES) === filterValue;
  }
  if ((frontRangeCities as readonly string[]).includes(filterValue)) {
    return firstMatch(text, FRONT_RANGE_CITY_RULES) === filterValue;
  }
  return true;
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

/** Compact weekday-set label for row density — "Thu/Fri/Sat", or "Weekends"
 * for the Sat+Sun special case. Companion to shared/recurrence.ts's
 * describeWeekdaySet (full plural form, used for recurrence labels); this
 * one is for Range mode's optional activeWeekdays filter. Empty string when
 * there's no filter (every day in the range is active). */
export function formatActiveWeekdays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return "";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Weekends";
  return sorted.map(d => DAYS[d]).join("/");
}

export function formatDateRange(dateStart: string, dateEnd?: string | null, activeWeekdays?: number[] | null): string {
  const parse = (d: string) => new Date(d + "T12:00:00");
  const fmt = (d: string) =>
    parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dow = (d: string) => DAYS[parse(d).getDay()];
  const weekdaySuffix = activeWeekdays?.length ? ` · ${formatActiveWeekdays(activeWeekdays)}` : "";

  if (!dateEnd || dateEnd === dateStart) return `${dow(dateStart)} ${fmt(dateStart)}`;
  const s = parse(dateStart);
  const e = parse(dateEnd);
  if (s.getMonth() === e.getMonth())
    return `${dow(dateStart)} ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}${weekdaySuffix}`;
  return `${dow(dateStart)} ${fmt(dateStart)} – ${dow(dateEnd)} ${fmt(dateEnd)}${weekdaySuffix}`;
}

/** Day-group header label for the day-boxed list view — "Fri, Aug 21".
 * Callers apply `uppercase` via CSS rather than baking it in here. */
export function formatDayHeaderLabel(dateStart: string): string {
  const d = new Date(dateStart + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Short "Aug 21" date label — used by the "Through {date}" line on Still
 * Time rows, where a weekday would just add noise. */
export function formatMonthDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Day-bucketing (Still Time) ──────────────────────────────────────────────
// Shared by the mobile day-scroll view and the desktop day-sheet modal so a
// given day's event list — and its "Still Time" split — matches between the
// two, rather than each screen growing its own copy that can drift.

export interface DaySpannableEvent {
  dateStart: string;
  dateEnd?: string | null;
  isRecurring?: boolean | null;
  activeWeekdays?: number[] | null;
  startTime?: string | null;
}

/** True end date of an event's span for day-inclusion purposes.
 * expandRecurringEvents stamps every occurrence's dateEnd by re-applying the
 * *base record's* full season-length span onto each occurrence's own
 * dateStart — so a single Saturday occurrence can end up with a computed
 * dateEnd months later. That span is meaningless for a recurring event (it
 * repeats, it doesn't run for months straight), so recurring events only
 * ever count on their own dateStart day here. */
export function spanEnd<T extends DaySpannableEvent>(ev: T): string {
  return ev.isRecurring ? ev.dateStart : (ev.dateEnd && ev.dateEnd > ev.dateStart ? ev.dateEnd : ev.dateStart);
}

function matchesActiveWeekday<T extends DaySpannableEvent>(ev: T, day: string): boolean {
  return !ev.activeWeekdays?.length || ev.activeWeekdays.includes(new Date(day + "T12:00:00").getDay());
}

/** Splits the events touching `day` into ones that start that day vs.
 * multi-day listings just still running through it (dateStart before `day`)
 * — the latter is the "Still Time" bucket, sorted soonest-closing first so
 * it doesn't crowd out what's new. Recurring events never land in Still
 * Time — see spanEnd above, they only ever appear on their own occurrence
 * day. */
export function splitDayEvents<T extends DaySpannableEvent>(events: T[], day: string): { all: T[]; startingToday: T[]; stillGoing: T[] } {
  const all = events.filter(ev => ev.dateStart <= day && spanEnd(ev) >= day && matchesActiveWeekday(ev, day));
  const byStartTime = (a: T, b: T) => (a.startTime ?? "").localeCompare(b.startTime ?? "");
  const byEndDate = (a: T, b: T) => spanEnd(a).localeCompare(spanEnd(b));
  const startingToday = all.filter(ev => ev.dateStart === day).sort(byStartTime);
  const stillGoing = all.filter(ev => ev.dateStart !== day).sort(byEndDate);
  return { all, startingToday, stillGoing };
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
