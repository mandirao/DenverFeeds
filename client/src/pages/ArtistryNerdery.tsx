import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { siteUrls } from "@/lib/siteConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { artCategories, type ArtEvent, type InsertArtEvent } from "@shared/schema";
import { Telescope, Plus, Sparkles, List, MoreVertical, Users, ImageIcon, FileText, ChevronDown, Calendar, CalendarDays, ChevronLeft, ChevronRight, ArrowUpDown, Check } from "lucide-react";
import { getWeekRange, getWeekOfMonth } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarSubscribeModal } from "@/components/CalendarSubscribeModal";
import {
  ensureHttps, riskPips, daysLive, formatDateRange, getMonthLabel, formatTime,
  createSearchUrl, createCalendarUrl, classifyRecurrence, addCalDays, addCalMonths,
  expandRecurringEvents, RISK_LABELS,
} from "@/lib/eventUtils";
import { ListingEventRow } from "@/components/listings/ListingEventRow";
import { ListingCalendarMonthView } from "@/components/listings/ListingCalendarMonthView";
import { EditListingEventModal } from "@/components/listings/EditListingEventModal";
import { AddListingEventModal } from "@/components/listings/AddListingEventModal";
import type { ListingRowConfig, ListingCalendarConfig, ListingFormConfig } from "@/lib/listingFeedConfig";

// ── Colors ────────────────────────────────────────────────────────────────────
const AN_ORANGE   = "#000000";
const AN_LAVENDER = "#FE6B41";
const AN_BG       = "#FEABDA";
const AN_TEAL     = "#41F2EE";

// ── Event Row ─────────────────────────────────────────────────────────────────

// Config for the shared <ListingEventRow>. Arts doesn't show a standalone
// recurring badge before the summary (no renderRecurringNote) — instead its
// "live badge" slot shows the recurring label in place of Food's "live Xd/w"
// text. Also note the risk-level-4 color (#ffff00) differs from Food's
// (#FFB700) — preserved as-is rather than unified, since that's cosmetic
// drift nobody's asked to fix yet.
const artRowConfig: ListingRowConfig<ArtEvent> = {
  apiPath: "/api/art-events",
  queryKey: "/api/art-events",
  dialogBg: AN_BG,
  deleteTitle: "Delete this event?",
  soldOutRestoreLabel: "Back on the list",
  ticketLabel: "Tickets",
  ticketTextColorClass: "text-[#FE6B41]",
  getCategory: (event) => event.category,
  renderLiveBadge: (event) => {
    const risk = riskPips(event.selloutRisk);
    if (!event.isRecurring && !risk) return null;
    return (
      <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#ffff00" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
        {event.isRecurring && <span>↻ {event.recurrenceLabel || "Recurring"}</span>}
        {risk && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{event.isRecurring ? " " : "· "}{risk}</span>}
      </span>
    );
  },
  renderInstanceNote: (note) => (
    <span className="block text-sm italic mt-0.5" style={{ opacity: 0.75 }}>
      ↳ {note}
    </span>
  ),
  EditModal: EditArtEventModal,
};

const artCalendarConfig: ListingCalendarConfig<ArtEvent> = {
  cellBg: AN_BG,
  guardRecurringMultiDaySpillover: true,
};

// ── Edit Art Event Modal ───────────────────────────────────────────────────────

// Config for the shared Add/Edit form. Arts is the one feed with the
// specific-dates batch-add feature (features.specificDatesBatchAdd: true) —
// recurring itself is shared with Food, not Arts-only.
const artFormConfig: ListingFormConfig<InsertArtEvent> = {
  idPrefix: "an",
  apiPath: "/api/art-events",
  queryKey: "/api/art-events",
  dialogBg: AN_BG,

  categoryFieldKey: "category",
  categoryLabel: "Category",
  categoryOptions: artCategories,

  venueLabel: "Venue",
  namePlaceholder: "Saturn at Opposition",
  venuePlaceholder: "Denver Art Museum",
  neighborhoodPlaceholder: "RiNo, LoHi…",
  emojiPlaceholder: "🎨",
  pricePlaceholder: "$20/person",
  recurrenceLabelPlaceholder: "Monthly, Weekly, Every 1st Friday…",
  instanceNotePlaceholder: "Theme, featured guest, topic for this date only…",
  descriptionPlaceholderAdd: "Smart, specific snapshot — what it is, who's behind it, why it's worth noting.",
  descriptionPlaceholderEdit: "Smart, specific snapshot of the event.",
  sourceUrlPlaceholder: "https://instagram.com/p/… or ticketing link",

  addModalTitle: "Add an Event",
  editModalTitle: "Edit Event",
  addSubmitLabel: "Add Event",
  createToastTitle: "Event added!",
  discardDescriptionEdit: "You have unsaved changes.",

  screenshotIntro: "Upload a screenshot from Instagram, Eventbrite, a museum site, or anywhere — AI will read the text directly from the image.",
  blurbIntro: "Paste a caption or description from social media, a newsletter, or a museum listing — AI will extract the event details.",
  blurbPlaceholder: `e.g.\n\nDenver Art Museum\n\nJoin us for an exclusive evening with artist Kaws on April 12th…`,

  parseEndpoint: "/api/ai/parse-art-blurb",
  redoEndpoint: "/api/ai/redo-art-event-content",
  buildRedoPayload: (form, instanceNote) => ({
    name: form.name,
    venue: form.venue,
    category: form.category,
    isRecurring: form.isRecurring,
    recurrenceLabel: form.recurrenceLabel,
    dateStart: form.dateStart,
    currentSummary: form.summary,
    currentInstanceNote: instanceNote,
  }),
  applyRedoResponse: (res, { setForm, setInstanceNote }) => {
    if (res.status === "no-info") {
      if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
      return { title: "Description polished ✓", description: `No new occurrence details found yet — ${res.message}` };
    }
    if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
    if (res.instanceNote) setInstanceNote(res.instanceNote);
    return { title: "Content refreshed ✨", description: "Description updated with latest details." };
  },
  applyParseResponse: (data, { blurb, form, setForm, setInstanceNote, setSpecificDates, setUseSpecificDates }) => {
    const { specificDates: aiDates, instanceNote: aiNote, ...rest } = data;
    if (aiNote) setInstanceNote(aiNote);
    if (Array.isArray(aiDates) && aiDates.length >= 2) {
      setSpecificDates(aiDates);
      setUseSpecificDates(true);
      setForm({ ...rest, dateStart: "", dateEnd: "", rawBlurb: blurb, sourceUrl: form.sourceUrl || "", requester: form.requester || "" });
      return { title: "Parsed!", description: `${aiDates.length} dates detected — review the series below.` };
    }
    setForm({ ...rest, rawBlurb: blurb, sourceUrl: form.sourceUrl || "", requester: form.requester || "" });
    return { title: "Parsed!", description: "Review the details below." };
  },

  getMissingField: (form) => {
    if (!form.requester?.trim()) return { field: "requester", label: "Your name" };
    if (!form.name?.trim())      return { field: "name",      label: "Event name" };
    if (!form.venue?.trim())     return { field: "venue",     label: "Venue" };
    if (!form.dateStart?.trim()) return { field: "dateStart", label: "Start date" };
    if (!form.emoji?.trim())     return { field: "emoji",     label: "Emoji" };
    if (!form.category?.trim())  return { field: "category",  label: "Category" };
    return null;
  },
  BLANK: {
    emoji: "", name: "", venue: "", neighborhood: "",
    dateStart: "", dateEnd: "", startTime: "", summary: "",
    category: "", price: "", ticketUrl: "", sourceUrl: "", rawBlurb: "", requester: "",
    announcedAt: "", selloutRisk: undefined, isRecurring: false, recurrenceLabel: "",
  },

  features: {
    specificDatesBatchAdd: true,
  },
};

function EditArtEventModal({ event, onClose }: { event: ArtEvent; onClose: () => void }) {
  return <EditListingEventModal event={event} onClose={onClose} config={artFormConfig} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ArtistryNerdery() {
  const [addOpen, setAddOpen] = useState(false);
  const [stillTimeExpanded, setStillTimeExpanded] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calViewYear, setCalViewYear] = useState(() => new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(() => new Date().getMonth());
  const [calEventDetail, setCalEventDetail] = useState<ArtEvent | null>(null);
  const [calDaySheet, setCalDaySheet] = useState<{ date: string; events: ArtEvent[] } | null>(null);
  const [calEventDetailFrom, setCalEventDetailFrom] = useState<{ date: string; events: ArtEvent[] } | null>(null);
  const [calDetailMenuOpen, setCalDetailMenuOpen] = useState(false);
  const [calDetailEditOpen, setCalDetailEditOpen] = useState(false);
  const [calDetailDeleteConfirm, setCalDetailDeleteConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "added">("date");
  const [filterCategory, setFilterCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "all");
  const [filterDay, setFilterDay] = useState(() => new URLSearchParams(window.location.search).get("day") || "all");
  const [filterDuration, setFilterDuration] = useState(() => new URLSearchParams(window.location.search).get("duration") || "all");

  useEffect(() => {
    const url = new URL(window.location.href);
    filterCategory !== "all" ? url.searchParams.set("category", filterCategory) : url.searchParams.delete("category");
    filterDay !== "all" ? url.searchParams.set("day", filterDay) : url.searchParams.delete("day");
    filterDuration !== "all" ? url.searchParams.set("duration", filterDuration) : url.searchParams.delete("duration");
    window.history.replaceState({}, "", url.toString());
  }, [filterCategory, filterDay, filterDuration]);

  const prevCalMonth = () => {
    if (calViewMonth === 0) { setCalViewMonth(11); setCalViewYear(y => y - 1); }
    else setCalViewMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    if (calViewMonth === 11) { setCalViewMonth(0); setCalViewYear(y => y + 1); }
    else setCalViewMonth(m => m + 1);
  };

  const { data: events = [], isLoading } = useQuery<ArtEvent[]>({
    queryKey: ["/api/art-events"],
  });

  const { toast } = useToast();
  const qcMain = useQueryClient();

  const calDetailSoldOutMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/art-events/${calEventDetail!.id}`, method: "PATCH", data: { soldOut: !calEventDetail!.soldOut } }),
    onSuccess: () => {
      qcMain.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: calEventDetail?.soldOut ? "Back on the list" : "Marked as sold out", description: calEventDetail?.name });
      setCalEventDetail(null); setCalEventDetailFrom(null);
    },
    onError: () => toast({ title: "Error", description: "Couldn't update this event.", variant: "destructive" }),
  });

  const calDetailDeleteMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/art-events/${calEventDetail!.id}`, method: "DELETE" }),
    onSuccess: () => {
      qcMain.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: "Deleted", description: `${calEventDetail?.name} removed.` });
      setCalDetailDeleteConfirm(false); setCalEventDetail(null); setCalEventDetailFrom(null);
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete this event.", variant: "destructive" }),
  });

  const expandedEvents = expandRecurringEvents(events);

  const hasActiveFilters = sortBy !== "date" || filterCategory !== "all" || filterDay !== "all" || filterDuration !== "all";

  const resetFilters = () => {
    setSortBy("date");
    setFilterCategory("all");
    setFilterDay("all");
    setFilterDuration("all");
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
  const weekendDateSet = (() => {
    const s = new Set<string>();
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 6=Sat
    if (dow === 0) {
      s.add(today.toISOString().split("T")[0]);
    } else {
      const daysUntilSat = dow === 6 ? 0 : 6 - dow;
      const sat = new Date(today); sat.setDate(today.getDate() + daysUntilSat);
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      s.add(sat.toISOString().split("T")[0]);
      s.add(sun.toISOString().split("T")[0]);
    }
    return s;
  })();

  const filteredEvents = expandedEvents.filter(ev => {
    if (filterCategory !== "all" && ev.category !== filterCategory) return false;
    if (filterDay !== "all") {
      const d = new Date(ev.dateStart + "T12:00:00");
      if (filterDay === "today")   { if (ev.dateStart !== todayStr) return false; }
      else if (filterDay === "tomorrow") { if (ev.dateStart !== tomorrowStr) return false; }
      else if (filterDay === "weekend")  { if (!weekendDateSet.has(ev.dateStart)) return false; }
      else { if (d.getDay().toString() !== filterDay) return false; }
    }
    if (filterDuration !== "all") {
      const isRecurring = ev.isRecurring === true;
      const hasSpan = ev.dateEnd && ev.dateEnd !== "" && ev.dateEnd !== ev.dateStart;
      if (filterDuration === "recurring" && !isRecurring) return false;
      if (filterDuration === "limited-run" && (isRecurring || !hasSpan)) return false;
      if (filterDuration === "one-time" && (isRecurring || hasSpan)) return false;
    }
    return true;
  });

  // "Still Time" — already started, not yet over; dedupe by id, sort by soonest closing
  const stillTimeEvents = filteredEvents
    .filter(ev => {
      if (!ev.dateEnd || ev.dateEnd === "" || ev.dateEnd === ev.dateStart) return false;
      return ev.dateStart < todayStr && ev.dateEnd >= todayStr;
    })
    .filter((ev, idx, arr) => arr.findIndex(e => e.id === ev.id) === idx)
    .sort((a, b) => (a.dateEnd ?? "").localeCompare(b.dateEnd ?? ""));

  const STILL_VISIBLE = 2;
  const stillTimeTruncated = stillTimeEvents.length > STILL_VISIBLE && !stillTimeExpanded;
  const visibleStillTimeEvents = stillTimeTruncated ? stillTimeEvents.slice(0, STILL_VISIBLE) : stillTimeEvents;
  const stillTimeHiddenCount = stillTimeEvents.length - STILL_VISIBLE;

  // Events that haven't started yet — feed into the normal month groups
  const upcomingFilteredEvents = filteredEvents.filter(ev => {
    if (!ev.dateEnd || ev.dateEnd === "" || ev.dateEnd === ev.dateStart) return true;
    return !(ev.dateStart < todayStr && ev.dateEnd >= todayStr);
  });

  type MonthBucket = { events: ArtEvent[]; weekGroups: Record<string, { events: ArtEvent[] }> };
  const grouped = upcomingFilteredEvents.reduce<Record<string, MonthBucket>>((acc, ev) => {
    const monthKey = getMonthLabel(ev.dateStart);
    const eventDate = new Date(ev.dateStart + "T12:00:00");
    const nowDate = new Date();
    const eventMonthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
    const currentMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    const dateForWeek = eventMonthStart < currentMonthStart ? nowDate : eventDate;
    const weekKey = getWeekRange(dateForWeek).key;
    if (!acc[monthKey]) acc[monthKey] = { events: [], weekGroups: {} };
    acc[monthKey].events.push(ev);
    if (!acc[monthKey].weekGroups[weekKey]) acc[monthKey].weekGroups[weekKey] = { events: [] };
    acc[monthKey].weekGroups[weekKey].events.push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: AN_BG }}>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 shadow-md px-4 py-3" style={{ backgroundColor: AN_ORANGE }}>
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-baseline gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 group outline-none">
                  <h1 className="text-3xl md:text-4xl text-white group-hover:text-[#41F2EE] transition-colors font-black">
                    ARTISTRY/NERDISTRY LIVE
                  </h1>
                  <ChevronDown className="h-4 w-4 text-white group-hover:text-[#41F2EE] transition-colors shrink-0 self-center" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-none border-2 border-black bg-black text-white p-0 min-w-[240px]">
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#FEABDA] focus:text-black px-4 py-3 cursor-pointer">
                    <a href={siteUrls.setlist} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎵 SETLIST SOCIAL FEED
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#FFF8E7] focus:text-black px-4 py-3 cursor-pointer">
                    <a href={siteUrls.amuseBouche} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🍽️ AMUSE-BOUCHE INSIDER
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCalendarOpen(true)}
                      className="text-white hover:text-[#41F2EE] transition-colors"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>Subscribe to calendar</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button onClick={() => setAddOpen(true)}
                className="bg-black text-[#FE6B41] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-1.5 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />Event
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Feed */}
      <main className={`container mx-auto px-4 py-6 flex-1 transition-all duration-200 ${viewMode === "calendar" ? "max-w-5xl" : "max-w-2xl"}`}>

        <p className="text-xs text-black mb-4 opacity-60 leading-snug">
          Exhibits, talks, screenings, performances, workshops and similar fun.
        </p>

        {/* Recent events banner */}
        {!isLoading && events.length > 0 && sortBy !== "added" && (() => {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          const recentCount = events.filter(e => e.createdAt && new Date(e.createdAt) > oneWeekAgo).length;
          if (recentCount === 0) return null;
          return (
            <div className="mb-6 text-left">
              <p className="font-light text-black mb-4 lowercase" style={{ fontSize: '24px' }}>
                <button
                  onClick={() => setSortBy("added")}
                  className="text-[#FE6B41] hover:text-[#41F2EE] underline font-light focus:outline-none"
                >
                  {recentCount} {recentCount === 1 ? "event" : "events"}
                </button>
                {' '}added in the last week.
              </p>
            </div>
          );
        })()}

        {/* Filters */}
        {!isLoading && events.length > 0 && (
          <div className="mb-5">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-2 items-center" style={{ minWidth: "max-content" }}>
                {/* View mode toggle — first position */}
                <div className="flex items-center gap-1 border border-black rounded-full overflow-hidden flex-shrink-0">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${
                      viewMode === "list" ? "bg-black text-white" : "text-black hover:bg-black/10"
                    }`}
                    title="List view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${
                      viewMode === "calendar" ? "bg-black text-white" : "text-black hover:bg-black/10"
                    }`}
                    title="Calendar view"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Sort pills — hidden in calendar mode */}
                {viewMode !== "calendar" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-black bg-white text-black font-medium text-sm hover:bg-black hover:text-white transition-colors whitespace-nowrap flex-shrink-0 focus:outline-none">
                        <ArrowUpDown className="w-3 h-3" />
                        {sortBy === "added" ? "Recently Added" : "Upcoming"}
                        <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-44 p-0">
                      {([
                        { label: "Upcoming", value: "date" as const },
                        { label: "Recently Added", value: "added" as const },
                      ]).map(opt => (
                        <DropdownMenuItem key={opt.label} onClick={() => setSortBy(opt.value)} className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-none focus:bg-gray-100 hover:bg-gray-100 cursor-pointer">
                          <span className="w-3.5 flex-shrink-0">{sortBy === opt.value ? <Check className="w-3 h-3" /> : null}</span>
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Vertical separator */}
                <div className="h-6 w-px bg-black opacity-40 mx-1 flex-shrink-0" />
                {/* Category filter */}
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filterCategory !== "all" ? "bg-white text-black" : "text-black hover:border-white"
                  }`} style={{ width: "160px", backgroundColor: filterCategory !== "all" ? "white" : AN_BG }}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {artCategories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Day filter */}
                <Select value={filterDay} onValueChange={setFilterDay}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filterDay !== "all" ? "bg-white text-black" : "text-black hover:border-white"
                  }`} style={{ width: "148px", backgroundColor: filterDay !== "all" ? "white" : AN_BG }}>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] overflow-y-auto">
                    <SelectGroup>
                      <SelectItem value="all">All Days</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-400 px-2 pb-0.5">Upcoming</SelectLabel>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="tomorrow">Tomorrow</SelectItem>
                      <SelectItem value="weekend">This Weekend</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-400 px-2 pb-0.5">Day of Week</SelectLabel>
                      <SelectItem value="0">Sundays</SelectItem>
                      <SelectItem value="1">Mondays</SelectItem>
                      <SelectItem value="2">Tuesdays</SelectItem>
                      <SelectItem value="3">Wednesdays</SelectItem>
                      <SelectItem value="4">Thursdays</SelectItem>
                      <SelectItem value="5">Fridays</SelectItem>
                      <SelectItem value="6">Saturdays</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* Duration filter */}
                <Select value={filterDuration} onValueChange={setFilterDuration}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filterDuration !== "all" ? "bg-white text-black" : "text-black hover:border-white"
                  }`} style={{ width: "140px", backgroundColor: filterDuration !== "all" ? "white" : AN_BG }}>
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Durations</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                    <SelectItem value="limited-run">Limited run</SelectItem>
                    <SelectItem value="recurring">Recurring</SelectItem>
                  </SelectContent>
                </Select>

              </div>
            </div>

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

        {isLoading && (
          <div className="text-center py-16 text-gray-400">
            <Telescope className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Loading the good stuff…</p>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="text-center py-16">
            <Telescope className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-2xl text-black uppercase mb-1">Nothing on the calendar yet.</p>
            <p className="text-sm text-gray-600 mb-4">Be the first to add an event.</p>
            <button onClick={() => setAddOpen(true)}
              className="bg-black text-white font-black uppercase tracking-wide text-sm px-6 py-2.5 border-2 border-black hover:text-[#41F2EE] transition-colors inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />Add an Event
            </button>
          </div>
        )}

        {!isLoading && events.length > 0 && filteredEvents.length === 0 && viewMode === "list" && (
          <div className="text-center py-16">
            <p className="text-lg text-black uppercase mb-2">No events match your filters.</p>
            <button onClick={resetFilters} className="text-black text-sm underline hover:text-white transition-colors">
              ✕ clear filters
            </button>
          </div>
        )}

        {!isLoading && viewMode === "calendar" && (
          <ListingCalendarMonthView
            events={filteredEvents}
            viewYear={calViewYear}
            viewMonth={calViewMonth}
            onPrevMonth={prevCalMonth}
            onNextMonth={nextCalMonth}
            onEventClick={setCalEventDetail}
            onDayOverflowClick={(date, events) => setCalDaySheet({ date, events })}
            config={artCalendarConfig}
          />
        )}

        {viewMode === "list" && sortBy === "added" && (() => {
          const now = new Date();
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dayOfWeek = todayDate.getDay();
          const startOfWeek = new Date(todayDate);
          startOfWeek.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

          const getGroup = (ev: ArtEvent): "today" | "week" | "month" | "earlier" => {
            if (!ev.createdAt) return "earlier";
            const c = new Date(ev.createdAt);
            const cDate = new Date(c.getFullYear(), c.getMonth(), c.getDate());
            if (cDate.getTime() === todayDate.getTime()) return "today";
            if (cDate >= startOfWeek) return "week";
            if (c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear()) return "month";
            return "earlier";
          };

          const seen = new Set<number>();
          const sorted = [...filteredEvents]
            .filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; })
            .sort((a, b) => b.id - a.id);
          const buckets: { key: "today" | "week" | "month" | "earlier"; label: string; events: ArtEvent[] }[] = [
            { key: "today", label: "Added today", events: [] },
            { key: "week",  label: "Added this week", events: [] },
            { key: "month", label: "Added this month", events: [] },
            { key: "earlier", label: "Added earlier", events: [] },
          ];
          for (const ev of sorted) buckets.find(b => b.key === getGroup(ev))!.events.push(ev);

          return buckets.filter(b => b.events.length > 0).map(bucket => (
            <div key={bucket.key} className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-0.5 flex-1 bg-black" />
                <h2 className="text-lg font-black uppercase text-black">{bucket.label.toUpperCase()}</h2>
                <div className="h-0.5 flex-1 bg-black" />
              </div>
              <ul className="space-y-0">
                {bucket.events.map(ev => (
                  <ListingEventRow key={`${ev.id}-${ev.dateStart}`} event={ev} config={artRowConfig} />
                ))}
              </ul>
            </div>
          ));
        })()}

        {viewMode === "list" && sortBy === "date" && stillTimeEvents.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-0.5 flex-1 bg-black" />
              <h2 className="text-lg font-black uppercase text-black flex items-center gap-2">
                STILL TIME
              </h2>
              <div className="h-0.5 flex-1 bg-black" />
            </div>

            <div className="relative">
              <ul className="space-y-0">
                {visibleStillTimeEvents.map(ev => (
                  <ListingEventRow key={`still-${ev.id}`} event={ev} config={artRowConfig} />
                ))}
              </ul>
              {stillTimeTruncated && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `linear-gradient(to bottom, transparent 40%, ${AN_BG} 100%)` }}
                />
              )}
            </div>
            {stillTimeTruncated && (
              <div className="text-center mt-3">
                <button
                  onClick={() => setStillTimeExpanded(true)}
                  className="text-black text-xs underline hover:opacity-60 transition-opacity focus:outline-none opacity-50"
                >
                  ↓ show {stillTimeHiddenCount} more closing soon
                </button>
              </div>
            )}
            {!stillTimeTruncated && stillTimeEvents.length > STILL_VISIBLE && (
              <div className="text-center mt-2">
                <button
                  onClick={() => setStillTimeExpanded(false)}
                  className="text-black text-xs underline hover:opacity-60 transition-opacity focus:outline-none opacity-50"
                >
                  ↑ show less
                </button>
              </div>
            )}
          </div>
        )}

        {viewMode === "list" && sortBy === "date" && Object.entries(grouped).map(([month, monthData]) => {
          const weekKeys = Object.keys(monthData.weekGroups).sort();
          return (
            <div key={month} className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-0.5 flex-1 bg-black" />
                <h2 className="text-lg font-black uppercase text-black">
                  {month.toUpperCase()}
                </h2>
                <div className="h-0.5 flex-1 bg-black" />
              </div>
              {weekKeys.map((weekKey, weekIdx) => {
                const weekEvents = monthData.weekGroups[weekKey].events;
                const isLastWeek = weekIdx === weekKeys.length - 1;
                const weekNumber = weekEvents.length > 0
                  ? getWeekOfMonth(new Date(weekEvents[0].dateStart))
                  : 1;
                return (
                  <div key={weekKey}>
                    <ul className="space-y-0">
                      {weekEvents.map(ev => (
                        <ListingEventRow key={`${ev.id}-${ev.dateStart}`} event={ev} config={artRowConfig} />
                      ))}
                    </ul>
                    {!isLastWeek && (
                      <div className="pt-2 pb-1">
                        <div className="text-black text-sm font-black uppercase">
                          WEEK {weekNumber + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </main>

      {/* Footer */}
      <footer className="py-4 px-4" style={{ backgroundColor: AN_BG }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a href={siteUrls.setlist} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Setlist Social Feed</a>
            <span className="text-black opacity-40">|</span>
            <a href={siteUrls.amuseBouche} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Amuse-Bouche Insider</a>
            <span className="text-black opacity-40">|</span>
            <span className="text-sm font-bold text-black uppercase">Artistry/Nerdistry Live</span>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setCalendarOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Subscribe to Calendar
            </button>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setAddOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Add an Event
            </button>
          </div>
          <span className="text-sm text-black whitespace-nowrap">© {new Date().getFullYear()} Artistry/Nerdistry Live</span>
        </div>
      </footer>

      <AddListingEventModal open={addOpen} onClose={() => setAddOpen(false)} config={artFormConfig} />
      <CalendarSubscribeModal
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        feedPath="/api/calendar/art-feed.ics"
        title="SUBSCRIBE TO EVENTS"
      />

      {/* Event detail dialog */}
      <Dialog open={calEventDetail !== null} onOpenChange={open => { if (!open) { setCalEventDetail(null); setCalEventDetailFrom(null); } }}>
        <DialogContent className="max-w-lg rounded-none border-2 border-black p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{calEventDetail?.name ?? "Event Details"}</DialogTitle>
          {calEventDetail && (() => {
            const ev = calEventDetail;
            const startDate = new Date(ev.dateStart + 'T12:00:00');
            const endDate = ev.dateEnd ? new Date(ev.dateEnd + 'T12:00:00') : null;
            const fmtOpts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
            const dateStr = endDate && ev.dateEnd !== ev.dateStart
              ? `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              : startDate.toLocaleDateString('en-US', fmtOpts);
            const evSearchUrl = createSearchUrl(ev);
            const evMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue + " Denver CO")}`;
            const evCalUrl = createCalendarUrl(ev);
            return (
              <>
                <div className="pl-6 pr-12 pt-9 pb-4" style={{ backgroundColor: AN_BG }}>
                  {/* Back button row */}
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
                      {new Date(calEventDetailFrom.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-3xl flex-shrink-0">{ev.emoji}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={evSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xl font-black uppercase text-black leading-tight hover:underline cursor-pointer"
                            >
                              {ev.name}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p>Search on Google</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {ev.soldOut && (
                        <span className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5">SOLD OUT</span>
                      )}
                      {/* 3-dot menu */}
                      <DropdownMenu open={calDetailMenuOpen} onOpenChange={setCalDetailMenuOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black">
                            <MoreVertical className="h-4 w-4 text-black" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); setCalDetailEditOpen(true); }}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); calDetailSoldOutMutation.mutate(); }}
                            disabled={calDetailSoldOutMutation.isPending}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            {ev.soldOut ? "Mark available" : "Mark sold out"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                            onClick={() => { setCalDetailMenuOpen(false); setTimeout(() => setCalDetailDeleteConfirm(true), 100); }}
                          >
                            Delete event
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-black/30 text-black/70">{ev.category}</span>
                    {ev.isRecurring && ev.recurrenceLabel && (
                      <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-black/10 text-black/70">{ev.recurrenceLabel}</span>
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
                            <a
                              href={evCalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline cursor-pointer"
                            >
                              {dateStr}{ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && <span className="font-normal opacity-60 ml-1">· {formatTime(ev.startTime)}</span>}
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
                            <a
                              href={evMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline cursor-pointer"
                            >
                              {ev.venue}{ev.neighborhood ? `, ${ev.neighborhood}` : ''}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent><p>Find on Google Maps</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {ev.price && (
                      <div className="flex items-center gap-2 text-sm text-black/80">
                        <span>🎟</span>
                        <span>{ev.price}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-black/90 leading-relaxed">{ev.summary}</p>

                  {(ev.ticketUrl || ev.sourceUrl) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ev.ticketUrl && (
                        <a
                          href={ev.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 bg-black text-white font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-[#FE6B41] transition-colors"
                        >
                          Get Tickets ↗
                        </a>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 border-2 border-black text-black font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-black hover:text-white transition-colors"
                        >
                          Original Post ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit modal for calendar event detail */}
      {calDetailEditOpen && calEventDetail && (
        <EditArtEventModal event={calEventDetail} onClose={() => setCalDetailEditOpen(false)} />
      )}

      {/* Delete confirmation for calendar event detail */}
      <AlertDialog open={calDetailDeleteConfirm} onOpenChange={setCalDetailDeleteConfirm}>
        <AlertDialogContent className="rounded-none border-2 border-black">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{calEventDetail?.name}" will be permanently removed from the feed.
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

      {/* Day sheet dialog — shows all events on a crowded day */}
      <Dialog open={calDaySheet !== null} onOpenChange={open => { if (!open) setCalDaySheet(null); }}>
        <DialogContent className="max-w-sm rounded-none border-2 border-black p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">
            {calDaySheet ? `Events on ${new Date(calDaySheet.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` : "Events"}
          </DialogTitle>
          {calDaySheet && (() => {
            const d = new Date(calDaySheet.date + 'T12:00:00');
            const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            return (
              <>
                <div className="px-5 pt-5 pb-3" style={{ backgroundColor: AN_BG }}>
                  <h2 className="text-base font-black uppercase text-black">{label}</h2>
                  <p className="text-xs text-black/60 mt-0.5">{calDaySheet.events.length} event{calDaySheet.events.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="divide-y divide-black/10 bg-white max-h-[60vh] overflow-y-auto">
                  {calDaySheet.events.map((ev, i) => (
                    <button
                      key={`${ev.id}-${i}`}
                      onClick={() => { setCalEventDetailFrom(calDaySheet); setCalDaySheet(null); setCalEventDetail(ev); }}
                      className="w-full text-left px-5 py-3 hover:bg-[#FEABDA]/40 transition-colors flex items-center gap-3"
                    >
                      <span className="text-xl flex-shrink-0">{ev.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-black truncate">{ev.name}</div>
                        <div className="text-xs text-black/60 truncate">{ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}</div>
                        {ev.price && <div className="text-xs text-black/50">{ev.price}</div>}
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
