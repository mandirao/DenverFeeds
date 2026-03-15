import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cuisineTypes, type FoodEvent, type InsertFoodEvent } from "@shared/schema";
import { UtensilsCrossed, Plus, Sparkles, List, MoreVertical, Users, ImageIcon, FileText, ChevronDown, Calendar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getWeekRange, getWeekOfMonth } from "@/lib/utils";
import { CalendarSubscribeModal } from "@/components/CalendarSubscribeModal";

// ── Colors ────────────────────────────────────────────────────────────────────
const AB_ORANGE = "#FE6B41";
const AB_PINK   = "#FEABDA";
const AB_GOLD   = "#FFF8E7";
const AB_TEAL   = "#41F2EE";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureHttps(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RISK_LABELS = ["", "Low", "Mild", "Moderate", "High", "Instant sellout"];

function riskPips(level: number | null | undefined): string | null {
  if (!level || level < 1 || level > 5) return null;
  return "●".repeat(level);
}

function daysLive(announcedAt: string | null | undefined): string | null {
  if (!announcedAt) return null;
  const announced = new Date(announcedAt + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.floor((today.getTime() - announced.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function formatDateRange(dateStart: string, dateEnd?: string | null): string {
  const parse = (d: string) => new Date(d + "T12:00:00");
  const fmt = (d: string) =>
    parse(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dow = (d: string) => DAYS[parse(d).getDay()];

  if (!dateEnd || dateEnd === dateStart) return `${dow(dateStart)} ${fmt(dateStart)}`;
  const s = parse(dateStart);
  const e = parse(dateEnd);
  if (s.getMonth() === e.getMonth())
    return `${dow(dateStart)} ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}`;
  return `${dow(dateStart)} ${fmt(dateStart)} – ${dow(dateEnd)} ${fmt(dateEnd)}`;
}

function getMonthLabel(dateStart: string): string {
  const eventDate = new Date(dateStart + "T12:00:00");
  const now = new Date();
  const eventMonthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const displayDate = eventMonthStart < currentMonthStart ? now : eventDate;
  return displayDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}


function createSearchUrl(event: FoodEvent): string {
  const parts: string[] = [event.name, event.venue, "Denver"];
  if (event.dateStart) {
    const d = new Date(event.dateStart + "T12:00:00");
    parts.push(d.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
  }
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

function createCalendarUrl(event: FoodEvent): string {
  const toGCal = (d: string) => d.replace(/-/g, "");
  const start = toGCal(event.dateStart);
  const endDate = event.dateEnd ? event.dateEnd : event.dateStart;
  // Google Calendar all-day events use exclusive end date (add 1 day)
  const end = toGCal(new Date(new Date(endDate + "T12:00:00").getTime() + 86400000).toISOString().slice(0, 10));
  const text = encodeURIComponent(event.name);
  const loc = encodeURIComponent(`${event.venue}${event.neighborhood ? ", " + event.neighborhood : ""}, Denver CO`);
  const details = encodeURIComponent(event.summary || "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&location=${loc}&details=${details}&dates=${start}/${end}`;
}

// ── Event Row (inline sentence style, matching Setlist Social) ────────────────

function FoodEventRow({ event }: { event: FoodEvent }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showRequesterTooltip, setShowRequesterTooltip] = useState(false);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + " Denver CO")}`;
  const calendarUrl = createCalendarUrl(event);
  const location = event.neighborhood ? `${event.venue}, ${event.neighborhood}` : event.venue;

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/food-events/${event.id}`, method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Deleted", description: `${event.name} removed from the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete this event.", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/food-events/${event.id}/duplicate`, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Duplicated", description: `${event.name} copied to the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't duplicate this event.", variant: "destructive" }),
  });

  const soldOutMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/food-events/${event.id}`, method: "PATCH", data: { soldOut: !event.soldOut } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: event.soldOut ? "Back on the menu" : "Marked as sold out", description: event.name });
    },
    onError: () => toast({ title: "Error", description: "Couldn't update this event.", variant: "destructive" }),
  });

  return (
    <>
      <li className="pb-1.5 relative flex items-start group">
        <span className="text-2xl mr-3 select-none">{event.emoji}</span>

        {event.soldOut ? (
          <div className="flex-1 text-base opacity-60">
            <span className="font-bold">{event.name}</span>
            {" "}
            <span className="inline-flex items-center align-middle text-xs font-black uppercase leading-none px-2 py-[3px] bg-black text-white">
              SOLD OUT
            </span>
            {event.sourceUrl && (
              <a
                href={ensureHttps(event.sourceUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center align-middle ml-2 bg-black text-white hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                View Post
              </a>
            )}
            {(daysLive(event.announcedAt) || riskPips(event.selloutRisk)) && (
              <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#FFB700" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
                {daysLive(event.announcedAt) && `· live ${daysLive(event.announcedAt)}`}
                {riskPips(event.selloutRisk) && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{daysLive(event.announcedAt) ? " " : "· "}{riskPips(event.selloutRisk)}</span>}
              </span>
            )}
          </div>
        ) : (
          <div className="flex-1 text-base">
            <a
              href={createSearchUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
            >
              {event.name}
            </a>

            {" @ "}

            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
            >
              {location}
            </a>

            {" ("}
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium border-b border-dotted border-black hover:border-solid cursor-pointer text-black"
            >
              {formatDateRange(event.dateStart, event.dateEnd)}
            </a>
            {"). "}

            {event.summary}

            {event.cuisine && (
              <span className="italic"> {event.cuisine}.</span>
            )}

            {event.price && (
              <span
                className="inline-flex items-center align-middle ml-2 text-xs font-black uppercase leading-none px-2 py-[3px]"
                style={{ backgroundColor: "white", border: "1.5px solid black" }}
              >
                {event.price}
              </span>
            )}

            {event.ticketUrl && (
              <a
                href={ensureHttps(event.ticketUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center align-middle ml-2 bg-black text-[#FEABDA] hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                Reserve
              </a>
            )}

            {event.sourceUrl && (
              <a
                href={ensureHttps(event.sourceUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center align-middle ml-2 bg-black text-white hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                View Post
              </a>
            )}
            {(daysLive(event.announcedAt) || riskPips(event.selloutRisk)) && (
              <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#FFB700" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
                {daysLive(event.announcedAt) && `· live ${daysLive(event.announcedAt)}`}
                {riskPips(event.selloutRisk) && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{daysLive(event.announcedAt) ? " " : "· "}{riskPips(event.selloutRisk)}</span>}
              </span>
            )}

            {event.requester && event.requester !== 'Mandi' && (
              <span className="inline-block align-middle ml-2">
                <TooltipProvider>
                  <Tooltip open={showRequesterTooltip}>
                    <TooltipTrigger asChild>
                      <span
                        className="text-base inline-flex items-center cursor-pointer"
                        style={{ position: 'relative', top: '-1px' }}
                        onClick={() => { setShowRequesterTooltip(true); setTimeout(() => setShowRequesterTooltip(false), 2000); }}
                        onMouseEnter={() => setShowRequesterTooltip(true)}
                        onMouseLeave={() => setShowRequesterTooltip(false)}
                      >
                        🛎️
                      </span>
                    </TooltipTrigger>
                    <TooltipContent><p>Added by {event.requester}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
          </div>
        )}

        {/* Three-dot menu */}
        <div className="ml-2 flex-shrink-0" style={{ position: "relative", top: "2px" }}>
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full bg-transparent opacity-30 group-hover:opacity-70 transition-opacity"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); setIsEditOpen(true); }}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); soldOutMutation.mutate(); }}
                disabled={soldOutMutation.isPending}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                {event.soldOut ? "Mark available" : "Sold out"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); duplicateMutation.mutate(); }}
                disabled={duplicateMutation.isPending}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                onClick={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setShowDeleteConfirm(true), 100);
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>

      {/* Edit modal */}
      {isEditOpen && (
        <EditFoodEventModal event={event} onClose={() => setIsEditOpen(false)} />
      )}

      {/* Delete confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AB_GOLD }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl uppercase">Delete this popup?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              <strong>{event.name}</strong> will be permanently removed from the feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-black text-xs uppercase hover:bg-black hover:text-white transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-black text-white border-2 border-black rounded-none font-black text-xs uppercase hover:text-red-400 transition-colors"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Edit Food Event Modal ──────────────────────────────────────────────────────

function getMissingField(form: Partial<InsertFoodEvent>): string | null {
  if (!form.emoji?.trim())     return "Emoji";
  if (!form.name?.trim())      return "Event name";
  if (!form.venue?.trim())     return "Venue / restaurant";
  if (!form.dateStart?.trim()) return "Start date";
  if (!form.cuisine?.trim())   return "Cuisine type";
  if (!form.requester?.trim()) return "Your name";
  return null;
}

function EditFoodEventModal({ event, onClose }: { event: FoodEvent; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [form, setForm] = useState<Partial<InsertFoodEvent>>({
    emoji: event.emoji || "",
    name: event.name || "",
    venue: event.venue || "",
    neighborhood: event.neighborhood || "",
    dateStart: event.dateStart || "",
    dateEnd: event.dateEnd || "",
    summary: event.summary || "",
    cuisine: event.cuisine || "",
    price: event.price || "",
    ticketUrl: event.ticketUrl || "",
    sourceUrl: event.sourceUrl || "",
    requester: event.requester || "",
    announcedAt: event.announcedAt || "",
    selloutRisk: event.selloutRisk ?? undefined,
  });

  const set = (field: keyof InsertFoodEvent, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const hasChanges = () => {
    const keys = ['emoji', 'name', 'venue', 'neighborhood', 'dateStart', 'dateEnd', 'summary', 'cuisine', 'price', 'ticketUrl', 'sourceUrl', 'requester', 'announcedAt'] as const;
    return keys.some(k => (form[k] || "") !== ((event[k as keyof FoodEvent] as string) || ""))
      || (form.selloutRisk ?? null) !== (event.selloutRisk ?? null);
  };

  const tryClose = () => {
    if (hasChanges()) setShowConfirmClose(true);
    else onClose();
  };

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertFoodEvent>) =>
      apiRequest({ endpoint: `/api/food-events/${event.id}`, method: "PATCH", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Saved!", description: `${form.name} updated.` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't save changes.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = getMissingField(form);
    if (missing) {
      toast({ title: `${missing} is required`, variant: "destructive" });
      return;
    }
    updateMutation.mutate(form);
  };

  const inputClass = "border-2 border-black rounded-none bg-white text-sm";
  const labelClass = "font-black text-xs uppercase tracking-wide text-black mb-0.5 block";

  return (
    <>
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AB_GOLD }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-black uppercase">Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>You have unsaved edits. They'll be lost if you close now.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-2 border-black rounded-none font-black uppercase text-sm">Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onClose} className="bg-black text-white border-2 border-black rounded-none font-black uppercase text-sm hover:text-[#41F2EE]">Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open onOpenChange={open => { if (!open) tryClose(); }}>
      <DialogContent className="w-full max-w-lg md:max-w-3xl border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: AB_GOLD }}>
        <DialogHeader>
          <DialogTitle className="text-3xl text-black uppercase tracking-tight">
            Edit Popup
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-5 gap-y-3 md:gap-y-0">

            {/* ── Left column ── */}
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Event Name *</label>
                <Input value={form.name || ""} onChange={e => set("name", e.target.value)}
                  className={inputClass} placeholder="Hot Pot Pop-Up Nights" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Venue / Restaurant *</label>
                  <Input value={form.venue || ""} onChange={e => set("venue", e.target.value)}
                    className={inputClass} placeholder="Hop Alley" />
                </div>
                <div>
                  <label className={labelClass}>Neighborhood</label>
                  <Input value={form.neighborhood || ""} onChange={e => set("neighborhood", e.target.value)}
                    className={inputClass} placeholder="RiNo, LoHi…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Start Date *</label>
                  <Input type="date" value={form.dateStart || ""} onChange={e => set("dateStart", e.target.value)}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>End Date</label>
                  <Input type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd", e.target.value)}
                    className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Description *</label>
                <Textarea value={form.summary || ""} onChange={e => set("summary", e.target.value)}
                  className={`${inputClass} resize-none`} rows={4} maxLength={200}
                  placeholder="Sensory snapshot — food, vibe, atmosphere. Name the shop/chef if it adds something." />
                <p className="text-xs text-gray-400 mt-0.5 text-right">{(form.summary || "").length}/200</p>
              </div>
            </div>

            {/* ── Right column ── */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Emoji *</label>
                  <Input value={form.emoji || ""} onChange={e => set("emoji", e.target.value)}
                    className={inputClass} placeholder="🫕" />
                </div>
                <div>
                  <label className={labelClass}>Cuisine *</label>
                  <Select value={form.cuisine || ""} onValueChange={v => set("cuisine", v)}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {cuisineTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Price</label>
                  <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                    className={inputClass} placeholder="$55/person" />
                </div>
                <div>
                  <label className={labelClass}>RSVP/Ticket URL</label>
                  <Input value={form.ticketUrl || ""} onChange={e => set("ticketUrl", e.target.value)}
                    className={inputClass} placeholder="https://tock.com/…" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Original post link</label>
                <Input value={form.sourceUrl || ""} onChange={e => set("sourceUrl", e.target.value)}
                  className={inputClass} placeholder="https://instagram.com/p/…" />
              </div>
              <div>
                <label className={labelClass}>Your Name *</label>
                <Input value={form.requester || ""} onChange={e => set("requester", e.target.value)}
                  className={inputClass} placeholder="Mandi" />
              </div>
              <div>
                <label className={labelClass}>Announced <span className="font-normal normal-case opacity-60">(optional)</span></label>
                <Input type="date" value={(form.announcedAt as string) || ""} onChange={e => set("announcedAt", e.target.value)}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Sellout Risk <span className="font-normal normal-case opacity-60">(optional)</span></label>
                <div className="flex gap-1.5 mt-1">
                  {[1,2,3,4,5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, selloutRisk: f.selloutRisk === n ? undefined : n }))}
                      className="flex-1 py-1 border-2 text-xs font-black transition-colors"
                      style={{
                        borderColor: "black",
                        backgroundColor: form.selloutRisk === n ? "black" : "white",
                        color: form.selloutRisk === n ? "white" : "black",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {form.selloutRisk && (
                  <p className="text-xs text-gray-500 mt-0.5">{RISK_LABELS[form.selloutRisk]} — {riskPips(form.selloutRisk)}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={updateMutation.isPending}
              className="w-full px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Add Event Modal ────────────────────────────────────────────────────────────

const BLANK: Partial<InsertFoodEvent> = {
  emoji: "", name: "", venue: "", neighborhood: "",
  dateStart: "", dateEnd: "", summary: "",
  cuisine: "", price: "", ticketUrl: "", sourceUrl: "", rawBlurb: "", requester: "",
  announcedAt: "", selloutRisk: undefined,
};

function AddEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [blurb, setBlurb] = useState("");
  const [form, setForm] = useState<Partial<InsertFoodEvent>>(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [inputMode, setInputMode] = useState<"screenshot" | "blurb">("screenshot");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const { toast } = useToast();

  const switchMode = (mode: "screenshot" | "blurb") => {
    setInputMode(mode);
    if (mode === "screenshot") {
      setBlurb("");
    } else {
      setImagePreview(null);
      setImageBase64(null);
      setImageMediaType(null);
    }
  };

  const set = (field: keyof InsertFoodEvent, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mediaType = file.type as string;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Extract pure base64 (strip data:image/...;base64, prefix)
      const base64 = dataUrl.split(",")[1];
      setImagePreview(dataUrl);
      setImageBase64(base64);
      setImageMediaType(mediaType);
    };
    reader.readAsDataURL(file);
  };

  const parseMutation = useMutation({
    mutationFn: () => apiRequest({
      endpoint: "/api/ai/parse-blurb",
      method: "POST",
      data: {
        blurb,
        ...(imageBase64 ? { imageBase64, imageMediaType, fileName: imageFileName } : {}),
      },
    }),
    onSuccess: (data) => {
      setForm({ ...data, rawBlurb: blurb, sourceUrl: form.sourceUrl || "", requester: form.requester || "" });
      setShowForm(true);
      toast({ title: "Blurb parsed!", description: "Review the details below." });
    },
    onError: () => {
      toast({ title: "Parse failed", description: "Fill in the form manually.", variant: "destructive" });
      setShowForm(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertFoodEvent) =>
      apiRequest({ endpoint: "/api/food-events", method: "POST", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Popup added!", description: "It's now on the feed." });
      forceClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't add event.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = getMissingField(form);
    if (missing) {
      toast({ title: `${missing} is required`, variant: "destructive" });
      return;
    }
    createMutation.mutate(form as InsertFoodEvent);
  };

  const hasContent = () => {
    const formHasContent = Object.values(form).some(v => v && v.toString().trim() !== "");
    return formHasContent || blurb.trim() !== "" || !!imageBase64;
  };

  const forceClose = () => {
    onClose();
    setBlurb("");
    setForm(BLANK);
    setShowForm(false);
    setInputMode("screenshot");
    setImagePreview(null);
    setImageBase64(null);
    setImageMediaType(null);
    setImageFileName(null);
    setShowConfirmClose(false);
  };

  const handleClose = () => {
    if (hasContent()) setShowConfirmClose(true);
    else forceClose();
  };

  const inputClass = "border-2 border-black rounded-none bg-white text-sm";
  const labelClass = "font-black text-xs uppercase tracking-wide text-black mb-0.5 block";

  return (
    <>
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AB_GOLD }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-black uppercase">Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>You have unsaved content. It'll be lost if you close now.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-2 border-black rounded-none font-black uppercase text-sm">Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={forceClose} className="bg-black text-white border-2 border-black rounded-none font-black uppercase text-sm hover:text-[#41F2EE]">Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-lg md:max-w-3xl border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: AB_GOLD }}>
        <DialogHeader>
          <DialogTitle className="text-3xl text-black uppercase tracking-tight">
            Add a Popup
          </DialogTitle>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">

            {/* ── Mode toggle ── */}
            <div className="grid grid-cols-2 border-2 border-black">
              <button
                type="button"
                onClick={() => switchMode("screenshot")}
                className={`flex items-center justify-center gap-2 py-2.5 font-black uppercase tracking-wide text-sm transition-colors ${
                  inputMode === "screenshot"
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                <ImageIcon className="w-4 h-4" />Screenshot
              </button>
              <button
                type="button"
                onClick={() => switchMode("blurb")}
                className={`flex items-center justify-center gap-2 py-2.5 font-black uppercase tracking-wide text-sm transition-colors border-l-2 border-black ${
                  inputMode === "blurb"
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                <FileText className="w-4 h-4" />Blurb
              </button>
            </div>

            {/* ── Screenshot mode ── */}
            {inputMode === "screenshot" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Upload a screenshot from Instagram, Eventbrite, or anywhere — AI will read the text directly from the image.</p>
                <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-black bg-white cursor-pointer hover:bg-gray-50 transition-colors py-6 px-3">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="max-h-48 max-w-full object-contain border-2 border-black" />
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); setImagePreview(null); setImageBase64(null); setImageMediaType(null); }}
                        className="absolute -top-2 -right-2 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                      >×</button>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 opacity-30" />
                      <span className="text-sm font-semibold">Click to upload screenshot</span>
                      <span className="text-xs text-gray-400">JPG, PNG, WEBP, GIF</span>
                    </>
                  )}
                </label>
              </div>
            )}

            {/* ── Blurb mode ── */}
            {inputMode === "blurb" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Paste a caption or description from social media — AI will extract the event details.</p>
                <Textarea rows={5}
                  placeholder={`e.g.\n\nhopalleydenver\n\nWe are happy to announce our Hop Alley Hot Pot Pop-Up Nights! On March 26-28…`}
                  value={blurb} onChange={e => setBlurb(e.target.value)}
                  className={`${inputClass} resize-none`} />
              </div>
            )}

            <div>
              <label className={labelClass}>Original post link <span className="font-normal normal-case opacity-60">(optional)</span></label>
              <Input
                value={form.sourceUrl || ""}
                onChange={e => set("sourceUrl", e.target.value)}
                className={inputClass}
                placeholder="https://instagram.com/p/… or eventbrite link" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => parseMutation.mutate()}
                disabled={(!blurb.trim() && !imageBase64) || parseMutation.isPending}
                className="flex-1 bg-black text-white font-black uppercase tracking-wide text-sm px-4 py-2.5 border-2 border-black hover:text-[#41F2EE] transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Sparkles className="w-4 h-4" />
                {parseMutation.isPending ? "Parsing…" : "Parse with AI"}
              </button>
              <button onClick={() => setShowForm(true)}
                className="px-4 py-2.5 border-2 border-black bg-white font-black uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
                Skip
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">

            {/* ── Back to AI ── */}
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1.5 text-xs font-semibold text-black opacity-50 hover:opacity-100 transition-opacity"
            >
              <Sparkles className="w-3 h-3" />
              Use AI instead
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-5 gap-y-3 md:gap-y-0">

              {/* ── Left column ── */}
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Description *</label>
                  <Textarea value={form.summary || ""} onChange={e => set("summary", e.target.value)}
                    className={`${inputClass} resize-none`} rows={4} maxLength={200}
                    placeholder="Sensory snapshot — food, vibe, atmosphere. Name the shop/chef if it adds something." />
                  <p className="text-xs text-gray-400 mt-0.5 text-right">{(form.summary || "").length}/200</p>
                </div>
                <div>
                  <label className={labelClass}>Event Name *</label>
                  <Input value={form.name || ""} onChange={e => set("name", e.target.value)}
                    className={inputClass} placeholder="Hot Pot Pop-Up Nights" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Venue / Restaurant *</label>
                    <Input value={form.venue || ""} onChange={e => set("venue", e.target.value)}
                      className={inputClass} placeholder="Hop Alley" />
                  </div>
                  <div>
                    <label className={labelClass}>Neighborhood</label>
                    <Input value={form.neighborhood || ""} onChange={e => set("neighborhood", e.target.value)}
                      className={inputClass} placeholder="RiNo, LoHi…" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Start Date *</label>
                    <Input type="date" value={form.dateStart || ""} onChange={e => set("dateStart", e.target.value)}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>End Date</label>
                    <Input type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd", e.target.value)}
                      className={inputClass} />
                  </div>
                </div>
              </div>

              {/* ── Right column ── */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Emoji *</label>
                    <Input value={form.emoji || ""} onChange={e => set("emoji", e.target.value)}
                      className={inputClass} placeholder="🫕" />
                  </div>
                  <div>
                    <label className={labelClass}>Cuisine *</label>
                    <Select value={form.cuisine || ""} onValueChange={v => set("cuisine", v)}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {cuisineTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Price</label>
                    <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                      className={inputClass} placeholder="$55/person" />
                  </div>
                  <div>
                    <label className={labelClass}>RSVP/Ticket URL</label>
                    <Input value={form.ticketUrl || ""} onChange={e => set("ticketUrl", e.target.value)}
                      className={inputClass} placeholder="https://tock.com/…" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Original post link</label>
                  <Input value={form.sourceUrl || ""} onChange={e => set("sourceUrl", e.target.value)}
                    className={inputClass} placeholder="https://instagram.com/p/… or eventbrite link" />
                </div>
                <div>
                  <label className={labelClass}>Your Name *</label>
                  <Input value={form.requester || ""} onChange={e => set("requester", e.target.value)}
                    className={inputClass} placeholder="Mandi" />
                </div>
                <div>
                  <label className={labelClass}>Announced <span className="font-normal normal-case opacity-60">(optional)</span></label>
                  <Input type="date" value={(form.announcedAt as string) || ""} onChange={e => set("announcedAt", e.target.value)}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sellout Risk <span className="font-normal normal-case opacity-60">(optional)</span></label>
                  <div className="flex gap-1.5 mt-1">
                    {[1,2,3,4,5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, selloutRisk: f.selloutRisk === n ? undefined : n }))}
                        className="flex-1 py-1 border-2 text-xs font-black transition-colors"
                        style={{
                          borderColor: "black",
                          backgroundColor: form.selloutRisk === n ? "black" : "white",
                          color: form.selloutRisk === n ? "white" : "black",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {form.selloutRisk && (
                    <p className="text-xs text-gray-500 mt-0.5">{RISK_LABELS[form.selloutRisk]} — {riskPips(form.selloutRisk)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={createMutation.isPending}
                className="w-full px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {createMutation.isPending ? "Adding…" : "Add Popup"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AmsueBouche() {
  const [addOpen, setAddOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<FoodEvent[]>({
    queryKey: ["/api/food-events"],
  });

  type MonthBucket = { events: FoodEvent[]; weekGroups: Record<string, { events: FoodEvent[] }> };
  const grouped = events.reduce<Record<string, MonthBucket>>((acc, ev) => {
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
            <div className="flex items-baseline gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 group outline-none">
                  <h1 className="text-3xl md:text-4xl text-black group-hover:text-[#41F2EE] transition-colors font-black">
                    AMUSE-BOUCHE INSIDER
                  </h1>
                  <ChevronDown className="h-4 w-4 text-black group-hover:text-[#41F2EE] transition-colors shrink-0 self-center" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-none border-2 border-black bg-black text-white p-0 min-w-[240px]">
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#FEABDA] focus:text-black px-4 py-3 cursor-pointer">
                    <Link href="/" className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎵 SETLIST SOCIAL FEED
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#F2F0FF] focus:text-black px-4 py-3 cursor-pointer">
                    <Link href="/artistry-nerdistry" className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎨 ARTISTRY/NERDISTRY LIVE
                    </Link>
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
              <button onClick={() => setAddOpen(true)}
                className="bg-black text-[#FEABDA] hover:text-[#41F2EE] font-black uppercase tracking-wide text-sm rounded-full px-3 py-1.5 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />Popup
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Feed ── */}
      <main className="container mx-auto px-4 py-6 flex-1 max-w-2xl">

        <p className="text-xs text-black mb-5 opacity-60 leading-snug">
          Pop-ups fill up fast! If something looks good, act on it.
        </p>

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

        {Object.entries(grouped).map(([month, monthData]) => {
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
                        <FoodEventRow key={ev.id} event={ev} />
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

      {/* ── Footer ── */}
      <footer className="py-4 px-4" style={{ backgroundColor: AB_GOLD }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Link href="/"
              className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline flex items-center gap-1">
              <List className="w-4 h-4" />SETLIST SOCIAL FEED
            </Link>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setAddOpen(true)}
              className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline">
              ADD A POPUP
            </button>
          </div>
          <span className="text-sm text-black">© {new Date().getFullYear()} Amuse Bouche</span>
        </div>
      </footer>

      <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CalendarSubscribeModal
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        feedPath="/api/calendar/food-feed.ics"
        title="SUBSCRIBE TO POPUPS"
      />
    </div>
  );
}
