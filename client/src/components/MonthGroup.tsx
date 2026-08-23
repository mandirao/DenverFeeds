import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth, extractUtcDateComponents } from "@/lib/utils";
import { formatDayHeaderLabel } from "@/lib/eventUtils";

interface MonthGroupProps {
  monthName: string;
  events: {
    events: Event[];
    weekGroups: Record<string, {
      start: Date;
      end: Date;
      events: Event[];
    }>;
  };
  // Darker "card" tint for odd-index day groups, matching the alternating-day
  // pattern used on Artistry/Nerdistry and Amuse-Bouche's feeds. Even-index
  // days use pageBg instead, so their (opaque) day headers can still stick
  // without showing scrolled-under content through them.
  altBg: string;
  // Page background color, painted behind even-index day headers — same
  // opaque-header trick the Amuse-Bouche and Artistry/Nerdery feeds use.
  pageBg: string;
  // Height of the sticky nav above this feed, so day headers stick just below it.
  navHeight: number;
}

interface WeekProps {
  weekEvents: Event[];
  dayIndexStart: number;
  altBg: string;
  pageBg: string;
  navHeight: number;
}

// Day-group key ("YYYY-MM-DD"), derived the same way groupEventsByMonth
// buckets events by day so the two never disagree on where a day boundary is.
function dayKey(event: Event): string {
  const { year, month, day } = extractUtcDateComponents(event.date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function WeekGroup({ weekEvents, dayIndexStart, altBg, pageBg, navHeight }: WeekProps) {
  if (weekEvents.length === 0) return null;

  // weekEvents arrives pre-sorted by date (see groupEventsByMonth) — group
  // consecutive same-day events without re-sorting.
  const dayGroups: { date: string; events: Event[] }[] = [];
  for (const event of weekEvents) {
    const key = dayKey(event);
    let bucket = dayGroups[dayGroups.length - 1]?.date === key ? dayGroups[dayGroups.length - 1] : undefined;
    if (!bucket) { bucket = { date: key, events: [] }; dayGroups.push(bucket); }
    bucket.events.push(event);
  }

  return (
    <div className="relative">
      {dayGroups.map((day, i) => {
        const hasBg = (dayIndexStart + i) % 2 === 1;
        const bgColor = hasBg ? altBg : pageBg;
        return (
          <div
            key={day.date}
            className={`rounded-[16px] sm:rounded-[18px] ${hasBg ? "mb-3 sm:mb-[14px]" : "mb-1 sm:mb-1.5"}`}
          >
            {/* Sticks to the base of the nav while this day's events scroll by,
                so a reader never loses track of which day they're looking at. */}
            <div
              className={`sticky z-30 rounded-t-[16px] sm:rounded-t-[18px] font-display font-black uppercase text-black text-[14px] sm:text-[15px] px-[14px] sm:px-[22px] pb-[11px] ${hasBg ? "pt-[10px] sm:pt-3" : "pt-0.5 sm:pt-1"}`}
              style={{ top: navHeight, backgroundColor: bgColor }}
            >
              {formatDayHeaderLabel(day.date)}
            </div>
            <ul
              className={`list-none pl-0 space-y-2 mb-0 px-[14px] sm:px-[22px] rounded-b-[16px] sm:rounded-b-[18px] ${hasBg ? "pb-4 sm:pb-[18px]" : "pb-1 sm:pb-1.5"}`}
              style={{ backgroundColor: bgColor }}
            >
              {day.events.map(event => (
                <EventItem key={event.id} event={event} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function MonthGroup({ monthName, events, altBg, pageBg, navHeight }: MonthGroupProps) {
  if (!events || events.events.length === 0) return null;

  const weekKeys = Object.keys(events.weekGroups).sort();
  let runningDayIndex = 0;

  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-1 font-black">{formatMonth(monthName)}</h2>
      {weekKeys.map((weekKey) => {
        const weekData = events.weekGroups[weekKey];
        const dayIndexStart = runningDayIndex;
        runningDayIndex += new Set(weekData.events.map(dayKey)).size;

        return (
          <WeekGroup
            key={weekKey}
            weekEvents={weekData.events}
            dayIndexStart={dayIndexStart}
            altBg={altBg}
            pageBg={pageBg}
            navHeight={navHeight}
          />
        );
      })}
    </div>
  );
}

export default MonthGroup;
