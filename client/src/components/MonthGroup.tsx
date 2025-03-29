import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { formatMonth } from "@/lib/utils";

interface MonthGroupProps {
  monthName: string;
  events: Event[];
}

export function MonthGroup({ monthName, events }: MonthGroupProps) {
  if (events.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-xl text-black mb-3 font-anton font-black">{formatMonth(monthName)}</h2>
      <ul className="list-none pl-0 space-y-2">
        {events.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ul>
    </div>
  );
}

export default MonthGroup;
