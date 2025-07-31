import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, denverBoulderVenues } from "@/components/EventFilters";
import { cheapThrillsVenues } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  
  // Count active filters (excluding defaults)
  const countActiveFilters = () => {
    let count = 0;
    if (filters.month !== "all") count++;
    if (filters.genre !== "all") count++;
    if (!filters.denverAreaOnly) count++; // Road trips is non-default
    return count;
  };
  
  const activeFilterCount = countActiveFilters();
  const hasActiveFilters = activeFilterCount > 0;
  
  // Reset filters to defaults
  const resetFilters = () => {
    setFilters({
      month: "all",
      genre: "all", 
      status: "all",
      denverAreaOnly: true,
      sortBy: "date"
    });
  };
  
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
    // For member picks, group by month with month headers
    const groupedEvents = groupEventsByMonth(sortedEvents);
    displayContent = (
      <>
        {Object.entries(groupedEvents).map(([month, monthEvents]) => (
          <MonthGroup 
            key={month} 
            monthName={month} 
            events={monthEvents} 
          />
        ))}
      </>
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
    // For cheap thrills events, group by month with month headers
    const groupedEvents = groupEventsByMonth(sortedEvents);
    displayContent = (
      <>
        {Object.entries(groupedEvents).map(([month, monthEvents]) => (
          <MonthGroup 
            key={month} 
            monthName={month} 
            events={monthEvents} 
          />
        ))}
      </>
    );
  } else if (filters.status === "scheduled") {
    // For scheduled events, group by month with month headers
    const groupedEvents = groupEventsByMonth(sortedEvents);
    displayContent = (
      <>
        {Object.entries(groupedEvents).map(([month, monthEvents]) => (
          <MonthGroup 
            key={month} 
            monthName={month} 
            events={monthEvents} 
          />
        ))}
      </>
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
  const hasEvents = filters.status === "top-voted" || filters.status === "just-added"
    ? sortedEvents.length > 0 
    : filters.status === "member-picks" || filters.status === "scheduled" || filters.status === "cheap-thrills"
    ? Object.entries(groupEventsByMonth(sortedEvents)).length > 0
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
      <Navbar />
      
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
            <div className="overflow-x-auto">
              <div className="flex gap-2 min-w-max pb-2">
              <button
                onClick={() => setFilters({ ...filters, status: "all" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "all" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                Show All
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "just-added" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "just-added" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                New
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "top-voted", sortBy: "votes" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "top-voted" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                Top Voted
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "scheduled" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "scheduled" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                Scheduled
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "member-picks" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "member-picks" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                Member Adds
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: "cheap-thrills" })}
                className={`px-2 py-1 rounded-full font-medium transition-colors border border-black text-sm ${
                  filters.status === "cheap-thrills" 
                    ? "bg-white text-black" 
                    : "bg-[#FE6B41] text-black hover:border-white"
                }`}
              >
                Cheap Thrills
              </button>
              
              {/* Dynamic filter count and clear button */}
              <div className="ml-0.5 flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className={`px-2 py-1 rounded-full font-medium transition-colors text-sm focus:outline-none ${
                            hasActiveFilters 
                              ? "bg-white text-black border border-black" 
                              : "bg-[#FE6B41] text-black hover:text-white"
                          }`}>
                            {hasActiveFilters ? `${activeFilterCount} More` : "+ More"}
                          </button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-2 border-black max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-black font-anton font-black uppercase">More Filters</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-4 pt-4">
                      <div>
                        <label className="block text-sm font-medium text-black mb-2">Month</label>
                        <select 
                          id="month-filter" 
                          value={filters.month}
                          onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                          className="w-full p-2 text-sm border border-black bg-white text-black rounded focus:outline-none focus:border-[#41F2EE]"
                        >
                          <option value="all">All Months</option>
                          {months.map((m) => (
                            <option key={m.key} value={m.key}>{m.display}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-black mb-2">Genre</label>
                        <select 
                          id="genre-filter" 
                          value={filters.genre}
                          onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
                          className="w-full p-2 text-sm border border-black bg-white text-black rounded focus:outline-none focus:border-[#41F2EE]"
                        >
                          <option value="all">All Genres</option>
                          {genres.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-black mb-2">Location</label>
                        <div className="flex gap-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="location"
                              checked={filters.denverAreaOnly}
                              onChange={() => setFilters({ ...filters, denverAreaOnly: true })}
                              className="w-4 h-4 text-[#41F2EE] bg-white border-2 border-black focus:ring-[#41F2EE] focus:ring-2"
                            />
                            <span className="text-sm font-medium">Denver/Boulder</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="location"
                              checked={!filters.denverAreaOnly}
                              onChange={() => setFilters({ ...filters, denverAreaOnly: false })}
                              className="w-4 h-4 text-[#41F2EE] bg-white border-2 border-black focus:ring-[#41F2EE] focus:ring-2"
                            />
                            <span className="text-sm font-medium">Roadtrips</span>
                          </label>
                        </div>
                      </div>
                    </div>
                        </DialogContent>
                      </Dialog>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add more filters</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {/* Clear filters button - only show when filters are active */}
                {hasActiveFilters && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button 
                          onClick={resetFilters}
                          className="px-2 py-1 rounded-full font-medium transition-colors text-sm bg-white text-black border border-black hover:bg-red-50 focus:outline-none"
                        >
                          ✕
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clear all filters</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              </div>
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