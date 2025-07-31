import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth, getWeekOfMonth } from "@/lib/utils";
import { format } from "date-fns";

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
  isLastWeek: boolean;
  weekNumber: number;
}

function WeekGroup({ weekEvents, isLastWeek, weekNumber }: WeekProps) {
  if (weekEvents.length === 0) return null;
  
  return (
    <div className="relative">
      <ul className="list-none pl-0 space-y-2 mb-3">
        {weekEvents.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ul>
      {!isLastWeek && (
        <div className="pt-5 pb-7">
          <div className="ml-[3rem] text-black text-sm font-medium">
            Week {weekNumber}
          </div>
        </div>
      )}
    </div>
  );
}

export function MonthGroup({ monthName, events }: MonthGroupProps) {
  if (!events || events.events.length === 0) return null;

  // Extract and sort week keys
  const weekKeys = Object.keys(events.weekGroups).sort();
  
  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-3 font-anton font-black">{formatMonth(monthName)}</h2>
      {weekKeys.map((weekKey, index) => {
        const weekData = events.weekGroups[weekKey];
        // Calculate week number from the first event in this week
        const weekNumber = weekData.events.length > 0 
          ? getWeekOfMonth(new Date(weekData.events[0].date)) 
          : 1;
        
        return (
          <WeekGroup 
            key={weekKey}
            weekEvents={weekData.events}
            isLastWeek={index === weekKeys.length - 1}
            weekNumber={weekNumber}
          />
        );
      })}
    </div>
  );
}

export default MonthGroup;
