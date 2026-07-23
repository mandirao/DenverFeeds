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
}

export function expandRecurringEvents<T extends RecurringEventLike>(events: T[]): T[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const result: T[] = [];

  for (const ev of events) {
    if (!ev.isRecurring) { result.push(ev); continue; }

    const type = classifyRecurrence(ev.recurrenceLabel);
    const spanDays = ev.dateEnd && ev.dateEnd !== '' && ev.dateEnd !== ev.dateStart
      ? Math.round((new Date(ev.dateEnd + 'T12:00:00').getTime() - new Date(ev.dateStart + 'T12:00:00').getTime()) / 86400000)
      : 0;
    const makeOccurrence = (dateStart: string): T => ({
      ...ev, dateStart,
      dateEnd: spanDays > 0 ? addCalDays(dateStart, spanDays) : (ev.dateEnd ?? ''),
    } as T);

    if (type === 'annual') {
      const monthDay = ev.dateStart.slice(5);
      const yr = today.getFullYear();
      const thisYearOcc = `${yr}-${monthDay}`;
      if (thisYearOcc >= todayStr) result.push(makeOccurrence(thisYearOcc));
      else if (today.getMonth() === 0) result.push(makeOccurrence(`${yr + 1}-${monthDay}`));
      continue;
    }
    if (type === 'irregular') {
      let d = ev.dateStart;
      while (d < todayStr) d = addCalMonths(d, 1);
      result.push(makeOccurrence(d));
      continue;
    }
    const periodDays = type === 'weekly' ? 7 : type === 'biweekly' ? 14 : null;
    let d = ev.dateStart;
    if (periodDays) { while (d < todayStr) d = addCalDays(d, periodDays); }
    else { while (d < todayStr) d = addCalMonths(d, 1); }
    for (let i = 0; i < 2; i++) {
      result.push(makeOccurrence(d));
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
