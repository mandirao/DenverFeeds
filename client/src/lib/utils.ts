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
  let year: number;
  let month: number;
  let day: number;
  
  if (typeof event.date === 'string') {
    if (event.date.includes('T')) {
      // Regular ISO string with time component
      const dateObj = new Date(event.date);
      year = dateObj.getFullYear();
      month = dateObj.getMonth();
      day = dateObj.getDate();
    } else {
      // Date-only string (YYYY-MM-DD)
      // Parse the parts directly
      const parts = event.date.split('-').map(Number);
      year = parts[0];
      month = parts[1] - 1; // JS months are 0-indexed
      day = parts[2];
    }
  } else {
    // Date object
    year = event.date.getFullYear();
    month = event.date.getMonth();
    day = event.date.getDate();
  }
  
  // Create a new date in the correct time zone (using actual date parts)
  const dateObj = new Date(year, month, day);
  
  // Set event to start at 7pm
  dateObj.setHours(19, 0, 0, 0);
  
  // End time is 3 hours later
  const endDate = new Date(dateObj);
  endDate.setHours(22, 0, 0, 0);
  
  const eventTitle = `${event.artist} @ ${event.venue}`;
  
  // Format dates for Google Calendar
  const startDateString = format(dateObj, "yyyyMMdd'T'HHmmss");
  const endDateString = format(endDate, "yyyyMMdd'T'HHmmss");
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&dates=${startDateString}/${endDateString}&details=Show%20organized%20by%20Setlist%20Social`;
}

// Create Google Maps URL or Google search for TBD venues
export function createGoogleMapsUrl(venue: string, artist?: string): string {
  // If venue is TBD, create a Google search for the artist + Denver
  if (venue === "TBD" && artist) {
    return createGoogleSearchUrl(`${artist} Denver concert`);
  }
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

// Helper function to normalize date and extract year, month, day
function extractDateParts(eventDate: string | Date): { year: number; month: number; day: number } {
  let year: number;
  let month: number;
  let day: number;
  
  if (typeof eventDate === 'string') {
    if (eventDate.includes('T')) {
      // For ISO strings with time component, extract parts using Date
      const dateObj = new Date(eventDate);
      year = dateObj.getFullYear();
      month = dateObj.getMonth();
      day = dateObj.getDate();
    } else {
      // For date-only strings (YYYY-MM-DD), parse directly
      const parts = eventDate.split('-').map(Number);
      year = parts[0];
      month = parts[1] - 1; // 0-indexed months
      day = parts[2];
    }
  } else if (eventDate instanceof Date) {
    year = eventDate.getFullYear();
    month = eventDate.getMonth();
    day = eventDate.getDate();
  } else {
    // Default to current date if format is unexpected
    console.warn('Unexpected date format:', eventDate);
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  }
  
  return { year, month, day };
}

// Calculate week number for a date, ensuring weeks start on Monday
function getWeekNumber(date: Date): number {
  // Copy date to avoid modifying the original
  const d = new Date(date);
  // Set to midnight to ensure consistent day calculations
  d.setHours(0, 0, 0, 0);
  
  // Adjust the date to nearest Monday (start of week)
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  // We want Monday as day 0, so we adjust:
  // - For Monday (1), subtract 1 → 0 days (day 0)
  // - For Tuesday (2), subtract 1 → 1 day
  // - For Sunday (0), subtract 1 → -1, then (+ 7) % 7 = 6 days
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday
  d.setDate(d.getDate() - dayOfWeek);
  
  // Get first day of year
  const yearStart = new Date(d.getFullYear(), 0, 1);
  // Calculate week number: (difference in days) / 7 (rounded up)
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000) / 7);
}

// Group events by month and then by week
export function groupEventsByMonth(events: any[]) {
  // First, sort events by date
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });
  
  const groupedEvents: Record<string, any[]> = {};
  
  sortedEvents.forEach(event => {
    const { year, month } = extractDateParts(event.date);
    
    // Get month name
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month];
    
    // Create a consistent key
    const monthYear = `${monthName} ${year}`;
    
    if (!groupedEvents[monthYear]) {
      groupedEvents[monthYear] = [];
    }
    
    groupedEvents[monthYear].push(event);
  });
  
  return groupedEvents;
}

// Group events by week within a month
// A week starts on Monday and ends on Sunday
export function groupEventsByWeek(events: any[]) {
  // First sort by date
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });
  
  const weekGroups: any[][] = [];
  let currentWeekEvents: any[] = [];
  let previousDate: Date | null = null;
  
  sortedEvents.forEach(event => {
    const { year, month, day } = extractDateParts(event.date);
    const eventDate = new Date(year, month, day);
    const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Check if we need to start a new week group
    let startNewGroup = false;
    
    if (previousDate) {
      const prevDay = previousDate.getDay();
      // Start a new group if:
      // 1. Current day is Monday (1) and previous day was ANY day (transition to new week)
      // 2. OR if days are not consecutive (gap in events)
      const dayDiff = (eventDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // If current day is Monday (1) OR there's a gap of more than 1 day
      startNewGroup = dayOfWeek === 1 || dayDiff > 1;
    }
    
    if (startNewGroup && currentWeekEvents.length > 0) {
      weekGroups.push([...currentWeekEvents]);
      currentWeekEvents = [];
    }
    
    currentWeekEvents.push(event);
    previousDate = eventDate;
  });
  
  // Add the last group
  if (currentWeekEvents.length > 0) {
    weekGroups.push(currentWeekEvents);
  }
  
  return weekGroups;
}

// Format month for display
export function formatMonth(monthYear: string): string {
  return monthYear.toUpperCase();
}
