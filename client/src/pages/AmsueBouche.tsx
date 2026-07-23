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
import { cuisineTypes, restaurantCuisineTypes, denverNeighborhoods, restaurantPricePoints, type FoodEvent, type InsertFoodEvent, type Restaurant } from "@shared/schema";
import { UtensilsCrossed, Plus, Sparkles, List, MoreVertical, Users, ImageIcon, FileText, ChevronDown, Calendar, CalendarDays, ChevronLeft, ChevronRight, ArrowUpDown, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getWeekRange, getWeekOfMonth } from "@/lib/utils";
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
const AB_ORANGE = "#FE6B41";
const AB_PINK   = "#FEABDA";
const AB_GOLD   = "#FFF8E7";
const AB_TEAL   = "#41F2EE";

// ── Neighborhood groups ───────────────────────────────────────────────────────
const INNER_DENVER_NEIGHBORHOODS = new Set([
  'Baker & South Broadway',
  'Capitol Hill & Uptown',
  'Cherry Creek & Glendale',
  'Downtown & LoDo',
  'Federal Blvd',
  'Highlands & LoHi',
  'RiNo & Five Points',
  "Sloan's Lake",
  'Stapleton & Central Park',
  'Sunnyside & Berkeley',
  'University Hills',
  'Wash Park & Platt Park',
]);
const SUBURB_NEIGHBORHOODS = ['Aurora', 'Boulder', 'DTC & Tech Center', 'Golden', 'Lakewood', 'Westminster', 'Other'];

const BAR_CUISINES = new Set(['Bar', 'Dive', 'Cocktails', 'Beer', 'Wine']);
const SHOP_CUISINES = new Set(['Grocery & Market']);
// Tags that describe venue type/attributes, not cuisine — shown separately in modal, no count limit
const VENUE_ATTR_TAGS = new Set(['Bar', 'Cafe', 'Dive', 'Cocktails', 'Beer', 'Wine', 'Coffee', 'Tea', 'Grocery & Market', 'Happy Hour', 'Patio']);
const VENUE_ATTR_LIST = ['Bar', 'Cafe', 'Dive', 'Cocktails', 'Beer', 'Wine', 'Coffee', 'Tea', 'Grocery & Market', 'Happy Hour', 'Patio'];

// ── Event Row (inline sentence style, matching Setlist Social) ────────────────

// Config for the shared <ListingEventRow>. Anything here is the "on/off
// switch" for this feed — Food currently shows a standalone recurring badge
// before the summary (renderRecurringNote) and a "live Xd/w" + risk-pip
// cluster (renderLiveBadge) instead of Arts' recurring-label version.
const foodRowConfig: ListingRowConfig<FoodEvent> = {
  apiPath: "/api/food-events",
  queryKey: "/api/food-events",
  dialogBg: AB_GOLD,
  deleteTitle: "Delete this popup?",
  soldOutRestoreLabel: "Back on the menu",
  ticketLabel: "Reserve",
  ticketTextColorClass: "text-[#FEABDA]",
  getCategory: (event) => event.cuisine,
  renderLiveBadge: (event) => {
    const live = daysLive(event.announcedAt);
    const risk = riskPips(event.selloutRisk);
    if (!live && !risk) return null;
    return (
      <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#FFB700" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
        {live && `· live ${live}`}
        {risk && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{live ? " " : "· "}{risk}</span>}
      </span>
    );
  },
  renderRecurringNote: (event) => event.isRecurring ? (
    <span className="inline-flex items-center align-middle mr-1.5 text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-black/10 text-black/70">
      ↻ {event.recurrenceLabel || "Recurring"}
    </span>
  ) : null,
  renderInstanceNote: (note) => (
    <span className="block text-xs text-black/60 mt-0.5 ml-1">
      ↳ {note}
    </span>
  ),
  EditModal: EditFoodEventModal,
};

const foodCalendarConfig: ListingCalendarConfig<FoodEvent> = {
  cellBg: AB_GOLD,
  guardRecurringMultiDaySpillover: false,
};

// ── Edit Food Event Modal ──────────────────────────────────────────────────────

// Config for the shared Add/Edit form. Food doesn't use the specific-dates
// batch-add feature (features.specificDatesBatchAdd: false) — recurring
// itself is available on both feeds.
const foodFormConfig: ListingFormConfig<InsertFoodEvent> = {
  idPrefix: "ab",
  apiPath: "/api/food-events",
  queryKey: "/api/food-events",
  dialogBg: AB_GOLD,

  categoryFieldKey: "cuisine",
  categoryLabel: "Cuisine",
  categoryOptions: cuisineTypes,

  venueLabel: "Venue / Restaurant",
  namePlaceholder: "Hot Pot Pop-Up Nights",
  venuePlaceholder: "Hop Alley",
  neighborhoodPlaceholder: "RiNo, LoHi…",
  emojiPlaceholder: "🫕",
  pricePlaceholder: "$55/person",
  recurrenceLabelPlaceholder: "e.g. Every Thursday, 1st Sunday monthly…",
  instanceNotePlaceholder: "e.g. Special prix-fixe menu this week",
  descriptionPlaceholderAdd: "Sensory snapshot — food, vibe, atmosphere. Name the shop/chef if it adds something.",
  descriptionPlaceholderEdit: "Sensory snapshot — food, vibe, atmosphere. Name the shop/chef if it adds something.",
  sourceUrlPlaceholder: "https://instagram.com/p/… or eventbrite link",

  addModalTitle: "Add a Popup",
  editModalTitle: "Edit Popup",
  addSubmitLabel: "Add Popup",
  createToastTitle: "Popup added!",
  discardDescriptionEdit: "You have unsaved edits. They'll be lost if you close now.",

  screenshotIntro: "Upload a screenshot from Instagram, Eventbrite, or anywhere — AI will read the text directly from the image.",
  blurbIntro: "Paste a caption or description from social media — AI will extract the event details.",
  blurbPlaceholder: `e.g.\n\nhopalleydenver\n\nWe are happy to announce our Hop Alley Hot Pot Pop-Up Nights! On March 26-28…`,

  parseEndpoint: "/api/ai/parse-blurb",
  redoEndpoint: "/api/ai/redo-food-event-content",
  buildRedoPayload: (form) => ({
    name: form.name,
    venue: form.venue,
    cuisine: form.cuisine,
    dateStart: form.dateStart,
    currentSummary: form.summary,
  }),
  applyRedoResponse: (res, { setForm }) => {
    if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
    if (res.status === "no-info") {
      return { title: "Description polished ✓", description: res.message || "No new details found online." };
    }
    return { title: "Content refreshed ✨", description: "Description updated with latest details." };
  },
  applyParseResponse: (data, { blurb, form, setForm }) => {
    setForm({ ...data, rawBlurb: blurb, sourceUrl: form.sourceUrl || "", requester: form.requester || "" });
    return { title: "Blurb parsed!", description: "Review the details below." };
  },

  getMissingField: (form) => {
    if (!form.requester?.trim()) return { field: "requester", label: "Your name" };
    if (!form.name?.trim())      return { field: "name",      label: "Event name" };
    if (!form.venue?.trim())     return { field: "venue",     label: "Venue / restaurant" };
    if (!form.dateStart?.trim()) return { field: "dateStart", label: "Start date" };
    if (!form.emoji?.trim())     return { field: "emoji",     label: "Emoji" };
    if (!form.cuisine?.trim())   return { field: "cuisine",   label: "Cuisine type" };
    return null;
  },
  BLANK: {
    emoji: "", name: "", venue: "", neighborhood: "",
    dateStart: "", dateEnd: "", startTime: "", summary: "",
    cuisine: "", price: "", ticketUrl: "", sourceUrl: "", rawBlurb: "", requester: "",
    announcedAt: "", selloutRisk: undefined,
    isRecurring: false, recurrenceLabel: "",
  },

  features: {
    specificDatesBatchAdd: false,
  },
};

function EditFoodEventModal({ event, onClose }: { event: FoodEvent; onClose: () => void }) {
  return <EditListingEventModal event={event} onClose={onClose} config={foodFormConfig} />;
}

// ── Restaurant Row ────────────────────────────────────────────────────────────

function RestaurantRow({ restaurant, onEdit, onDelete }: {
  restaurant: Restaurant;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(restaurant.name + " Denver restaurant")}`;
  return (
    <li className="flex items-start gap-3 py-3.5 border-b border-black/10 group last:border-0">
      <span className="text-2xl flex-shrink-0 mt-0.5">{restaurant.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer"
                      className="font-black uppercase text-black text-sm leading-tight underline decoration-dotted underline-offset-2 hover:opacity-70 transition-opacity">
                      {restaurant.name}
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                    Opens Google search
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {restaurant.pricePoint && (
                <span className="text-[11px] font-bold text-black/50 leading-none">{restaurant.pricePoint}</span>
              )}
              {restaurant.michelinStar && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-base leading-none cursor-default select-none">⭐</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                      Michelin Star
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {restaurant.hotNew && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-base leading-none cursor-default select-none">🔥</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                      Hot &amp; New
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(restaurant as any).fixture && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-base leading-none cursor-default select-none">📌</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                      Fixture
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(restaurant as any).foodTruck && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-base leading-none cursor-default select-none">🚚</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                      Food Truck
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(restaurant as any).jamesBeard && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-base leading-none cursor-default select-none">🏆</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                      James Beard
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {restaurant.neighborhood && (
              <p className="text-[11px] text-black/40 font-medium mt-0.5 leading-none">{restaurant.neighborhood}</p>
            )}
            <p className="text-sm text-black/75 mt-1 leading-snug">{restaurant.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(restaurant.cuisine ?? []).map(c => (
                <span key={c} className="text-[11px] font-bold border border-black/25 px-2 py-0.5 rounded-full text-black/60">{c}</span>
              ))}
            </div>
          </div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm"
                className="h-7 w-7 p-0 flex items-center justify-center rounded-full bg-transparent opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
              <DropdownMenuItem onClick={() => { setMenuOpen(false); onEdit(); }}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none">
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                onClick={() => { setMenuOpen(false); onDelete(); }}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

// ── Restaurant Modal (Add + Edit) ─────────────────────────────────────────────

function RestaurantModal({ mode, initial, onClose }: {
  mode: "add" | "edit";
  initial?: Restaurant;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    emoji: initial?.emoji ?? "🍽️",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    cuisine: (initial?.cuisine ?? []) as string[],
    pricePoint: initial?.pricePoint ?? "$$",
    neighborhood: initial?.neighborhood ?? denverNeighborhoods[0],
    hotNew: initial?.hotNew ?? false,
    michelinStar: initial?.michelinStar ?? false,
    jamesBeard: (initial as any)?.jamesBeard ?? false,
    fixture: (initial as any)?.fixture ?? false,
    foodTruck: (initial as any)?.foodTruck ?? false,
  });

  const [aiLoading, setAiLoading] = useState(false);

  const toggleCuisine = (c: string) => {
    setForm(f => {
      const has = f.cuisine.includes(c);
      if (has) return { ...f, cuisine: f.cuisine.filter(x => x !== c) };
      const foodCount = f.cuisine.filter(x => !VENUE_ATTR_TAGS.has(x)).length;
      if (!VENUE_ATTR_TAGS.has(c) && foodCount >= 3) return f;
      return { ...f, cuisine: [...f.cuisine, c] };
    });
  };

  const handleAIFill = async () => {
    if (!form.name.trim()) {
      toast({ title: "Enter a name first", description: "Type the restaurant name, then click AI Fill.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    try {
      const result = await apiRequest({ endpoint: "/api/ai/fill-restaurant", method: "POST", data: { name: form.name.trim() } });
      setForm(f => ({
        ...f,
        ...(result.emoji ? { emoji: result.emoji } : {}),
        ...(result.description ? { description: result.description } : {}),
        ...(result.cuisine?.length ? { cuisine: result.cuisine } : {}),
        ...(result.pricePoint ? { pricePoint: result.pricePoint } : {}),
        ...(result.neighborhood ? { neighborhood: result.neighborhood } : {}),
        ...(typeof result.hotNew === "boolean" ? { hotNew: result.hotNew } : {}),
        ...(typeof result.michelinStar === "boolean" ? { michelinStar: result.michelinStar } : {}),
      }));
      toast({ title: "Filled with AI ✨", description: "Always verify chef names and accolades — AI gets those wrong sometimes." });
    } catch {
      toast({ title: "AI fill failed", description: "Check the restaurant name and try again.", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => mode === "add"
      ? apiRequest({ endpoint: "/api/restaurants", method: "POST", data: form })
      : apiRequest({ endpoint: `/api/restaurants/${initial!.id}`, method: "PATCH", data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/restaurants"] });
      toast({ title: mode === "add" ? "Restaurant added!" : "Restaurant updated!" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Something went wrong.", variant: "destructive" }),
  });

  const isValid = form.name.trim() && form.description.trim() && form.cuisine.length > 0 && form.pricePoint && form.neighborhood;

  const foodCuisineCount = form.cuisine.filter(c => !VENUE_ATTR_TAGS.has(c)).length;
  const cuisineChips = (
    <div className="space-y-3">
      {/* Food cuisine tags — max 3 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs font-bold uppercase">Cuisine * <span className="font-normal normal-case opacity-50">(up to 3)</span></Label>
          {foodCuisineCount > 0 && (
            <span className="text-[10px] text-black/50">{foodCuisineCount}/3</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {[...restaurantCuisineTypes].filter(c => !VENUE_ATTR_TAGS.has(c)).sort().map(c => {
            const selected = form.cuisine.includes(c);
            const maxed = foodCuisineCount >= 3 && !selected;
            return (
              <button key={c} type="button"
                onClick={() => !maxed && toggleCuisine(c)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                  selected
                    ? "bg-black text-white border-black"
                    : maxed
                      ? "bg-white text-black/25 border-black/10 cursor-not-allowed"
                      : "bg-white text-black/55 border-black/20 hover:border-black hover:text-black"
                }`}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
      {/* Venue attributes — unlimited */}
      <div>
        <Label className="text-xs font-bold uppercase">Venue Attributes <span className="font-normal normal-case opacity-50">(pick any)</span></Label>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {VENUE_ATTR_LIST.map(c => {
            const selected = form.cuisine.includes(c);
            return (
              <button key={c} type="button"
                onClick={() => toggleCuisine(c)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                  selected
                    ? "bg-black text-white border-black"
                    : "bg-white text-black/55 border-black/20 hover:border-black hover:text-black"
                }`}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md sm:max-w-2xl rounded-none border-2 border-black p-0 overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{mode === "add" ? "Add Restaurant" : "Edit Restaurant"}</DialogTitle>
        <div className="px-6 pt-4 pb-3" style={{ backgroundColor: AB_ORANGE }}>
          <h2 className="font-black uppercase text-black text-lg">
            {mode === "add" ? "Add Restaurant" : "Edit Restaurant"}
          </h2>
        </div>

        {/* Body: single column on mobile, two columns on desktop */}
        <div className="bg-white sm:flex sm:divide-x sm:divide-black/10 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Left column — main fields */}
          <div className="px-6 py-4 space-y-3 flex-1">
            {/* Emoji + Name row */}
            <div className="flex gap-3">
              <div className="w-16 flex-shrink-0">
                <Label className="text-xs font-bold uppercase">Emoji</Label>
                <Input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  className="mt-1 rounded-none border-black text-center text-xl h-9" maxLength={4} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold uppercase">Name *</Label>
                  <button type="button" onClick={handleAIFill} disabled={aiLoading}
                    className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 border border-black hover:opacity-75 transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: aiLoading ? "#e5e5e5" : "#41F2EE" }}>
                    <Sparkles className="w-2.5 h-2.5" />
                    {aiLoading ? "Searching…" : "AI Fill"}
                  </button>
                </div>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Restaurant name" className="rounded-none border-black h-9" />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs font-bold uppercase">Description *</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What to order, the vibe, who it's for…" rows={5}
                className="mt-1 rounded-none border-black resize-y min-h-[100px]" />
            </div>

            {/* Price + Neighborhood */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">Price *</Label>
                <Select value={form.pricePoint} onValueChange={v => setForm(f => ({ ...f, pricePoint: v }))}>
                  <SelectTrigger className="mt-1 rounded-none border-black h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {restaurantPricePoints.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Neighborhood *</Label>
                <Select value={form.neighborhood} onValueChange={v => setForm(f => ({ ...f, neighborhood: v }))}>
                  <SelectTrigger className="mt-1 rounded-none border-black h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {denverNeighborhoods.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Hot New + Michelin + Fixture */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="hotNew" checked={form.hotNew}
                  onChange={e => setForm(f => ({ ...f, hotNew: e.target.checked }))}
                  className="w-4 h-4 rounded border-black accent-black cursor-pointer" />
                <label htmlFor="hotNew" className="text-xs font-bold uppercase cursor-pointer select-none">
                  🔥 Hot &amp; New <span className="font-normal normal-case opacity-50">(opened this year)</span>
                </label>
              </div>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="michelinStar" checked={form.michelinStar}
                  onChange={e => setForm(f => ({ ...f, michelinStar: e.target.checked }))}
                  className="w-4 h-4 rounded border-black accent-black cursor-pointer" />
                <label htmlFor="michelinStar" className="text-xs font-bold uppercase cursor-pointer select-none">
                  ⭐ Michelin <span className="font-normal normal-case opacity-50">(Michelin starred or recognized)</span>
                </label>
              </div>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="fixture" checked={(form as any).fixture ?? false}
                  onChange={e => setForm(f => ({ ...f, fixture: e.target.checked } as any))}
                  className="w-4 h-4 rounded border-black accent-black cursor-pointer" />
                <label htmlFor="fixture" className="text-xs font-bold uppercase cursor-pointer select-none">
                  📌 Fixture <span className="font-normal normal-case opacity-50">(a Denver institution)</span>
                </label>
              </div>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="foodTruck" checked={(form as any).foodTruck ?? false}
                  onChange={e => setForm(f => ({ ...f, foodTruck: e.target.checked } as any))}
                  className="w-4 h-4 rounded border-black accent-black cursor-pointer" />
                <label htmlFor="foodTruck" className="text-xs font-bold uppercase cursor-pointer select-none">
                  🚚 Food Truck
                </label>
              </div>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="jamesBeard" checked={(form as any).jamesBeard ?? false}
                  onChange={e => setForm(f => ({ ...f, jamesBeard: e.target.checked } as any))}
                  className="w-4 h-4 rounded border-black accent-black cursor-pointer" />
                <label htmlFor="jamesBeard" className="text-xs font-bold uppercase cursor-pointer select-none">
                  🏆 James Beard <span className="font-normal normal-case opacity-50">(winner or nominee)</span>
                </label>
              </div>
            </div>

            {/* Cuisine chips — mobile only */}
            <div className="sm:hidden pt-1">
              {cuisineChips}
            </div>
          </div>

          {/* Right column — cuisine chips, desktop only */}
          <div className="hidden sm:flex sm:flex-col w-72 px-5 py-4 flex-shrink-0">
            <div className="overflow-y-auto flex-1 pr-1" style={{ maxHeight: "calc(90vh - 200px)" }}>
              {cuisineChips}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-black/10 flex gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-none border-black flex-1">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}
            className="rounded-none flex-1 font-black uppercase text-black hover:opacity-80"
            style={{ backgroundColor: AB_ORANGE }}>
            {mutation.isPending ? "Saving…" : mode === "add" ? "Add Restaurant" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AmsueBouche() {
  const [addOpen, setAddOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calViewYear, setCalViewYear] = useState(() => new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(() => new Date().getMonth());
  const [calEventDetail, setCalEventDetail] = useState<FoodEvent | null>(null);
  const [calDaySheet, setCalDaySheet] = useState<{ date: string; events: FoodEvent[] } | null>(null);
  const [calEventDetailFrom, setCalEventDetailFrom] = useState<{ date: string; events: FoodEvent[] } | null>(null);
  const [calDetailMenuOpen, setCalDetailMenuOpen] = useState(false);
  const [calDetailEditOpen, setCalDetailEditOpen] = useState(false);
  const [calDetailDeleteConfirm, setCalDetailDeleteConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "added">(() => new URLSearchParams(window.location.search).get("sort") === "added" ? "added" : "date");
  const [filterCuisine, setFilterCuisine] = useState(() => new URLSearchParams(window.location.search).get("evCuisine") || "all");
  const [filterDay, setFilterDay] = useState(() => new URLSearchParams(window.location.search).get("evDay") || "all");
  const [pageTab, setPageTab] = useState<"events" | "bestOf">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "best-of" ? "bestOf" : "events";
  });

  const switchTab = (tab: "events" | "bestOf") => {
    setPageTab(tab);
    const url = new URL(window.location.href);
    if (tab === "bestOf") {
      url.searchParams.set("tab", "best-of");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", url.toString());
  };
  const [restaurantAddOpen, setRestaurantAddOpen] = useState(false);
  const [restaurantToEdit, setRestaurantToEdit] = useState<Restaurant | null>(null);
  const [restaurantToDelete, setRestaurantToDelete] = useState<Restaurant | null>(null);
  const [filterRVenueType, setFilterRVenueType] = useState<"all" | "restaurant" | "bar" | "cafe" | "shop">(() => {
    const p = new URLSearchParams(window.location.search);
    return (p.get("type") as any) || "all";
  });
  const [filterRCuisine, setFilterRCuisine] = useState(() => new URLSearchParams(window.location.search).get("cuisine") || "all");
  const [filterRNeighborhood, setFilterRNeighborhood] = useState(() => new URLSearchParams(window.location.search).get("neighborhood") || "all");
  const [filterRPrice, setFilterRPrice] = useState(() => new URLSearchParams(window.location.search).get("price") || "all");
  const [filterRBadge, setFilterRBadge] = useState<"all" | "hotNew" | "michelin" | "jamesBeard" | "fixture" | "foodTruck" | "happyHour" | "patio">(() => {
    const p = new URLSearchParams(window.location.search);
    return (p.get("spot") as any) || "all";
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (pageTab === "bestOf") {
      filterRVenueType !== "all" ? url.searchParams.set("type", filterRVenueType) : url.searchParams.delete("type");
      filterRCuisine !== "all" ? url.searchParams.set("cuisine", filterRCuisine) : url.searchParams.delete("cuisine");
      filterRNeighborhood !== "all" ? url.searchParams.set("neighborhood", filterRNeighborhood) : url.searchParams.delete("neighborhood");
      filterRPrice !== "all" ? url.searchParams.set("price", filterRPrice) : url.searchParams.delete("price");
      filterRBadge !== "all" ? url.searchParams.set("spot", filterRBadge) : url.searchParams.delete("spot");
      ["evCuisine", "evDay", "sort"].forEach(k => url.searchParams.delete(k));
    } else {
      filterCuisine !== "all" ? url.searchParams.set("evCuisine", filterCuisine) : url.searchParams.delete("evCuisine");
      filterDay !== "all" ? url.searchParams.set("evDay", filterDay) : url.searchParams.delete("evDay");
      sortBy !== "date" ? url.searchParams.set("sort", sortBy) : url.searchParams.delete("sort");
      ["type", "cuisine", "neighborhood", "price", "spot"].forEach(k => url.searchParams.delete(k));
    }
    window.history.replaceState({}, "", url.toString());
  }, [pageTab, filterRVenueType, filterRCuisine, filterRNeighborhood, filterRPrice, filterRBadge, filterCuisine, filterDay, sortBy]);

  const prevCalMonth = () => {
    if (calViewMonth === 0) { setCalViewMonth(11); setCalViewYear(y => y - 1); }
    else setCalViewMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    if (calViewMonth === 11) { setCalViewMonth(0); setCalViewYear(y => y + 1); }
    else setCalViewMonth(m => m + 1);
  };

  const { data: events = [], isLoading } = useQuery<FoodEvent[]>({
    queryKey: ["/api/food-events"],
  });

  const { data: restaurantList = [], isLoading: restaurantsLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
  });

  const { toast } = useToast();
  const qcMain = useQueryClient();

  const calDetailSoldOutMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/food-events/${calEventDetail!.id}`, method: "PATCH", data: { soldOut: !calEventDetail!.soldOut } }),
    onSuccess: () => {
      qcMain.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: calEventDetail?.soldOut ? "Back on the menu" : "Marked as sold out", description: calEventDetail?.name });
      setCalEventDetail(null); setCalEventDetailFrom(null);
    },
    onError: () => toast({ title: "Error", description: "Couldn't update this event.", variant: "destructive" }),
  });

  const calDetailDeleteMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/food-events/${calEventDetail!.id}`, method: "DELETE" }),
    onSuccess: () => {
      qcMain.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Deleted", description: `${calEventDetail?.name} removed.` });
      setCalDetailDeleteConfirm(false); setCalEventDetail(null); setCalEventDetailFrom(null);
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete this event.", variant: "destructive" }),
  });

  const deleteRestaurantMutation = useMutation({
    mutationFn: (id: number) => apiRequest({ endpoint: `/api/restaurants/${id}`, method: "DELETE" }),
    onSuccess: () => {
      qcMain.invalidateQueries({ queryKey: ["/api/restaurants"] });
      toast({ title: "Removed", description: `${restaurantToDelete?.name} deleted.` });
      setRestaurantToDelete(null);
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete.", variant: "destructive" }),
  });

  const filteredRestaurants = restaurantList
    .filter(r => {
      const cuisine = r.cuisine ?? [];
      if (filterRVenueType === "bar" && !cuisine.includes('Bar')) return false;
      if (filterRVenueType === "cafe" && !cuisine.includes('Cafe')) return false;
      if (filterRVenueType === "shop" && !cuisine.some(c => SHOP_CUISINES.has(c))) return false;
      if (filterRVenueType === "restaurant" && !cuisine.some(c => !BAR_CUISINES.has(c) && !SHOP_CUISINES.has(c))) return false;
      if (filterRCuisine !== "all" && !cuisine.includes(filterRCuisine)) return false;
      if (filterRNeighborhood === "inner_denver" && !INNER_DENVER_NEIGHBORHOODS.has(r.neighborhood)) return false;
      if (filterRNeighborhood !== "all" && filterRNeighborhood !== "inner_denver" && r.neighborhood !== filterRNeighborhood) return false;
      if (filterRPrice !== "all" && r.pricePoint !== filterRPrice) return false;
      if (filterRBadge === "hotNew" && !r.hotNew) return false;
      if (filterRBadge === "michelin" && !r.michelinStar) return false;
      if (filterRBadge === "jamesBeard" && !(r as any).jamesBeard) return false;
      if (filterRBadge === "fixture" && !(r as any).fixture) return false;
      if (filterRBadge === "foodTruck" && !(r as any).foodTruck) return false;
      if (filterRBadge === "happyHour" && !cuisine.includes('Happy Hour')) return false;
      if (filterRBadge === "patio" && !cuisine.includes('Patio')) return false;
      return true;
    })
    .sort((a, b) => a.name.trim().localeCompare(b.name.trim()));

  const hasActiveRestaurantFilters = filterRVenueType !== "all" || filterRCuisine !== "all" || filterRNeighborhood !== "all" || filterRPrice !== "all" || filterRBadge !== "all";
  const resetRestaurantFilters = () => {
    setFilterRVenueType("all"); setFilterRCuisine("all"); setFilterRNeighborhood("all");
    setFilterRPrice("all"); setFilterRBadge("all");
  };

  const expandedEvents = expandRecurringEvents(events);

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
  const weekendDates = (() => {
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
    if (filterCuisine !== "all" && ev.cuisine !== filterCuisine) return false;
    if (filterDay !== "all") {
      const [y, mo, dy] = ev.dateStart.split("-").map(Number);
      const d = new Date(y, mo - 1, dy);
      if (filterDay === "today")    { if (ev.dateStart !== todayStr) return false; }
      else if (filterDay === "tomorrow") { if (ev.dateStart !== tomorrowStr) return false; }
      else if (filterDay === "weekend")  { if (!weekendDates.has(ev.dateStart)) return false; }
      else { if (d.getDay().toString() !== filterDay) return false; }
    }
    return true;
  });

  const hasActiveFilters = filterCuisine !== "all" || filterDay !== "all" || sortBy !== "date";
  const resetFilters = () => { setFilterCuisine("all"); setFilterDay("all"); setSortBy("date"); };

  type MonthBucket = { events: FoodEvent[]; weekGroups: Record<string, { events: FoodEvent[] }> };
  const grouped = filteredEvents.reduce<Record<string, MonthBucket>>((acc, ev) => {
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: AB_GOLD }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 shadow-md px-4 py-3" style={{ backgroundColor: AB_ORANGE }}>
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 group outline-none">
                  <h1 className="text-3xl md:text-4xl text-black group-hover:text-[#41F2EE] transition-colors font-black">
                    AMUSE-BOUCHE INSIDER
                  </h1>
                  <ChevronDown className="h-4 w-4 text-black group-hover:text-[#41F2EE] transition-colors shrink-0 self-center" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-none border-2 border-black bg-black text-white p-0 min-w-[240px]">
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#FEABDA] focus:text-black px-4 py-3 cursor-pointer">
                    <a href={siteUrls.setlist} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎵 SETLIST SOCIAL FEED
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#F2F0FF] focus:text-black px-4 py-3 cursor-pointer">
                    <a href={siteUrls.artistryNerdistry} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎨 ARTISTRY/NERDISTRY LIVE
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
                      className="text-black hover:text-[#41F2EE] transition-colors"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>Subscribe to calendar</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <a href="https://www.meetup.com/amuse-bouche/"
                target="_blank" rel="noopener noreferrer"
                className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>Meetup</span>
              </a>
              {pageTab === "events"
                ? <button onClick={() => setAddOpen(true)}
                    className="bg-black text-[#FEABDA] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-1.5 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" />Popup
                  </button>
                : <button onClick={() => setRestaurantAddOpen(true)}
                    className="bg-black text-[#FEABDA] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-1.5 transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" />Foodie Gem
                  </button>
              }
            </div>
          </div>
        </div>
      </nav>

      {/* Section tabs — below nav, part of content flow */}
      <div className="border-b border-black/12 px-4" style={{ backgroundColor: AB_GOLD }}>
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => switchTab("events")}
            className={`text-xs font-black uppercase tracking-widest px-5 py-2.5 border-b-2 transition-colors ${pageTab === "events" ? "border-black text-black" : "border-transparent text-black/35 hover:text-black"}`}
          >
            Popups
          </button>
          <button
            onClick={() => switchTab("bestOf")}
            className={`text-xs font-black uppercase tracking-widest px-5 py-2.5 border-b-2 transition-colors ${pageTab === "bestOf" ? "border-black text-black" : "border-transparent text-black/35 hover:text-black"}`}
          >
            Best Of Denver
          </button>
        </div>
      </div>

      {/* ── Feed ── */}
      {pageTab === "events" && (
      <main className={`container mx-auto px-4 py-6 flex-1 transition-all duration-200 ${viewMode === "calendar" ? "max-w-5xl" : "max-w-2xl"}`}>

        <p className="text-xs text-black mb-4 opacity-60 leading-snug">
          Pop-ups fill up fast! If something looks good, act on it.
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
                  {recentCount} {recentCount === 1 ? "popup" : "popups"}
                </button>
                {' '}added in the last week.
              </p>
            </div>
          );
        })()}

        {/* Filter row */}
        {!isLoading && events.length > 0 && (
          <div className="mb-5">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-2 items-center" style={{ minWidth: "max-content" }}>
                {/* View mode toggle */}
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

                {/* Sort dropdown — hidden in calendar mode */}
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
                {/* Separator */}
                <div className="h-6 w-px bg-black opacity-40 mx-1 flex-shrink-0" />

                {/* Cuisine filter */}
                <Select value={filterCuisine} onValueChange={setFilterCuisine}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filterCuisine !== "all" ? "bg-white text-black" : "text-black hover:border-white"
                  }`} style={{ width: "160px", backgroundColor: filterCuisine !== "all" ? "white" : AB_GOLD }}>
                    <SelectValue placeholder="All Cuisine" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] overflow-y-auto">
                    <SelectItem value="all">All Cuisine</SelectItem>
                    <SelectSeparator />
                    {[...cuisineTypes].sort().map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Day of week filter */}
                <Select value={filterDay} onValueChange={setFilterDay}>
                  <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0 ${
                    filterDay !== "all" ? "bg-white text-black" : "text-black hover:border-white"
                  }`} style={{ width: "148px", backgroundColor: filterDay !== "all" ? "white" : AB_GOLD }}>
                    <SelectValue placeholder="All Days" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] overflow-y-auto">
                    <SelectItem value="all">All Days</SelectItem>
                    <SelectSeparator />
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="weekend">This Weekend</SelectItem>
                    <SelectSeparator />
                    <SelectItem value="0">Sundays</SelectItem>
                    <SelectItem value="1">Mondays</SelectItem>
                    <SelectItem value="2">Tuesdays</SelectItem>
                    <SelectItem value="3">Wednesdays</SelectItem>
                    <SelectItem value="4">Thursdays</SelectItem>
                    <SelectItem value="5">Fridays</SelectItem>
                    <SelectItem value="6">Saturdays</SelectItem>
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
            <UtensilsCrossed className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Loading the good stuff…</p>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="text-center py-16">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-2xl text-black uppercase mb-1">Nothing on the menu yet.</p>
            <p className="text-sm text-gray-600 mb-4">Be the first to add a popup.</p>
            <button onClick={() => setAddOpen(true)}
              className="bg-black text-white font-black uppercase tracking-wide text-sm px-6 py-2.5 border-2 border-black hover:text-[#41F2EE] transition-colors inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />Add a Popup
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
            onDayOverflowClick={(date, evs) => setCalDaySheet({ date, events: evs })}
            config={foodCalendarConfig}
          />
        )}

        {viewMode === "list" && sortBy === "added" && (() => {
          const now = new Date();
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dayOfWeek = todayDate.getDay();
          const startOfWeek = new Date(todayDate);
          startOfWeek.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

          const getGroup = (ev: FoodEvent): "today" | "week" | "month" | "earlier" => {
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
          const buckets: { key: "today" | "week" | "month" | "earlier"; label: string; events: FoodEvent[] }[] = [
            { key: "today",   label: "Added today",        events: [] },
            { key: "week",    label: "Added this week",    events: [] },
            { key: "month",   label: "Added this month",   events: [] },
            { key: "earlier", label: "Added earlier",      events: [] },
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
                  <ListingEventRow key={ev.id} event={ev} config={foodRowConfig} />
                ))}
              </ul>
            </div>
          ));
        })()}

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
                        <ListingEventRow key={ev.id} event={ev} config={foodRowConfig} />
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
      )}

      {/* ── Best Of Denver ── */}
      {pageTab === "bestOf" && (
        <main className="container mx-auto px-4 py-6 flex-1 max-w-2xl">
          <p className="text-xs text-black mb-4 opacity-60 leading-snug">
            Foodie gems around Denver worth going back to.
          </p>

          {/* Filter row */}
          {restaurantList.length > 0 && (
            <div className="mb-5">
              <div className="overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 pb-2 items-center" style={{ minWidth: "max-content" }}>
                  <Select value={filterRVenueType} onValueChange={v => setFilterRVenueType(v as any)}>
                    <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0`}
                      style={{ width: "140px", backgroundColor: filterRVenueType !== "all" ? "white" : AB_GOLD }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectSeparator />
                      <SelectItem value="restaurant">Restaurants</SelectItem>
                      <SelectItem value="bar">Bars</SelectItem>
                      <SelectItem value="cafe">Cafes</SelectItem>
                      <SelectItem value="shop">Shops</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterRCuisine} onValueChange={setFilterRCuisine}>
                    <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0`}
                      style={{ width: "160px", backgroundColor: filterRCuisine !== "all" ? "white" : AB_GOLD }}>
                      <SelectValue placeholder="All Cuisine" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px] overflow-y-auto">
                      <SelectItem value="all">All Cuisine</SelectItem>
                      <SelectSeparator />
                      {[...new Set(restaurantList.flatMap(r => r.cuisine ?? []))].filter(c => !VENUE_ATTR_TAGS.has(c)).sort().map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterRNeighborhood} onValueChange={setFilterRNeighborhood}>
                    <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0`}
                      style={{ width: "190px", backgroundColor: filterRNeighborhood !== "all" ? "white" : AB_GOLD }}>
                      <SelectValue placeholder="All Neighborhoods" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[340px] overflow-y-auto">
                      <SelectItem value="all">All Neighborhoods</SelectItem>
                      <SelectSeparator />
                      <SelectItem value="inner_denver">Inner Denver</SelectItem>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-widest text-black/35 px-2">Denver proper</SelectLabel>
                        {[...INNER_DENVER_NEIGHBORHOODS].sort().map(n => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-widest text-black/35 px-2">Suburbs &amp; beyond</SelectLabel>
                        {SUBURB_NEIGHBORHOODS.map(n => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <Select value={filterRPrice} onValueChange={setFilterRPrice}>
                    <SelectTrigger className={`rounded-full border border-black text-sm h-8 px-3 flex-shrink-0`}
                      style={{ width: "110px", backgroundColor: filterRPrice !== "all" ? "white" : AB_GOLD }}>
                      <SelectValue placeholder="All Prices" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Prices</SelectItem>
                      <SelectSeparator />
                      {restaurantPricePoints.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterRBadge} onValueChange={v => setFilterRBadge(v as any)}>
                    <SelectTrigger className="rounded-full border border-black text-sm h-8 px-3 flex-shrink-0"
                      style={{ width: "150px", backgroundColor: filterRBadge !== "all" ? "white" : AB_GOLD }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Spots</SelectItem>
                      <SelectSeparator />
                      <SelectItem value="hotNew">🔥 Hot &amp; New</SelectItem>
                      <SelectItem value="michelin">⭐ Michelin</SelectItem>
                      <SelectItem value="jamesBeard">🏆 James Beard</SelectItem>
                      <SelectItem value="fixture">📌 Fixture</SelectItem>
                      <SelectItem value="foodTruck">🚚 Food Truck</SelectItem>
                      <SelectItem value="happyHour">⏰ Happy Hour</SelectItem>
                      <SelectItem value="patio">☀️ Patio</SelectItem>
                    </SelectContent>
                  </Select>

                  {hasActiveRestaurantFilters && (
                    <button onClick={resetRestaurantFilters}
                      className="text-xs font-bold underline text-black opacity-50 hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Restaurant list */}
          {restaurantsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 py-3 border-b border-black/10 animate-pulse">
                  <div className="w-8 h-8 bg-black/10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-black/10 rounded w-1/3" />
                    <div className="h-3 bg-black/10 rounded w-2/3" />
                    <div className="flex gap-2">
                      <div className="h-3 bg-black/10 rounded w-16" />
                      <div className="h-3 bg-black/10 rounded w-8" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : restaurantList.length === 0 ? (
            <div className="text-center py-16 text-black/50">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="font-bold uppercase text-sm mb-1">No restaurants yet</p>
              <p className="text-xs mb-4">Add the group's favorite Denver spots.</p>
              <button onClick={() => setRestaurantAddOpen(true)}
                className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
                Add a Restaurant
              </button>
            </div>
          ) : filteredRestaurants.length === 0 ? (
            <div className="text-center py-12 text-black/50">
              <p className="text-sm font-bold uppercase mb-2">No matches</p>
              <button onClick={resetRestaurantFilters}
                className="text-xs font-bold underline text-black opacity-50 hover:opacity-80 transition-opacity">
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="divide-y-0">
              {filteredRestaurants.map(r => (
                <RestaurantRow
                  key={r.id}
                  restaurant={r}
                  onEdit={() => setRestaurantToEdit(r)}
                  onDelete={() => setRestaurantToDelete(r)}
                />
              ))}
            </ul>
          )}
        </main>
      )}

      {/* ── Footer ── */}
      <footer className="py-4 px-4" style={{ backgroundColor: AB_GOLD }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a href={siteUrls.setlist} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Setlist Social Feed</a>
            <span className="text-black opacity-40">|</span>
            <span className="text-sm font-bold text-black uppercase">Amuse-Bouche Insider</span>
            <span className="text-black opacity-40">|</span>
            <a href={siteUrls.artistryNerdistry} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Artistry/Nerdistry Live</a>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setCalendarOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Subscribe to Calendar
            </button>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setAddOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Add a Popup
            </button>
          </div>
          <span className="text-sm text-black whitespace-nowrap">© {new Date().getFullYear()} Amuse-Bouche Insider</span>
        </div>
      </footer>

      <AddListingEventModal open={addOpen} onClose={() => setAddOpen(false)} config={foodFormConfig} />

      {restaurantAddOpen && (
        <RestaurantModal mode="add" onClose={() => setRestaurantAddOpen(false)} />
      )}
      {restaurantToEdit && (
        <RestaurantModal mode="edit" initial={restaurantToEdit} onClose={() => setRestaurantToEdit(null)} />
      )}
      <AlertDialog open={!!restaurantToDelete} onOpenChange={open => { if (!open) setRestaurantToDelete(null); }}>
        <AlertDialogContent className="rounded-none border-2 border-black">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this restaurant?</AlertDialogTitle>
            <AlertDialogDescription>
              "{restaurantToDelete?.name}" will be permanently removed from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-none bg-red-600 hover:bg-red-700"
              onClick={() => restaurantToDelete && deleteRestaurantMutation.mutate(restaurantToDelete.id)}
              disabled={deleteRestaurantMutation.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CalendarSubscribeModal
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        feedPath="/api/calendar/food-feed.ics"
        title="SUBSCRIBE TO POPUPS"
      />

      {/* Calendar event detail dialog */}
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
                <div className="pl-6 pr-12 pt-9 pb-4" style={{ backgroundColor: AB_GOLD }}>
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
                            <a href={evSearchUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xl font-black uppercase text-black leading-tight hover:underline cursor-pointer">
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
                      <DropdownMenu open={calDetailMenuOpen} onOpenChange={setCalDetailMenuOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black">
                            <MoreVertical className="h-4 w-4 text-black" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                          <DropdownMenuItem onClick={() => { setCalDetailMenuOpen(false); setCalDetailEditOpen(true); }}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none">
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setCalDetailMenuOpen(false); calDetailSoldOutMutation.mutate(); }}
                            disabled={calDetailSoldOutMutation.isPending}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none">
                            {ev.soldOut ? "Mark available" : "Mark sold out"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                            onClick={() => { setCalDetailMenuOpen(false); setTimeout(() => setCalDetailDeleteConfirm(true), 100); }}>
                            Delete event
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-black/30 text-black/70">{ev.cuisine}</span>
                  </div>
                </div>

                <div className="px-6 py-4 space-y-4 bg-white">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-black font-semibold">
                      <span>📅</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={evCalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">
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
                            <a href={evMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">
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
                        <a href={ev.ticketUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 bg-black text-white font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-[#FE6B41] transition-colors">
                          Get Tickets ↗
                        </a>
                      )}
                      {ev.sourceUrl && (
                        <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 border-2 border-black text-black font-black uppercase text-xs tracking-wide px-4 py-2 hover:bg-black hover:text-white transition-colors">
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
        <EditFoodEventModal event={calEventDetail} onClose={() => setCalDetailEditOpen(false)} />
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

      {/* Day sheet dialog */}
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
                <div className="px-5 pt-5 pb-3" style={{ backgroundColor: AB_GOLD }}>
                  <h2 className="text-base font-black uppercase text-black">{label}</h2>
                  <p className="text-xs text-black/60 mt-0.5">{calDaySheet.events.length} popup{calDaySheet.events.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="divide-y divide-black/10 bg-white max-h-[60vh] overflow-y-auto">
                  {calDaySheet.events.map((ev, i) => (
                    <button
                      key={`${ev.id}-${i}`}
                      onClick={() => { setCalEventDetailFrom(calDaySheet); setCalDaySheet(null); setCalEventDetail(ev); }}
                      className="w-full text-left px-5 py-3 hover:bg-[#FFF8E7] transition-colors flex items-center gap-3"
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
