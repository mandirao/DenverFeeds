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
import { UtensilsCrossed, Plus, Sparkles, List, MoreVertical } from "lucide-react";

// ── Colors ────────────────────────────────────────────────────────────────────
const AB_ORANGE = "#FE6B41";
const AB_PINK   = "#FEABDA";
const AB_GOLD   = "#FFF8E7";
const AB_TEAL   = "#41F2EE";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(dateStart: string, dateEnd?: string | null): string {
  const fmt = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!dateEnd || dateEnd === dateStart) return fmt(dateStart);
  const s = new Date(dateStart + "T12:00:00");
  const e = new Date(dateEnd + "T12:00:00");
  if (s.getMonth() === e.getMonth())
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}`;
  return `${fmt(dateStart)} – ${fmt(dateEnd)}`;
}

function getMonthLabel(dateStart: string): string {
  return new Date(dateStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
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

  return (
    <>
      <li className="pb-1.5 relative flex items-start group">
        <span className="text-2xl mr-3 select-none">{event.emoji}</span>

        <div className="flex-1 text-base">
          <a
            href={event.ticketUrl || mapsUrl}
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
              className="inline-block align-middle ml-2 text-xs font-black font-sora uppercase px-1.5 py-0.5"
              style={{ backgroundColor: AB_ORANGE, position: "relative", top: "-1px" }}
            >
              {event.price}
            </span>
          )}

          {event.ticketUrl && (
            <span className="inline-block align-middle ml-2" style={{ position: "relative", top: "-1px" }}>
              <a
                href={event.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-black text-[#FEABDA] hover:text-[#41F2EE] text-xs font-black font-sora uppercase tracking-wide px-2 py-0.5 transition-colors"
              >
                Reserve
              </a>
            </span>
          )}

          {event.sourceUrl && (
            <span className="inline-block align-middle ml-2" style={{ position: "relative", top: "-1px" }}>
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-black text-white hover:text-[#41F2EE] text-xs font-black font-sora uppercase tracking-wide px-2 py-0.5 transition-colors"
              >
                View Post
              </a>
            </span>
          )}
        </div>

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
            <DropdownMenuContent align="end" className="w-32 border-none bg-gray-100 shadow-md rounded-sm font-sans">
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); setIsEditOpen(true); }}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                Edit
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
            <AlertDialogTitle className="font-anton text-xl uppercase">Delete this popup?</AlertDialogTitle>
            <AlertDialogDescription className="font-sora text-sm">
              <strong>{event.name}</strong> will be permanently removed from the feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-sora font-black text-xs uppercase hover:bg-black hover:text-white transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-black text-white border-2 border-black rounded-none font-sora font-black text-xs uppercase hover:text-red-400 transition-colors"
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

function EditFoodEventModal({ event, onClose }: { event: FoodEvent; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
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
  });

  const set = (field: keyof InsertFoodEvent, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

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
    if (!form.name || !form.venue || !form.dateStart || !form.cuisine || !form.requester) {
      toast({ title: "Missing fields", description: "Name, venue, date, cuisine, and your name are required.", variant: "destructive" });
      return;
    }
    updateMutation.mutate(form);
  };

  const inputClass = "border-2 border-black rounded-none bg-white font-sora text-sm";
  const labelClass = "font-sora font-black text-xs uppercase tracking-wide text-black mb-0.5 block";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: AB_GOLD }}>
        <DialogHeader>
          <DialogTitle className="font-anton text-3xl text-black uppercase tracking-tight">
            Edit Popup
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
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
                  {cuisineTypes.map(c => <SelectItem key={c} value={c} className="font-sora">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

          <div>
            <label className={labelClass}>One-liner *</label>
            <Input value={form.summary || ""} onChange={e => set("summary", e.target.value)}
              className={inputClass} placeholder="MC'd hot pot with curated broths — bring your crew"
              maxLength={75} />
            <p className="text-xs font-sora text-gray-400 mt-0.5">{(form.summary || "").length}/75</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Price</label>
              <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                className={inputClass} placeholder="$55/person" />
            </div>
            <div>
              <label className={labelClass}>Ticket / Reservation URL</label>
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

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border-2 border-black bg-white font-black font-sora uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={updateMutation.isPending}
              className="flex-1 px-4 py-2.5 border-2 border-black bg-black text-white font-black font-sora uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Event Modal ────────────────────────────────────────────────────────────

const BLANK: Partial<InsertFoodEvent> = {
  emoji: "", name: "", venue: "", neighborhood: "",
  dateStart: "", dateEnd: "", summary: "",
  cuisine: "", price: "", ticketUrl: "", sourceUrl: "", rawBlurb: "", requester: "",
};

function AddEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [blurb, setBlurb] = useState("");
  const [form, setForm] = useState<Partial<InsertFoodEvent>>(BLANK);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const set = (field: keyof InsertFoodEvent, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const parseMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: "/api/ai/parse-blurb", method: "POST", data: { blurb } }),
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
      handleClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't add event.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.venue || !form.dateStart || !form.cuisine || !form.requester) {
      toast({ title: "Missing fields", description: "Name, venue, date, cuisine, and your name are required.", variant: "destructive" });
      return;
    }
    createMutation.mutate(form as InsertFoodEvent);
  };

  const handleClose = () => {
    onClose(); setBlurb(""); setForm(BLANK); setShowForm(false);
  };

  const inputClass = "border-2 border-black rounded-none bg-white font-sora text-sm";
  const labelClass = "font-sora font-black text-xs uppercase tracking-wide text-black mb-0.5 block";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: AB_GOLD }}>
        <DialogHeader>
          <DialogTitle className="font-anton text-3xl text-black uppercase tracking-tight">
            Add a Popup
          </DialogTitle>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <p className="text-sm font-sora text-gray-700">
              Paste a social media blurb and AI will parse the details — or skip to the form.
            </p>
            <div>
              <label className={labelClass}>Social media blurb</label>
              <Textarea rows={5}
                placeholder={`e.g.\n\nhopalleydenver\n\nWe are happy to announce our Hop Alley Hot Pot Pop-Up Nights! On March 26-28…`}
                value={blurb} onChange={e => setBlurb(e.target.value)}
                className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass}>Original post link</label>
              <Input
                value={form.sourceUrl || ""}
                onChange={e => set("sourceUrl", e.target.value)}
                className={inputClass}
                placeholder="https://instagram.com/p/… or eventbrite link" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => parseMutation.mutate()}
                disabled={!blurb.trim() || parseMutation.isPending}
                className="flex-1 bg-black text-white font-black font-sora uppercase tracking-wide text-sm px-4 py-2.5 border-2 border-black hover:text-[#41F2EE] transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Sparkles className="w-4 h-4" />
                {parseMutation.isPending ? "Parsing…" : "Parse with AI"}
              </button>
              <button onClick={() => setShowForm(true)}
                className="px-4 py-2.5 border-2 border-black bg-white font-black font-sora uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
                Skip
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
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
                    {cuisineTypes.map(c => <SelectItem key={c} value={c} className="font-sora">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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

            <div>
              <label className={labelClass}>One-liner *</label>
              <Input value={form.summary || ""} onChange={e => set("summary", e.target.value)}
                className={inputClass} placeholder="MC'd hot pot with curated broths — bring your crew"
                maxLength={75} />
              <p className="text-xs font-sora text-gray-400 mt-0.5">{(form.summary || "").length}/75</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Price</label>
                <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                  className={inputClass} placeholder="$55/person" />
              </div>
              <div>
                <label className={labelClass}>Ticket / Reservation URL</label>
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

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose}
                className="flex-1 px-4 py-2.5 border-2 border-black bg-white font-black font-sora uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createMutation.isPending}
                className="flex-1 px-4 py-2.5 border-2 border-black bg-black text-white font-black font-sora uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {createMutation.isPending ? "Adding…" : "Add Popup"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AmsueBouche() {
  const [addOpen, setAddOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<FoodEvent[]>({
    queryKey: ["/api/food-events"],
  });

  const grouped = events.reduce<Record<string, FoodEvent[]>>((acc, ev) => {
    const key = getMonthLabel(ev.dateStart);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: AB_GOLD }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 shadow-md px-4 py-3" style={{ backgroundColor: AB_ORANGE }}>
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-baseline gap-2">
              <Link href="/amuse-bouche">
                <h1 className="font-anton text-3xl md:text-4xl text-black hover:text-[#41F2EE] transition-colors cursor-pointer tracking-tight">
                  AMUSE BOUCHE
                </h1>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-sora text-sm font-semibold text-black opacity-60 hidden sm:block">
                Denver food popups
              </span>
              <button onClick={() => setAddOpen(true)}
                className="bg-black text-[#FEABDA] hover:text-[#41F2EE] font-black font-sora uppercase tracking-wide text-sm rounded-full px-3 py-1.5 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />Popup
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero strip ── */}
      <div className="py-3 px-4 text-center" style={{ backgroundColor: AB_PINK }}>
        <p className="font-sora text-sm font-semibold text-black max-w-xl mx-auto">
          Exclusive popups, secret dinners &amp; one-night-only experiences for our foodie community.
          Spot something? Paste the blurb and let AI do the rest.
        </p>
      </div>

      {/* ── Feed ── */}
      <main className="container mx-auto px-4 py-6 flex-1 max-w-2xl">

        {isLoading && (
          <div className="text-center py-16 text-gray-400 font-sora">
            <UtensilsCrossed className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Loading the good stuff…</p>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="text-center py-16">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-anton text-2xl text-black uppercase mb-1">Nothing on the menu yet.</p>
            <p className="font-sora text-sm text-gray-600 mb-4">Be the first to add a popup.</p>
            <button onClick={() => setAddOpen(true)}
              className="bg-black text-white font-black font-sora uppercase tracking-wide text-sm px-6 py-2.5 border-2 border-black hover:text-[#41F2EE] transition-colors inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />Add a Popup
            </button>
          </div>
        )}

        {Object.entries(grouped).map(([month, monthEvents]) => {
          return (
            <div key={month} className="mb-6">
              {/* Fix 1: Month header — line — MONTH — line treatment */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-0.5 flex-1 bg-black" />
                <h2 className="font-anton text-lg font-black uppercase text-black">
                  {month.toUpperCase()}
                </h2>
                <div className="h-0.5 flex-1 bg-black" />
              </div>
              <ul className="space-y-0">
                {monthEvents.map(ev => (
                  <FoodEventRow key={ev.id} event={ev} />
                ))}
              </ul>
            </div>
          );
        })}
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 px-4" style={{ backgroundColor: AB_ORANGE }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Link href="/"
              className="font-sora text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline flex items-center gap-1">
              <List className="w-4 h-4" />SETLIST SOCIAL FEED
            </Link>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setAddOpen(true)}
              className="font-sora text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline">
              ADD A POPUP
            </button>
          </div>
          <span className="font-sora text-sm text-black">© {new Date().getFullYear()} Amuse Bouche</span>
        </div>
      </footer>

      <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
