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
  let dateObj: Date;
  
  // Convert input date to a JavaScript Date object
  if (typeof event.date === 'string') {
    if (event.date.includes('T')) {
      // ISO string with time component - create a date object from it
      dateObj = new Date(event.date);
    } else {
      // Date-only string (YYYY-MM-DD) - parse the parts and create a date at noon
      const parts = event.date.split('-').map(Number);
      dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
    }
  } else {
    // It's already a Date object
    dateObj = new Date(event.date);
  }
  
  // Extract date parts (in local timezone, which doesn't matter for the date only)
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1; // Convert to 1-indexed month
  const day = dateObj.getDate();
  
  // Format date for display (for debugging)
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  // Create the event specifically in Denver time (MDT/MST, UTC-6 or UTC-7)
  // We'll hard-code the UTC-6 offset for now (Denver time during standard time)
  // For a production app, we should determine if Denver is currently in daylight saving time
  
  // Create 7:00 PM Denver time event
  // Format: YYYYMMDDTHHMMSS (in Denver time)
  const denverStart = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}T190000`;
  const denverEnd = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}T220000`;

  // For Google Calendar, we need to specify the timezone
  // Instead of converting to UTC which causes issues, we'll use Denver timezone directly
  const eventTitle = `${event.artist} @ ${event.venue}`;
  
  // Google Calendar accepts two formats:
  // 1. UTC format with Z suffix: YYYYMMDDTHHMMSSz
  // 2. Local time with timezone: YYYYMMDDTHHMMSS (with "ctz" parameter for timezone)
  
  // We'll use the second format for better accuracy with Denver time
  const startDateString = denverStart;
  const endDateString = denverEnd;
  
  // Include the venue as the location and specify Denver timezone
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&dates=${startDateString}/${endDateString}&details=Show%20organized%20by%20Setlist%20Social&location=${encodeURIComponent(event.venue)}&ctz=America/Denver`;
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

// Format month for display
export function formatMonth(monthYear: string): string {
  return monthYear.toUpperCase();
}
