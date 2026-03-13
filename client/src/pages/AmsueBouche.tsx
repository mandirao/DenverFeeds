import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cuisineTypes, type FoodEvent, type InsertFoodEvent } from "@shared/schema";
import { UtensilsCrossed, Plus, Sparkles, List, ArrowUp } from "lucide-react";

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

const MONTH_COLORS: Record<string, string> = {
  January: "#EF4444", February: "#EC4899", March: "#22C55E",
  April: "#3B82F6", May: "#8B5CF6", June: "#EAB308",
  July: "#F97316", August: "#14B8A6", September: "#6366F1",
  October: "#F59E0B", November: "#06B6D4", December: "#F43F5E",
};

function monthColor(dateStart: string) {
  const month = new Date(dateStart + "T12:00:00").toLocaleDateString("en-US", { month: "long" });
  return MONTH_COLORS[month] || AB_ORANGE;
}

// ── Event Row (inline sentence style, matching Setlist Social) ────────────────

function FoodEventRow({ event, onUpvote }: { event: FoodEvent; onUpvote: (id: number) => void }) {
  const [upvoted, setUpvoted] = useState(false);
  const [showUpvoteTooltip, setShowUpvoteTooltip] = useState(false);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + " Denver CO")}`;

  const handleUpvote = () => {
    if (!upvoted) { onUpvote(event.id); setUpvoted(true); }
    setShowUpvoteTooltip(true);
    setTimeout(() => setShowUpvoteTooltip(false), 2000);
  };

  const location = event.neighborhood ? `${event.venue}, ${event.neighborhood}` : event.venue;

  return (
    <li className="pb-1.5 relative flex items-start">
      <span className="text-2xl mr-3 select-none">{event.emoji}</span>

      <div className="flex-1 text-base">
        {/* Event name — links to ticket URL if available, else maps */}
        <a
          href={event.ticketUrl || mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
        >
          {event.name}
        </a>

        {" @ "}

        {/* Venue — links to Google Maps */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
        >
          {location}
        </a>

        {" ("}
        <span style={{ color: monthColor(event.dateStart) }} className="font-medium">
          {formatDateRange(event.dateStart, event.dateEnd)}
        </span>
        {"). "}

        {event.summary}

        {/* Price badge inline */}
        {event.price && (
          <span
            className="inline-block align-middle ml-1 text-xs font-black font-sora uppercase px-1.5 py-0.5"
            style={{ backgroundColor: AB_ORANGE, position: "relative", top: "-1px" }}
          >
            {event.price}
          </span>
        )}

        {/* Reserve CTA — inline if ticket URL exists */}
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

        {/* Upvote pill — inline, same style as Setlist */}
        <span
          className="inline-block align-middle ml-2"
          style={{ position: "relative", top: "-1px" }}
          onMouseEnter={() => setShowUpvoteTooltip(true)}
          onMouseLeave={() => !upvoted && setShowUpvoteTooltip(false)}
        >
          <button
            onClick={handleUpvote}
            disabled={upvoted}
            className={`${upvoted ? "bg-[#25428A] text-white" : "bg-black text-[#FE6B41] hover:text-[#41F2EE]"} rounded-full text-xs flex items-center gap-1 h-5 px-2 py-0 cursor-pointer transition-colors`}
          >
            <ArrowUp className="h-3 w-3" /> {event.upvotes + (upvoted ? 1 : 0)}
          </button>
        </span>
      </div>
    </li>
  );
}

// ── Add Event Modal ────────────────────────────────────────────────────────────

const BLANK: Partial<InsertFoodEvent> = {
  emoji: "", name: "", venue: "", neighborhood: "",
  dateStart: "", dateEnd: "", summary: "",
  cuisine: "", price: "", ticketUrl: "", rawBlurb: "", requester: "",
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
      setForm({ ...data, rawBlurb: blurb, requester: form.requester || "" });
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
              <Textarea rows={6}
                placeholder={`e.g.\n\nhopalleydenver\n\nWe are happy to announce our Hop Alley Hot Pot Pop-Up Nights! On March 26-28…`}
                value={blurb} onChange={e => setBlurb(e.target.value)}
                className={`${inputClass} resize-none`} />
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
  const { toast } = useToast();

  const { data: events = [], isLoading } = useQuery<FoodEvent[]>({
    queryKey: ["/api/food-events"],
  });

  const upvoteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest({ endpoint: `/api/food-events/${id}/upvote`, method: "POST", data: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/food-events"] }),
    onError: () => toast({ title: "Couldn't upvote", variant: "destructive" }),
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
      <div className="border-b-2 border-black py-3 px-4 text-center" style={{ backgroundColor: AB_PINK }}>
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
          const color = monthColor(monthEvents[0].dateStart);
          return (
            <div key={month} className="mb-6">
              {/* Month header — same style as Setlist's MonthGroup */}
              <h2 className="text-xl text-black mb-3 font-anton font-black" style={{ color }}>
                {month.toUpperCase()}
              </h2>
              <ul className="space-y-0">
                {monthEvents.map(ev => (
                  <FoodEventRow key={ev.id} event={ev} onUpvote={(id) => upvoteMutation.mutate(id)} />
                ))}
              </ul>
            </div>
          );
        })}
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 px-4 border-t-2 border-black" style={{ backgroundColor: AB_ORANGE }}>
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
