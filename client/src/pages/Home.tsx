import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, denverBoulderVenues } from "@/components/EventFilters";
import { cheapThrillsVenues } from "@shared/schema";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
import EventItem from "@/components/EventItem";
import WeekDivider from "@/components/WeekDivider";
import JustAddedView from "@/components/JustAddedView";
import { groupEventsByMonth, groupEventsByCreationTime, isRecentlyAdded, getAddedTimeCategory } from "@/lib/utils";
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
    if (filters.status === "scheduled" && !event.isScheduled) {
      return false;
    } else if (filters.status === "top-voted") {
      // Only show unscheduled events with at least 1 vote
      if (event.isScheduled || !event.upvotes || event.upvotes < 1) {
        return false;
      }
    } else if (filters.status === "member-picks") {
      // Only show events not added by Mandi and with a requester field (for the 🛎️ emoji)
      if (event.requester === "Mandi" || !event.requester || event.requester.trim() === "") {
        return false;
      }
    } else if (filters.status === "cheap-thrills") {
      // Only show events at cheap thrills venues
      if (!cheapThrillsVenues.some(venue => event.venue.toLowerCase() === venue.toLowerCase())) {
        return false;
      }
    }
    // Note: we removed the just-added filter here, as we'll now show all events but sorted differently
    
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
    // Filter out events with 0 votes
    const eventsWithVotes = sortedEvents.filter(event => (event.upvotes || 0) > 0);
    
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
      <div className="mb-6">
        {filterSubtitle && <p className="text-white text-sm mb-4 opacity-80">{filterSubtitle}</p>}
        <ul className="list-none pl-0 space-y-2 mb-3">
          {eventsWithVotes.map(event => (
            <EventItem key={event.id} event={event} />
          ))}
        </ul>
      </div>
    );
  } else if (filters.status === "member-picks") {
    // For member picks, we now use the WeekDivider component to group by week
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
      <WeekDivider 
        events={sortedEvents} 
        subtitle={filterSubtitle} 
      />
    );
  } else if (filters.status === "just-added") {
    // Special case for 'Just Added' - we now use the JustAddedView component
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
      <JustAddedView 
        events={filteredEvents} 
        subtitle={filterSubtitle} 
      />
    );
  } else if (filters.status === "cheap-thrills") {
    // For cheap thrills events, we now use the WeekDivider component to group by week
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
      <WeekDivider 
        events={sortedEvents} 
        subtitle={filterSubtitle} 
      />
    );
  } else if (filters.status === "scheduled") {
    // For scheduled events, we now use the WeekDivider component to group by week
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
      <WeekDivider 
        events={sortedEvents} 
        subtitle={filterSubtitle} 
      />
    );
  } else {
    // Standard view with events grouped by month
    displayContent = (
      <>
        {/* Display events grouped by month without additional heading */}
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
  const hasEvents = filters.status === "top-voted" || filters.status === "just-added" || filters.status === "member-picks" || filters.status === "scheduled" || filters.status === "cheap-thrills"
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
        {/* Recent Events Banner - Only show in default view and if there are recent events */}
        {!isLoading && !error && hasEvents && filters.status === "all" && (() => {
          // Count events added in the last week (today + this_week)
          const recentEvents = events.filter(event => {
            const category = getAddedTimeCategory(event.createdAt);
            return category === 'today' || category === 'this_week';
          });
          return recentEvents.length > 0;
        })() && (
          <div className="mb-6 text-left">
            <p className="font-light text-black mb-4 lowercase" style={{ fontSize: '24px' }}>
              {(() => {
                // Count events added in the last week (today + this_week)
                const recentEvents = events.filter(event => {
                  const category = getAddedTimeCategory(event.createdAt);
                  return category === 'today' || category === 'this_week';
                });
                return (
                  <>
                    {recentEvents.length} shows added in the last week. {' '}
                    <button 
                      onClick={() => setFilters({ ...filters, status: "just-added" })}
                      className="text-white hover:text-[#41F2EE] underline font-light focus:outline-none"
                    >
                      Review + vote
                    </button>
                  </>
                );
              })()}
            </p>
          </div>
        )}

        {/* Filter Pills - Show on default view or when any filter is active */}
        {!isLoading && !error && hasEvents && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilters({ ...filters, status: "all" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "all" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Show All
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "top-voted", sortBy: "votes" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "top-voted" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Top Voted
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "just-added" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "just-added" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Updates
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "scheduled" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "scheduled" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Scheduled
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "member-picks" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "member-picks" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Member Adds
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "cheap-thrills" })}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  filters.status === "cheap-thrills" 
                    ? "bg-white text-black border-white" 
                    : "bg-[#FE6B41] text-black border-black hover:border-white"
                }`}
              >
                Cheap Thrills
              </button>
            </div>
          </div>
        )}
        
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