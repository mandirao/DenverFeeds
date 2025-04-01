import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, denverBoulderVenues } from "@/components/EventFilters";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
import EventItem from "@/components/EventItem";
import { groupEventsByMonth, isRecentlyAdded } from "@/lib/utils";
import { venueOptions, VenueOption, Event, genres as schemaGenres } from "@shared/schema";

export default function Home() {
  const [filters, setFilters] = useState({
    month: "all",
    genre: "all",
    status: "all",
    denverAreaOnly: true,
    sortBy: "date"
  });

  // Fetch events - with refetchOnMount: always to ensure a fresh load every time
  const { data: events = [], isLoading, error } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    refetchOnMount: 'always',  // This forces a refresh every time the component mounts
    staleTime: 0,              // Consider data stale immediately
  });

  // Use the genres list directly from schema
  const genres = schemaGenres;
  
  // Get unique months, ensuring no duplicates for the filter dropdown
  const months = getNextMonths();

  // Filter events based on selected filters
  const filteredEvents = events.filter(event => {
    // Month filter (now applied for all views including top-voted)
    if (filters.month !== "all") {
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
    // Filter based on venue location
    // Get all the road trip venues for easier checking
    const roadTripVenues = venueOptions
      .filter(venue => venue.group === "road_trip")
      .map(venue => venue.value);
      
    if (filters.denverAreaOnly) {
      // When ON: Show only Denver/Boulder venues
      // A venue is considered Denver/Boulder if:
      // 1. It's in the denverBoulderVenues list, OR
      // 2. It starts with "Other:", OR
      // 3. It's a custom venue not in our road trip list
      if (roadTripVenues.includes(event.venue)) {
        return false; // Filter out road trip venues
      }
    } else {
      // When OFF: Show only roadtrip venues
      // A venue is considered a road trip if:
      // It's explicitly in our road trip venues list
      if (!roadTripVenues.includes(event.venue)) {
        return false; // Filter out Denver/Boulder and custom venues
      }
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
    // Create subtitle if month or genre filters are applied
    let filterSubtitle = '';
    if (filters.month !== 'all' && filters.genre !== 'all') {
      filterSubtitle = `${filters.genre} in ${filters.month}`;
    } else if (filters.month !== 'all') {
      filterSubtitle = filters.month;
    } else if (filters.genre !== 'all') {
      filterSubtitle = filters.genre;
    }
    
    displayContent = (
      <div className="p-4 mb-8">
        <h2 className="text-xl font-black mb-1 text-white uppercase">TOP VOTED</h2>
        {filterSubtitle && <p className="text-white text-sm mb-4 opacity-80">{filterSubtitle}</p>}
        <ul className="list-none pl-0 space-y-2 mb-3">
          {sortedEvents.map(event => (
            <EventItem key={event.id} event={event} />
          ))}
        </ul>
      </div>
    );
  } else {
    // Standard view with appropriate heading based on filter
    displayContent = (
      <>
        {/* Display heading based on filter */}
        <h2 className="text-xl font-black mb-4 text-white uppercase">
          {filters.denverAreaOnly ? "Denver/Boulder" : "Roadtrip Shows"}
        </h2>
        
        {/* Display events grouped by month */}
        {Object.entries(groupedByMonthAndWeek).map(([month, monthEvents]) => (
          <MonthGroup 
            key={month} 
            monthName={month} 
            events={monthEvents} 
          />
        ))}
      </>
    );
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