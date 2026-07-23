import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ListingEventBase, ListingCalendarConfig } from "@/lib/listingFeedConfig";

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function ListingCalendarMonthView<T extends ListingEventBase>({
  events,
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onDayOverflowClick,
  config,
}: {
  events: T[];
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick: (ev: T) => void;
  onDayOverflowClick: (date: string, events: T[]) => void;
  config: ListingCalendarConfig<T>;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
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

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="p-1.5 text-black hover:text-[#FE6B41] transition-colors rounded-full hover:bg-black/10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black uppercase text-black tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h2>
        <button onClick={onNextMonth} className="p-1.5 text-black hover:text-[#FE6B41] transition-colors rounded-full hover:bg-black/10">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-black text-black/50 uppercase py-1 tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-black/15">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="border-r border-b border-black/15 min-h-[72px] sm:min-h-[90px]" style={{ backgroundColor: config.cellBg }} />
            );
          }
          const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          const isToday = dayStr === todayStr;
          const dayEvents = eventsByDay.get(dayStr) ?? [];
          const MAX_SHOWN = 3;
          const shown = dayEvents.slice(0, MAX_SHOWN);
          const overflow = dayEvents.length - MAX_SHOWN;
          return (
            <div key={dayStr} className="border-r border-b border-black/15 p-1 min-h-[72px] sm:min-h-[90px]" style={{ backgroundColor: config.cellBg }}>
              <div className={`text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center leading-none ${
                isToday ? 'bg-black text-white rounded-full' : 'text-black'
              }`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {shown.map((ev, i) => (
                  <button
                    key={`${ev.id}-${ev.dateStart}-${i}`}
                    onClick={() => onEventClick(ev)}
                    className="w-full text-left text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 bg-black/10 hover:bg-black/20 active:bg-black/30 rounded text-black truncate transition-colors cursor-pointer"
                    title={ev.name}
                  >
                    <span>{ev.emoji} </span>
                    <span className="font-medium">{ev.name}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayOverflowClick(dayStr, dayEvents)}
                    className="text-[9px] text-black/60 hover:text-black pl-1 font-semibold transition-colors cursor-pointer underline underline-offset-1"
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
