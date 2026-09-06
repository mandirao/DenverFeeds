import type { ListingEventBase, ListingCalendarConfig } from "@/lib/listingFeedConfig";
import { localDateStr, formatTimeShort } from "@/lib/eventUtils";

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export type CalendarDensity = "comfortable" | "compact";

const ROW_CAP: Record<CalendarDensity, number> = { comfortable: 8, compact: 3 };
const ROW_GAP: Record<CalendarDensity, number> = { comfortable: 5, compact: 4 };
const HEADER_MARGIN_B: Record<CalendarDensity, number> = { comfortable: 7, compact: 6 };
const CELL_MIN_H: Record<CalendarDensity, number> = { comfortable: 112, compact: 96 };
const OVERFLOW_INDENT: Record<CalendarDensity, number> = { comfortable: 36, compact: 19 };

// A timed event has a parseable HH:MM (single- or double-digit hour, per the
// same pattern eventUtils.hasStartTimePassed already tolerates for AI-parsed
// data). Untimed events sort to the bottom and leave the time column blank.
function isTimedEvent<T extends ListingEventBase>(ev: T): boolean {
  return !!ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime);
}

function startTimeMinutes(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number);
  return h * 60 + m;
}

/** Timed events ascending by minutes-since-midnight (not the formatted
 * string — a string sort on 12-hour times would put "10:30 AM" after
 * "1:00 PM"), then untimed events in their existing relative order. */
function sortDayEvents<T extends ListingEventBase>(events: T[]): T[] {
  const timed = events.filter(isTimedEvent).sort((a, b) => startTimeMinutes(a.startTime!) - startTimeMinutes(b.startTime!));
  const untimed = events.filter(ev => !isTimedEvent(ev));
  return [...timed, ...untimed];
}

export function ListingCalendarMonthView<T extends ListingEventBase>({
  events,
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onDayOverflowClick,
  config,
  density,
  onDensityChange,
  activeCategoryLabel,
}: {
  events: T[];
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick: (ev: T) => void;
  onDayOverflowClick: (date: string, events: T[]) => void;
  config: ListingCalendarConfig<T>;
  density: CalendarDensity;
  onDensityChange: (density: CalendarDensity) => void;
  /** Name of the active category/cuisine filter, appended to the event total ("142 events · Music & Live"). Null when no category filter is active. */
  activeCategoryLabel?: string | null;
}) {
  const todayStr = localDateStr();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  const eventsByDay = new Map<string, T[]>();
  for (const ev of events) {
    if (ev.dateStart.startsWith(monthPrefix)) {
      const existing = eventsByDay.get(ev.dateStart) ?? [];
      eventsByDay.set(ev.dateStart, [...existing, ev]);
    } else if (
      ev.dateEnd && ev.dateEnd !== ev.dateStart &&
      !(config.guardRecurringMultiDaySpillover && ev.isRecurring)
    ) {
      // Multi-day event that started before this month but extends into it
      const monthStart = new Date(viewYear, viewMonth, 1);
      const end = new Date(ev.dateEnd + 'T12:00:00');
      const start = new Date(ev.dateStart + 'T12:00:00');
      if (start < monthStart && end >= monthStart) {
        const key = `${monthPrefix}-01`;
        const existing = eventsByDay.get(key) ?? [];
        eventsByDay.set(key, [...existing, ev]);
      }
    }
  }

  // Same filtered set the grid renders, so the total stays correct under
  // filtering with no extra plumbing.
  const totalMonthEvents = [...eventsByDay.values()].reduce((sum, evs) => sum + evs.length, 0);

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rowCap = ROW_CAP[density];
  const cellMinH = CELL_MIN_H[density];

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onPrevMonth}
            aria-label="Previous month"
            className="w-[30px] h-[30px] rounded-full border border-black/25 flex items-center justify-center text-black hover:bg-black/10 transition-colors leading-none"
            style={{ fontSize: 15 }}
          >
            ‹
          </button>
          <h2 className="font-display font-black uppercase text-black" style={{ fontSize: 19, letterSpacing: '.05em' }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <button
            onClick={onNextMonth}
            aria-label="Next month"
            className="w-[30px] h-[30px] rounded-full border border-black/25 flex items-center justify-center text-black hover:bg-black/10 transition-colors leading-none"
            style={{ fontSize: 15 }}
          >
            ›
          </button>
          <span className="ml-1.5" style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
            {totalMonthEvents} event{totalMonthEvents === 1 ? '' : 's'}{activeCategoryLabel ? ` · ${activeCategoryLabel}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-display font-black uppercase" style={{ fontSize: 10, letterSpacing: '.14em', color: 'rgba(0,0,0,0.5)' }}>
            Density
          </span>
          <div role="radiogroup" aria-label="Calendar density" className="flex border border-black rounded-full overflow-hidden">
            {(["comfortable", "compact"] as const).map(opt => {
              const selected = density === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onDensityChange(opt)}
                  className={`px-3 py-[5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${selected ? 'bg-black text-white' : 'bg-transparent text-black'}`}
                  style={{ fontSize: 12 }}
                >
                  {opt === "comfortable" ? "Comfortable" : "Compact"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center font-display font-black uppercase" style={{ fontSize: 10, letterSpacing: '.16em', color: 'rgba(0,0,0,0.5)', padding: '6px 0' }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-black/20">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="border-r border-b border-black/20" style={{ backgroundColor: config.cellBg, minHeight: cellMinH }} />
            );
          }
          const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          const isToday = dayStr === todayStr;
          const dayEvents = sortDayEvents(eventsByDay.get(dayStr) ?? []);
          const shown = dayEvents.slice(0, rowCap);
          const overflow = dayEvents.length - rowCap;
          const weekdayLabel = DAY_HEADERS[idx % 7];
          return (
            <div
              key={dayStr}
              className="border-r border-b border-black/20 pt-2 px-2.5 pb-2.5"
              style={{ backgroundColor: isToday ? config.todayBg : config.cellBg, minHeight: cellMinH }}
            >
              <div className="flex items-center gap-1.5" style={{ marginBottom: HEADER_MARGIN_B[density] }}>
                <div
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center font-display font-black flex-shrink-0 ${isToday ? 'bg-black text-white' : 'text-black'}`}
                  style={{ fontSize: 13 }}
                >
                  {day}
                </div>
                {density === "comfortable" && (
                  <div className="font-display font-black uppercase" style={{ fontSize: 10, letterSpacing: '.14em', color: 'rgba(0,0,0,0.45)' }}>
                    {weekdayLabel}
                  </div>
                )}
                <div className="ml-auto font-display font-black" style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                  {dayEvents.length}
                </div>
              </div>

              <div className="flex flex-col" style={{ gap: ROW_GAP[density] }}>
                {shown.map((ev, i) => (
                  <button
                    key={`${ev.id}-${ev.dateStart}-${i}`}
                    onClick={() => onEventClick(ev)}
                    className="flex items-baseline gap-1.5 text-left cursor-pointer w-full min-w-0"
                    title={ev.soldOut ? `${ev.name} (Sold Out)` : ev.name}
                  >
                    {density === "comfortable" && (
                      <span
                        className="flex-shrink-0 text-right font-semibold"
                        style={{ width: 30, fontSize: 10, color: 'rgba(0,0,0,0.45)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {isTimedEvent(ev) ? formatTimeShort(ev.startTime!) : ''}
                      </span>
                    )}
                    <span className="flex-shrink-0" style={{ fontSize: 12 }}>{ev.emoji}</span>
                    <span
                      className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold hover:underline ${ev.soldOut ? 'line-through' : ''}`}
                      style={{ fontSize: 12, lineHeight: 1.3, color: ev.soldOut ? 'rgba(0,0,0,0.4)' : '#000' }}
                    >
                      {ev.name}
                    </span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayOverflowClick(dayStr, dayEvents)}
                    className="text-left font-semibold underline cursor-pointer"
                    style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', textUnderlineOffset: 2, paddingLeft: OVERFLOW_INDENT[density] }}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ListingCalendarMonthView;
