import { Event } from "@shared/schema";
import EventItem from "@/components/EventItem";
import { getWeekRange, getWeekOfMonth } from "@/lib/utils";

interface WeekDividerProps {
  events: Event[];
  subtitle?: string;
}

export default function WeekDivider({ events, subtitle }: WeekDividerProps) {
  if (!events.length) return null;

  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const weekGroups: Record<string, { events: Event[], weekNumber: number }> = {};

  sortedEvents.forEach(event => {
    const date = new Date(event.date);
    const weekInfo = getWeekRange(date);
    const weekKey = weekInfo.key;
    const weekNumber = getWeekOfMonth(date);

    if (!weekGroups[weekKey]) {
      weekGroups[weekKey] = { events: [], weekNumber };
    }
    weekGroups[weekKey].events.push(event);
  });

  const sortedWeekKeys = Object.keys(weekGroups).sort();

  return (
    <div className="mb-6">
      {subtitle && <p className="text-white text-sm mb-4 opacity-80">{subtitle}</p>}
      {sortedWeekKeys.map((weekKey, index) => {
        const weekGroup = weekGroups[weekKey];
        return (
          <div key={weekKey} className="relative">
            {index > 0 && (
              <div className="pt-2 pb-1">
                <div className="text-black text-sm font-black uppercase">
                  WEEK {weekGroup.weekNumber}
                </div>
              </div>
            )}
            <ul className="list-none pl-0 space-y-2 mb-3">
              {weekGroup.events.map(event => (
                <EventItem key={event.id} event={event} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
