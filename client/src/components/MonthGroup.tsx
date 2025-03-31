import { Event } from "@shared/schema";
import WeekGroup from "@/components/WeekGroup";
import { formatMonth, groupEventsByWeek } from "@/lib/utils";

interface MonthGroupProps {
  monthName: string;
  events: Event[];
}

export function MonthGroup({ monthName, events }: MonthGroupProps) {
  if (events.length === 0) return null;

  // Group the events by week
  const weekGroupedEvents = groupEventsByWeek(events);

  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-3 font-anton font-black">{formatMonth(monthName)}</h2>
      
      {/* Render each week group */}
      {weekGroupedEvents.map((weekEvents, index) => (
        <WeekGroup 
          key={`week-${index}-${weekEvents[0]?.id || index}`}
          events={weekEvents}
          isLastWeekInMonth={index === weekGroupedEvents.length - 1}
        />
      ))}
    </div>
  );
}

export default MonthGroup;
