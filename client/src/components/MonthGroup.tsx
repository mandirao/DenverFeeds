import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth, getWeekOfMonth, extractUtcDateComponents } from "@/lib/utils";
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
  // days stay transparent so they blend with the page background.
  altBg: string;
}

interface WeekProps {
  weekEvents: Event[];
  weekNumber: number;
  totalWeeks: number;
  dayIndexStart: number;
  altBg: string;
}

// Day-group key ("YYYY-MM-DD"), derived the same way groupEventsByMonth
// buckets events by day so the two never disagree on where a day boundary is.
function dayKey(event: Event): string {
  const { year, month, day } = extractUtcDateComponents(event.date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function WeekGroup({ weekEvents, weekNumber, totalWeeks, dayIndexStart, altBg }: WeekProps) {
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
      {totalWeeks > 1 && (
        <div className="pt-2 pb-1">
          <div className="text-black text-sm font-black uppercase">
            WEEK {weekNumber}
          </div>
        </div>
      )}
      {dayGroups.map((day, i) => (
        <div
          key={day.date}
          className="rounded-[16px] sm:rounded-[18px] px-[14px] sm:px-[22px] pt-[14px] sm:pt-4 pb-4 sm:pb-[18px] mb-3 sm:mb-[14px]"
          style={{ backgroundColor: (dayIndexStart + i) % 2 === 1 ? altBg : "transparent" }}
        >
          <div className="font-display font-black uppercase text-black text-[14px] sm:text-[15px] mb-[11px]">
            {formatDayHeaderLabel(day.date)}
          </div>
          <ul className="list-none pl-0 space-y-2 mb-0">
            {day.events.map(event => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MonthGroup({ monthName, events, altBg }: MonthGroupProps) {
  if (!events || events.events.length === 0) return null;

  const weekKeys = Object.keys(events.weekGroups).sort();
  let runningDayIndex = 0;

  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-3 font-black">{formatMonth(monthName)}</h2>
      {weekKeys.map((weekKey) => {
        const weekData = events.weekGroups[weekKey];
        const weekNumber = weekData.events.length > 0
          ? getWeekOfMonth(new Date(weekData.events[0].date))
          : 1;
        const dayIndexStart = runningDayIndex;
        runningDayIndex += new Set(weekData.events.map(dayKey)).size;

        return (
          <WeekGroup
            key={weekKey}
            weekEvents={weekData.events}
            weekNumber={weekNumber}
            totalWeeks={weekKeys.length}
            dayIndexStart={dayIndexStart}
            altBg={altBg}
          />
        );
      })}
    </div>
  );
}

export default MonthGroup;
