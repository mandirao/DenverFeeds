import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { getWeekRange, getWeekOfMonth } from "@/lib/utils";

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
  
  // Group events by week with week number info
  const weekGroups: Record<string, { events: Event[], weekNumber: number, monthName: string }> = {};
  
  sortedEvents.forEach(event => {
    const date = new Date(event.date);
    const weekInfo = getWeekRange(date);
    const weekKey = weekInfo.key;
    const weekNumber = getWeekOfMonth(date);
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });
    
    if (!weekGroups[weekKey]) {
      weekGroups[weekKey] = { events: [], weekNumber, monthName };
    }
    
    weekGroups[weekKey].events.push(event);
  });
  
  // Sort week keys chronologically
  const sortedWeekKeys = Object.keys(weekGroups).sort();
  
  return (
    <div className="mb-6">
      {subtitle && <p className="text-white text-sm mb-4 opacity-80">{subtitle}</p>}
      
      {sortedWeekKeys.map((weekKey, index) => {
        const weekGroup = weekGroups[weekKey];
        return (
          <div key={weekKey} className="relative">
            <ul className="list-none pl-0 space-y-2 mb-3">
              {weekGroup.events.map(event => (
                <EventItem key={event.id} event={event} />
              ))}
            </ul>
            {index < sortedWeekKeys.length - 1 && (
              <div className="pt-5 pb-7">
                <div className="text-black text-sm font-bold uppercase">
                  WEEK {weekGroup.weekNumber + 1}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
