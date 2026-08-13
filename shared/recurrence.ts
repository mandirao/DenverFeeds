// Structured recurrence rules for Food + Art recurring events.
//
// This exists alongside the free-text `recurrenceLabel` column (not instead
// of it) — see the "Structured recurrence rules" plan for the full rationale.
// `recurrenceLabel` stays the terse, feed-voice display string ("Mondays",
// "3rd Thursdays"); this module is what makes that string reliably correct
// instead of a keyword-matched guess.

import { z } from "zod";

export type RecurrenceFreq = 'weekly' | 'monthly' | 'quarterly' | 'annual';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Weekly only: every N weeks. 2 = biweekly. Default 1. */
  interval?: number;
  /** Weekly only, preferred field: one or more weekdays (0=Sun..6=Sat), e.g. [0,6] for weekends. */
  byWeekdays?: number[];
  /** Monthly nth-weekday only (single weekday — "3rd Thursday", not a set). Also read as a
   * single-day fallback for weekly rows written before multi-weekday support existed. */
  byWeekday?: number;
  /** Despite the name, this now governs monthly, quarterly, AND annual — kept
   * as one field (rather than a new one per freq) so existing persisted rows
   * don't need a migration. 'day-of-month' is the shared "pin to the same
   * calendar day" mode monthly/quarterly/annual all use; 'nth-weekday' is
   * monthly-only ("3rd Thursday" has no quarterly/annual equivalent); 'tbd'
   * means the exact date isn't known/fixed — quarterly and annual read it as
   * "don't spell out a specific day", monthly as "no fixed day either". Date
   * math for 'tbd' still falls back to day-of-month (same as leaving this
   * unset) since occurrences still need a real, sortable date. */
  monthlyMode?: 'day-of-month' | 'nth-weekday' | 'tbd';
  /** Monthly nth-weekday only. -1 = "last". */
  weekdayOrdinal?: 1 | 2 | 3 | 4 | -1;
  /** Optional hard end of the series (ISO date, inclusive) — e.g. a pop-up
   * that recurs weekly Aug–Oct and then genuinely stops. Independent of the
   * display cap in expandRecurringEvents, which still only shows the next
   * 1-2 upcoming occurrences at a time regardless of whether the series has
   * an end date. */
  until?: string;
}

/** Normalizes a weekly rule's weekday(s) regardless of which field wrote them
 * (new byWeekdays array, legacy singular byWeekday, or neither — inferred
 * from the event's own dateStart). Always returns at least one weekday. */
function weeklyDays(rule: RecurrenceRule, dateStart: string): number[] {
  if (rule.byWeekdays && rule.byWeekdays.length > 0) return rule.byWeekdays;
  if (rule.byWeekday !== undefined) return [rule.byWeekday];
  return [parseDateLocal(dateStart).getDay()];
}

// drizzle-zod can't infer the literal-union shape of RecurrenceRule from the
// jsonb column's $type<>() alone (unlike the plain Record<string,string> of
// instanceNotes) — this explicit schema is spliced into insertFoodEventSchema
// / insertArtEventSchema via .extend() in shared/schema.ts.
export const recurrenceRuleSchema: z.ZodType<RecurrenceRule> = z.object({
  freq: z.enum(['weekly', 'monthly', 'quarterly', 'annual']),
  interval: z.number().optional(),
  byWeekdays: z.array(z.number().min(0).max(6)).optional(),
  byWeekday: z.number().min(0).max(6).optional(),
  monthlyMode: z.enum(['day-of-month', 'nth-weekday', 'tbd']).optional(),
  weekdayOrdinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]).optional(),
  until: z.string().optional(),
});

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_NAMES_LOWER = WEEKDAY_NAMES.map(w => w.toLowerCase());
const ORDINAL_WORDS: Record<string, 1 | 2 | 3 | 4 | -1> = {
  '1st': 1, first: 1,
  '2nd': 2, second: 2,
  '3rd': 3, third: 3,
  '4th': 4, fourth: 4,
  last: -1,
};

function parseDateLocal(d: string): Date {
  return new Date(d + 'T12:00:00');
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function addMonths(dateStr: string, months: number): string {
  const d = parseDateLocal(dateStr);
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

/** The date of the Nth (or last, ordinal=-1) `weekday` in the given year/month (0-indexed month). */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: 1 | 2 | 3 | 4 | -1): string {
  if (ordinal === -1) {
    const lastOfMonth = new Date(year, month + 1, 0);
    const diff = (lastOfMonth.getDay() - weekday + 7) % 7;
    lastOfMonth.setDate(lastOfMonth.getDate() - diff);
    return toDateStr(lastOfMonth);
  }
  const firstOfMonth = new Date(year, month, 1);
  const diff = (weekday - firstOfMonth.getDay() + 7) % 7;
  const day = 1 + diff + (ordinal - 1) * 7;
  return toDateStr(new Date(year, month, day));
}

// ── Display label generation ────────────────────────────────────────────────

/** Deterministic terse label from a structured rule — matches the existing
 * feed voice ("Mondays", not "Weekly on Mondays"). Single source of truth so
 * the picker, AI output, and backfill all produce the same style. */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const weekdayPlural = (wd: number) => WEEKDAY_NAMES[wd] + 's';
  const joinWeekdayLabels = (days: number[]) => {
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Weekends';
    const names = sorted.map(weekdayPlural);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  };
  switch (rule.freq) {
    case 'weekly': {
      const days = rule.byWeekdays ?? (rule.byWeekday !== undefined ? [rule.byWeekday] : []);
      if (days.length === 0) return 'Weekly';
      const base = joinWeekdayLabels(days);
      if (rule.interval === 2) {
        // Singular for a single weekday ("Every other Monday"), plural join
        // stays as-is for multi-day sets ("Every other Weekends" reads fine).
        const singular = days.length === 1 ? WEEKDAY_NAMES[days[0]] : base;
        return `Every other ${singular}`;
      }
      if (rule.interval && rule.interval > 2) return `Every ${rule.interval} weeks (${base})`;
      return base;
    }
    case 'monthly': {
      if (rule.monthlyMode === 'nth-weekday' && rule.byWeekday !== undefined && rule.weekdayOrdinal) {
        const ord = rule.weekdayOrdinal === -1 ? 'Last' : ['', '1st', '2nd', '3rd', '4th'][rule.weekdayOrdinal];
        return `${ord} ${weekdayPlural(rule.byWeekday)}`;
      }
      return 'Monthly';
    }
    case 'quarterly':
      return 'Quarterly';
    case 'annual':
    default:
      return 'Annually';
  }
}

// ── Occurrence computation ──────────────────────────────────────────────────

/** Filters generated occurrence dates down to those on/before an optional
 * series end date. No-op when `until` isn't set. */
function applyUntil(dates: string[], until: string | undefined): string[] {
  if (!until) return dates;
  return dates.filter(d => d <= until);
}

/** Computes the next `count` upcoming occurrence dates (>= todayStr) for a
 * structured rule, anchored on the event's original `dateStart`, truncated
 * at `rule.until` when set, and skipping any date in `excludedDates` (a
 * single one-off cancellation, e.g. a holiday closure) — the count is still
 * backfilled from later occurrences rather than just shrinking by one. */
export function computeOccurrences(rule: RecurrenceRule, dateStart: string, todayStr: string, count: number, excludedDates?: string[]): string[] {
  if (!excludedDates?.length) return computeOccurrencesRaw(rule, dateStart, todayStr, count);
  const excluded = new Set(excludedDates);
  // Overfetch by the number of excluded dates — worst case every one of them
  // was about to be in the next `count` occurrences, so this guarantees
  // enough real (non-excluded) dates to still fill the requested count.
  const raw = computeOccurrencesRaw(rule, dateStart, todayStr, count + excluded.size);
  return raw.filter(d => !excluded.has(d)).slice(0, count);
}

function computeOccurrencesRaw(rule: RecurrenceRule, dateStart: string, todayStr: string, count: number): string[] {
  const result: string[] = [];

  if (rule.freq === 'annual') {
    const monthDay = dateStart.slice(5);
    const yr = parseInt(todayStr.slice(0, 4), 10);
    let occ = `${yr}-${monthDay}`;
    if (occ < todayStr) occ = `${yr + 1}-${monthDay}`;
    for (let i = 0; i < count; i++) {
      result.push(occ);
      occ = `${parseInt(occ.slice(0, 4), 10) + 1}-${monthDay}`;
    }
    return applyUntil(result, rule.until);
  }

  // Quarterly always pins to the anchor's calendar day, stepped 3 months at a
  // time — there's no nth-weekday variant (wrong mental model for quarterly,
  // per the picker UI), so 'tbd' also falls through to this same day-of-month
  // math; only the display copy differs.
  if (rule.freq === 'quarterly') {
    let d = dateStart;
    while (d < todayStr) d = addMonths(d, 3);
    for (let i = 0; i < count; i++) {
      result.push(d);
      d = addMonths(d, 3);
    }
    return applyUntil(result, rule.until);
  }

  if (rule.freq === 'weekly') {
    const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
    const days = weeklyDays(rule, dateStart);
    // Each selected weekday gets its own anchored sequence (locked to dateStart
    // so "every OTHER Sunday" stays on-phase), then all sequences are merged
    // and sorted chronologically so e.g. weekends interleave Sat/Sun correctly.
    const pooled: string[] = [];
    for (const byWeekday of days) {
      let anchor = dateStart;
      const anchorWeekday = parseDateLocal(anchor).getDay();
      if (anchorWeekday !== byWeekday) {
        anchor = addDays(anchor, (byWeekday - anchorWeekday + 7) % 7);
      }
      let d = anchor;
      while (d < todayStr) d = addDays(d, 7 * interval);
      for (let i = 0; i < count; i++) {
        pooled.push(d);
        d = addDays(d, 7 * interval);
      }
    }
    pooled.sort();
    return applyUntil(pooled, rule.until).slice(0, count);
  }

  // monthly
  if (rule.monthlyMode === 'nth-weekday' && rule.byWeekday !== undefined && rule.weekdayOrdinal) {
    let cursor = parseDateLocal(dateStart);
    let occ = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), rule.byWeekday, rule.weekdayOrdinal);
    while (occ < todayStr) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      occ = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), rule.byWeekday, rule.weekdayOrdinal);
    }
    for (let i = 0; i < count; i++) {
      result.push(occ);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      occ = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), rule.byWeekday, rule.weekdayOrdinal);
    }
    return applyUntil(result, rule.until);
  }

  // day-of-month (default monthly mode)
  let d = dateStart;
  while (d < todayStr) d = addMonths(d, 1);
  for (let i = 0; i < count; i++) {
    result.push(d);
    d = addMonths(d, 1);
  }
  return applyUntil(result, rule.until);
}

// ── Legacy label → structured rule inference (backfill only) ───────────────

/** Best-effort structured-rule inference from old free-text recurrenceLabel
 * text, used only by the one-time backfill script. Returns null when it
 * can't confidently classify — those rows stay on the legacy keyword-match
 * fallback in expandRecurringEvents. */
export function parseLegacyRecurrenceLabel(label: string | null | undefined, dateStart: string): RecurrenceRule | null {
  if (!label) return null;
  const l = label.toLowerCase().trim();

  if (l.includes('annual') || l.includes('yearly') || l.includes('seasonal')) {
    return { freq: 'annual' };
  }

  // "weekends" (before the generic "week" substring fallback below claims it)
  if (l.includes('weekend')) {
    return { freq: 'weekly', byWeekdays: [0, 6], interval: 1 };
  }

  const namedWeekday = WEEKDAY_NAMES_LOWER.findIndex(w => l.includes(w));

  // "1st/2nd/3rd/4th/last <weekday>(s)" → monthly nth-weekday
  const ordinalMatch = l.match(/\b(1st|first|2nd|second|3rd|third|4th|fourth|last)\b/);
  if (ordinalMatch && namedWeekday !== -1) {
    const ordinal = ORDINAL_WORDS[ordinalMatch[1]];
    if (ordinal) {
      return { freq: 'monthly', monthlyMode: 'nth-weekday', byWeekday: namedWeekday, weekdayOrdinal: ordinal };
    }
  }

  // "every other <weekday>" / "bi-weekly <weekday>" / "biweekly"
  if (l.includes('bi-week') || l.includes('biweek') || l.includes('every other week') ||
      (l.includes('every other') && namedWeekday !== -1)) {
    const byWeekday = namedWeekday !== -1 ? namedWeekday : parseDateLocal(dateStart).getDay();
    return { freq: 'weekly', byWeekdays: [byWeekday], interval: 2 };
  }

  // "every N weeks" / "every N <weekday>s" (e.g. "every 2 Sundays") → weekly, interval N
  const everyNMatch = l.match(/every\s+(\d+)\s+(week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (everyNMatch) {
    const n = parseInt(everyNMatch[1], 10);
    const byWeekday = everyNMatch[2] === 'week'
      ? (namedWeekday !== -1 ? namedWeekday : parseDateLocal(dateStart).getDay())
      : WEEKDAY_NAMES_LOWER.indexOf(everyNMatch[2]);
    if (n >= 1) return { freq: 'weekly', byWeekdays: [byWeekday], interval: n };
  }

  // bare weekday name(s), or "every <weekday>", or "weekly" — weekly, weekday from label or dateStart
  if (namedWeekday !== -1) {
    return { freq: 'weekly', byWeekdays: [namedWeekday], interval: 1 };
  }
  if (l.includes('week')) {
    return { freq: 'weekly', byWeekdays: [parseDateLocal(dateStart).getDay()], interval: 1 };
  }

  // bare "monthly" (no weekday, no ordinal) → same date each month, matches
  // existing behavior's implicit assumption
  if (l.includes('month')) {
    return { freq: 'monthly', monthlyMode: 'day-of-month' };
  }

  return null;
}

// ── Occurrence expansion (which upcoming dates to actually show) ───────────
//
// Lives here (not client-only) so both the client feed pages AND the server's
// .ics calendar-feed generation expand recurring events identically — see
// server/routes.ts's /calendar/{food,art}-feed.ics routes. Pure date/string
// logic, no browser APIs, so it's safe to import from either side.

export function classifyRecurrence(label: string | null | undefined): 'weekly' | 'biweekly' | 'monthly' | 'annual' | 'irregular' {
  if (!label) return 'monthly';
  const l = label.toLowerCase();
  if (l.includes('annual') || l.includes('yearly') || l.includes('seasonal')) return 'annual';
  if (l.includes('bi-week') || l.includes('biweek') || l.includes('every other week') ||
      /\d+(st|nd|rd|th)?.{0,5}&.{0,5}\d+(st|nd|rd|th)?/.test(l)) return 'biweekly';
  if (l.includes('week')) return 'weekly';
  if (l.includes('month') || l.includes('every 1st') || l.includes('every first') ||
      l.includes('every last') || /every \d+(st|nd|rd|th)/.test(l)) return 'monthly';
  return 'irregular';
}

export function addCalDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function addCalMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

// Structural shape needed to expand recurring listings into their upcoming occurrences.
export interface RecurringEventLike {
  dateStart: string;
  dateEnd?: string | null;
  startTime?: string | null;
  isRecurring?: boolean | null;
  recurrenceLabel?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  excludedDates?: string[] | null;
  /** Date of the most recent occurrence a human explicitly confirmed as
   * real — only meaningful alongside monthlyMode 'tbd'. See isDateUnverified
   * below. */
  verifiedThroughDate?: string | null;
}

export function expandRecurringEvents<T extends RecurringEventLike>(events: T[]): T[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const result: T[] = [];

  for (const ev of events) {
    if (!ev.isRecurring) { result.push(ev); continue; }

    const spanDays = ev.dateEnd && ev.dateEnd !== '' && ev.dateEnd !== ev.dateStart
      ? Math.round((new Date(ev.dateEnd + 'T12:00:00').getTime() - new Date(ev.dateStart + 'T12:00:00').getTime()) / 86400000)
      : 0;
    // seriesAnchorDate preserves the row's real stored dateStart (before it
    // gets overwritten below with this specific occurrence's computed date)
    // so an edit to a later occurrence doesn't clobber the series anchor —
    // see EditListingEventModal.
    // A 'tbd' rule means the series' cadence itself isn't reliably
    // predictable, so each occurrence needs its own explicit confirmation —
    // comparing the computed date against the stored anchor doesn't work as
    // a "confirmed" signal (the anchor is usually just whatever guess was
    // typed in, not evidence anyone confirmed it, and for annual/quarterly
    // rules a still-pending anchor always looks "confirmed" by coincidence
    // of the date math). verifiedThroughDate is the explicit, human-set
    // alternative: only an occurrence a person actually confirmed (via
    // "Verify this date" or by correcting the date, see
    // ListingEventFormFields) counts as verified; every other occurrence —
    // including next cycle's, even right after this one's been confirmed —
    // still shows "Verify date" until it gets its own confirmation.
    const makeOccurrence = (dateStart: string): T => ({
      ...ev, dateStart,
      dateEnd: spanDays > 0 ? addCalDays(dateStart, spanDays) : (ev.dateEnd ?? ''),
      seriesAnchorDate: ev.dateStart,
      isDateUnverified: ev.recurrenceRule?.monthlyMode === 'tbd' && dateStart !== ev.verifiedThroughDate,
    } as T);

    // Structured rule present — use the real per-freq date math instead of
    // the legacy keyword-matched fallback below. Annual/quarterly get only 1
    // edition ahead (not 2) so those can't ever surface something up to two
    // years (or two quarters) out; weekly/monthly keep the wider 2-edition
    // window since their absolute time span stays small regardless.
    if (ev.recurrenceRule) {
      const count = (ev.recurrenceRule.freq === 'annual' || ev.recurrenceRule.freq === 'quarterly') ? 1 : 2;
      const dates = computeOccurrences(ev.recurrenceRule, ev.dateStart, todayStr, count, ev.excludedDates ?? undefined);
      for (const d of dates) result.push(makeOccurrence(d));
      continue;
    }

    // Legacy keyword-matched fallback (no structured rule) — skipped dates
    // are just filtered out here rather than backfilled like the structured
    // path above; this path is already a lower-fidelity fallback, not worth
    // the extra complexity for what's a shrinking, older case.
    const excludedSet = new Set(ev.excludedDates ?? []);
    const type = classifyRecurrence(ev.recurrenceLabel);

    if (type === 'annual') {
      const monthDay = ev.dateStart.slice(5);
      const yr = today.getFullYear();
      const thisYearOcc = `${yr}-${monthDay}`;
      if (thisYearOcc >= todayStr) { if (!excludedSet.has(thisYearOcc)) result.push(makeOccurrence(thisYearOcc)); }
      else if (today.getMonth() === 0) { const occ = `${yr + 1}-${monthDay}`; if (!excludedSet.has(occ)) result.push(makeOccurrence(occ)); }
      continue;
    }
    if (type === 'irregular') {
      let d = ev.dateStart;
      while (d < todayStr) d = addCalMonths(d, 1);
      if (!excludedSet.has(d)) result.push(makeOccurrence(d));
      continue;
    }
    const periodDays = type === 'weekly' ? 7 : type === 'biweekly' ? 14 : null;
    let d = ev.dateStart;
    if (periodDays) { while (d < todayStr) d = addCalDays(d, periodDays); }
    else { while (d < todayStr) d = addCalMonths(d, 1); }
    for (let i = 0; i < 2; i++) {
      if (!excludedSet.has(d)) result.push(makeOccurrence(d));
      if (i < 1) d = periodDays ? addCalDays(d, periodDays) : addCalMonths(d, 1);
    }
  }
  return result.sort((a, b) => {
    const dateCompare = a.dateStart.localeCompare(b.dateStart);
    if (dateCompare !== 0) return dateCompare;
    const aTime = a.startTime && /^\d{1,2}:\d{2}$/.test(a.startTime) ? a.startTime : '23:59';
    const bTime = b.startTime && /^\d{1,2}:\d{2}$/.test(b.startTime) ? b.startTime : '23:59';
    return aTime.localeCompare(bTime);
  });
}
