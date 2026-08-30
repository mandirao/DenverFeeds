import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
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
import { artCategories, denverProperNeighborhoods, denverMetroSuburbs, frontRangeCities, type ArtEvent, type InsertArtEvent } from "@shared/schema";
import { Telescope, Plus, Sparkles, List, MoreVertical, ImageIcon, FileText, ChevronDown, Calendar, CalendarDays, ChevronLeft, ChevronRight, ArrowUpDown, Check, Search, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarSubscribeModal } from "@/components/CalendarSubscribeModal";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { getNextMonths } from "@/components/EventFilters";
import {
  ensureHttps, formatDateRange, getMonthLabel, formatTime, formatDayHeaderLabel,
  createSearchUrl, createCalendarUrl, classifyRecurrence, addCalDays, addCalMonths,
  expandRecurringEvents, hasStartTimePassed, localDateStr,
  announcedTooltipText, SELLOUT_LIKELY_THRESHOLD, matchesRegionFilter,
  splitDayEvents, spanEnd, formatMonthDay,
} from "@/lib/eventUtils";
import { getAddedTimeCategory } from "@/lib/utils";
import { useElementHeight } from "@/hooks/use-element-height";
import { useIsMobile } from "@/hooks/use-mobile";
import { ListingEventRow } from "@/components/listings/ListingEventRow";
import { ListingCalendarMonthView } from "@/components/listings/ListingCalendarMonthView";
import { ListingDayScrollView } from "@/components/listings/ListingDayScrollView";
import { EditListingEventModal } from "@/components/listings/EditListingEventModal";
import { AddListingEventModal } from "@/components/listings/AddListingEventModal";
import type { ListingRowConfig, ListingCalendarConfig, ListingFormConfig } from "@/lib/listingFeedConfig";

// ── Colors ────────────────────────────────────────────────────────────────────
const AN_ORANGE   = "#000000";
const AN_LAVENDER = "#FE6B41";
const AN_BG       = "#FEABDA";
const AN_TEAL     = "#41F2EE";
const AN_DAY_ALT  = "#EE9BC7"; // odd-index day-box tint, see design handoff

// Display labels for the active-filters summary line next to "clear filters".
const REGION_LABELS: Record<string, string> = { denver: "Denver", suburbs: "Suburbs", front_range: "Front Range", mountains: "Mountains" };
const DAY_LABELS: Record<string, string> = {
  today: "Today", tomorrow: "Tomorrow", weekend: "This Weekend", "next-week": "Next Week", "next-month": "Next Month",
  "0": "Sundays", "1": "Mondays", "2": "Tuesdays", "3": "Wednesdays", "4": "Thursdays", "5": "Fridays", "6": "Saturdays",
};
const DURATION_LABELS: Record<string, string> = {
  "one-time": "One Time", "limited-run": "Limited Run", annual: "Annually", monthly: "Monthly", weekly: "Weekly", quarterly: "Quarterly", recurring: "All Recurring",
};

// ── Event Row ─────────────────────────────────────────────────────────────────

// Config for the shared <ListingEventRow>.
const artRowConfig: ListingRowConfig<ArtEvent> = {
  apiPath: "/api/art-events",
  queryKey: "/api/art-events",
  dialogBg: AN_BG,
  deleteTitle: "Delete this event?",
  soldOutRestoreLabel: "Back on the list",
  ticketLabel: "Tickets",
  ticketTextColorClass: "text-[#FE6B41]",
  getCategory: (event) => event.category,
  renderInstanceNote: (note) => (
    <span className="block text-sm italic mt-0.5" style={{ opacity: 0.75 }}>
      ↳ {note}
    </span>
  ),
  EditModal: EditArtEventModal,
};

const artCalendarConfig: ListingCalendarConfig<ArtEvent> = {
  cellBg: AN_BG,
  cardBg: AN_DAY_ALT,
  guardRecurringMultiDaySpillover: true,
};

// ── Edit Art Event Modal ───────────────────────────────────────────────────────

// Config for the shared Add/Edit form.
const artFormConfig: ListingFormConfig<InsertArtEvent> = {
  idPrefix: "an",
  apiPath: "/api/art-events",
  queryKey: "/api/art-events",
  dialogBg: AN_BG,

  categoryFieldKey: "category",
  categoryLabel: "Category",
  categoryOptions: artCategories,

  venueLabel: "Venue",
  namePlaceholder: "e.g. FBC Book Club",
  venuePlaceholder: "e.g. Fiction Beer Company",
  neighborhoodPlaceholder: "e.g. Park Hill",
  emojiPlaceholder: "🎨",
  pricePlaceholder: "$20/person",
  instanceNotePlaceholder: "e.g. This month tackles V.E. Schwab's 'Vicious'—college friends turned superpowered enemies.",
  instanceTitlePlaceholder: "e.g. Vicious by V.E. Schwab",
  descriptionPlaceholderAdd: "e.g. Monthly book club at a literary-themed brewery. Grab a pint, settle in, and talk books—no pressure to finish before you show up.",
  descriptionPlaceholderEdit: "e.g. Monthly book club at a literary-themed brewery. Grab a pint, settle in, and talk books—no pressure to finish before you show up.",
  sourceUrlPlaceholder: "https://instagram.com/p/… or ticketing link",

  addModalTitle: "Add an Event",
  editModalTitle: "Edit Event",
  addSubmitLabel: "Add Event",
  createToastTitle: "Event added!",
  discardDescriptionEdit: "You have unsaved changes.",

  screenshotIntro: "AI reads screenshots from Instagram, Eventbrite, a museum site, or anywhere.",
  blurbIntro: "Paste text from anywhere for AI to read.",
  blurbPlaceholder: "e.g. FBC Book Club at Fiction Beer Company in Park Hill. This month: Vicious by V.E. Schwab. Mon Aug 17, 7 PM.",

  parseEndpoint: "/api/ai/parse-art-blurb",
  redoEndpoint: "/api/ai/redo-art-event-content",
  buildRedoPayload: (form, instanceNote, instanceTitle) => ({
    name: form.name,
    venue: form.venue,
    category: form.category,
    isRecurring: form.isRecurring,
    recurrenceLabel: form.recurrenceLabel,
    recurrenceRule: form.recurrenceRule,
    dateStart: form.dateStart,
    startTime: form.startTime,
    price: form.price,
    ticketUrl: form.ticketUrl,
    neighborhood: form.neighborhood,
    currentSummary: form.summary,
    currentInstanceNote: instanceNote,
    currentInstanceTitle: instanceTitle,
  }),
  applyRedoResponse: (res, { setForm, setInstanceNote, setInstanceTitle }) => {
    if (res.status === "not-found") {
      if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
      return { title: "Couldn't verify online ⚠️", description: res.message };
    }
    if (res.status === "confirmed") {
      if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
      return { title: "Confirmed correct ✓", description: res.message };
    }
    setForm(f => ({
      ...f,
      ...(res.summary ? { summary: res.summary } : {}),
      ...(res.dateStart ? { dateStart: res.dateStart } : {}),
      ...(res.startTime ? { startTime: res.startTime } : {}),
      ...(res.venue ? { venue: res.venue } : {}),
      ...(res.neighborhood ? { neighborhood: res.neighborhood } : {}),
      ...(res.price ? { price: res.price } : {}),
      ...(res.ticketUrl ? { ticketUrl: res.ticketUrl } : {}),
    }));
    if (res.instanceNote) setInstanceNote(res.instanceNote);
    if (res.instanceTitle) setInstanceTitle(res.instanceTitle);
    return { title: "Updated ✨", description: res.message };
  },
  applyParseResponse: (data, { blurb, form, setForm, setInstanceNote, setInstanceTitle, setSpecificDates, setUseSpecificDates }) => {
    const { specificDates: aiDates, instanceNote: aiNote, titleModifier: aiTitle, ...rest } = data;
    if (aiNote) setInstanceNote(aiNote);
    if (aiTitle) setInstanceTitle(aiTitle);
    if (Array.isArray(aiDates) && aiDates.length >= 2) {
      setSpecificDates(aiDates.map((date: string) => ({ date, title: "" })));
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
  const [calEventDetail, setCalEventDetail] = useState<(ArtEvent & { isDateUnverified?: boolean | null }) | null>(null);
  const [calDaySheet, setCalDaySheet] = useState<{ date: string } | null>(null);
  const [calEventDetailFrom, setCalEventDetailFrom] = useState<{ date: string } | null>(null);
  const [calDetailMenuOpen, setCalDetailMenuOpen] = useState(false);
  const [calDetailEditOpen, setCalDetailEditOpen] = useState(false);
  const [calDetailDeleteConfirm, setCalDetailDeleteConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "added">("date");
  const [filterCategory, setFilterCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "all");
  const [filterRegion, setFilterRegion] = useState(() => new URLSearchParams(window.location.search).get("region") || "all");
  const [filterDay, setFilterDay] = useState(() => new URLSearchParams(window.location.search).get("day") || "all");
  const [filterDuration, setFilterDuration] = useState(() => new URLSearchParams(window.location.search).get("duration") || "all");
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [searchOpen, setSearchOpen] = useState(() => searchQuery.trim() !== "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { ref: filterBarRef, height: filterBarHeight } = useElementHeight<HTMLDivElement>();
  // Measures the sticky nav's own rendered height (which differs by breakpoint —
  // the filter bar is part of the nav's flow on desktop but fixed-to-bottom on
  // mobile) so the sticky day-header bars below can stick flush beneath it.
  const { ref: navRef, height: navHeight } = useElementHeight<HTMLElement>();
  const isMobile = useIsMobile();

  // Forces a re-render every minute so today's events drop off the feed
  // (via hasStartTimePassed below) as their start time passes, without
  // requiring a manual page refresh.
  const [, forceMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceMinuteTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    filterCategory !== "all" ? url.searchParams.set("category", filterCategory) : url.searchParams.delete("category");
    filterRegion !== "all" ? url.searchParams.set("region", filterRegion) : url.searchParams.delete("region");
    filterDay !== "all" ? url.searchParams.set("day", filterDay) : url.searchParams.delete("day");
    filterDuration !== "all" ? url.searchParams.set("duration", filterDuration) : url.searchParams.delete("duration");
    searchQuery.trim() ? url.searchParams.set("q", searchQuery.trim()) : url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());
  }, [filterCategory, filterRegion, filterDay, filterDuration, searchQuery]);

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

  const hasActiveFilters = sortBy !== "date" || filterCategory !== "all" || filterRegion !== "all" || filterDay !== "all" || filterDuration !== "all" || searchQuery.trim() !== "";

  const resetFilters = () => {
    setSortBy("date");
    setFilterCategory("all");
    setFilterRegion("all");
    setFilterDay("all");
    setFilterDuration("all");
    setSearchQuery("");
    setSearchOpen(false);
  };

  const activeFilterLabels: string[] = [];
  if (filterCategory !== "all") activeFilterLabels.push(filterCategory);
  if (filterRegion !== "all") activeFilterLabels.push(REGION_LABELS[filterRegion] ?? filterRegion);
  if (filterDay !== "all") activeFilterLabels.push(filterDay.startsWith("month:") ? filterDay.slice(6) : DAY_LABELS[filterDay] ?? filterDay);
  if (filterDuration !== "all") activeFilterLabels.push(DURATION_LABELS[filterDuration] ?? filterDuration);
  if (sortBy !== "date") activeFilterLabels.push("Recently Added");
  if (searchQuery.trim() !== "") activeFilterLabels.push(`"${searchQuery.trim()}"`);

  const todayStr = localDateStr();
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);
  const weekendDateSet = (() => {
    const s = new Set<string>();
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 6=Sat
    if (dow === 0) {
      s.add(localDateStr(today));
    } else {
      const daysUntilSat = dow === 6 ? 0 : 6 - dow;
      const sat = new Date(today); sat.setDate(today.getDate() + daysUntilSat);
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      s.add(localDateStr(sat));
      s.add(localDateStr(sun));
    }
    return s;
  })();
  const nextWeekRange = (() => {
    const today = new Date();
    const daysSinceMonday = (today.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - daysSinceMonday);
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday = new Date(nextMonday); nextSunday.setDate(nextMonday.getDate() + 6);
    return { start: localDateStr(nextMonday), end: localDateStr(nextSunday) };
  })();
  const nextMonthRange = (() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return { start: localDateStr(start), end: localDateStr(end) };
  })();

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const monthOptions = getNextMonths();

  const filteredEvents = expandedEvents.filter(ev => {
    if (hasStartTimePassed(ev, todayStr)) return false;
    if (normalizedSearch) {
      const instanceTitle = ev.isRecurring ? ev.instanceTitles?.[ev.dateStart] ?? "" : "";
      const instanceNote = ev.isRecurring ? ev.instanceNotes?.[ev.dateStart] ?? "" : "";
      const haystack = `${ev.name} ${ev.venue} ${ev.neighborhood ?? ""} ${ev.summary} ${ev.category} ${instanceTitle} ${instanceNote}`.toLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }
    if (filterCategory !== "all" && ev.category !== filterCategory) return false;
    if (!matchesRegionFilter(ev.neighborhood, filterRegion)) return false;
    if (filterDay !== "all") {
      const d = new Date(ev.dateStart + "T12:00:00");
      if (filterDay === "today")   { if (ev.dateStart !== todayStr) return false; }
      else if (filterDay === "tomorrow") { if (ev.dateStart !== tomorrowStr) return false; }
      else if (filterDay === "weekend")  { if (!weekendDateSet.has(ev.dateStart)) return false; }
      else if (filterDay === "next-week")  { if (ev.dateStart < nextWeekRange.start || ev.dateStart > nextWeekRange.end) return false; }
      else if (filterDay === "next-month") { if (ev.dateStart < nextMonthRange.start || ev.dateStart > nextMonthRange.end) return false; }
      else if (filterDay.startsWith("month:")) { if (format(d, "MMMM yyyy") !== filterDay.slice(6)) return false; }
      else { if (d.getDay().toString() !== filterDay) return false; }
    }
    if (filterDuration !== "all") {
      const isRecurring = ev.isRecurring === true;
      const hasSpan = ev.dateEnd && ev.dateEnd !== "" && ev.dateEnd !== ev.dateStart;
      const recurrenceType = isRecurring ? classifyRecurrence(ev.recurrenceLabel) : null;
      if (filterDuration === "recurring" && !isRecurring) return false;
      if (filterDuration === "annual" && recurrenceType !== "annual") return false;
      if (filterDuration === "monthly" && recurrenceType !== "monthly") return false;
      if (filterDuration === "weekly" && recurrenceType !== "weekly") return false;
      if (filterDuration === "quarterly" && recurrenceType !== "quarterly") return false;
      if (filterDuration === "limited-run" && (isRecurring || !hasSpan)) return false;
      if (filterDuration === "one-time" && (isRecurring || hasSpan)) return false;
    }
    return true;
  });

  // "Still Time" — already-started, not-yet-over one-time range events; dedupe
  // by id, sort by soonest closing. Recurring events never belong here, even
  // when a given occurrence carries a multi-day span — each occurrence is its
  // own dated feed entry instead (see upcomingFilteredEvents below).
  const stillTimeEvents = filteredEvents
    .filter(ev => {
      if (ev.isRecurring) return false;
      if (!ev.dateEnd || ev.dateEnd === "" || ev.dateEnd === ev.dateStart) return false;
      return ev.dateStart < todayStr && ev.dateEnd >= todayStr;
    })
    .filter((ev, idx, arr) => arr.findIndex(e => e.id === ev.id) === idx)
    .sort((a, b) => (a.dateEnd ?? "").localeCompare(b.dateEnd ?? ""));

  const STILL_VISIBLE = 1;
  const stillTimeTruncated = stillTimeEvents.length > STILL_VISIBLE && !stillTimeExpanded;
  const visibleStillTimeEvents = stillTimeTruncated ? stillTimeEvents.slice(0, STILL_VISIBLE) : stillTimeEvents;
  const stillTimeHiddenCount = stillTimeEvents.length - STILL_VISIBLE;

  // Events that aren't in the Still Time bucket — feed into the normal month
  // groups. Mirrors the stillTimeEvents condition exactly (recurring events
  // are always included here, never diverted to Still Time).
  const upcomingFilteredEvents = filteredEvents.filter(ev => {
    if (ev.isRecurring) return true;
    if (!ev.dateEnd || ev.dateEnd === "" || ev.dateEnd === ev.dateStart) return true;
    return !(ev.dateStart < todayStr && ev.dateEnd >= todayStr);
  });

  // Month → day-group. Day groups are keyed by dateStart and rendered in
  // ascending order with a sequential index (spanning the whole month, not
  // reset per calendar week) that drives the alternating day-box background —
  // see the "Day Grouping + Indicator Redesign" design handoff.
  type DayBucket = { date: string; events: ArtEvent[] };
  type MonthBucket = { dayGroups: DayBucket[] };
  const grouped = upcomingFilteredEvents.reduce<Record<string, MonthBucket>>((acc, ev) => {
    const monthKey = getMonthLabel(ev.dateStart);
    if (!acc[monthKey]) acc[monthKey] = { dayGroups: [] };
    let day = acc[monthKey].dayGroups.find(d => d.date === ev.dateStart);
    if (!day) { day = { date: ev.dateStart, events: [] }; acc[monthKey].dayGroups.push(day); }
    day.events.push(ev);
    return acc;
  }, {});

  return (
    <div className={`min-h-screen flex flex-col ${viewMode === "calendar" && isMobile ? "h-dvh" : ""}`} style={{ backgroundColor: AN_BG }}>

      {/* Navbar */}
      <nav ref={navRef} className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: AN_ORANGE }}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-baseline gap-3">
              <SiteSwitcher
                title={<>ARTISTRY/NERDISTRY<span className="hidden md:inline"> LIVE</span></>}
                titleClassName="text-3xl md:text-4xl text-white group-hover:text-[#41F2EE] transition-colors font-black"
                chevronClassName="h-4 w-4 text-white group-hover:text-[#41F2EE] transition-colors shrink-0 self-center"
              />
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCalendarOpen(true)}
                      className="text-white hover:text-[#41F2EE] transition-colors p-3.5 -m-3.5 md:p-0 md:m-0"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>Subscribe to calendar</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <a href="https://www.meetup.com/artistry-nerdistry-live"
                target="_blank" rel="noopener noreferrer"
                className="text-white hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0">
                <span>Meetup</span>
              </a>
              <button onClick={() => setAddOpen(true)}
                className="bg-black text-[#FE6B41] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-2.5 md:py-1.5 transition-colors flex items-center gap-1 border border-[#FE6B41] hover:border-[#41F2EE]">
                <Plus className="w-4 h-4" />Event
              </button>
            </div>
          </div>
        </div>

        {/* Filters - a persistent bottom section of the nav on desktop, pinned to the bottom of the screen on mobile */}
        {!isLoading && events.length > 0 && (
          <div
            ref={filterBarRef}
            className="fixed inset-x-0 bottom-0 z-40 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-black md:bg-[#FEABDA] shadow-[0_-4px_12px_rgba(0,0,0,0.12)] border-t border-white/10 md:static md:inset-x-auto md:bottom-auto md:pb-3 md:shadow-none md:border-t-0"
          >
            <div className="px-4 md:container md:mx-auto">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-2 items-center" style={{ minWidth: "max-content" }}>
                {/* Search — expands from an icon into an inline input */}
                {searchOpen ? (
                  <div className="flex items-center gap-1 h-10 md:h-8 pl-2.5 pr-1 rounded-full border border-black bg-white flex-shrink-0" style={{ width: "170px" }}>
                    <Search className="w-3.5 h-3.5 text-black/50 flex-shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onBlur={() => { if (!searchQuery.trim()) setSearchOpen(false); }}
                      placeholder="Search events"
                      className="flex-1 min-w-0 h-full text-base md:text-sm text-black placeholder:text-black/40 bg-transparent focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                        className="flex-shrink-0 text-black/40 hover:text-black transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                    className="h-10 w-10 md:h-8 md:w-8 flex items-center justify-center rounded-full border border-white text-white hover:bg-white hover:text-black md:border-black md:text-black md:hover:bg-black md:hover:text-white transition-colors flex-shrink-0"
                    title="Search events"
                    aria-label="Search events"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* View mode toggle */}
                <div className="flex items-center gap-1 border border-white md:border-black rounded-full overflow-hidden flex-shrink-0">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`h-10 w-10 md:h-8 md:w-8 flex items-center justify-center transition-colors ${
                      viewMode === "list" ? "bg-white text-black md:bg-black md:text-white" : "text-white hover:bg-white/10 md:text-black md:hover:bg-black/10"
                    }`}
                    title="List view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`h-10 w-10 md:h-8 md:w-8 flex items-center justify-center transition-colors ${
                      viewMode === "calendar" ? "bg-white text-black md:bg-black md:text-white" : "text-white hover:bg-white/10 md:text-black md:hover:bg-black/10"
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
                      <button className="flex items-center gap-1.5 px-3 h-10 md:h-8 rounded-full border border-black bg-white text-black font-medium text-sm hover:bg-black hover:text-white transition-colors whitespace-nowrap flex-shrink-0 focus:outline-none">
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
                <div className="h-6 w-px bg-white md:bg-black opacity-40 mx-1 flex-shrink-0" />
                {/* Category filter */}
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className={`rounded-full border text-sm h-10 md:h-8 px-3 flex-shrink-0 ${
                    filterCategory !== "all"
                      ? "bg-white text-black border-black"
                      : "bg-black text-[#FEABDA] border-white md:bg-[#FEABDA] md:text-black md:border-black md:hover:border-white"
                  }`} style={{ width: "160px" }}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {artCategories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Region filter — broad tiers (Denver/Suburbs/Front Range/
                    Mountains) up top for a quick pick, with each tier's
                    specific neighborhoods/cities broken out in their own
                    section further down for anyone who wants to get precise. */}
                <Select value={filterRegion} onValueChange={setFilterRegion}>
                  <SelectTrigger className={`rounded-full border text-sm h-10 md:h-8 px-3 flex-shrink-0 ${
                    filterRegion !== "all"
                      ? "bg-white text-black border-black"
                      : "bg-black text-[#FEABDA] border-white md:bg-[#FEABDA] md:text-black md:border-black md:hover:border-white"
                  }`} style={{ width: "190px" }}>
                    <SelectValue placeholder="Region" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[340px] overflow-y-auto">
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="denver">Denver</SelectItem>
                    <SelectItem value="suburbs">Suburbs</SelectItem>
                    <SelectItem value="front_range">Front Range</SelectItem>
                    <SelectItem value="mountains">Mountains</SelectItem>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-widest text-black/35 px-2">Denver proper</SelectLabel>
                      {denverProperNeighborhoods.map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-widest text-black/35 px-2">Suburbs</SelectLabel>
                      {denverMetroSuburbs.map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-widest text-black/35 px-2">Front Range</SelectLabel>
                      {frontRangeCities.map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* Day filter */}
                <Select value={filterDay} onValueChange={setFilterDay}>
                  <SelectTrigger className={`rounded-full border text-sm h-10 md:h-8 px-3 flex-shrink-0 ${
                    filterDay !== "all"
                      ? "bg-white text-black border-black"
                      : "bg-black text-[#FEABDA] border-white md:bg-[#FEABDA] md:text-black md:border-black md:hover:border-white"
                  }`} style={{ width: "148px" }}>
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
                      <SelectItem value="next-week">Next Week</SelectItem>
                      <SelectItem value="next-month">Next Month</SelectItem>
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
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-400 px-2 pb-0.5">Months</SelectLabel>
                      {monthOptions.map(m => (
                        <SelectItem key={m.key} value={`month:${m.key}`}>{m.display}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* Duration filter */}
                <Select value={filterDuration} onValueChange={setFilterDuration}>
                  <SelectTrigger className={`rounded-full border text-sm h-10 md:h-8 px-3 flex-shrink-0 ${
                    filterDuration !== "all"
                      ? "bg-white text-black border-black"
                      : "bg-black text-[#FEABDA] border-white md:bg-[#FEABDA] md:text-black md:border-black md:hover:border-white"
                  }`} style={{ width: "140px" }}>
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Durations</SelectItem>
                    <SelectItem value="one-time">One Time</SelectItem>
                    <SelectItem value="limited-run">Limited Run</SelectItem>
                    <SelectItem value="annual">Annually</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="recurring">All Recurring</SelectItem>
                  </SelectContent>
                </Select>

              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                <button
                  onClick={resetFilters}
                  className="text-white hover:text-white/70 md:text-black md:hover:text-white transition-colors focus:outline-none underline py-2.5 -my-2.5 md:py-0 md:my-0"
                >
                  ✕ clear filters
                </button>
                <span className="text-white/70 md:text-black/50">
                  {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
                  {activeFilterLabels.length > 0 && ` · ${activeFilterLabels.join(" · ")}`}
                </span>
              </div>
            )}
            </div>
          </div>
        )}
      </nav>

      {/* Feed */}
      <main className={`container mx-auto px-4 py-6 flex-1 transition-all duration-200 ${viewMode === "calendar" ? (isMobile ? "flex flex-col min-h-0" : "") : "max-w-3xl"}`}>

        {/* Recent events banner - prioritize "today", fall back to "this week", else hide. Hidden on desktop in calendar view. */}
        {!isLoading && events.length > 0 && sortBy !== "added" && (() => {
          const todayCount = events.filter(e => getAddedTimeCategory(e.createdAt ?? null) === 'today').length;
          const weekCount = todayCount + events.filter(e => getAddedTimeCategory(e.createdAt ?? null) === 'this_week').length;
          const count = todayCount > 0 ? todayCount : weekCount;
          if (count === 0) return null;
          const label = todayCount > 0 ? "added today." : "added in the last week.";
          return (
            <div className={`mb-6 text-left ${viewMode === "calendar" ? "hidden" : ""}`}>
              <p className="font-light text-black mb-4 lowercase" style={{ fontSize: '24px' }}>
                <button
                  onClick={() => setSortBy("added")}
                  className="text-[#FE6B41] hover:text-[#41F2EE] underline font-light focus:outline-none"
                >
                  {count} {count === 1 ? "event" : "events"}
                </button>
                {' '}{label}
              </p>
            </div>
          );
        })()}

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
          isMobile ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <ListingDayScrollView
                events={filteredEvents}
                onEventClick={setCalEventDetail}
                config={artCalendarConfig}
                filterDay={filterDay}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={resetFilters}
              />
            </div>
          ) : (
            <ListingCalendarMonthView
              events={filteredEvents}
              viewYear={calViewYear}
              viewMonth={calViewMonth}
              onPrevMonth={prevCalMonth}
              onNextMonth={nextCalMonth}
              onEventClick={setCalEventDetail}
              onDayOverflowClick={date => setCalDaySheet({ date })}
              config={artCalendarConfig}
            />
          )
        )}

        {viewMode === "list" && sortBy === "added" && (() => {
          const categoryLabels = {
            today: "NEW TODAY",
            this_week: "NEW THIS WEEK",
            last_week: "NEW LAST WEEK",
            this_month: "NEW THIS MONTH",
            last_month: "NEW LAST MONTH",
            older: "OLD NEWS",
          } as const;

          const seen = new Set<number>();
          const sorted = [...filteredEvents]
            .filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; })
            .sort((a, b) => b.id - a.id);
          const buckets = (Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]).map(key => ({
            key,
            label: categoryLabels[key],
            events: sorted.filter(ev => getAddedTimeCategory(ev.createdAt ?? null) === key),
          }));

          return buckets.filter(b => b.events.length > 0).map(bucket => (
            <div key={bucket.key} className="mb-6">
              <h3 className="text-xl text-black mb-3 font-black">{bucket.label}</h3>
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
            <h2 className="text-xl text-black mb-3 font-black">STILL TIME</h2>

            <div
              className="rounded-[16px] sm:rounded-[18px] overflow-hidden"
              style={{ backgroundColor: AN_DAY_ALT }}
            >
              <div className={`px-[14px] sm:px-[22px] pt-[14px] sm:pt-4 ${stillTimeTruncated ? "" : "pb-3"}`}>
                <ul className="list-none m-0 p-0 flex flex-col gap-[11px] sm:gap-[9px]">
                  {visibleStillTimeEvents.map(ev => (
                    <ListingEventRow key={`still-${ev.id}`} event={ev} config={artRowConfig} />
                  ))}
                </ul>
                {/* Hard-clipped peek at the next hidden event, flush against the
                    footer button below — no fade, no gap, the button visibly
                    "cuts it off". */}
                {stillTimeTruncated && (
                  <div className="overflow-hidden pointer-events-none mt-[11px] sm:mt-[9px]" style={{ maxHeight: "1.1rem" }}>
                    <ul className="list-none m-0 p-0 flex flex-col gap-[11px] sm:gap-[9px]">
                      <ListingEventRow key={`still-peek-${stillTimeEvents[STILL_VISIBLE].id}`} event={stillTimeEvents[STILL_VISIBLE]} config={artRowConfig} />
                    </ul>
                  </div>
                )}
              </div>
              {stillTimeEvents.length > STILL_VISIBLE && (
                <button
                  onClick={() => setStillTimeExpanded(!stillTimeExpanded)}
                  className="w-full px-5 py-2 border-t border-black/10 bg-black/5 hover:bg-black/10 transition-colors flex items-center gap-2 text-left"
                >
                  <span className="text-sm font-black uppercase tracking-wider text-black/40">
                    {stillTimeTruncated ? `↓ Show ${stillTimeHiddenCount} more closing soon` : "↑ Show less"}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === "list" && sortBy === "date" && Object.entries(grouped).map(([month, monthData]) => (
          <div key={month} className="mb-6">
            <h2 className="text-xl text-black mb-1 font-black">{month.toUpperCase()}</h2>
            {monthData.dayGroups.map((day, dayIdx) => (
              <div
                key={day.date}
                className={`rounded-[16px] sm:rounded-[18px] ${dayIdx % 2 === 1 ? "mb-3 sm:mb-[14px]" : "mb-1 sm:mb-1.5"}`}
                style={{ backgroundColor: dayIdx % 2 === 1 ? AN_DAY_ALT : AN_BG }}
              >
                {/* Sticks to the base of the nav while this day's events scroll by,
                    so a reader never loses track of which day they're looking at. */}
                <div
                  className={`sticky z-30 rounded-t-[16px] sm:rounded-t-[18px] font-display font-black uppercase text-black text-[14px] sm:text-[15px] px-[14px] sm:px-[22px] pb-[11px] ${dayIdx % 2 === 1 ? "pt-[10px] sm:pt-3" : "pt-0.5 sm:pt-1"}`}
                  style={{ top: navHeight, backgroundColor: dayIdx % 2 === 1 ? AN_DAY_ALT : AN_BG }}
                >
                  {formatDayHeaderLabel(day.date)}
                </div>
                <ul className={`list-none m-0 p-0 flex flex-col gap-[11px] sm:gap-[9px] px-[14px] sm:px-[22px] ${dayIdx % 2 === 1 ? "pb-4 sm:pb-[18px]" : "pb-1 sm:pb-1.5"}`}>
                  {day.events.map(ev => (
                    <ListingEventRow
                      key={`${ev.id}-${ev.dateStart}`}
                      event={ev}
                      config={artRowConfig}
                      dateDisplay="timeOnly"
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}

        {/* Reserves space for the mobile bottom-pinned filter bar so it doesn't cover the feed */}
        {!isLoading && events.length > 0 && (
          <div className="md:hidden" style={{ height: filterBarHeight }} />
        )}
      </main>

      {/* Footer - hidden on mobile in calendar view, where the day card takes priority */}
      <footer className={`py-4 px-4 ${viewMode === "calendar" ? "hidden md:block" : ""}`} style={{ backgroundColor: AN_BG }}>
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
        <DialogContent className="max-w-lg max-h-[85vh] rounded-none border-2 border-black p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{calEventDetail?.name ?? "Event Details"}</DialogTitle>
          {calEventDetail && (() => {
            const ev = calEventDetail;
            const startDate = new Date(ev.dateStart + 'T12:00:00');
            const endDate = ev.dateEnd ? new Date(ev.dateEnd + 'T12:00:00') : null;
            const fmtOpts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
            const dateStr = endDate && ev.dateEnd !== ev.dateStart && !ev.isRecurring
              ? `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              : startDate.toLocaleDateString('en-US', fmtOpts);
            const evSearchUrl = createSearchUrl(ev);
            const evMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue + " Denver CO")}`;
            const evCalUrl = createCalendarUrl(ev);
            return (
              <div className="overflow-y-auto min-h-0 flex-1">
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
                      className="flex items-center gap-1 text-sm md:text-xs font-bold text-black/60 hover:text-black mb-3 transition-colors py-1 -my-1"
                    >
                      <ChevronLeft className="w-4 h-4 md:w-3.5 md:h-3.5" />
                      {new Date(calEventDetailFrom.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-4xl md:text-3xl flex-shrink-0">{ev.emoji}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={evSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-2xl md:text-xl font-black uppercase text-black leading-tight hover:underline cursor-pointer"
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
                        <span className="text-xs md:text-[10px] font-black uppercase bg-black text-white px-2.5 py-1 md:px-2 md:py-0.5">SOLD OUT</span>
                      )}
                      {/* 3-dot menu */}
                      <DropdownMenu open={calDetailMenuOpen} onOpenChange={setCalDetailMenuOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-11 w-11 md:h-9 md:w-9 p-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black">
                            <MoreVertical className="h-5 w-5 md:h-4 md:w-4 text-black" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 md:w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); setCalDetailEditOpen(true); }}
                            className="text-base md:text-sm py-3 md:py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); calDetailSoldOutMutation.mutate(); }}
                            disabled={calDetailSoldOutMutation.isPending}
                            className="text-base md:text-sm py-3 md:py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            {ev.soldOut ? "Mark available" : "Mark sold out"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 text-base md:text-sm py-3 md:py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                            onClick={() => { setCalDetailMenuOpen(false); setTimeout(() => setCalDetailDeleteConfirm(true), 100); }}
                          >
                            Delete event
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-sm md:text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 md:px-2 md:py-0.5 rounded-full border border-black/30 text-black/70">{ev.category}</span>
                    {ev.isRecurring && ev.recurrenceLabel && (
                      <span className="text-sm md:text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 md:px-2 md:py-0.5 rounded-full bg-black/10 text-black/70">{ev.recurrenceLabel}</span>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4 space-y-4 bg-white">
                  <div className="space-y-2 md:space-y-1">
                    <div className="flex items-center gap-2 text-base md:text-sm text-black font-semibold">
                      <span>📅</span>
                      {ev.isDateUnverified ? (
                        <button
                          type="button"
                          onClick={() => setCalDetailEditOpen(true)}
                          title="Exact date not announced yet — click to confirm"
                          className="hover:underline cursor-pointer"
                        >
                          Verify date
                        </button>
                      ) : (
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
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-base md:text-sm text-black/80">
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
                      <div className="flex items-center gap-2 text-base md:text-sm text-black/80">
                        <span>🎟</span>
                        <span>{ev.price}</span>
                      </div>
                    )}
                  </div>

                  {!ev.soldOut && (ev.selloutRisk ?? 0) >= SELLOUT_LIKELY_THRESHOLD && (
                    <div className="pt-3 -mt-1 border-t border-black/10">
                      <p className="text-sm md:text-xs text-black/60">{announcedTooltipText(ev.announcedAt) ?? "Sellout likely"}</p>
                    </div>
                  )}

                  <p className="text-base md:text-sm text-black/90 leading-relaxed">{ev.summary}</p>

                  {(ev.ticketUrl || ev.sourceUrl) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ev.ticketUrl && (
                        <a
                          href={ev.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 bg-black text-white font-black uppercase text-sm md:text-xs tracking-wide px-5 py-3 md:px-4 md:py-2 hover:bg-[#FE6B41] transition-colors"
                        >
                          Get Tickets ↗
                        </a>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 border-2 border-black text-black font-black uppercase text-sm md:text-xs tracking-wide px-5 py-3 md:px-4 md:py-2 hover:bg-black hover:text-white transition-colors"
                        >
                          Original Post ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
            const todayStr = localDateStr();
            const prevDateStr = addCalDays(calDaySheet.date, -1);
            const nextDateStr = addCalDays(calDaySheet.date, 1);
            const goToDay = (date: string) => setCalDaySheet({ date });
            const { all: dayEvents, startingToday, stillGoing } = splitDayEvents(filteredEvents, calDaySheet.date);
            const renderRow = (ev: ArtEvent, i: number, keyPrefix: string, showThrough: boolean) => (
              <button
                key={`${keyPrefix}-${ev.id}-${i}`}
                onClick={() => { setCalEventDetailFrom({ date: calDaySheet.date }); setCalDaySheet(null); setCalEventDetail(ev); }}
                className={`w-full text-left px-5 py-3 hover:bg-[#FEABDA]/40 transition-colors flex items-center gap-3 ${ev.soldOut ? "opacity-50" : ""}`}
              >
                <span className="text-xl flex-shrink-0">{ev.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-bold text-black truncate ${ev.soldOut ? "line-through" : ""}`}>{ev.name}</div>
                    {ev.soldOut && (
                      <span className="flex-shrink-0 text-[10px] font-black uppercase leading-none px-1.5 py-1 bg-black text-white">SOLD OUT</span>
                    )}
                  </div>
                  <div className="text-xs text-black/60 truncate">
                    {ev.startTime && /^\d{1,2}:\d{2}$/.test(ev.startTime) && <span className="font-semibold text-black/80">{formatTime(ev.startTime)} · </span>}
                    {ev.venue}{ev.neighborhood ? ` · ${ev.neighborhood}` : ''}
                  </div>
                  {showThrough && <div className="text-xs text-black/50 font-semibold">Through {formatMonthDay(spanEnd(ev))}</div>}
                  {ev.price && <div className="text-xs text-black/50">{ev.price}</div>}
                </div>
                <ChevronRight className="w-4 h-4 text-black/30 flex-shrink-0 ml-auto" />
              </button>
            );
            return (
              <>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2" style={{ backgroundColor: AN_BG }}>
                  <button
                    onClick={() => goToDay(prevDateStr)}
                    disabled={prevDateStr < todayStr}
                    className="p-1 rounded-full hover:bg-black/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-5 h-5 text-black" />
                  </button>
                  <div className="text-center min-w-0">
                    <h2 className="text-base font-black uppercase text-black truncate">{label}</h2>
                    <p className="text-xs text-black/60 mt-0.5">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={() => goToDay(nextDateStr)}
                    className="p-1 rounded-full hover:bg-black/10 transition-colors flex-shrink-0"
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-5 h-5 text-black" />
                  </button>
                </div>
                <div className="divide-y divide-black/10 bg-white max-h-[60vh] overflow-y-auto">
                  {dayEvents.length === 0 && (
                    <div className="px-5 py-8 text-center text-sm text-black/40">No events this day</div>
                  )}
                  {startingToday.map((ev, i) => renderRow(ev, i, 'start', false))}
                  {stillGoing.length > 0 && (
                    <div className="px-5 py-1.5 bg-black/5 flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-black/40">Still Time</span>
                    </div>
                  )}
                  {stillGoing.map((ev, i) => renderRow(ev, i, 'still', true))}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
