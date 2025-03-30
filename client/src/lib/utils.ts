import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isAfter, isBefore, addDays, addWeeks } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date as "ddd, M/D" (e.g., "Mon, 7/1")
export function formatDate(date: Date | string): string {
  let dateObj: Date;
  
  if (typeof date === 'string') {
    // Handle ISO strings properly to maintain the day
    if (date.includes('T')) {
      // Regular ISO string with time component
      dateObj = new Date(date);
    } else {
      // Date-only string (YYYY-MM-DD)
      // Use date parts to create a date object that preserves the day regardless of timezone
      const [year, month, day] = date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
  } else {
    dateObj = date;
  }
  
  return format(dateObj, "EEE, M/d");
}

// Create Google Calendar URL
export function createGoogleCalendarUrl(event: {
  artist: string;
  venue: string;
  date: Date | string;
}): string {
  let dateObj: Date;
  
  if (typeof event.date === 'string') {
    // Handle ISO strings properly to maintain the day
    if (event.date.includes('T')) {
      // Regular ISO string with time component
      dateObj = new Date(event.date);
    } else {
      // Date-only string (YYYY-MM-DD)
      // Use date parts to create a date object that preserves the day
      const [year, month, day] = event.date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
  } else {
    dateObj = event.date;
  }
  
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

// Create Google Maps URL
export function createGoogleMapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

// Create Spotify search URL
export function createSpotifySearchUrl(artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(artist)}`;
}

// Check if event was added in the last three days
export function isRecentlyAdded(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  
  let dateObj: Date;
  
  if (typeof createdAt === 'string') {
    // Handle ISO strings properly
    if (createdAt.includes('T')) {
      // Regular ISO string with time component
      dateObj = new Date(createdAt);
    } else {
      // Date-only string (YYYY-MM-DD)
      const [year, month, day] = createdAt.split('-').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
  } else {
    dateObj = createdAt;
  }
  
  const threeDaysAgo = addDays(new Date(), -3);
  return isAfter(dateObj, threeDaysAgo);
}

// Group events by month
export function groupEventsByMonth(events: any[]) {
  const groupedEvents: Record<string, any[]> = {};
  
  events.forEach(event => {
    let date: Date;
    
    if (typeof event.date === 'string') {
      // Handle ISO strings properly to maintain the month
      if (event.date.includes('T')) {
        // Regular ISO string with time component
        date = new Date(event.date);
      } else {
        // Date-only string (YYYY-MM-DD)
        // Use date parts to create a date object that preserves the month
        const [year, month, day] = event.date.split('-').map(Number);
        date = new Date(year, month - 1, day);
      }
    } else {
      date = event.date;
    }
    
    const monthYear = format(date, 'MMMM yyyy'); // e.g., "July 2023"
    
    if (!groupedEvents[monthYear]) {
      groupedEvents[monthYear] = [];
    }
    
    groupedEvents[monthYear].push(event);
  });
  
  return groupedEvents;
}

// Format month for display
export function formatMonth(monthYear: string): string {
  return monthYear.toUpperCase();
}
