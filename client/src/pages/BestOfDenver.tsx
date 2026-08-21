import { useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { restaurantCuisineTypes, denverNeighborhoods, restaurantPricePoints, type Restaurant } from "@shared/schema";
import { Sparkles, MoreVertical, Users, Calendar, UtensilsCrossed, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarSubscribeModal } from "@/components/CalendarSubscribeModal";
import { SiteSwitcher } from "@/components/SiteSwitcher";

// ── Colors (matching Amuse-Bouche Insider's branding) ──────────────────────────
const AB_ORANGE = "#FE6B41";
const AB_GOLD    = "#FFF8E7";

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

export default function BestOfDenver() {
  const [calendarOpen, setCalendarOpen] = useState(false);
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
                <Users className="h-4 w-4" />
                <span>Meetup</span>
              </a>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/amuse-bouche"
                      className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0"
                    >
                      <UtensilsCrossed className="h-4 w-4" />
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
      </nav>

      {/* ── Feed ── */}
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
                  <SelectTrigger className={`rounded-full border border-black text-sm h-10 md:h-8 px-3 flex-shrink-0`}
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
                  <SelectTrigger className={`rounded-full border border-black text-sm h-10 md:h-8 px-3 flex-shrink-0`}
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
                  <SelectTrigger className={`rounded-full border border-black text-sm h-10 md:h-8 px-3 flex-shrink-0`}
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
                  <SelectTrigger className={`rounded-full border border-black text-sm h-10 md:h-8 px-3 flex-shrink-0`}
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
                  <SelectTrigger className="rounded-full border border-black text-sm h-10 md:h-8 px-3 flex-shrink-0"
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
                    className="text-xs font-bold underline text-black opacity-50 hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0 h-10 md:h-auto flex items-center">
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
