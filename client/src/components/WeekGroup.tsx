import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";

interface WeekGroupProps {
  events: Event[];
  isLastWeekInMonth: boolean;
}

export function WeekGroup({ events, isLastWeekInMonth }: WeekGroupProps) {
  if (events.length === 0) return null;

  return (
    <div className="relative">
      <ul className="list-none pl-0 space-y-2 mb-2">
        {events.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ul>
      
      {/* Week separator - only show if not the last week in the month */}
      {!isLastWeekInMonth && (
        <div className="mx-auto w-[30px] h-[1px] bg-black my-3" aria-hidden="true" />
      )}
    </div>
  );
}

export default WeekGroup;