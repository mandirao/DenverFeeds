import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getNextMonths, denverBoulderVenues } from "@/components/EventFilters";
import { cheapThrillsVenues } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, List, ChevronLeft, ChevronRight, MoreVertical, ArrowUpDown, ChevronDown, Check } from "lucide-react";
import MonthGroup from "@/components/MonthGroup";
import EmptyState from "@/components/EmptyState";
import EventItem from "@/components/EventItem";
import WeekDivider from "@/components/WeekDivider";
import JustAddedView from "@/components/JustAddedView";
import { groupEventsByMonth, groupEventsByCreationTime, isRecentlyAdded, getAddedTimeCategory } from "@/lib/utils";
import { venueOptions, VenueOption, Event, genres as schemaGenres } from "@shared/schema";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const MUSIC_ORANGE = "#FE6B41";

function ConcertCalendarMonthView({
  events,
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onDayOverflowClick,
}: {
  events: Event[];
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick: (ev: Event) => void;
  onDayOverflowClick: (date: string, evs: Event[]) => void;
}) {
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const eventsByDate = events.reduce<Record<string, Event[]>>((acc, ev) => {
    const key = ev.date.toString().slice(0, 10); // extract YYYY-MM-DD without UTC conversion
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="h-8 w-8 flex items-center justify-center border border-black rounded-full hover:bg-black/10 transition-colors">
          <ChevronLeft className="w-4 h-4 text-black" />
        </button>
        <h2 className="font-black uppercase text-black text-lg tracking-wide">{monthLabel}</h2>
        <button onClick={onNextMonth} className="h-8 w-8 flex items-center justify-center border border-black rounded-full hover:bg-black/10 transition-colors">
          <ChevronRight className="w-4 h-4 text-black" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-t border-l border-black">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="border-b border-r border-black px-1 py-1 text-[10px] font-black uppercase text-black/60 text-center bg-black/5">
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return (
            <div key={`empty-${idx}`} className="border-b border-r border-black bg-black/5 min-h-[80px]" />
          );
          const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsByDate[key] || [];
          const isToday = key === todayKey;
          const MAX_VISIBLE = 3;
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;
          return (
            <div key={key} className={`border-b border-r border-black min-h-[80px] p-1 flex flex-col ${isToday ? "bg-white/60" : "bg-white/20 hover:bg-white/30"} transition-colors`}>
              <div className={`text-xs font-bold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? "bg-black text-white" : "text-black/70"}`}>
                {day}
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                {visible.map((ev, i) => (
                  <button
                    key={`${ev.id}-${i}`}
                    onClick={() => onEventClick(ev)}
                    className="text-left text-[10px] leading-tight px-1 py-0.5 rounded font-semibold text-black truncate transition-colors hover:opacity-80"
                    style={{ backgroundColor: "#FEABDA" }}
                    title={ev.artist}
                  >
                    {ev.emoji} {ev.artist}
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayOverflowClick(key, dayEvents)}
                    className="text-[10px] text-black/60 font-bold hover:text-black transition-colors text-left px-1"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();

  // Calendar view state
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calViewYear, setCalViewYear] = useState(now.getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(now.getMonth());
  const prevCalMonth = () => {
    if (calViewMonth === 0) { setCalViewYear(y => y - 1); setCalViewMonth(11); }
    else setCalViewMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    if (calViewMonth === 11) { setCalViewYear(y => y + 1); setCalViewMonth(0); }
    else setCalViewMonth(m => m + 1);
  };

  // Calendar event detail / day sheet
  const [calEventDetail, setCalEventDetail] = useState<Event | null>(null);
  const [calDaySheet, setCalDaySheet] = useState<{ date: string; events: Event[] } | null>(null);
  const [calEventDetailFrom, setCalEventDetailFrom] = useState<{ date: string; events: Event[] } | null>(null);
  const [calDetailMenuOpen, setCalDetailMenuOpen] = useState(false);
  const [calDetailDeleteConfirm, setCalDetailDeleteConfirm] = useState(false);

  const calDetailScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!calEventDetail) return;
      const endpoint = calEventDetail.isScheduled ? `/api/events/${calEventDetail.id}/unschedule` : `/api/events/${calEventDetail.id}/schedule`;
      await apiRequest("POST", endpoint, undefined);
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ["/api/events"] });
      if (calEventDetail) {
        setCalEventDetail({ ...calEventDetail, isScheduled: !calEventDetail.isScheduled });
        toast({ title: calEventDetail.isScheduled ? "Removed from scheduled" : "Marked as scheduled" });
      }
    },
  });

  const calDetailDeleteMutation = useMutation({
    mutationFn: async () => {
      if (!calEventDetail) return;
      await apiRequest("DELETE", `/api/events/${calEventDetail.id}`, undefined);
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ["/api/events"] });
      setCalDetailDeleteConfirm(false);
      setCalEventDetail(null);
      setCalEventDetailFrom(null);
      toast({ title: "Event deleted" });
    },
  });

  // Initialize filters from URL parameters using window.location.search
  // (wouter's useLocation only returns the pathname, not query params)
  const getFiltersFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    const sortParam = params.get('sortBy') || 'date';
    return {
      month: params.get('month') || "all",
      genre: params.get('genre') || "all",
      status: params.get('status') || "all",
      location: params.get('location') || "all",
      venue: params.get('venue') || "all",
      dayOfWeek: params.get('dayOfWeek') || "all",
      sortBy: sortParam,
    };
  };

  const [filters, setFiltersState] = useState(getFiltersFromURL);
  
  // Update URL when filters change
  const setFilters = (newFilters: typeof filters) => {
    const finalFilters = { ...newFilters };
    setFiltersState(finalFilters);
    
    const params = new URLSearchParams();
    Object.entries(finalFilters).forEach(([key, value]) => {
      if (value !== "all" && value !== "date") {
        params.set(key, value as string);
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
  
  // Sort events based on sortBy option
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (filters.sortBy === "votes") {
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
    if (filters.location !== "all") count++;
    if (filters.venue !== "all") count++;
    if (filters.dayOfWeek !== "all") count++;
    if (filters.status !== "all") count++;
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
  
  if (filters.sortBy === "votes") {
    // Top Voted: flat list sorted by votes, only events with >0 votes and not yet scheduled
    const eventsWithVotes = sortedEvents.filter(event => (event.upvotes || 0) > 0 && !event.isScheduled);
    displayContent = (
      <div className="mb-6">
        <ul className="list-none pl-0 space-y-2 mb-3">
          {eventsWithVotes.map(event => (
            <EventItem key={event.id} event={event} />
          ))}
        </ul>
      </div>
    );
  } else if (filters.sortBy === "just-added") {
    // Recently Added: group by when they were added (today / this week / this month / earlier)
    displayContent = (
      <JustAddedView 
        events={filteredEvents} 
        subtitle="" 
      />
    );
  } else {
    // Upcoming (date) sort: month/week grouping for all content filters
    displayContent = (
      <>
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
  const hasEvents = filters.sortBy === "votes"
    ? sortedEvents.filter(e => (e.upvotes || 0) > 0 && !e.isScheduled).length > 0
    : filters.sortBy === "just-added"
    ? filteredEvents.length > 0
    : Object.entries(groupedByMonthAndWeek).length > 0;



  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className={`container mx-auto px-4 py-8 transition-all duration-200 ${viewMode === "calendar" ? "max-w-5xl" : ""}`}>
        {/* Recent Events Banner - Only show in default view and if there are recent events */}
        {!isLoading && !error && events.length > 0 && filters.status === "all" && filters.sortBy !== "just-added" && (() => {
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
                      onClick={() => setFilters({ ...filters, sortBy: "just-added" })}
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
                {/* View toggle */}
                <div className="flex items-center gap-1 border border-black rounded-full overflow-hidden flex-shrink-0 mr-1">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "list" ? "bg-black text-white" : "text-black hover:bg-black/10"}`}
                    title="List view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "calendar" ? "bg-black text-white" : "text-black hover:bg-black/10"}`}
                    title="Calendar view"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Status Filters — hidden in calendar mode */}
                {viewMode !== "calendar" && (<>
                {/* Sort dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-black bg-white text-black font-medium text-sm hover:bg-black hover:text-white transition-colors whitespace-nowrap flex-shrink-0 focus:outline-none">
                      <ArrowUpDown className="w-3 h-3" />
                      {filters.sortBy === "just-added" ? "Recently Added" : filters.sortBy === "votes" ? "Top Voted" : "Upcoming"}
                      <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-44 p-0">
                    {([
                      { label: "Upcoming", onClick: () => setFilters({ ...filters, sortBy: "date" }), active: filters.sortBy === "date" },
                      { label: "Recently Added", onClick: () => setFilters({ ...filters, sortBy: "just-added" }), active: filters.sortBy === "just-added" },
                      { label: "Top Voted", onClick: () => setFilters({ ...filters, sortBy: "votes" }), active: filters.sortBy === "votes" },
                    ] as const).map(opt => (
                      <DropdownMenuItem key={opt.label} onClick={opt.onClick} className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-none focus:bg-gray-100 hover:bg-gray-100 cursor-pointer">
                        <span className="w-3.5 flex-shrink-0">{opt.active ? <Check className="w-3 h-3" /> : null}</span>
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                </>)}

                {/* Separator between sort and filter pills */}
                <div className="h-6 w-px bg-black opacity-40 mx-1 flex-shrink-0" />
                <button
                  onClick={() => setFilters({ ...filters, status: filters.status === "cheap-thrills" ? "all" : "cheap-thrills" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "cheap-thrills" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Cheap Thrills
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: filters.status === "scheduled" ? "all" : "scheduled" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "scheduled" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => setFilters({ ...filters, status: filters.status === "member-picks" ? "all" : "member-picks" })}
                  className={`px-3 py-1 rounded-full font-medium transition-colors border border-black text-sm whitespace-nowrap ${
                    filters.status === "member-picks" 
                      ? "bg-white text-black" 
                      : "bg-[#FE6B41] text-black hover:border-white"
                  }`}
                >
                  Member Adds
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
          ) : viewMode === "calendar" ? (
            <ConcertCalendarMonthView
              events={filteredEvents}
              viewYear={calViewYear}
              viewMonth={calViewMonth}
              onPrevMonth={prevCalMonth}
              onNextMonth={nextCalMonth}
              onEventClick={setCalEventDetail}
              onDayOverflowClick={(date, evs) => setCalDaySheet({ date, events: evs })}
            />
          ) : !hasEvents ? (
            <EmptyState />
          ) : (
            // Render events using the appropriate display method
            displayContent
          )}
        </div>
      </main>
      <Footer />

      {/* Calendar event detail dialog */}
      <Dialog open={calEventDetail !== null} onOpenChange={open => { if (!open) { setCalEventDetail(null); setCalEventDetailFrom(null); } }}>
        <DialogContent className="max-w-lg rounded-none border-2 border-black p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{calEventDetail?.artist ?? "Event Details"}</DialogTitle>
          {calEventDetail && (() => {
            const ev = calEventDetail;
            const evDate = new Date(ev.date.toString().slice(0, 10) + "T12:00:00");
            const dateStr = evDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue + " Denver CO")}`;
            const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(ev.artist)}`;
            const calendarUrl = (() => {
              const d = evDate;
              const pad = (n: number) => String(n).padStart(2, "0");
              const dateParam = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
              const next = new Date(d); next.setDate(next.getDate() + 1);
              const nextParam = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
              return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.artist + " @ " + ev.venue)}&dates=${dateParam}/${nextParam}&details=${encodeURIComponent(ev.summary || "")}`;
            })();
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(ev.artist + " " + ev.venue + " concert")}`;
            return (
              <>
                <div className="px-6 pt-5 pb-4" style={{ backgroundColor: MUSIC_ORANGE }}>
                  {calEventDetailFrom && (
                    <button
                      onClick={() => {
                        const from = calEventDetailFrom;
                        setCalEventDetail(null);
                        setCalEventDetailFrom(null);
                        setCalDaySheet(from);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-black/60 hover:text-black mb-3 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {new Date(calEventDetailFrom.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-3xl flex-shrink-0">{ev.emoji}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={searchUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xl font-black uppercase text-black leading-tight hover:underline cursor-pointer">
                              {ev.artist}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p>Search on Google</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {ev.isScheduled && (
                        <span className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5">SCHEDULED</span>
                      )}
                      <DropdownMenu open={calDetailMenuOpen} onOpenChange={setCalDetailMenuOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black">
                            <MoreVertical className="h-3.5 w-3.5 text-black" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                          <DropdownMenuItem onClick={() => { setCalDetailMenuOpen(false); calDetailScheduleMutation.mutate(); }}
                            disabled={calDetailScheduleMutation.isPending}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none">
                            {ev.isScheduled ? "Remove from Scheduled" : "Mark as Scheduled"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                            onClick={() => { setCalDetailMenuOpen(false); setTimeout(() => setCalDetailDeleteConfirm(true), 100); }}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-black/30 text-black/70">{ev.genre}</span>
                    {ev.requester && ev.requester !== "Mandi" && (
                      <span className="text-[11px] text-black/60">🛎️ {ev.requester}</span>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4 space-y-4 bg-white">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-black font-semibold">
                      <span>📅</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">
                              {dateStr}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p>Add to Google Calendar</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-black/80">
                      <span>📍</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">
                              {ev.venue}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p>Find on Google Maps</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {ev.soundsLike && (
                      <div className="flex items-center gap-2 text-sm text-black/70">
                        <span>🎵</span>
                        <span>Sounds like: {ev.soundsLike}</span>
                      </div>
                    )}
                    {ev.upvotes && ev.upvotes > 0 ? (
                      <div className="flex items-center gap-2 text-sm text-black/60">
                        <span>🔥</span>
                        <span>{ev.upvotes} vote{ev.upvotes !== 1 ? "s" : ""}</span>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-sm text-black/90 leading-relaxed">{ev.summary}</p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={spotifyUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-black text-white font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-[#1DB954] transition-colors">
                      Spotify ↗
                    </a>
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 border-2 border-black text-black font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-black hover:text-white transition-colors">
                      Search ↗
                    </a>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={calDetailDeleteConfirm} onOpenChange={setCalDetailDeleteConfirm}>
        <AlertDialogContent className="rounded-none border-2 border-black">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{calEventDetail?.artist}" will be permanently removed from the feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 hover:bg-red-700"
              onClick={() => calDetailDeleteMutation.mutate()}
              disabled={calDetailDeleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Day sheet dialog */}
      <Dialog open={calDaySheet !== null} onOpenChange={open => { if (!open) setCalDaySheet(null); }}>
        <DialogContent className="max-w-sm rounded-none border-2 border-black p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">
            {calDaySheet ? `Shows on ${new Date(calDaySheet.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` : "Shows"}
          </DialogTitle>
          {calDaySheet && (() => {
            const d = new Date(calDaySheet.date + "T12:00:00");
            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
            return (
              <>
                <div className="px-5 pt-5 pb-3" style={{ backgroundColor: MUSIC_ORANGE }}>
                  <h2 className="text-base font-black uppercase text-black">{label}</h2>
                  <p className="text-xs text-black/60 mt-0.5">{calDaySheet.events.length} show{calDaySheet.events.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="divide-y divide-black/10 bg-white max-h-[60vh] overflow-y-auto">
                  {calDaySheet.events.map((ev, i) => (
                    <button
                      key={`${ev.id}-${i}`}
                      onClick={() => { setCalEventDetailFrom(calDaySheet); setCalDaySheet(null); setCalEventDetail(ev); }}
                      className="w-full text-left px-5 py-3 hover:bg-orange-50 transition-colors flex items-center gap-3"
                    >
                      <span className="text-xl flex-shrink-0">{ev.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-black truncate">{ev.artist}</div>
                        <div className="text-xs text-black/60 truncate">{ev.venue}</div>
                        <div className="text-xs text-black/50">{ev.genre}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-black/30 flex-shrink-0 ml-auto" />
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}