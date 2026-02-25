import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
import EventItem from "@/components/EventItem";
import WeekDivider from "@/components/WeekDivider";
import JustAddedView from "@/components/JustAddedView";
import { groupEventsByMonth, groupEventsByCreationTime, isRecentlyAdded, getAddedTimeCategory } from "@/lib/utils";
import { venueOptions, VenueOption, Event, genres as schemaGenres } from "@shared/schema";

export default function Home() {
  
  // Initialize filters from URL parameters using window.location.search
  // (wouter's useLocation only returns the pathname, not query params)
  const getFiltersFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') || "all";
    return {
      month: params.get('month') || "all",
      genre: params.get('genre') || "all", 
      status: status,
      location: params.get('location') || "all",
      venue: params.get('venue') || "all",
      dayOfWeek: params.get('dayOfWeek') || "all",
      sortBy: status === "top-voted" ? "votes" : "date"
    };
  };

  const [filters, setFiltersState] = useState(getFiltersFromURL);
  
  // Update URL when filters change
  const setFilters = (newFilters: typeof filters) => {
    const finalFilters = {
      ...newFilters,
      sortBy: newFilters.status === "top-voted" ? "votes" : "date"
    };
    
    setFiltersState(finalFilters);
    
    const params = new URLSearchParams();
    Object.entries(finalFilters).forEach(([key, value]) => {
      if (key !== "sortBy" && value !== "all" && value !== "date") {
        params.set(key, value);
      }
    });
    
    const newURL = params.toString() ? `/?${params.toString()}` : '/';
    window.history.replaceState(null, '', newURL);
  };
  
  // Sync filters when URL changes (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      setFiltersState(getFiltersFromURL());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  // Get defined venue options from schema plus "Other" for manually entered venues
  const definedVenueValues = venueOptions.map(option => option.value);
  
  // Separate venues by group
  const denverVenues = venueOptions
    .filter(venue => venue.group === "denver" && venue.value !== "other" && venue.value !== "TBD")
    .map(venue => venue.value)
    .sort();
    
  const frontRangeVenues = venueOptions
    .filter(venue => venue.group === "front_range")
    .map(venue => venue.value)
    .sort();
    
  const mountainsVenues = venueOptions
    .filter(venue => venue.group === "mountains")
    .map(venue => venue.value)
    .sort();
  
  // Check if there are any events with venues not in our defined list
  const hasOtherVenues = events.some(event => !definedVenueValues.includes(event.venue));

  // Filter events based on selected filters
  const filteredEvents = events.filter(event => {
    // Month filter (now applied for all views including top-voted)
    if (filters.month !== "all") {
      // Parse date as local date to avoid timezone issues
      const dateStr = event.date.toString().split('T')[0]; // Get just the YYYY-MM-DD part
      const [year, month, day] = dateStr.split('-').map(Number);
      const eventDate = new Date(year, month - 1, day); // Create local date
      const eventMonth = format(eventDate, "MMMM yyyy");
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
      // Show events at cheap thrills venues OR any event with "Free" in artist/description
      const isAtCheapVenue = cheapThrillsVenues.some(venue => event.venue.toLowerCase() === venue.toLowerCase());
      const hasFreeInText = event.artist.toLowerCase().includes("free") || 
                           (event.summary && event.summary.toLowerCase().includes("free"));
      
      if (!isAtCheapVenue && !hasFreeInText) {
        return false;
      }
    }
    // Note: we removed the just-added filter here, as we'll now show all events but sorted differently
    
    // Location filter (All Regions, Denver, Front Range, or Mountains)
    // Get all known venue names to check if venue is custom/unknown
    const allKnownVenues = venueOptions.map(v => v.value);
    const denverVenuesList = venueOptions.filter(v => v.group === "denver").map(v => v.value);
    const frontRangeVenuesList = venueOptions.filter(v => v.group === "front_range").map(v => v.value);
    const mountainsVenuesList = venueOptions.filter(v => v.group === "mountains").map(v => v.value);
    
    // Custom venues (not in our defined list) are treated as Denver by default
    const isCustomVenue = !allKnownVenues.includes(event.venue);
      
    if (filters.location === "denver") {
      // Show Denver venues AND custom venues (festivals, one-off locations)
      if (!denverVenuesList.includes(event.venue) && !isCustomVenue) {
        return false;
      }
    } else if (filters.location === "front_range") {
      // Show only Front Range venues
      if (!frontRangeVenuesList.includes(event.venue)) {
        return false;
      }
    } else if (filters.location === "mountains") {
      // Show only Mountains venues
      if (!mountainsVenuesList.includes(event.venue)) {
        return false;
      }
    }
    // Note: when filters.location === "all", show all venues (no filtering)
    
    // Venue filter
    if (filters.venue !== "all") {
      if (filters.venue === "other") {
        // Show only events with venues not in our defined list
        if (definedVenueValues.includes(event.venue)) {
          return false;
        }
      } else if (event.venue !== filters.venue) {
        return false;
      }
    }
    
    // Day of week filter
    if (filters.dayOfWeek !== "all") {
      // Parse date as local date to avoid timezone issues
      const dateStr = event.date.toString().split('T')[0]; // Get just the YYYY-MM-DD part
      const [year, month, day] = dateStr.split('-').map(Number);
      const eventDate = new Date(year, month - 1, day); // Create local date
      const eventDayOfWeek = eventDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      if (eventDayOfWeek.toString() !== filters.dayOfWeek) {
        return false;
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
    if (filters.location !== "all") count++; // "All Regions" is the cleared state
    if (filters.venue !== "all") count++;
    if (filters.dayOfWeek !== "all") count++;
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
      location: "all",
      venue: "all",
      dayOfWeek: "all",
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



  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {/* Recent Events Banner - Only show in default view and if there are recent events */}
        {!isLoading && !error && events.length > 0 && filters.status === "all" && (() => {
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

        {/* Filter Pills - Horizontal scrolling to prevent line wrapping */}
        {!isLoading && !error && events.length > 0 && (
          <div className="mb-6">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-2 items-center" style={{ minWidth: "max-content" }}>
                {/* Status Filters */}
                <button
                  onClick={() => setFilters({ ...filters, status: "all" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Show All
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: "just-added" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "just-added" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  New
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: "top-voted", sortBy: "votes" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "top-voted" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Top Voted
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: "scheduled" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "scheduled" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: "member-picks" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "member-picks" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Member Adds
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: "cheap-thrills" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "cheap-thrills" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Cheap Thrills
                </button>
                
                {/* Vertical separator */}
                <div className="h-6 w-px bg-black opacity-40 mx-2 flex-shrink-0"></div>
                
                {/* Location/Region Filter Dropdown */}
                <Select value={filters.location} onValueChange={(value) => setFilters({ ...filters, location: value })}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filters.location !== "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`} style={{ width: "145px" }}>
                    <SelectValue placeholder="Region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="denver">Denver</SelectItem>
                    <SelectItem value="front_range">Front Range</SelectItem>
                    <SelectItem value="mountains">Mountains</SelectItem>
                  </SelectContent>
                </Select>

                {/* Month Filter Dropdown */}
                <Select value={filters.month} onValueChange={(value) => setFilters({ ...filters, month: value })}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filters.month !== "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`} style={{ width: "120px" }}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month.key} value={month.key}>{month.display}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Genre Filter Dropdown */}
                <Select value={filters.genre} onValueChange={(value) => setFilters({ ...filters, genre: value })}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filters.genre !== "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`} style={{ width: "115px" }}>
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    {genres.map((genre) => (
                      <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Venue Filter Dropdown */}
                <Select value={filters.venue} onValueChange={(value) => setFilters({ ...filters, venue: value })}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filters.venue !== "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`} style={{ width: "115px" }}>
                    <SelectValue placeholder="Venue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Venues</SelectItem>
                    
                    {/* Denver venues */}
                    {denverVenues.map((venue) => (
                      <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                    ))}
                    
                    {/* Show "Other" option if there are custom venues */}
                    {hasOtherVenues && (
                      <SelectItem value="other">Other</SelectItem>
                    )}
                    
                    {/* Separator and Front Range venues */}
                    {frontRangeVenues.length > 0 && (
                      <>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-gray-300" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-gray-500">Front Range</span>
                          </div>
                        </div>
                        {frontRangeVenues.map((venue) => (
                          <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                        ))}
                      </>
                    )}
                    
                    {/* Separator and Mountains venues */}
                    {mountainsVenues.length > 0 && (
                      <>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-gray-300" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-gray-500">Mountains</span>
                          </div>
                        </div>
                        {mountainsVenues.map((venue) => (
                          <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                {/* Day of Week Filter Dropdown */}
                <Select value={filters.dayOfWeek} onValueChange={(value) => setFilters({ ...filters, dayOfWeek: value })}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filters.dayOfWeek !== "all" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`} style={{ width: "115px" }}>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Days</SelectItem>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Clear filters link - only show when filters are active */}
            {hasActiveFilters && (
              <div className="mt-2">
                <button 
                  onClick={resetFilters}
                  className="text-black text-sm hover:text-white transition-colors focus:outline-none underline"
                >
                  ✕ clear filters
                </button>
              </div>
            )}
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