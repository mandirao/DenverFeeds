import { Event } from "@shared/schema";
import { getAddedTimeCategory } from "@/lib/utils";
import WeekDivider from "@/components/WeekDivider";

interface JustAddedViewProps {
  events: Event[];
  subtitle?: string;
}

type TimeCategory = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'older';

export default function JustAddedView({ events, subtitle }: JustAddedViewProps) {
  if (!events.length) return null;
  
  // Sort events by creation date (newest first)
  const sortedByCreationDate = [...events].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateB.getTime() - dateA.getTime(); // Newest first
  });
  
  // Group events by creation time (today, this week, this month, older)
  const timeCategories: Record<TimeCategory, Event[]> = {
    today: [],
    this_week: [],
    last_week: [],
    this_month: [],
    last_month: [],
    older: []
  };
  
  // Categorize each event by creation time
  sortedByCreationDate.forEach(event => {
    const category = getAddedTimeCategory(event.createdAt) as TimeCategory;
    if (timeCategories[category]) {
      timeCategories[category].push(event);
    } else {
      timeCategories.older.push(event);
    }
  });
  
  // Sort events within each time category by event date (chronologically)
  Object.keys(timeCategories).forEach((key) => {
    const typedKey = key as TimeCategory;
    timeCategories[typedKey].sort((a: Event, b: Event) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateA.getTime() - dateB.getTime(); // Ascending (earliest first)
    });
  });
  
  // Category titles for display
  const categoryDisplayNames: Record<TimeCategory, string> = {
    today: "Added Today",
    this_week: "Added This Week",
    last_week: "Added Last Week",
    this_month: "Added This Month",
    last_month: "Added Last Month",
    older: "Added Earlier"
  };
  
  return (
    <div className="mb-6">
      {subtitle && <p className="text-white text-sm mb-4 opacity-80">{subtitle}</p>}
      
      {/* Display events by time category */}
      {Object.entries(timeCategories).map(([category, categoryEvents]) => {
        if (categoryEvents.length === 0) return null;
        const typedCategory = category as TimeCategory;
        
        return (
          <div key={category} className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">{categoryDisplayNames[typedCategory]}</h3>
            <WeekDivider 
              events={categoryEvents}
            />
          </div>
        );
      })}
    </div>
  );
}
