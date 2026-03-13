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
import { UtensilsCrossed, MapPin, Ticket, Heart, Plus, Sparkles, ExternalLink, List, ChevronDown } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(dateStart: string, dateEnd?: string | null): string {
  const fmt = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  if (!dateEnd || dateEnd === dateStart) return fmt(dateStart);
  const s = new Date(dateStart + "T12:00:00");
  const e = new Date(dateEnd + "T12:00:00");
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}`;
  }
  return `${fmt(dateStart)} – ${fmt(dateEnd)}`;
}

function getMonthLabel(dateStart: string): string {
  const d = new Date(dateStart + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const MONTH_COLORS: Record<string, string> = {
  January: "#EF4444", February: "#EC4899", March: "#22C55E",
  April: "#3B82F6", May: "#8B5CF6", June: "#EAB308",
  July: "#F97316", August: "#14B8A6", September: "#6366F1",
  October: "#F59E0B", November: "#06B6D4", December: "#F43F5E",
};

function monthColor(dateStart: string) {
  const month = new Date(dateStart + "T12:00:00").toLocaleDateString("en-US", { month: "long" });
  return MONTH_COLORS[month] || "#D97706";
}

// ── Event Card ────────────────────────────────────────────────────────────────

function FoodEventCard({ event, onUpvote }: { event: FoodEvent; onUpvote: (id: number) => void }) {
  const [upvoted, setUpvoted] = useState(false);

  const handleUpvote = () => {
    if (!upvoted) {
      onUpvote(event.id);
      setUpvoted(true);
    }
  };

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + " Denver CO")}`;

  return (
    <div className="bg-white border-2 border-black rounded-none p-4 mb-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none pt-0.5">{event.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h3 className="font-black text-lg leading-tight text-black">{event.name}</h3>
            {event.price && (
              <span className="text-xs font-bold bg-[#D97706] text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                {event.price}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-600 mb-2">
            <span className="font-medium text-black">{event.venue}</span>
            {event.neighborhood && (
              <>
                <span className="text-gray-400">·</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" />
                  {event.neighborhood}
                </span>
              </>
            )}
            <span className="text-gray-400">·</span>
            <span className="font-medium" style={{ color: monthColor(event.dateStart) }}>
              {formatDateRange(event.dateStart, event.dateEnd)}
            </span>
          </div>

          <p className="text-sm text-gray-700 mb-3">{event.summary}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold bg-[#E8F5E9] text-[#1B5E20] border border-[#A5D6A7] px-2 py-0.5 rounded-full">
              {event.cuisine}
            </span>

            <div className="flex items-center gap-2 ml-auto">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-black transition-colors flex items-center gap-0.5">
                <MapPin className="w-3 h-3" /> Map
              </a>

              {event.ticketUrl && (
                <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold bg-black text-white hover:bg-[#2D6A4F] px-2 py-0.5 rounded transition-colors flex items-center gap-0.5">
                  <Ticket className="w-3 h-3" /> Reserve
                </a>
              )}

              <button
                onClick={handleUpvote}
                disabled={upvoted}
                className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border-2 transition-colors ${
                  upvoted
                    ? "border-[#D97706] text-[#D97706] bg-[#FFF8E1]"
                    : "border-black text-black hover:border-[#D97706] hover:text-[#D97706]"
                }`}
              >
                <Heart className={`w-3 h-3 ${upvoted ? "fill-current" : ""}`} />
                {event.upvotes + (upvoted ? 1 : 0)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Event Form / Modal ─────────────────────────────────────────────────────

const BLANK_FORM: Partial<InsertFoodEvent> = {
  emoji: "", name: "", venue: "", neighborhood: "",
  dateStart: "", dateEnd: "", summary: "",
  cuisine: "", price: "", ticketUrl: "", rawBlurb: "", requester: "",
};

function AddEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [blurb, setBlurb] = useState("");
  const [parsing, setParsing] = useState(false);
  const [form, setForm] = useState<Partial<InsertFoodEvent>>(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const setField = (field: keyof InsertFoodEvent, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const parseBlurbMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({ endpoint: "/api/ai/parse-blurb", method: "POST", data: { blurb } });
    },
    onSuccess: (data) => {
      setForm({ ...data, rawBlurb: blurb, requester: form.requester || "" });
      setShowForm(true);
      toast({ title: "Blurb parsed!", description: "Review the details and add your name." });
    },
    onError: () => {
      toast({ title: "Parse failed", description: "Try again or fill in the form manually.", variant: "destructive" });
      setShowForm(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertFoodEvent) => {
      return apiRequest({ endpoint: "/api/food-events", method: "POST", data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/food-events"] });
      toast({ title: "Event added!", description: "Your popup is now on the feed." });
      onClose();
      setBlurb("");
      setForm(BLANK_FORM);
      setShowForm(false);
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
    onClose();
    setBlurb("");
    setForm(BLANK_FORM);
    setShowForm(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-[#F1F8E9] border-2 border-black rounded-none max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-black">ADD A POPUP</DialogTitle>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Paste a social media blurb and let AI extract the details — or skip straight to the form.
            </p>
            <div>
              <Label className="font-bold text-black mb-1 block">Social media blurb</Label>
              <Textarea
                rows={6}
                placeholder={`e.g.\n\nhopalleydenver\n\nWe are happy to announce our Hop Alley Hot Pot Pop-Up Nights! On March 26-28, grab some friends…`}
                value={blurb}
                onChange={e => setBlurb(e.target.value)}
                className="border-2 border-black rounded-none bg-white text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => parseBlurbMutation.mutate()}
                disabled={!blurb.trim() || parseBlurbMutation.isPending}
                className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-none flex-1"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {parseBlurbMutation.isPending ? "Parsing…" : "Parse with AI"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(true)}
                className="border-2 border-black rounded-none font-bold"
              >
                Skip
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-bold text-black text-xs">Emoji *</Label>
                <Input value={form.emoji || ""} onChange={e => setField("emoji", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" placeholder="🍲" />
              </div>
              <div>
                <Label className="font-bold text-black text-xs">Cuisine *</Label>
                <Select value={form.cuisine || ""} onValueChange={v => setField("cuisine", v)}>
                  <SelectTrigger className="border-2 border-black rounded-none bg-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuisineTypes.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="font-bold text-black text-xs">Event Name *</Label>
              <Input value={form.name || ""} onChange={e => setField("name", e.target.value)}
                className="border-2 border-black rounded-none bg-white" placeholder="Hot Pot Pop-Up Nights" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-bold text-black text-xs">Venue / Restaurant *</Label>
                <Input value={form.venue || ""} onChange={e => setField("venue", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" placeholder="Hop Alley" />
              </div>
              <div>
                <Label className="font-bold text-black text-xs">Neighborhood</Label>
                <Input value={form.neighborhood || ""} onChange={e => setField("neighborhood", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" placeholder="RiNo, Capitol Hill…" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-bold text-black text-xs">Start Date *</Label>
                <Input type="date" value={form.dateStart || ""} onChange={e => setField("dateStart", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" />
              </div>
              <div>
                <Label className="font-bold text-black text-xs">End Date</Label>
                <Input type="date" value={form.dateEnd || ""} onChange={e => setField("dateEnd", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" />
              </div>
            </div>

            <div>
              <Label className="font-bold text-black text-xs">Summary *</Label>
              <Input value={form.summary || ""} onChange={e => setField("summary", e.target.value)}
                className="border-2 border-black rounded-none bg-white"
                placeholder="MC'd hot pot with curated broths — bring your crew" maxLength={75} />
              <p className="text-xs text-gray-400 mt-0.5">{(form.summary || "").length}/75 chars</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-bold text-black text-xs">Price</Label>
                <Input value={form.price || ""} onChange={e => setField("price", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" placeholder="$55/person" />
              </div>
              <div>
                <Label className="font-bold text-black text-xs">Ticket / Reservation URL</Label>
                <Input value={form.ticketUrl || ""} onChange={e => setField("ticketUrl", e.target.value)}
                  className="border-2 border-black rounded-none bg-white" placeholder="https://tock.com/…" />
              </div>
            </div>

            <div>
              <Label className="font-bold text-black text-xs">Your Name *</Label>
              <Input value={form.requester || ""} onChange={e => setField("requester", e.target.value)}
                className="border-2 border-black rounded-none bg-white" placeholder="Mandi" />
            </div>

            <DialogFooter className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}
                className="border-2 border-black rounded-none font-bold flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}
                className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-black rounded-none flex-1">
                {createMutation.isPending ? "Adding…" : "Add Popup"}
              </Button>
            </DialogFooter>
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
    mutationFn: async (id: number) => {
      return apiRequest({ endpoint: `/api/food-events/${id}/upvote`, method: "POST", data: {} });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/food-events"] });
    },
    onError: () => {
      toast({ title: "Couldn't upvote", description: "Try again.", variant: "destructive" });
    },
  });

  // Group by month
  const grouped = events.reduce<Record<string, FoodEvent[]>>((acc, ev) => {
    const key = getMonthLabel(ev.dateStart);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAFAF7" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 shadow-md px-4 py-3" style={{ backgroundColor: "#2D6A4F" }}>
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-3">
              <UtensilsCrossed className="w-6 h-6 text-white opacity-80" />
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">AMUSE BOUCHE</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-green-200 text-sm font-medium hidden sm:block">
                Denver food popups
              </span>
              <button
                onClick={() => setAddOpen(true)}
                className="bg-[#D97706] hover:bg-[#B45309] text-white font-black px-4 py-2 rounded-none flex items-center gap-1 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Popup
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero strip */}
      <div className="py-4 px-4 text-center border-b-2 border-black" style={{ backgroundColor: "#F0FDF4" }}>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Exclusive popups, secret dinners, and one-night-only experiences for our foodie community.
          Spot something good? Paste the blurb and let AI do the rest.
        </p>
      </div>

      {/* Feed */}
      <main className="container mx-auto px-4 py-6 flex-1 max-w-2xl">
        {isLoading && (
          <div className="text-center py-16 text-gray-500">
            <UtensilsCrossed className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Loading the good stuff…</p>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-bold text-lg text-black">Nothing on the menu yet.</p>
            <p className="text-sm mt-1 mb-4">Be the first to add a popup.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="bg-[#2D6A4F] text-white font-black px-6 py-2 rounded-none inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add a Popup
            </button>
          </div>
        )}

        {Object.entries(grouped).map(([month, monthEvents]) => {
          const color = monthColor(monthEvents[0].dateStart);
          return (
            <div key={month} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-0.5 flex-1" style={{ backgroundColor: color }} />
                <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>
                  {month.toUpperCase()}
                </span>
                <div className="h-0.5 flex-1" style={{ backgroundColor: color }} />
              </div>
              {monthEvents.map(ev => (
                <FoodEventCard key={ev.id} event={ev} onUpvote={(id) => upvoteMutation.mutate(id)} />
              ))}
            </div>
          );
        })}
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 border-t-2 border-black" style={{ backgroundColor: "#D97706" }}>
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-sm font-semibold">
          <Link href="/" className="text-black hover:text-white transition-colors flex items-center gap-1 underline">
            <List className="w-4 h-4" /> SETLIST SOCIAL FEED
          </Link>
          <span className="text-black">© {new Date().getFullYear()} Amuse Bouche</span>
          <button
            onClick={() => setAddOpen(true)}
            className="text-black hover:text-white transition-colors underline"
          >
            ADD A POPUP
          </button>
        </div>
      </footer>

      <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
