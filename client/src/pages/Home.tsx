import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, nonDenverAreaVenues } from "@/components/EventFilters";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
import EventItem from "@/components/EventItem";
import { groupEventsByMonth, isRecentlyAdded } from "@/lib/utils";
import { Event } from "@shared/schema";

// Extract unique genres from events
const extractGenres = (events: Event[]): string[] => {
  const genreSet = new Set<string>();
  events.forEach(event => genreSet.add(event.genre));
  return Array.from(genreSet);
};

export default function Home() {
  const [filters, setFilters] = useState({
    month: "all",
    genre: "all",
    status: "all",
    denverAreaOnly: true,
    sortBy: "date"
  });

  // Fetch events
  const { data: events = [], isLoading, error } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Extract unique genres for the filter
  const genres = extractGenres(events);
  const months = getNextMonths();

  // Filter events based on selected filters
  const filteredEvents = events.filter(event => {
    // Month filter (not applied for top-voted)
    if (filters.status !== "top-voted" && filters.month !== "all") {
      const eventMonth = format(new Date(event.date), "MMMM yyyy");
      if (eventMonth !== filters.month) return false;
    }
    
    // Genre filter
    if (filters.genre !== "all" && event.genre !== filters.genre) {
      return false;
    }
    
    // Status filter
    if (filters.status === "just-added" && !isRecentlyAdded(event.createdAt)) {
      return false;
    } else if (filters.status === "scheduled" && !event.isScheduled) {
      return false;
    } else if (filters.status === "top-voted") {
      // Only show unscheduled events with at least 1 vote
      if (event.isScheduled || !event.upvotes || event.upvotes < 1) {
        return false;
      }
    }
    
    // Denver/Boulder area filter
    if (filters.denverAreaOnly && nonDenverAreaVenues.includes(event.venue)) {
      return false;
    }
    
    return true;
  });
  
  // Sort events based on sortBy option and status
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (filters.status === "top-voted" || filters.sortBy === "votes") {
      // Sort by votes (highest first)
      const aVotes = a.upvotes || 0;
      const bVotes = b.upvotes || 0;
      
      if (aVotes !== bVotes) {
        return bVotes - aVotes; // Highest votes first
      } else {
        // If votes are the same, sort by date
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    } else {
      // Default (date) sort
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
  });
  
  // For standard view, group by month and week
  const groupedByMonthAndWeek = groupEventsByMonth(sortedEvents);
  
  // Determine if we should group by month/week or show a flat list
  let displayContent;
  
  if (filters.status === "top-voted") {
    // For top-voted, we show a flat list without month/week grouping
    displayContent = (
      <div className="bg-white p-4 mb-8 shadow-md">
        <h2 className="text-2xl font-bold mb-4">Top Voted Events</h2>
        <ul className="space-y-6">
          {sortedEvents.map(event => (
            <EventItem key={event.id} event={event} />
          ))}
        </ul>
      </div>
    );
  } else {
    // Standard view with month/week grouping
    displayContent = Object.entries(groupedByMonthAndWeek).map(([month, monthEvents]) => (
      <MonthGroup 
        key={month} 
        monthName={month} 
        events={monthEvents} 
      />
    ));
  }
  
  // Check if we have events to display after filtering
  const hasEvents = filters.status === "top-voted" 
    ? sortedEvents.length > 0 
    : Object.entries(groupedByMonthAndWeek).length > 0;

  // Handle individual filter changes
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, month: e.target.value });
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, genre: e.target.value });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    
    // If selecting "top-voted", automatically set sortBy to "votes"
    if (newStatus === "top-voted") {
      setFilters({ ...filters, status: newStatus, sortBy: "votes" });
    } else {
      setFilters({ ...filters, status: newStatus });
    }
  };
  
  const handleDenverAreaOnlyChange = (checked: boolean) => {
    setFilters({ ...filters, denverAreaOnly: checked });
  };
  
  const handleSortByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, sortBy: e.target.value });
  };

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar 
        showFilters={true}
        filterProps={{
          onFilterChange: setFilters,
          genres,
          months,
          monthFilter: filters.month,
          genreFilter: filters.genre,
          statusFilter: filters.status,
          denverAreaOnlyFilter: filters.denverAreaOnly,
          sortByFilter: filters.sortBy,
          onMonthChange: handleMonthChange,
          onGenreChange: handleGenreChange,
          onStatusChange: handleStatusChange,
          onDenverAreaOnlyChange: handleDenverAreaOnlyChange,
          onSortByChange: handleSortByChange
        }}
      />
      
      <main className="container mx-auto px-4 py-8">
        {/* Events Feed */}
        <div className="mb-8 min-h-[400px]">
          {isLoading ? (
            <div className="py-10 text-center">Loading events...</div>
          ) : error ? (
            <div className="py-10 text-center text-red-500">Error loading events</div>
          ) : !hasEvents ? (
            <EmptyState />
          ) : (
            // Render events using the appropriate display method
            displayContent
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}