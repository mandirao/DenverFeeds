import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { getWeekRange } from "@/lib/utils";

interface WeekDividerProps {
  events: Event[];
  title: string;
  subtitle?: string;
  onClose?: () => void;
}

/**
 * WeekDivider component displays events with week dividers
 * It groups events by week and adds a horizontal divider between weeks
 */
export default function WeekDivider({ events, title, subtitle, onClose }: WeekDividerProps) {
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
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <h2 className="text-xl font-black text-white uppercase">{title}</h2>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-white hover:text-[#41F2EE] text-xs font-bold ml-5"
              aria-label="Close filter view"
              style={{ fontSize: '0.75rem' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      
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
