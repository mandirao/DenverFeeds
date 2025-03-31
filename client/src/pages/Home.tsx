import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, nonDenverAreaVenues } from "@/components/EventFilters";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
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
    denverAreaOnly: true
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
    // Month filter
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
    }
    
    // Denver/Boulder area filter
    if (filters.denverAreaOnly && nonDenverAreaVenues.includes(event.venue)) {
      return false;
    }
    
    return true;
  });
  
  // Group filtered events by month and week
  const groupedByMonthAndWeek = groupEventsByMonth(filteredEvents);
  
  // Check if we have events to display after filtering
  const hasEvents = Object.keys(groupedByMonthAndWeek).length > 0;

  // Handle individual filter changes
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, month: e.target.value });
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, genre: e.target.value });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, status: e.target.value });
  };
  
  const handleDenverAreaOnlyChange = (checked: boolean) => {
    setFilters({ ...filters, denverAreaOnly: checked });
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
          onMonthChange: handleMonthChange,
          onGenreChange: handleGenreChange,
          onStatusChange: handleStatusChange,
          onDenverAreaOnlyChange: handleDenverAreaOnlyChange
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
            // Render events grouped by month
            Object.entries(groupedByMonthAndWeek).map(([month, monthEvents]) => (
              <MonthGroup 
                key={month} 
                monthName={month} 
                events={monthEvents} 
              />
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
