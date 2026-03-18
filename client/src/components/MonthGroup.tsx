import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth, getWeekOfMonth } from "@/lib/utils";

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
}

interface WeekProps {
  weekEvents: Event[];
  weekNumber: number;
  totalWeeks: number;
}

function WeekGroup({ weekEvents, weekNumber, totalWeeks }: WeekProps) {
  if (weekEvents.length === 0) return null;

  return (
    <div className="relative">
      {totalWeeks > 1 && (
        <div className="pt-2 pb-1">
          <div className="text-black text-sm font-black uppercase">
            WEEK {weekNumber}
          </div>
        </div>
      )}
      <ul className="list-none pl-0 space-y-2 mb-3">
        {weekEvents.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ul>
    </div>
  );
}

export function MonthGroup({ monthName, events }: MonthGroupProps) {
  if (!events || events.events.length === 0) return null;

  const weekKeys = Object.keys(events.weekGroups).sort();

  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-3 font-black">{formatMonth(monthName)}</h2>
      {weekKeys.map((weekKey) => {
        const weekData = events.weekGroups[weekKey];
        const weekNumber = weekData.events.length > 0
          ? getWeekOfMonth(new Date(weekData.events[0].date))
          : 1;

        return (
          <WeekGroup
            key={weekKey}
            weekEvents={weekData.events}
            weekNumber={weekNumber}
            totalWeeks={weekKeys.length}
          />
        );
      })}
    </div>
  );
}

export default MonthGroup;
