import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth } from "@/lib/utils";
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
}

function WeekGroup({ weekEvents, isLastWeek }: WeekProps) {
  if (weekEvents.length === 0) return null;
  
  return (
    <div className="relative">
      <ul className="list-none pl-0 space-y-2 mb-3">
        {weekEvents.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ul>
      {!isLastWeek && (
        <div className="relative mb-3">
          <div
            className="absolute left-0 h-[2px] bg-black opacity-10"
            style={{ width: "calc(100% - 3rem)", marginLeft: "3rem" }}
          />
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
      {weekKeys.map((weekKey, index) => (
        <WeekGroup 
          key={weekKey}
          weekEvents={events.weekGroups[weekKey].events}
          isLastWeek={index === weekKeys.length - 1}
        />
      ))}
    </div>
  );
}

export default MonthGroup;
