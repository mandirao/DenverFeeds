import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { siteUrls } from "@/lib/siteConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  restaurantCuisineTypes, denverNeighborhoods, denverProperNeighborhoods,
  RESTAURANT_NEIGHBORHOOD_BROAD_REGION, restaurantPricePoints, type Restaurant, type DenverNeighborhood,
} from "@shared/schema";
import { Sparkles, MoreVertical, Calendar, Plus, Search, X, ChevronDown, Check, ArrowUpDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarSubscribeModal } from "@/components/CalendarSubscribeModal";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { useElementHeight } from "@/hooks/use-element-height";

// ── Colors (matching Amuse-Bouche Insider's branding) ──────────────────────────
const AB_ORANGE = "#FE6B41";
const AB_GOLD    = "#FFF8E7";

// Derived from the enum + lookup (not food/art's fuller denverMetroSuburbs/
// frontRangeCities lists) so this only ever offers filter options that some
// restaurant could actually be tagged with — e.g. Fort Collins/Greeley/
// Colorado Springs are Front Range cities in the events feeds' taxonomy but
// were never in scope for a "Best of Denver" restaurant directory, so they
// stay out of denverNeighborhoods and correctly don't show up here either.
const RESTAURANT_SUBURBS = denverNeighborhoods.filter(n => RESTAURANT_NEIGHBORHOOD_BROAD_REGION[n] === "suburbs");
const RESTAURANT_FRONT_RANGE_CITIES = denverNeighborhoods.filter(n => RESTAURANT_NEIGHBORHOOD_BROAD_REGION[n] === "front_range");

const BAR_CUISINES = new Set(['Bar', 'Dive', 'Cocktails', 'Beer', 'Wine']);
const SHOP_CUISINES = new Set(['Grocery & Market']);
// Tags that describe venue type/attributes, not cuisine — shown separately in modal, no count limit
const VENUE_ATTR_TAGS = new Set(['Bar', 'Cafe', 'Dive', 'Cocktails', 'Beer', 'Wine', 'Coffee', 'Tea', 'Grocery & Market', 'Happy Hour', 'Patio']);
const VENUE_ATTR_LIST = ['Bar', 'Cafe', 'Dive', 'Cocktails', 'Beer', 'Wine', 'Coffee', 'Tea', 'Grocery & Market', 'Happy Hour', 'Patio'];

// Display labels for the filter bar's multi-select triggers (only needed
// where the filter value itself isn't already the display text).
const TYPE_LABELS: Record<string, string> = { restaurant: "Restaurants", bar: "Bars", cafe: "Cafes", shop: "Shops" };
const REGION_LABELS: Record<string, string> = { denver: "Denver", suburbs: "Suburbs", front_range: "Front Range" };
const SPOT_LABELS: Record<string, string> = {
  hotNew: "🔥 Hot & New", michelin: "⭐ Michelin", jamesBeard: "🏆 James Beard", fixture: "📌 Fixture", foodTruck: "🚚 Food Truck",
  happyHour: "⏰ Happy Hour", patio: "☀️ Patio", cocktails: "🍸 Cocktails", wine: "🍷 Wine", beer: "🍺 Beer", coffee: "☕ Coffee", tea: "🍵 Tea", dive: "🎱 Dive Bar",
};
// Plain-text (no-emoji) equivalent of SPOT_LABELS, for the active-filters summary line.
const SPOT_PLAIN_LABELS: Record<string, string> = {
  hotNew: "Hot & New", michelin: "Michelin", jamesBeard: "James Beard", fixture: "Fixture", foodTruck: "Food Truck",
  happyHour: "Happy Hour", patio: "Patio", cocktails: "Cocktails", wine: "Wine", beer: "Beer", coffee: "Coffee", tea: "Tea", dive: "Dive Bar",
};

// ── Restaurant Row ────────────────────────────────────────────────────────────

function RestaurantRow({ restaurant, onEdit, onDelete, activeCuisines, onTagClick }: {
  restaurant: Restaurant;
  onEdit: () => void;
  onDelete: () => void;
  activeCuisines: string[];
  onTagClick: (cuisine: string) => void;
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
                      className="font-black uppercase text-black text-base leading-tight underline decoration-dotted underline-offset-2 hover:opacity-70 transition-opacity">
                      {restaurant.name}
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs rounded-none border-black bg-black text-white px-2 py-1">
                    Opens Google search
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {restaurant.pricePoint && (
                <span className="text-xs font-bold text-black/50 leading-none">{restaurant.pricePoint}</span>
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
              <p className="text-xs text-black/40 font-medium mt-0.5 leading-none">{restaurant.neighborhood}</p>
            )}
            <p className="text-base text-black/75 mt-1 leading-snug">{restaurant.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(restaurant.cuisine ?? []).map(c => {
                const active = activeCuisines.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onTagClick(c)}
                    className={`text-xs font-bold border px-2 py-0.5 rounded-full transition-colors ${
                      active
                        ? "bg-black text-white border-black"
                        : "border-black/25 text-black/60 hover:border-black hover:text-black"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm"
                className="h-7 w-7 p-0 flex items-center justify-center rounded-full bg-transparent opacity-30 group-hover:opacity-70 hover:!opacity-100 transition-opacity flex-shrink-0 mt-0.5">
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

// ── Multi-select filter pill ─────────────────────────────────────────────────
// Shared trigger + row building blocks for the filter bar's multi-select
// dropdowns (Type/Cuisine/Region/Price all use "match any selected" OR logic;
// Spots uses "match all selected" AND logic — see filteredRestaurants below).

const toggleInArray = (arr: string[], value: string) =>
  arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

const multiTriggerLabel = (selected: string[], placeholder: string, labels: Record<string, string> = {}) =>
  selected.length === 0 ? placeholder
    : selected.length === 1 ? (labels[selected[0]] ?? selected[0])
    : `${selected.length} selected`;

function MultiSelectTrigger({ active, width, ariaLabel, children }: { active: boolean; width: string; ariaLabel: string; children: ReactNode }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        aria-label={ariaLabel}
        className={`flex items-center justify-between gap-1 rounded-full border text-sm h-10 md:h-8 px-3 flex-shrink-0 overflow-hidden focus:outline-none ${
          active
            ? "bg-white text-black border-black"
            : "bg-black text-[#FFF8E7] border-white md:bg-[#FFF8E7] md:text-black md:border-black md:hover:border-white"
        }`}
        style={{ width }}
      >
        <span className="truncate">{children}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
      </button>
    </DropdownMenuTrigger>
  );
}

function MultiSelectRow({ label, checked, onToggle }: { label: ReactNode; checked: boolean; onToggle: () => void }) {
  return (
    <DropdownMenuItem
      onSelect={e => { e.preventDefault(); onToggle(); }}
      className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-none focus:bg-gray-100 hover:bg-gray-100 cursor-pointer"
    >
      <span className="w-3.5 flex-shrink-0">{checked ? <Check className="w-3 h-3" /> : null}</span>
      {label}
    </DropdownMenuItem>
  );
}

const MULTI_SELECT_LABEL_CLASS = "text-[10px] uppercase tracking-widest text-black/35 px-2 pt-1.5";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BestOfDenver() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [restaurantAddOpen, setRestaurantAddOpen] = useState(false);
  const [restaurantToEdit, setRestaurantToEdit] = useState<Restaurant | null>(null);
  const [restaurantToDelete, setRestaurantToDelete] = useState<Restaurant | null>(null);
  const parseMultiParam = (name: string) => {
    const raw = new URLSearchParams(window.location.search).get(name);
    return raw ? raw.split(",").filter(Boolean) : [];
  };
  const [filterRVenueTypes, setFilterRVenueTypes] = useState<string[]>(() => parseMultiParam("type"));
  const [filterRCuisines, setFilterRCuisines] = useState<string[]>(() => parseMultiParam("cuisine"));
  const [filterRRegions, setFilterRRegions] = useState<string[]>(() => parseMultiParam("neighborhood"));
  const [filterRPrices, setFilterRPrices] = useState<string[]>(() => parseMultiParam("price"));
  const { ref: filterBarRef, height: filterBarHeight } = useElementHeight<HTMLDivElement>();
  const [filterRSpots, setFilterRSpots] = useState<string[]>(() => parseMultiParam("spot"));
  const [sortBy, setSortBy] = useState<"alpha" | "added">(() => new URLSearchParams(window.location.search).get("sort") === "added" ? "added" : "alpha");
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [searchOpen, setSearchOpen] = useState(() => searchQuery.trim() !== "");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const qcMain = useQueryClient();

  const { data: restaurantList = [], isLoading: restaurantsLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
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

  const normalizedRestaurantSearch = searchQuery.trim().toLowerCase();

  const filteredRestaurants = restaurantList
    .filter(r => {
      const cuisine = r.cuisine ?? [];
      if (normalizedRestaurantSearch) {
        const haystack = `${r.name} ${r.description} ${r.neighborhood} ${cuisine.join(" ")}`.toLowerCase();
        if (!haystack.includes(normalizedRestaurantSearch)) return false;
      }
      // Type/Cuisine/Region/Price: "match ANY selected" (OR) — these are
      // mutually-exclusive-ish categories, so picking Bar + Cafe should
      // broaden results to either, not narrow to venues tagged as both.
      if (filterRVenueTypes.length > 0) {
        const matchesType = (t: string) => {
          if (t === "bar") return cuisine.includes('Bar');
          if (t === "cafe") return cuisine.includes('Cafe');
          if (t === "shop") return cuisine.some(c => SHOP_CUISINES.has(c));
          if (t === "restaurant") return cuisine.some(c => !BAR_CUISINES.has(c) && !SHOP_CUISINES.has(c));
          return false;
        };
        if (!filterRVenueTypes.some(matchesType)) return false;
      }
      if (filterRCuisines.length > 0 && !filterRCuisines.some(c => cuisine.includes(c))) return false;
      if (filterRRegions.length > 0) {
        const matchesRegion = (val: string) => {
          if (val === "denver" || val === "suburbs" || val === "front_range") {
            return RESTAURANT_NEIGHBORHOOD_BROAD_REGION[r.neighborhood as DenverNeighborhood] === val;
          }
          return r.neighborhood === val;
        };
        if (!filterRRegions.some(matchesRegion)) return false;
      }
      if (filterRPrices.length > 0 && !filterRPrices.includes(r.pricePoint)) return false;
      // Spots (badges + drinks/amenities): "match ALL selected" (AND) — these
      // are independent attributes a single venue can genuinely have at once
      // (e.g. Patio + Happy Hour), so checking more should narrow the results.
      if (filterRSpots.length > 0) {
        const matchesSpot = (val: string) => {
          switch (val) {
            case "hotNew": return r.hotNew;
            case "michelin": return r.michelinStar;
            case "jamesBeard": return !!(r as any).jamesBeard;
            case "fixture": return !!(r as any).fixture;
            case "foodTruck": return !!(r as any).foodTruck;
            case "happyHour": return cuisine.includes('Happy Hour');
            case "patio": return cuisine.includes('Patio');
            case "cocktails": return cuisine.includes('Cocktails');
            case "wine": return cuisine.includes('Wine');
            case "beer": return cuisine.includes('Beer');
            case "coffee": return cuisine.includes('Coffee');
            case "tea": return cuisine.includes('Tea');
            case "dive": return cuisine.includes('Dive');
            default: return false;
          }
        };
        if (!filterRSpots.every(matchesSpot)) return false;
      }
      return true;
    })
    .sort((a, b) => sortBy === "added" ? b.id - a.id : a.name.trim().localeCompare(b.name.trim()));

  const hasActiveRestaurantFilters = filterRVenueTypes.length > 0 || filterRCuisines.length > 0 || filterRRegions.length > 0 || filterRPrices.length > 0 || filterRSpots.length > 0 || sortBy !== "alpha" || searchQuery.trim() !== "";
  const resetRestaurantFilters = () => {
    setFilterRVenueTypes([]); setFilterRCuisines([]); setFilterRRegions([]);
    setFilterRPrices([]); setFilterRSpots([]); setSortBy("alpha"); setSearchQuery(""); setSearchOpen(false);
  };

  const activeFilterLabels: string[] = [
    ...filterRVenueTypes.map(t => TYPE_LABELS[t] ?? t),
    ...filterRCuisines,
    ...filterRRegions.map(r => REGION_LABELS[r] ?? r),
    ...filterRPrices,
    ...filterRSpots.map(s => SPOT_PLAIN_LABELS[s] ?? s),
  ];
  if (sortBy !== "alpha") activeFilterLabels.push("Recently Added");
  if (searchQuery.trim() !== "") activeFilterLabels.push(`"${searchQuery.trim()}"`);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: AB_GOLD }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: AB_ORANGE }}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <SiteSwitcher
                title={<>AMUSE-BOUCHE<span className="hidden md:inline"> INSIDER</span></>}
                titleClassName="text-3xl md:text-4xl text-black group-hover:text-[#41F2EE] transition-colors font-black"
                chevronClassName="h-4 w-4 text-black group-hover:text-[#41F2EE] transition-colors shrink-0 self-center"
              />
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCalendarOpen(true)}
                      className="text-black hover:text-[#41F2EE] transition-colors p-3.5 -m-3.5 md:p-0 md:m-0"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>Subscribe to calendar</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <a href="https://www.meetup.com/amuse-bouche/"
                target="_blank" rel="noopener noreferrer"
                className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0">
                <span>Meetup</span>
              </a>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/amuse-bouche"
                      className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0"
                    >
                      <span>Popups</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent><p>Back to the pop-up feed</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button onClick={() => setRestaurantAddOpen(true)}
                className="bg-black text-[#FEABDA] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-2.5 md:py-1.5 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />Foodie Gem
              </button>
            </div>
          </div>
        </div>

        {/* Filter row - a persistent bottom section of the nav on desktop, pinned to the bottom of the screen on mobile */}
        {restaurantList.length > 0 && (
          <div
            ref={filterBarRef}
            className="fixed inset-x-0 bottom-0 z-40 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-black md:bg-[#FFF8E7] shadow-[0_-4px_12px_rgba(0,0,0,0.12)] border-t border-white/10 md:static md:inset-x-auto md:bottom-auto md:pb-3 md:shadow-none md:border-t-0"
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
                      placeholder="Search gems"
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
                    title="Search gems"
                    aria-label="Search gems"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Sort dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 px-3 h-10 md:h-8 rounded-full border border-black bg-white text-black font-medium text-sm hover:bg-black hover:text-white transition-colors whitespace-nowrap flex-shrink-0 focus:outline-none">
                      <ArrowUpDown className="w-3 h-3" />
                      {sortBy === "added" ? "Recently Added" : "Alphabetical"}
                      <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-44 p-0">
                    {([
                      { label: "Alphabetical", value: "alpha" as const },
                      { label: "Recently Added", value: "added" as const },
                    ]).map(opt => (
                      <DropdownMenuItem key={opt.label} onClick={() => setSortBy(opt.value)} className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-none focus:bg-gray-100 hover:bg-gray-100 cursor-pointer">
                        <span className="w-3.5 flex-shrink-0">{sortBy === opt.value ? <Check className="w-3 h-3" /> : null}</span>
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Separator */}
                <div className="h-6 w-px bg-white md:bg-black opacity-40 mx-1 flex-shrink-0" />

                <DropdownMenu>
                  <MultiSelectTrigger active={filterRVenueTypes.length > 0} width="140px" ariaLabel="Type filter">
                    {multiTriggerLabel(filterRVenueTypes, "All Types", TYPE_LABELS)}
                  </MultiSelectTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-44 p-0">
                    <MultiSelectRow label="All Types" checked={filterRVenueTypes.length === 0} onToggle={() => setFilterRVenueTypes([])} />
                    <DropdownMenuSeparator />
                    <MultiSelectRow label="Restaurants" checked={filterRVenueTypes.includes("restaurant")} onToggle={() => setFilterRVenueTypes(prev => toggleInArray(prev, "restaurant"))} />
                    <MultiSelectRow label="Bars" checked={filterRVenueTypes.includes("bar")} onToggle={() => setFilterRVenueTypes(prev => toggleInArray(prev, "bar"))} />
                    <MultiSelectRow label="Cafes" checked={filterRVenueTypes.includes("cafe")} onToggle={() => setFilterRVenueTypes(prev => toggleInArray(prev, "cafe"))} />
                    <MultiSelectRow label="Shops" checked={filterRVenueTypes.includes("shop")} onToggle={() => setFilterRVenueTypes(prev => toggleInArray(prev, "shop"))} />
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <MultiSelectTrigger active={filterRCuisines.length > 0} width="160px" ariaLabel="Cuisine filter">
                    {multiTriggerLabel(filterRCuisines, "All Cuisine")}
                  </MultiSelectTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-52 p-0 max-h-[320px] overflow-y-auto">
                    <MultiSelectRow label="All Cuisine" checked={filterRCuisines.length === 0} onToggle={() => setFilterRCuisines([])} />
                    <DropdownMenuSeparator />
                    {[...new Set(restaurantList.flatMap(r => r.cuisine ?? []))].filter(c => !VENUE_ATTR_TAGS.has(c)).sort().map(c => (
                      <MultiSelectRow key={c} label={c} checked={filterRCuisines.includes(c)} onToggle={() => setFilterRCuisines(prev => toggleInArray(prev, c))} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Region filter — broad tiers (Denver/Suburbs/Front Range) up
                    top for a quick pick, matching Amuse-Bouche/Artistry-
                    Nerdistry's Region filter, with each tier's specific
                    neighborhoods/cities broken out in their own section
                    further down. No Mountains tier — no restaurant here is
                    ever tagged a mountain town. */}
                <DropdownMenu>
                  <MultiSelectTrigger active={filterRRegions.length > 0} width="190px" ariaLabel="Region filter">
                    {multiTriggerLabel(filterRRegions, "Region", REGION_LABELS)}
                  </MultiSelectTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-56 p-0 max-h-[340px] overflow-y-auto">
                    <MultiSelectRow label="All Regions" checked={filterRRegions.length === 0} onToggle={() => setFilterRRegions([])} />
                    <MultiSelectRow label="Denver" checked={filterRRegions.includes("denver")} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, "denver"))} />
                    <MultiSelectRow label="Suburbs" checked={filterRRegions.includes("suburbs")} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, "suburbs"))} />
                    <MultiSelectRow label="Front Range" checked={filterRRegions.includes("front_range")} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, "front_range"))} />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MULTI_SELECT_LABEL_CLASS}>Denver proper</DropdownMenuLabel>
                    {denverProperNeighborhoods.map(n => (
                      <MultiSelectRow key={n} label={n} checked={filterRRegions.includes(n)} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, n))} />
                    ))}
                    <MultiSelectRow label="Other" checked={filterRRegions.includes("Other")} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, "Other"))} />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MULTI_SELECT_LABEL_CLASS}>Suburbs</DropdownMenuLabel>
                    {RESTAURANT_SUBURBS.map(n => (
                      <MultiSelectRow key={n} label={n} checked={filterRRegions.includes(n)} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, n))} />
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MULTI_SELECT_LABEL_CLASS}>Front Range</DropdownMenuLabel>
                    {RESTAURANT_FRONT_RANGE_CITIES.map(n => (
                      <MultiSelectRow key={n} label={n} checked={filterRRegions.includes(n)} onToggle={() => setFilterRRegions(prev => toggleInArray(prev, n))} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <MultiSelectTrigger active={filterRPrices.length > 0} width="110px" ariaLabel="Price filter">
                    {multiTriggerLabel(filterRPrices, "All Prices")}
                  </MultiSelectTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-32 p-0">
                    <MultiSelectRow label="All Prices" checked={filterRPrices.length === 0} onToggle={() => setFilterRPrices([])} />
                    <DropdownMenuSeparator />
                    {restaurantPricePoints.map(p => (
                      <MultiSelectRow key={p} label={p} checked={filterRPrices.includes(p)} onToggle={() => setFilterRPrices(prev => toggleInArray(prev, p))} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <MultiSelectTrigger active={filterRSpots.length > 0} width="150px" ariaLabel="Spots filter">
                    {multiTriggerLabel(filterRSpots, "All Spots", SPOT_LABELS)}
                  </MultiSelectTrigger>
                  <DropdownMenuContent align="start" className="rounded-none border-2 border-black shadow-none bg-white w-52 p-0 max-h-[340px] overflow-y-auto">
                    <MultiSelectRow label="All Spots" checked={filterRSpots.length === 0} onToggle={() => setFilterRSpots([])} />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MULTI_SELECT_LABEL_CLASS}>Badges</DropdownMenuLabel>
                    <MultiSelectRow label="🔥 Hot & New" checked={filterRSpots.includes("hotNew")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "hotNew"))} />
                    <MultiSelectRow label="⭐ Michelin" checked={filterRSpots.includes("michelin")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "michelin"))} />
                    <MultiSelectRow label="🏆 James Beard" checked={filterRSpots.includes("jamesBeard")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "jamesBeard"))} />
                    <MultiSelectRow label="📌 Fixture" checked={filterRSpots.includes("fixture")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "fixture"))} />
                    <MultiSelectRow label="🚚 Food Truck" checked={filterRSpots.includes("foodTruck")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "foodTruck"))} />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MULTI_SELECT_LABEL_CLASS}>Drinks &amp; Amenities</DropdownMenuLabel>
                    <MultiSelectRow label="⏰ Happy Hour" checked={filterRSpots.includes("happyHour")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "happyHour"))} />
                    <MultiSelectRow label="☀️ Patio" checked={filterRSpots.includes("patio")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "patio"))} />
                    <MultiSelectRow label="🍸 Cocktails" checked={filterRSpots.includes("cocktails")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "cocktails"))} />
                    <MultiSelectRow label="🍷 Wine" checked={filterRSpots.includes("wine")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "wine"))} />
                    <MultiSelectRow label="🍺 Beer" checked={filterRSpots.includes("beer")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "beer"))} />
                    <MultiSelectRow label="☕ Coffee" checked={filterRSpots.includes("coffee")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "coffee"))} />
                    <MultiSelectRow label="🍵 Tea" checked={filterRSpots.includes("tea")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "tea"))} />
                    <MultiSelectRow label="🎱 Dive Bar" checked={filterRSpots.includes("dive")} onToggle={() => setFilterRSpots(prev => toggleInArray(prev, "dive"))} />
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
            </div>
            {hasActiveRestaurantFilters && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                <button
                  onClick={resetRestaurantFilters}
                  className="text-white hover:text-white/70 md:text-black md:hover:text-white transition-colors focus:outline-none underline py-2.5 -my-2.5 md:py-0 md:my-0"
                >
                  ✕ clear filters
                </button>
                <span className="text-white/70 md:text-black/50">
                  {filteredRestaurants.length} {filteredRestaurants.length === 1 ? "restaurant" : "restaurants"}
                  {activeFilterLabels.length > 0 && ` · ${activeFilterLabels.join(" · ")}`}
                </span>
              </div>
            )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Feed ── */}
      <main className="container mx-auto px-4 py-6 flex-1 max-w-2xl">
        <p className="text-xs text-black mb-4 opacity-60 leading-snug">
          Foodie gems around Denver worth going back to.
        </p>

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
                activeCuisines={filterRCuisines}
                onTagClick={c => setFilterRCuisines(prev => toggleInArray(prev, c))}
              />
            ))}
          </ul>
        )}

        {/* Reserves space for the mobile bottom-pinned filter bar so it doesn't cover the feed */}
        {restaurantList.length > 0 && (
          <div className="md:hidden" style={{ height: filterBarHeight }} />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 px-4" style={{ backgroundColor: AB_GOLD }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a href={siteUrls.setlist} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Setlist Social Feed</a>
            <span className="text-black opacity-40">|</span>
            <Link href="/amuse-bouche" className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Amuse-Bouche Insider</Link>
            <span className="text-black opacity-40">|</span>
            <a href={siteUrls.artistryNerdistry} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">Artistry/Nerdistry Live</a>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setCalendarOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Subscribe to Calendar
            </button>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setRestaurantAddOpen(true)} className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline uppercase">
              Add a Foodie Gem
            </button>
          </div>
          <span className="text-sm text-black whitespace-nowrap">© {new Date().getFullYear()} Amuse-Bouche Insider</span>
        </div>
      </footer>

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
    </div>
  );
}
