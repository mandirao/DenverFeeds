import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isAfter, isBefore, addDays, addWeeks } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date as "ddd, M/D" (e.g., "Mon, 7/1")
export function formatDate(date: Date | string): string {
  // IMPORTANT: Our date handling approach:
  // 1. Backend stores all dates at midnight UTC (00:00:00Z)
  // 2. Frontend displays dates in local timezone for the user
  
  // Create a new date object from the input
  let dateObj: Date;
  if (typeof date === 'string') {
    // Parse the ISO date string from our database (will be in UTC)
    dateObj = new Date(date);
    console.log(`Formatting date from string: ${date} -> Date object: ${dateObj.toString()}`);
  } else {
    dateObj = date;
  }
  
  // Format the date using the user's local timezone
  return format(dateObj, "EEE, M/d");
}

// Create Google Calendar URL
export function createGoogleCalendarUrl(event: {
  artist: string;
  venue: string;
  date: Date | string;
}): string {
  // Parse the date to user's local time
  const dateObj = typeof event.date === 'string' ? new Date(event.date) : event.date;
  
  console.log(`Calendar URL: Event date from DB: ${event.date}, parsed as: ${dateObj.toString()}`);
  
  // Set event to start at 7pm in user's local time
  const eventDate = new Date(dateObj);
  eventDate.setHours(19, 0, 0, 0);
  
  // End time is 3 hours later
  const endDate = new Date(eventDate);
  endDate.setHours(22, 0, 0, 0);
  
  const eventTitle = `${event.artist} @ ${event.venue}`;
  
  // Format dates for Google Calendar (will be in local timezone)
  const startDateString = format(eventDate, "yyyyMMdd'T'HHmmss");
  const endDateString = format(endDate, "yyyyMMdd'T'HHmmss");
  
  console.log(`Calendar event time: ${eventDate.toString()} to ${endDate.toString()}`);
  
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
  const dateObj = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const threeDaysAgo = addDays(new Date(), -3);
  return isAfter(dateObj, threeDaysAgo);
}

// Group events by month
export function groupEventsByMonth(events: any[]) {
  const groupedEvents: Record<string, any[]> = {};
  
  events.forEach(event => {
    // Parse the date from ISO format (UTC) into local timezone
    const date = new Date(event.date);
    
    // Log the date conversion for debugging timezone issues
    console.log(`Event grouping: ${event.artist} @ ${event.venue}, UTC date: ${event.date}, Local date: ${date.toString()}`);
    
    // Format the date using date-fns to get the month and year in the user's timezone
    const monthYear = format(date, 'MMMM yyyy'); // e.g., "July 2025"
    
    // Create month group if it doesn't exist yet
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
