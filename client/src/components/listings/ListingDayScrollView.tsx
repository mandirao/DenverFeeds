import { ChevronRight } from "lucide-react";
import type { ListingEventBase, ListingCalendarConfig } from "@/lib/listingFeedConfig";
import { localDateStr, formatTime } from "@/lib/eventUtils";
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

  let maxDate = todayStr;
  for (const ev of events) {
    const end = ev.dateEnd && ev.dateEnd > ev.dateStart ? ev.dateEnd : ev.dateStart;
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
  const eventsOnDay = (day: string) => {
    const all = events.filter(ev => {
      const end = ev.dateEnd && ev.dateEnd > ev.dateStart ? ev.dateEnd : ev.dateStart;
      return ev.dateStart <= day && end >= day;
    });
    const byStartTime = (a: T, b: T) => (a.startTime ?? '').localeCompare(b.startTime ?? '');
    const startingToday = all.filter(ev => ev.dateStart === day).sort(byStartTime);
    const stillGoing = all.filter(ev => ev.dateStart !== day).sort(byStartTime);
    return { all, startingToday, stillGoing };
  };

  return (
    <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory flex gap-3 pb-2 -mx-4 px-4">
      {days.map(day => {
        const { all: dayEvents, startingToday, stillGoing } = eventsOnDay(day);
        const isToday = day === todayStr;
        const d = new Date(day + 'T12:00:00');
        return (
          <div
            key={day}
            className="snap-start flex-shrink-0 w-[82vw] max-w-[320px] border-2 border-black flex flex-col"
            style={{ backgroundColor: config.cellBg }}
          >
            <div className="px-4 py-3 border-b-2 border-black flex items-center justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-black/50 truncate">
                  {isToday ? 'Today' : WEEKDAY_LONG[d.getDay()]}
                </div>
                <div className="text-base font-black text-black">
                  {MONTH_SHORT[d.getMonth()]} {d.getDate()}
                </div>
              </div>
              {dayEvents.length > 0 && (
                <div className="text-xs font-bold text-black/50 flex-shrink-0">
                  {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="divide-y divide-black/10 overflow-y-auto max-h-[55vh] scrollbar-dark">
              {dayEvents.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-black/40">Nothing scheduled</div>
              )}
              {startingToday.map((ev, i) => (
                <button
                  key={`${ev.id}-${day}-${i}`}
                  onClick={() => onEventClick(ev)}
                  className="w-full text-left px-4 py-3 hover:bg-black/5 active:bg-black/10 transition-colors flex items-center gap-3"
                >
                  <span className="text-xl flex-shrink-0">{ev.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-black truncate">{ev.name}</div>
                    <div className="text-xs text-black/60 truncate">
                      {ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && (
                        <span className="font-semibold text-black/80">{formatTime(ev.startTime)} · </span>
                      )}
                      {ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}
                    </div>
                    {ev.price && <div className="text-xs text-black/50">{ev.price}</div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-black/30 flex-shrink-0" />
                </button>
              ))}
              {stillGoing.length > 0 && (
                <div className="px-4 py-1.5 bg-black/5 flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-black/40">Still Time</span>
                </div>
              )}
              {stillGoing.map((ev, i) => (
                <button
                  key={`still-${ev.id}-${day}-${i}`}
                  onClick={() => onEventClick(ev)}
                  className="w-full text-left px-4 py-3 hover:bg-black/5 active:bg-black/10 transition-colors flex items-center gap-3"
                >
                  <span className="text-xl flex-shrink-0">{ev.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-black truncate">{ev.name}</div>
                    <div className="text-xs text-black/60 truncate">
                      {ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && (
                        <span className="font-semibold text-black/80">{formatTime(ev.startTime)} · </span>
                      )}
                      {ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}
                    </div>
                    {ev.price && <div className="text-xs text-black/50">{ev.price}</div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-black/30 flex-shrink-0" />
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
