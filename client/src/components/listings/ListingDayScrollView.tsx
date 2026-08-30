import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { ListingEventBase, ListingCalendarConfig } from "@/lib/listingFeedConfig";
import { localDateStr, formatTime, formatRecurrenceCadence, dayMatchesFilter, spanEnd, splitDayEvents, formatMonthDay } from "@/lib/eventUtils";
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
  filterDay = "all",
  hasActiveFilters = false,
  onClearFilters,
}: {
  events: T[];
  onEventClick: (ev: T) => void;
  config: ListingCalendarConfig<T>;
  // The day-of-week/date-range filter currently applied to `events` (same
  // values AmsueBouche/ArtistryNerdery use: "all", "today", "weekend", a
  // weekday index, "month:August 2026", etc). Days that fail this filter are
  // dropped from the strip entirely rather than shown as empty — a "Mondays
  // only" filter shouldn't force scrolling past six blank days per week.
  filterDay?: string;
  // Whether any filter (cuisine/region/day/duration/search/sort) is
  // currently active — controls whether the end-of-strip card offers a
  // "Clear filters" way out or just reports a genuinely empty calendar.
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayStr = localDateStr();

  let maxDate = todayStr;
  for (const ev of events) {
    const end = spanEnd(ev);
    if (end > maxDate) maxDate = end;
  }

  const MAX_DAYS = 90;
  const allDays: string[] = [];
  let cursor = todayStr;
  for (let i = 0; i < MAX_DAYS && cursor <= maxDate; i++) {
    allDays.push(cursor);
    cursor = addCalDays(cursor, 1);
  }
  if (allDays.length === 0) allDays.push(todayStr);

  // Drop days the active filter excludes on purpose (e.g. "Mondays only",
  // "August only") — those shouldn't render as cards at all, empty or not.
  const days = filterDay === "all" ? allDays : allDays.filter(d => dayMatchesFilter(d, filterDay));

  // Splits a day's events into ones that start today vs. multi-day listings
  // just still running through today ("Still Time") — pushed under a divider
  // so the same limited-run event repeating across several day-cards doesn't
  // crowd out what's new. Same bucketing the desktop day-sheet modal uses.
  const eventsOnDay = (day: string) => splitDayEvents(events, day);

  // Empty days between event days are simply omitted — no marker, no
  // count, just the next real day card butted up against the last one.
  // Tried an explicit "N days skipped" waypoint between cards first, but it
  // didn't earn its keep: the information wasn't useful and the click target
  // was redundant with just swiping past it. The one exception is the very
  // end of the range — if there's nothing left at all, that's worth a card
  // explaining why the strip stops, rather than just trailing off.
  type Item = { kind: "day"; date: string } | { kind: "end" };
  const items: Item[] = [];
  for (let i = 0; i < days.length; i++) {
    if (eventsOnDay(days[i]).all.length > 0) {
      items.push({ kind: "day", date: days[i] });
      continue;
    }
    let j = i;
    while (j < days.length && eventsOnDay(days[j]).all.length === 0) j++;
    if (j >= days.length) {
      items.push({ kind: "end" });
    }
    i = j - 1;
  }

  // `days` is always built forward from today, so the leftmost card is
  // always the eligible day closest to today — but the strip doesn't
  // re-render on filter change, it just gets new children, so without this
  // it keeps whatever scroll offset the user was previously at (e.g.
  // mid-scroll from "All Days") and a fresh "Next Week"/"August" pick — or
  // hitting "Clear filters" from the end-of-strip card — can land the
  // viewport on some arbitrary day instead of the one closest to today.
  // Runs post-render (not inline in the button's onClick) so it isn't lost
  // to the browser re-anchoring scroll position when the strip's children
  // are swapped out wholesale.
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0 });
  }, [filterDay, hasActiveFilters]);

  if (items.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-center text-base text-black/50 px-6">
        Nothing matches this filter in the next {MAX_DAYS} days.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto scrollbar-hide snap-x snap-mandatory flex gap-3 -mx-4 px-4 scroll-pl-4 scroll-pr-4 flex-1 min-h-0">
      {items.map(item => {
        if (item.kind === "end") {
          return (
            <div
              key="end"
              className="snap-start flex-shrink-0 w-[85vw] max-w-[380px] rounded-[16px] sm:rounded-[18px] overflow-hidden flex flex-col items-center justify-center text-center px-6 gap-3"
              style={{ backgroundColor: config.cardBg }}
            >
              <div className="text-base text-black/50">
                {hasActiveFilters
                  ? "No more events match your filters."
                  : `Nothing else scheduled in the next ${MAX_DAYS} days.`}
              </div>
              {hasActiveFilters && onClearFilters && (
                <button
                  onClick={onClearFilters}
                  className="px-4 py-2.5 rounded-full bg-black/10 hover:bg-black/20 active:bg-black/25 transition-colors font-black uppercase text-sm text-black"
                >
                  Clear filters
                </button>
              )}
            </div>
          );
        }

        const day = item.date;
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
              <div className="text-sm font-bold text-black/50 flex-shrink-0">
                {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="divide-y divide-black/10 overflow-y-auto scrollbar-dark flex-1 min-h-0">
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
                    {!ev.soldOut && <div className="text-sm text-black/50 font-semibold">Through {formatMonthDay(spanEnd(ev))}</div>}
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
