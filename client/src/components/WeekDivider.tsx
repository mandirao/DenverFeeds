import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { getWeekRange } from "@/lib/utils";

interface WeekDividerProps {
  events: Event[];
  subtitle?: string;
}

/**
 * WeekDivider component displays events with week dividers
 * It groups events by week and adds a horizontal divider between weeks
 */
export default function WeekDivider({ events, subtitle }: WeekDividerProps) {
  if (!events.length) return null;
  
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  
  // Group events by week
  const weekGroups: Record<string, Event[]> = {};
  
  sortedEvents.forEach(event => {
    const date = new Date(event.date);
    const weekInfo = getWeekRange(date);
    const weekKey = weekInfo.key;
    
    if (!weekGroups[weekKey]) {
      weekGroups[weekKey] = [];
    }
    
    weekGroups[weekKey].push(event);
  });
  
  // Sort week keys chronologically
  const sortedWeekKeys = Object.keys(weekGroups).sort();
  
  return (
    <div className="mb-6">
      {subtitle && <p className="text-white text-sm mb-4 opacity-80">{subtitle}</p>}
      
      {sortedWeekKeys.map((weekKey, index) => (
        <div key={weekKey} className="relative">
          <ul className="list-none pl-0 space-y-2 mb-3">
            {weekGroups[weekKey].map(event => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
          {index < sortedWeekKeys.length - 1 && (
            <div className="pt-5 pb-7">
              <div 
                className="w-[30px] h-[2px] bg-black ml-[3rem]"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
