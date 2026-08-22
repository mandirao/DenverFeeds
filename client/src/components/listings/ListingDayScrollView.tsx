import { ChevronRight } from "lucide-react";
import type { ListingEventBase, ListingCalendarConfig } from "@/lib/listingFeedConfig";
import { localDateStr, formatTime, formatRecurrenceCadence } from "@/lib/eventUtils";
import { addCalDays } from "@shared/recurrence";

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Mobile-optimized alternative to <ListingCalendarMonthView> — a horizontal,
// scroll-snapped strip of day cards (today first) instead of a month grid,
// since a 7-column grid reads as tiny text on a phone. Each event shows on
// every day it spans (dateStart..dateEnd inclusive), not just its start day.
export function ListingDayScrollView<T extends ListingEventBase>({
  events,
  onEventClick,
  config,
}: {
  events: T[];
  onEventClick: (ev: T) => void;
  config: ListingCalendarConfig<T>;
}) {
  const todayStr = localDateStr();

  // expandRecurringEvents stamps every occurrence's dateEnd by re-applying
  // the *base record's* full season-length span (e.g. "runs weekly Aug–Jan")
  // onto each individual occurrence's own dateStart — so a single Saturday
  // occurrence can end up with a computed dateEnd months later. That span is
  // meaningless for a recurring event (it repeats, it doesn't run for
  // months straight), so it must never be used for day-inclusion here —
  // only a genuine one-time/limited-run listing's dateEnd is real. Desktop's
  // month grid has the same guard (see guardRecurringMultiDaySpillover).
  const spanEnd = (ev: T) => ev.isRecurring
    ? ev.dateStart
    : (ev.dateEnd && ev.dateEnd > ev.dateStart ? ev.dateEnd : ev.dateStart);

  let maxDate = todayStr;
  for (const ev of events) {
    const end = spanEnd(ev);
    if (end > maxDate) maxDate = end;
  }

  const MAX_DAYS = 90;
  const days: string[] = [];
  let cursor = todayStr;
  for (let i = 0; i < MAX_DAYS && cursor <= maxDate; i++) {
    days.push(cursor);
    cursor = addCalDays(cursor, 1);
  }
  if (days.length === 0) days.push(todayStr);

  // Splits a day's events into ones that start today vs. multi-day listings
  // just still running through today (dateStart before this day) — the
  // latter get pushed under a "Still Time" divider so the same limited-run
  // event repeating across several day-cards doesn't crowd out what's new.
  // Recurring events never land in "Still Time" — see spanEnd above, they
  // only ever appear on their own occurrence day.
  const eventsOnDay = (day: string) => {
    const all = events.filter(ev => ev.dateStart <= day && spanEnd(ev) >= day);
    const byStartTime = (a: T, b: T) => (a.startTime ?? '').localeCompare(b.startTime ?? '');
    // Still Time stacks soonest-closing first, matching desktop's stillTimeEvents sort.
    const byEndDate = (a: T, b: T) => spanEnd(a).localeCompare(spanEnd(b));
    const startingToday = all.filter(ev => ev.dateStart === day).sort(byStartTime);
    const stillGoing = all.filter(ev => ev.dateStart !== day).sort(byEndDate);
    return { all, startingToday, stillGoing };
  };

  const formatThrough = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    return `${MONTH_SHORT[dt.getMonth()]} ${dt.getDate()}`;
  };

  return (
    <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory flex gap-3 -mx-4 px-4 scroll-pl-4 scroll-pr-4 flex-1 min-h-0">
      {days.map(day => {
        const { all: dayEvents, startingToday, stillGoing } = eventsOnDay(day);
        const isToday = day === todayStr;
        const d = new Date(day + 'T12:00:00');
        return (
          <div
            key={day}
            className="snap-start flex-shrink-0 w-[85vw] max-w-[380px] rounded-[16px] sm:rounded-[18px] overflow-hidden flex flex-col"
            style={{ backgroundColor: config.cardBg }}
          >
            <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-black uppercase tracking-wider text-black/50 truncate">
                  {isToday ? 'Today' : WEEKDAY_LONG[d.getDay()]}
                </div>
                <div className="text-xl font-black text-black">
                  {MONTH_SHORT[d.getMonth()]} {d.getDate()}
                </div>
              </div>
              {dayEvents.length > 0 && (
                <div className="text-sm font-bold text-black/50 flex-shrink-0">
                  {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="divide-y divide-black/10 overflow-y-auto scrollbar-dark flex-1 min-h-0">
              {dayEvents.length === 0 && (
                <div className="px-5 py-10 text-center text-base text-black/40">Nothing scheduled</div>
              )}
              {startingToday.map((ev, i) => (
                <button
                  key={`${ev.id}-${day}-${i}`}
                  onClick={() => onEventClick(ev)}
                  className={`w-full text-left px-5 py-4 hover:bg-black/5 active:bg-black/10 transition-colors flex items-center gap-3 ${ev.soldOut ? "opacity-50" : ""}`}
                >
                  <span className="text-2xl flex-shrink-0">{ev.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`text-base font-bold text-black truncate ${ev.soldOut ? "line-through" : ""}`}>{ev.name}</div>
                      {ev.soldOut && (
                        <span className="flex-shrink-0 text-[10px] font-black uppercase leading-none px-1.5 py-1 bg-black text-white">SOLD OUT</span>
                      )}
                    </div>
                    {!ev.soldOut && (
                      <div className="text-sm text-black/60 truncate">
                        {ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && (
                          <span className="font-semibold text-black/80">{formatTime(ev.startTime)} · </span>
                        )}
                        {ev.isRecurring && (
                          <span className="font-semibold text-black/80">{formatRecurrenceCadence(ev.recurrenceLabel)} · </span>
                        )}
                        {ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}
                      </div>
                    )}
                    {!ev.soldOut && ev.price && <div className="text-sm text-black/50">{ev.price}</div>}
                  </div>
                  <ChevronRight className="w-5 h-5 text-black/30 flex-shrink-0" />
                </button>
              ))}
              {stillGoing.length > 0 && (
                <div className="px-5 py-2 bg-black/5 flex items-center gap-2">
                  <span className="text-sm font-black uppercase tracking-wider text-black/40">Still Time</span>
                </div>
              )}
              {stillGoing.map((ev, i) => (
                <button
                  key={`still-${ev.id}-${day}-${i}`}
                  onClick={() => onEventClick(ev)}
                  className={`w-full text-left px-5 py-4 hover:bg-black/5 active:bg-black/10 transition-colors flex items-center gap-3 ${ev.soldOut ? "opacity-50" : ""}`}
                >
                  <span className="text-2xl flex-shrink-0">{ev.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`text-base font-bold text-black truncate ${ev.soldOut ? "line-through" : ""}`}>{ev.name}</div>
                      {ev.soldOut && (
                        <span className="flex-shrink-0 text-[10px] font-black uppercase leading-none px-1.5 py-1 bg-black text-white">SOLD OUT</span>
                      )}
                    </div>
                    {!ev.soldOut && (
                      <div className="text-sm text-black/60 truncate">
                        {ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && (
                          <span className="font-semibold text-black/80">{formatTime(ev.startTime)} · </span>
                        )}
                        {ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}
                      </div>
                    )}
                    {!ev.soldOut && <div className="text-sm text-black/50 font-semibold">Through {formatThrough(spanEnd(ev))}</div>}
                    {!ev.soldOut && ev.price && <div className="text-sm text-black/50">{ev.price}</div>}
                  </div>
                  <ChevronRight className="w-5 h-5 text-black/30 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ListingDayScrollView;
