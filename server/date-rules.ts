// Date validation shared by event routes. Two separate questions:
//   1. Is this a real calendar date? (always enforced: rejects 2026-02-30)
//   2. Is it a sensible date for a NEW listing? (a window relative to
//      today, so it never needs an annual code change)
// Edits only apply (2) when the date actually changes, so an existing event
// never becomes uneditable just because its date has aged.

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export const NEW_EVENT_WINDOW = { yearsBack: 1, yearsAhead: 5 };

export function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  // setUTCFullYear, not Date.UTC: the latter maps years 0–99 to 1900–1999.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

// Returns an error message, or null when the date is acceptable for a new
// listing (or a changed date on an existing one).
export function checkNewListingDate(value: string, now: Date = new Date()): string | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return `"${value}" is not a valid date (expected YYYY-MM-DD)`;
  const candidate = new Date(0).setUTCFullYear(parsed.year, parsed.month - 1, parsed.day);
  const earliest = Date.UTC(now.getUTCFullYear() - NEW_EVENT_WINDOW.yearsBack, now.getUTCMonth(), now.getUTCDate());
  const latest = Date.UTC(now.getUTCFullYear() + NEW_EVENT_WINDOW.yearsAhead, now.getUTCMonth(), now.getUTCDate());
  if (candidate < earliest) return `${value} is more than ${NEW_EVENT_WINDOW.yearsBack} year in the past`;
  if (candidate > latest) return `${value} is more than ${NEW_EVENT_WINDOW.yearsAhead} years in the future`;
  return null;
}

// Music events store a timestamp at local midnight of the entered day; this
// mirrors the routes' existing `new Date(year, month - 1, day)` conversion.
export function toLocalMidnight(value: string): Date | null {
  const parsed = parseCalendarDate(value);
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0) : null;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

// Music event input: the CSV importer sends "YYYY-MM-DD" (stored at local
// midnight, as before); the add/edit forms send a serialized Date (ISO
// datetime). Anything else, or an impossible date, is rejected.
export function parseEventDateInput(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (DATE_RE.test(trimmed)) return toLocalMidnight(trimmed);
  if (ISO_DATETIME_RE.test(trimmed)) {
    if (!isCalendarDate(trimmed.slice(0, 10))) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
