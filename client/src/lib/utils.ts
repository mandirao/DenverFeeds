import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isAfter, isBefore, addDays, addWeeks } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date as "ddd, M/D" (e.g., "Mon, 7/1")
export function formatDate(date: Date | string): string {
  // Special handling for dates to prevent timezone issues
  if (typeof date === 'string') {
    // Extract the date parts directly without using the Date constructor for YYYY-MM-DD format
    if (!date.includes('T')) {
      // For date-only strings (YYYY-MM-DD), directly parse and format without timezone adjustments
      const [year, month, day] = date.split('-').map(Number);
      
      // Create a date object using UTC to avoid timezone shifting
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      
      // Get day of week using UTC methods to ensure correct day
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getUTCDay()];
      
      // Return formatted date without allowing timezone shifts
      return `${dayOfWeek}, ${month}/${day}`;
    } else {
      // For ISO strings with time component, parse using UTC
      const dateTime = new Date(date);
      const utcDateObj = new Date(Date.UTC(
        dateTime.getUTCFullYear(),
        dateTime.getUTCMonth(),
        dateTime.getUTCDate()
      ));
      
      // Format using UTC date parts
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][utcDateObj.getUTCDay()];
      return `${dayOfWeek}, ${utcDateObj.getUTCMonth() + 1}/${utcDateObj.getUTCDate()}`;
    }
  } else {
    // For Date objects, create a UTC version to avoid timezone shifts
    const utcDateObj = new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ));
    
    // Format using UTC methods
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][utcDateObj.getUTCDay()];
    return `${dayOfWeek}, ${utcDateObj.getUTCMonth() + 1}/${utcDateObj.getUTCDate()}`;
  }
}

// Create Google Calendar URL
export function createGoogleCalendarUrl(event: {
  artist: string;
  venue: string;
  date: Date | string;
}): string {
  // Get the date components directly from the date string or object
  let year: number;
  let month: number;
  let day: number;
  
  if (typeof event.date === 'string') {
    if (event.date.includes('T')) {
      // It's an ISO string with time component
      const parts = event.date.split('T')[0].split('-').map(Number);
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else {
      // It's a date-only string (YYYY-MM-DD)
      const parts = event.date.split('-').map(Number);
      year = parts[0];
      month = parts[1];
      day = parts[2];
    }
  } else {
    // It's a Date object - extract UTC components to ensure we get the database date
    // This is important because Date objects might be affected by browser timezone
    year = event.date.getUTCFullYear();
    month = event.date.getUTCMonth() + 1; // Convert to 1-indexed month
    day = event.date.getUTCDate();
  }
  
  // Build the date string in the exact format Google Calendar expects
  // For an all-day event with time in Denver, we need:
  // 1. Format the date as YYYYMMDD
  // 2. Specify start/end times in the same day
  // 3. Use America/Denver timezone explicitly
  
  // Format as 20250401T190000 (April 1, 2025 at 7:00 PM)
  const dateFormatted = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  
  // Create start (7:00 PM) and end (10:00 PM) on the same day
  const startTime = `${dateFormatted}T190000`;
  const endTime = `${dateFormatted}T220000`;
  
  const eventTitle = `${event.artist} @ ${event.venue}`;
  
  // Build the Google Calendar URL with explicit Denver timezone
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&dates=${startTime}/${endTime}&details=Show%20organized%20by%20Setlist%20Social&location=${encodeURIComponent(event.venue)}&ctz=America/Denver`;
}

// Create Google search URL for venue and tickets
export function createGoogleMapsUrl(venue: string, artist?: string): string {
  // For all venues, create a Google search for the artist + Colorado + Tickets
  if (artist) {
    return createGoogleSearchUrl(`${artist} Colorado Tickets`);
  }
  // Fallback to standard maps URL if no artist provided
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

// Create Google search URL
export function createGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// Create Spotify search URL
export function createSpotifySearchUrl(artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(artist)}`;
}

// Check if event was added in the last three days
export function isRecentlyAdded(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  
  let year: number;
  let month: number;
  let day: number;
  
  if (typeof createdAt === 'string') {
    if (createdAt.includes('T')) {
      // For ISO strings with time component, extract the date
      const dateObj = new Date(createdAt);
      year = dateObj.getFullYear();
      month = dateObj.getMonth(); 
      day = dateObj.getDate();
    } else {
      // For date-only strings (YYYY-MM-DD), parse directly
      const parts = createdAt.split('-').map(Number);
      year = parts[0];
      month = parts[1] - 1; // JS months are 0-indexed
      day = parts[2];
    }
  } else {
    // Date object
    year = createdAt.getFullYear();
    month = createdAt.getMonth();
    day = createdAt.getDate();
  }
  
  // Create a date object with the extracted parts
  const dateObj = new Date(year, month, day);
  
  // Calculate three days ago from now
  const now = new Date();
  const threeDaysAgo = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -3);
  
  return isAfter(dateObj, threeDaysAgo);
}

// Determine creation time category for an event
export function getAddedTimeCategory(createdAt: Date | string | null): 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'older' {
  if (!createdAt) return 'older';
  
  let createdDate: Date;
  
  if (typeof createdAt === 'string') {
    createdDate = new Date(createdAt);
  } else {
    createdDate = createdAt;
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = addDays(today, -1);
  const oneWeekAgo = addDays(today, -7);
  const twoWeeksAgo = addDays(today, -14);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const twoMonthsAgo = new Date(today);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  
  // Start of the created date (midnight)
  const createdDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
  
  if (isAfter(createdDay, yesterday) || createdDay.getTime() === today.getTime()) {
    return 'today';
  } else if (isAfter(createdDay, oneWeekAgo)) {
    return 'this_week';
  } else if (isAfter(createdDay, twoWeeksAgo)) {
    return 'last_week';
  } else if (isAfter(createdDay, oneMonthAgo)) {
    return 'this_month';
  } else if (isAfter(createdDay, twoMonthsAgo)) {
    return 'last_month';
  } else {
    return 'older';
  }
}

// Get the UTC week start (Monday) and end (Sunday) dates for a given date
export function getWeekRange(date: Date): { start: Date, end: Date, key: string } {
  // Create date from UTC components to avoid timezone shifts
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDate = date.getUTCDate();
  const utcDay = date.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to subtract to get to Monday (if Sunday, go back 6 days)
  const daysToSubtract = utcDay === 0 ? 6 : utcDay - 1;
  
  // Create start date (Monday)
  const start = new Date(Date.UTC(utcYear, utcMonth, utcDate - daysToSubtract));
  
  // Create end date (Sunday)
  const end = new Date(Date.UTC(utcYear, utcMonth, utcDate + (7 - daysToSubtract) - 1));
  
  // Create a consistent key for this week: "YYYY-MM-DD"
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
  
  return { start, end, key };
}

// Extract UTC date components from various date formats
export function extractUtcDateComponents(eventDate: string | Date): { year: number, month: number, day: number, date: Date } {
  let year: number;
  let month: number;
  let day: number;
  let date: Date;
  
  if (typeof eventDate === 'string') {
    if (eventDate.includes('T')) {
      // For ISO strings with time component, extract the date
      date = new Date(eventDate);
      year = date.getUTCFullYear();
      month = date.getUTCMonth();
      day = date.getUTCDate();
    } else {
      // For date-only strings (YYYY-MM-DD), parse directly
      const parts = eventDate.split('-').map(Number);
      year = parts[0];
      month = parts[1] - 1; // JS months are 0-indexed
      day = parts[2];
      date = new Date(Date.UTC(year, month, day));
    }
  } else {
    // Date object
    date = eventDate;
    year = date.getUTCFullYear();
    month = date.getUTCMonth();
    day = date.getUTCDate();
  }
  
  return { year, month, day, date };
}

// Group events by month and then by week
export function groupEventsByMonth(events: any[]) {
  const groupedEvents: Record<string, any> = {};
  
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = extractUtcDateComponents(a.date).date;
    const dateB = extractUtcDateComponents(b.date).date;
    return dateA.getTime() - dateB.getTime();
  });
  
  sortedEvents.forEach(event => {
    const { year, month, date } = extractUtcDateComponents(event.date);
    
    // Get month name
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month];
    
    // Create a consistent key for month
    const monthYear = `${monthName} ${year}`;
    
    // Initialize the month structure if it doesn't exist
    if (!groupedEvents[monthYear]) {
      groupedEvents[monthYear] = {
        events: [],
        weekGroups: {}
      };
    }
    
    // Add to month events array
    groupedEvents[monthYear].events.push(event);
    
    // Get week grouping
    const weekInfo = getWeekRange(date);
    const weekKey = weekInfo.key;
    
    // Initialize the week if it doesn't exist
    if (!groupedEvents[monthYear].weekGroups[weekKey]) {
      groupedEvents[monthYear].weekGroups[weekKey] = {
        start: weekInfo.start,
        end: weekInfo.end,
        events: []
      };
    }
    
    // Add event to the week group
    groupedEvents[monthYear].weekGroups[weekKey].events.push(event);
  });
  
  return groupedEvents;
}

// Group events by their creation time (when they were added)
export function groupEventsByCreationTime(events: any[]) {
  // Define the structure of our result with all possible categories
  const result: Record<string, any[]> = {
    today: [],
    this_week: [],
    last_week: [],
    this_month: [],
    last_month: [],
    older: []
  };
  
  // Categorize each event by creation time first
  events.forEach(event => {
    const category = getAddedTimeCategory(event.createdAt);
    // Make sure the category exists in our result object
    if (result[category]) {
      result[category].push(event);
    } else {
      // Fallback to older if we don't recognize the category
      result.older.push(event);
    }
  });
  
  // Now sort each category by event date (chronologically)
  Object.keys(result).forEach(key => {
    result[key].sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateA.getTime() - dateB.getTime(); // Ascending (earliest first)
    });
  });
  
  return result;
}

// Format month for display
export function formatMonth(monthYear: string): string {
  return monthYear.toUpperCase();
}
