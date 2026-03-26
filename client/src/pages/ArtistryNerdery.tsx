import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
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

// ── Colors ────────────────────────────────────────────────────────────────────
const AN_ORANGE   = "#000000";
const AN_LAVENDER = "#FE6B41";
const AN_BG       = "#FEABDA";
const AN_TEAL     = "#41F2EE";

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

function createSearchUrl(event: ArtEvent): string {
  const parts: string[] = [event.name, event.venue, "Denver"];
  if (event.dateStart) {
    const d = new Date(event.dateStart + "T12:00:00");
    parts.push(d.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
  }
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

function createCalendarUrl(event: ArtEvent): string {
  const toGCal = (d: string) => d.replace(/-/g, "");
  const start = toGCal(event.dateStart);
  const endDate = event.dateEnd ? event.dateEnd : event.dateStart;
  const end = toGCal(new Date(new Date(endDate + "T12:00:00").getTime() + 86400000).toISOString().slice(0, 10));
  const text = encodeURIComponent(event.name);
  const loc = encodeURIComponent(`${event.venue}${event.neighborhood ? ", " + event.neighborhood : ""}, Denver CO`);
  const detailsParts: string[] = [];
  if (event.summary) detailsParts.push(event.summary);
  if (event.ticketUrl) detailsParts.push(`Tickets: ${event.ticketUrl}`);
  if (event.sourceUrl) detailsParts.push(`More info: ${event.sourceUrl}`);
  const details = encodeURIComponent(detailsParts.join("\n"));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&location=${loc}&details=${details}&dates=${start}/${end}`;
}

// ── Event Row ─────────────────────────────────────────────────────────────────

function ArtEventRow({ event }: { event: ArtEvent }) {
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
    mutationFn: () => apiRequest({ endpoint: `/api/art-events/${event.id}`, method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: "Deleted", description: `${event.name} removed from the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete this event.", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/art-events/${event.id}/duplicate`, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: "Duplicated", description: `${event.name} copied to the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't duplicate this event.", variant: "destructive" }),
  });

  const soldOutMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `/api/art-events/${event.id}`, method: "PATCH", data: { soldOut: !event.soldOut } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: event.soldOut ? "Back on the list" : "Marked as sold out", description: event.name });
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
            {(event.isRecurring || riskPips(event.selloutRisk)) && (
              <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#ffff00" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
                {event.isRecurring && <span>↻ {event.recurrenceLabel || "Recurring"}</span>}
                {riskPips(event.selloutRisk) && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{event.isRecurring ? " " : "· "}{riskPips(event.selloutRisk)}</span>}
              </span>
            )}
          </div>
        ) : (
          <div className="flex-1 text-base">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={createSearchUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
                  >
                    {event.name}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Search on Google</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {" @ "}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
                  >
                    {location}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Find on Google Maps</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {" ("}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium border-b border-dotted border-black hover:border-solid cursor-pointer text-black"
                  >
                    {formatDateRange(event.dateStart, event.dateEnd)}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Add to Google Calendar</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {"). "}

            {event.summary}

            {event.isRecurring && event.instanceNotes?.[event.dateStart] && (
              <span className="block text-sm italic mt-0.5" style={{ opacity: 0.75 }}>
                ↳ {(event.instanceNotes as Record<string, string>)[event.dateStart]}
              </span>
            )}

            {event.category && (
              <span className="italic"> {event.category}.</span>
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
                className="inline-flex items-center align-middle ml-2 bg-black text-[#FE6B41] hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                Tickets
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

            {(event.isRecurring || riskPips(event.selloutRisk)) && (
              <span className="text-[10px] ml-1.5 tracking-tight" style={{ color: event.selloutRisk === 5 ? "#FE6B41" : event.selloutRisk === 4 ? "#ffff00" : undefined, opacity: (event.selloutRisk === 5 || event.selloutRisk === 4) ? 1 : 0.4 }}>
                {event.isRecurring && <span>↻ {event.recurrenceLabel || "Recurring"}</span>}
                {riskPips(event.selloutRisk) && <span title={`Sellout risk: ${RISK_LABELS[event.selloutRisk!]}`} style={{ fontSize: '8px', letterSpacing: '0.2em' }}>{event.isRecurring ? " " : "· "}{riskPips(event.selloutRisk)}</span>}
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

      {isEditOpen && (
        <EditArtEventModal event={event} onClose={() => setIsEditOpen(false)} />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AN_BG }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl uppercase">Delete this event?</AlertDialogTitle>
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

// ── Edit Art Event Modal ───────────────────────────────────────────────────────

function getMissingField(form: Partial<InsertArtEvent>): { field: string; label: string } | null {
  if (!form.requester?.trim()) return { field: "requester", label: "Your name" };
  if (!form.name?.trim())      return { field: "name",      label: "Event name" };
  if (!form.venue?.trim())     return { field: "venue",     label: "Venue" };
  if (!form.dateStart?.trim()) return { field: "dateStart", label: "Start date" };
  if (!form.emoji?.trim())     return { field: "emoji",     label: "Emoji" };
  if (!form.category?.trim())  return { field: "category",  label: "Category" };
  return null;
}

function EditArtEventModal({ event, onClose }: { event: ArtEvent; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [redoLoading, setRedoLoading] = useState(false);
  const occurrenceDate = event.dateStart;
  const [instanceNote, setInstanceNote] = useState<string>(
    (event.instanceNotes as Record<string, string> | null | undefined)?.[occurrenceDate] ?? ""
  );
  const [form, setForm] = useState<Partial<InsertArtEvent>>({
    emoji: event.emoji || "",
    name: event.name || "",
    venue: event.venue || "",
    neighborhood: event.neighborhood || "",
    dateStart: event.dateStart || "",
    dateEnd: event.dateEnd || "",
    summary: event.summary || "",
    category: event.category || "",
    price: event.price || "",
    ticketUrl: event.ticketUrl || "",
    sourceUrl: event.sourceUrl || "",
    requester: event.requester || "",
    announcedAt: event.announcedAt || "",
    selloutRisk: event.selloutRisk ?? undefined,
    isRecurring: event.isRecurring ?? false,
    recurrenceLabel: event.recurrenceLabel || "",
  });

  const set = (field: keyof InsertArtEvent, value: string) => {
    setErrorField(null);
    setForm(f => ({ ...f, [field]: value }));
  };

  const isDirty = () => {
    const keys: (keyof InsertArtEvent)[] = ["emoji", "name", "venue", "neighborhood", "dateStart", "dateEnd", "summary", "category", "price", "ticketUrl", "sourceUrl", "requester", "announcedAt", "recurrenceLabel"];
    const originalNote = (event.instanceNotes as Record<string, string> | null | undefined)?.[occurrenceDate] ?? "";
    return keys.some(k => (form[k] || "") !== ((event[k as keyof ArtEvent] as string) || ""))
      || form.selloutRisk !== (event.selloutRisk ?? undefined)
      || form.isRecurring !== (event.isRecurring ?? false)
      || instanceNote !== originalNote;
  };

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertArtEvent> & { instanceNotes?: Record<string, string> }) =>
      apiRequest({ endpoint: `/api/art-events/${event.id}`, method: "PATCH", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: "Updated!", description: `${form.name} saved.` });
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
      setErrorField(missing.field);
      toast({ title: `${missing.label} is required`, variant: "destructive" });
      setTimeout(() => document.getElementById(`edit-an-${missing.field}`)?.focus(), 50);
      return;
    }
    const existingNotes = (event.instanceNotes as Record<string, string> | null | undefined) ?? {};
    const updatedNotes = { ...existingNotes };
    if (instanceNote.trim()) {
      updatedNotes[occurrenceDate] = instanceNote.trim();
    } else {
      delete updatedNotes[occurrenceDate];
    }
    updateMutation.mutate({ ...form, instanceNotes: updatedNotes });
  };

  const handleClose = () => {
    if (isDirty()) setShowConfirmClose(true);
    else onClose();
  };

  const handleRedoAI = async () => {
    if (!form.name) {
      toast({ title: "Event name required", variant: "destructive" });
      return;
    }
    setRedoLoading(true);
    try {
      const res = await apiRequest({
        endpoint: "/api/ai/redo-art-event-content",
        method: "POST",
        data: {
          name: form.name,
          venue: form.venue,
          category: form.category,
          isRecurring: form.isRecurring,
          recurrenceLabel: form.recurrenceLabel,
          dateStart: form.dateStart,
          currentSummary: form.summary,
          currentInstanceNote: instanceNote,
        },
      });
      if (res.status === "no-info") {
        if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
        toast({
          title: "Description polished ✓",
          description: `No new occurrence details found yet — ${res.message}`,
        });
      } else {
        if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
        if (res.instanceNote !== undefined) setInstanceNote(res.instanceNote || "");
        toast({ title: "Content refreshed ✨", description: "Description updated with latest details." });
      }
    } catch (e: any) {
      toast({ title: "AI refresh failed", description: e?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setRedoLoading(false);
    }
  };

  const inputClass = "border-2 border-black rounded-none bg-white text-sm";
  const labelClass = "font-black text-xs uppercase tracking-wide text-black mb-0.5 block";
  const fieldErr = (f: string) => errorField === f ? " !border-red-500 ring-2 ring-red-200" : "";

  return (
    <>
      <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AN_BG }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase">Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-black uppercase text-sm">Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} className="bg-black text-white border-2 border-black rounded-none font-black uppercase text-sm hover:text-[#41F2EE]">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open onOpenChange={handleClose}>
        <DialogContent className="w-full max-w-lg md:max-w-3xl border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: AN_BG }}>
          <DialogHeader>
            <DialogTitle className="text-3xl text-black uppercase tracking-tight">
              Edit Event
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Your Name — always first */}
            <div>
              <label className={labelClass}>Your Name *</label>
              <Input id="edit-an-requester" value={form.requester || ""} onChange={e => set("requester", e.target.value)}
                className={inputClass + fieldErr("requester")} placeholder="Mandi" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-5 gap-y-3 md:gap-y-0">

              {/* Left column — core identity + scheduling */}
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Event Name *</label>
                  <Input id="edit-an-name" value={form.name || ""} onChange={e => set("name", e.target.value)}
                    className={inputClass + fieldErr("name")} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Venue *</label>
                    <Input id="edit-an-venue" value={form.venue || ""} onChange={e => set("venue", e.target.value)}
                      className={inputClass + fieldErr("venue")} />
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
                    <Input id="edit-an-dateStart" type="date" value={form.dateStart || ""} onChange={e => set("dateStart", e.target.value)}
                      className={inputClass + fieldErr("dateStart")} />
                  </div>
                  <div>
                    <label className={labelClass}>End Date</label>
                    <Input type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd", e.target.value)}
                      className={inputClass} />
                  </div>
                </div>
                {/* Recurring — below dates */}
                <div>
                  <label className={labelClass}>Recurring <span className="font-normal normal-case opacity-60">(optional)</span></label>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 border-2 text-xs font-black transition-colors"
                      style={{ borderColor: "black", backgroundColor: form.isRecurring ? "black" : "white", color: form.isRecurring ? "white" : "black" }}
                    >↻ {form.isRecurring ? "Yes" : "No"}</button>
                    {form.isRecurring && (
                      <Input value={form.recurrenceLabel || ""} onChange={e => set("recurrenceLabel", e.target.value)}
                        className={inputClass + " flex-1"} placeholder="Monthly, Weekly, Every 1st Friday…" />
                    )}
                  </div>
                  {/* Per-occurrence note — visible whenever recurring is toggled on */}
                  {form.isRecurring && (
                    <div className="border-2 border-dashed border-black/40 p-2 mt-2" style={{ backgroundColor: "rgba(0,0,0,0.04)" }}>
                      <label className="font-black text-xs uppercase tracking-wide text-black mb-1 block">
                        ↻ This occurrence only
                        {occurrenceDate && (
                          <span className="font-normal normal-case ml-1 opacity-50">
                            — {new Date(occurrenceDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </label>
                      <textarea
                        value={instanceNote}
                        onChange={e => setInstanceNote(e.target.value)}
                        rows={2}
                        className="w-full border-2 border-black/30 bg-white text-sm p-2 resize-none focus:outline-none focus:border-black"
                        placeholder="Theme, featured guest, topic for this date only…"
                      />
                      <p className="text-[10px] text-black/40 mt-0.5">Won't affect other dates in the series.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column — metadata */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Emoji *</label>
                    <Input id="edit-an-emoji" value={form.emoji || ""} onChange={e => set("emoji", e.target.value)}
                      className={inputClass + fieldErr("emoji")} placeholder="🎨" />
                  </div>
                  <div>
                    <label className={labelClass}>Category *</label>
                    <Select value={form.category || ""} onValueChange={v => { setErrorField(null); set("category", v); }}>
                      <SelectTrigger id="edit-an-category" className={inputClass + fieldErr("category")}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px] overflow-y-auto">
                        {artCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Price</label>
                    <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                      className={inputClass} placeholder="$20/person" />
                  </div>
                  <div>
                    <label className={labelClass}>Ticket URL</label>
                    <Input value={form.ticketUrl || ""} onChange={e => set("ticketUrl", e.target.value)}
                      className={inputClass} placeholder="https://…" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Original post link</label>
                  <Input value={form.sourceUrl || ""} onChange={e => set("sourceUrl", e.target.value)}
                    className={inputClass} placeholder="https://instagram.com/p/…" />
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
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({ ...f, selloutRisk: f.selloutRisk === n ? undefined : n }))}
                        className="flex-1 py-1 border-2 text-xs font-black transition-colors"
                        style={{ borderColor: "black", backgroundColor: form.selloutRisk === n ? "black" : "white", color: form.selloutRisk === n ? "white" : "black" }}
                      >{n}</button>
                    ))}
                  </div>
                  {form.selloutRisk && (
                    <p className="text-xs text-gray-500 mt-0.5">{RISK_LABELS[form.selloutRisk]} — {riskPips(form.selloutRisk)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Description — full width at bottom */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className={labelClass + " mb-0"}>Description <span className="font-normal normal-case opacity-60">(recommended)</span></label>
                <button type="button" onClick={handleRedoAI} disabled={redoLoading}
                  className="flex items-center gap-1 px-2.5 py-1 border-2 border-black bg-white text-xs font-black uppercase tracking-wide hover:bg-black hover:text-[#41F2EE] transition-colors disabled:opacity-40"
                  title={form.isRecurring ? "Search for this occurrence's latest details + polish description" : "Polish description with latest web info"}>
                  {redoLoading ? "Searching…" : "✨ Refresh AI"}
                </button>
              </div>
              <Textarea value={form.summary || ""} onChange={e => set("summary", e.target.value)}
                className={`${inputClass} resize-none`} rows={3} maxLength={200}
                placeholder="Smart, specific snapshot of the event." />
              <p className="text-xs text-gray-400 mt-0.5 text-right">{(form.summary || "").length}/200</p>
            </div>

            <DialogFooter className="pt-1 flex gap-2">
              <button type="button" onClick={handleClose}
                className="px-4 py-2.5 border-2 border-black bg-white font-black uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Add Event Modal ────────────────────────────────────────────────────────────

const BLANK: Partial<InsertArtEvent> = {
  emoji: "", name: "", venue: "", neighborhood: "",
  dateStart: "", dateEnd: "", summary: "",
  category: "", price: "", ticketUrl: "", sourceUrl: "", rawBlurb: "", requester: "",
  announcedAt: "", selloutRisk: undefined, isRecurring: false, recurrenceLabel: "",
};

function AddEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [blurb, setBlurb] = useState("");
  const [form, setForm] = useState<Partial<InsertArtEvent>>(BLANK);
  const [instanceNote, setInstanceNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [inputMode, setInputMode] = useState<"screenshot" | "blurb">("screenshot");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [redoLoading, setRedoLoading] = useState(false);
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

  const set = (field: keyof InsertArtEvent, value: string) => {
    setErrorField(null);
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mediaType = file.type as string;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setImagePreview(dataUrl);
      setImageBase64(base64);
      setImageMediaType(mediaType);
    };
    reader.readAsDataURL(file);
  };

  const parseMutation = useMutation({
    mutationFn: () => apiRequest({
      endpoint: "/api/ai/parse-art-blurb",
      method: "POST",
      data: {
        blurb,
        ...(imageBase64 ? { imageBase64, imageMediaType, fileName: imageFileName } : {}),
      },
    }),
    onSuccess: (data) => {
      setForm({ ...data, rawBlurb: blurb, sourceUrl: form.sourceUrl || "", requester: form.requester || "" });
      setShowForm(true);
      toast({ title: "Parsed!", description: "Review the details below." });
    },
    onError: () => {
      toast({ title: "Parse failed", description: "Fill in the form manually.", variant: "destructive" });
      setShowForm(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertArtEvent) =>
      apiRequest({ endpoint: "/api/art-events", method: "POST", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/art-events"] });
      toast({ title: "Event added!", description: "It's now on the feed." });
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
      setErrorField(missing.field);
      toast({ title: `${missing.label} is required`, variant: "destructive" });
      setTimeout(() => document.getElementById(`add-an-${missing.field}`)?.focus(), 50);
      return;
    }
    const payload: InsertArtEvent = { ...(form as InsertArtEvent) };
    if (form.isRecurring && instanceNote.trim() && form.dateStart) {
      payload.instanceNotes = { [form.dateStart]: instanceNote.trim() };
    }
    createMutation.mutate(payload);
  };

  const hasContent = () => {
    const formHasContent = Object.values(form).some(v => v && v.toString().trim() !== "");
    return formHasContent || blurb.trim() !== "" || !!imageBase64;
  };

  const forceClose = () => {
    onClose();
    setBlurb("");
    setForm(BLANK);
    setInstanceNote("");
    setShowForm(false);
    setInputMode("screenshot");
    setImagePreview(null);
    setImageBase64(null);
    setImageMediaType(null);
    setImageFileName(null);
    setShowConfirmClose(false);
    setErrorField(null);
  };

  const handleClose = () => {
    if (hasContent()) setShowConfirmClose(true);
    else forceClose();
  };

  const handleRedoAI = async () => {
    if (!form.name) {
      toast({ title: "Event name required", variant: "destructive" });
      return;
    }
    setRedoLoading(true);
    try {
      const res = await apiRequest({
        endpoint: "/api/ai/redo-art-event-content",
        method: "POST",
        data: {
          name: form.name,
          venue: form.venue,
          category: form.category,
          isRecurring: form.isRecurring,
          recurrenceLabel: form.recurrenceLabel,
          dateStart: form.dateStart,
          currentSummary: form.summary,
          currentInstanceNote: instanceNote,
        },
      });
      if (res.status === "no-info") {
        if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
        toast({
          title: "Description polished ✓",
          description: `No new occurrence details found yet — ${res.message}`,
        });
      } else {
        if (res.summary) setForm(f => ({ ...f, summary: res.summary }));
        if (res.instanceNote !== undefined) setInstanceNote(res.instanceNote || "");
        toast({ title: "Content refreshed ✨", description: "Description updated with latest details." });
      }
    } catch (e: any) {
      toast({ title: "AI refresh failed", description: e?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setRedoLoading(false);
    }
  };

  const inputClass = "border-2 border-black rounded-none bg-white text-sm";
  const labelClass = "font-black text-xs uppercase tracking-wide text-black mb-0.5 block";
  const fieldErr = (f: string) => errorField === f ? " !border-red-500 ring-2 ring-red-200" : "";

  return (
    <>
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: AN_BG }}>
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
        style={{ backgroundColor: AN_BG }}>
        <DialogHeader>
          <DialogTitle className="text-3xl text-black uppercase tracking-tight">
            Add an Event
          </DialogTitle>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">

            {/* Mode toggle */}
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

            {/* Screenshot mode */}
            {inputMode === "screenshot" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Upload a screenshot from Instagram, Eventbrite, a museum site, or anywhere — AI will read the text directly from the image.</p>
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

            {/* Blurb mode */}
            {inputMode === "blurb" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Paste a caption or description from social media, a newsletter, or a museum listing — AI will extract the event details.</p>
                <Textarea rows={5}
                  placeholder={`e.g.\n\nDenver Art Museum\n\nJoin us for an exclusive evening with artist Kaws on April 12th…`}
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
                placeholder="https://instagram.com/p/… or ticketing link" />
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
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Use AI instead — visible button */}
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide border border-black px-3 py-1.5 bg-white hover:bg-black hover:text-white transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              ← Use AI instead
            </button>

            {/* Your Name — always first */}
            <div>
              <label className={labelClass}>Your Name *</label>
              <Input id="add-an-requester" value={form.requester || ""} onChange={e => set("requester", e.target.value)}
                className={inputClass + fieldErr("requester")} placeholder="Mandi" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-5 gap-y-4 md:gap-y-0">

              {/* Left column — core identity + scheduling */}
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Event Name *</label>
                  <Input id="add-an-name" value={form.name || ""} onChange={e => set("name", e.target.value)}
                    className={inputClass + fieldErr("name")} placeholder="Saturn at Opposition" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Venue *</label>
                    <Input id="add-an-venue" value={form.venue || ""} onChange={e => set("venue", e.target.value)}
                      className={inputClass + fieldErr("venue")} placeholder="Denver Art Museum" />
                  </div>
                  <div>
                    <label className={labelClass}>Neighborhood</label>
                    <Input value={form.neighborhood || ""} onChange={e => set("neighborhood", e.target.value)}
                      className={inputClass} placeholder="Capitol Hill…" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Start Date *</label>
                    <Input id="add-an-dateStart" type="date" value={form.dateStart || ""} onChange={e => set("dateStart", e.target.value)}
                      className={inputClass + fieldErr("dateStart")} />
                  </div>
                  <div>
                    <label className={labelClass}>End Date</label>
                    <Input type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd", e.target.value)}
                      className={inputClass} />
                  </div>
                </div>
                {/* Recurring — below dates */}
                <div>
                  <label className={labelClass}>Recurring <span className="font-normal normal-case opacity-60">(optional)</span></label>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 border-2 text-xs font-black transition-colors"
                      style={{ borderColor: "black", backgroundColor: form.isRecurring ? "black" : "white", color: form.isRecurring ? "white" : "black" }}
                    >↻ {form.isRecurring ? "Yes" : "No"}</button>
                    {form.isRecurring && (
                      <Input value={form.recurrenceLabel || ""} onChange={e => set("recurrenceLabel", e.target.value)}
                        className={inputClass + " flex-1"} placeholder="Monthly, Weekly, Every 1st Friday…" />
                    )}
                  </div>
                  {form.isRecurring && (
                    <div className="border-2 border-dashed border-black/40 p-2 mt-2" style={{ backgroundColor: "rgba(0,0,0,0.04)" }}>
                      <label className="font-black text-xs uppercase tracking-wide text-black mb-1 block">
                        ↻ This occurrence only
                        {form.dateStart && (
                          <span className="font-normal normal-case ml-1 opacity-50">
                            — {new Date(form.dateStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </label>
                      <textarea
                        value={instanceNote}
                        onChange={e => setInstanceNote(e.target.value)}
                        rows={2}
                        className="w-full border-2 border-black/30 bg-white text-sm p-2 resize-none focus:outline-none focus:border-black"
                        placeholder="Theme, featured guest, topic for this date only…"
                      />
                      <p className="text-[10px] text-black/40 mt-0.5">Won't affect other dates in the series.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column — metadata */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Emoji *</label>
                    <Input id="add-an-emoji" value={form.emoji || ""} onChange={e => set("emoji", e.target.value)}
                      className={inputClass + fieldErr("emoji")} placeholder="🎨" />
                  </div>
                  <div>
                    <label className={labelClass}>Category *</label>
                    <Select value={form.category || ""} onValueChange={v => { setErrorField(null); set("category", v); }}>
                      <SelectTrigger id="add-an-category" className={inputClass + fieldErr("category")}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px] overflow-y-auto">
                        {artCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Price</label>
                    <Input value={form.price || ""} onChange={e => set("price", e.target.value)}
                      className={inputClass} placeholder="$20/person" />
                  </div>
                  <div>
                    <label className={labelClass}>Ticket URL</label>
                    <Input value={form.ticketUrl || ""} onChange={e => set("ticketUrl", e.target.value)}
                      className={inputClass} placeholder="https://…" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Original post link</label>
                  <Input value={form.sourceUrl || ""} onChange={e => set("sourceUrl", e.target.value)}
                    className={inputClass} placeholder="https://instagram.com/p/…" />
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
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({ ...f, selloutRisk: f.selloutRisk === n ? undefined : n }))}
                        className="flex-1 py-1 border-2 text-xs font-black transition-colors"
                        style={{ borderColor: "black", backgroundColor: form.selloutRisk === n ? "black" : "white", color: form.selloutRisk === n ? "white" : "black" }}
                      >{n}</button>
                    ))}
                  </div>
                  {form.selloutRisk && (
                    <p className="text-xs text-gray-500 mt-0.5">{RISK_LABELS[form.selloutRisk]} — {riskPips(form.selloutRisk)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Description — full width at bottom, easy to review after AI parse */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className={labelClass + " mb-0"}>Description <span className="font-normal normal-case opacity-60">(recommended)</span></label>
                <button type="button" onClick={handleRedoAI} disabled={redoLoading}
                  className="flex items-center gap-1 px-2.5 py-1 border-2 border-black bg-white text-xs font-black uppercase tracking-wide hover:bg-black hover:text-[#41F2EE] transition-colors disabled:opacity-40"
                  title={form.isRecurring ? "Search for this occurrence's latest details + polish description" : "Polish description with latest web info"}>
                  {redoLoading ? "Searching…" : "✨ Refresh AI"}
                </button>
              </div>
              <Textarea value={form.summary || ""} onChange={e => set("summary", e.target.value)}
                className={`${inputClass} resize-none`} rows={3} maxLength={200}
                placeholder="Smart, specific snapshot — what it is, who's behind it, why it's worth noting." />
              <p className="text-xs text-gray-400 mt-0.5 text-right">{(form.summary || "").length}/200</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={createMutation.isPending}
                className="w-full px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {createMutation.isPending ? "Adding…" : "Add Event"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Calendar month view ────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function CalendarMonthView({
  filteredEvents,
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  onEventClick,
  onDayOverflowClick,
}: {
  filteredEvents: ArtEvent[];
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEventClick: (ev: ArtEvent) => void;
  onDayOverflowClick: (date: string, events: ArtEvent[]) => void;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  const eventsByDay = new Map<string, ArtEvent[]>();
  for (const ev of filteredEvents) {
    if (ev.dateStart.startsWith(monthPrefix)) {
      const existing = eventsByDay.get(ev.dateStart) ?? [];
      eventsByDay.set(ev.dateStart, [...existing, ev]);
    } else if (ev.dateEnd && ev.dateEnd !== ev.dateStart && !ev.isRecurring) {
      // Multi-day event that started before this month but extends into it
      const monthStart = new Date(viewYear, viewMonth, 1);
      const end = new Date(ev.dateEnd + 'T12:00:00');
      const start = new Date(ev.dateStart + 'T12:00:00');
      if (start < monthStart && end >= monthStart) {
        const key = `${monthPrefix}-01`;
        const existing = eventsByDay.get(key) ?? [];
        eventsByDay.set(key, [...existing, ev]);
      }
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="p-1.5 text-black hover:text-[#FE6B41] transition-colors rounded-full hover:bg-black/10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black uppercase text-black tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h2>
        <button onClick={onNextMonth} className="p-1.5 text-black hover:text-[#FE6B41] transition-colors rounded-full hover:bg-black/10">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-black text-black/50 uppercase py-1 tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-black/15">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="border-r border-b border-black/15 min-h-[72px] sm:min-h-[90px]" style={{ backgroundColor: AN_BG }} />
            );
          }
          const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          const isToday = dayStr === todayStr;
          const dayEvents = eventsByDay.get(dayStr) ?? [];
          const MAX_SHOWN = 3;
          const shown = dayEvents.slice(0, MAX_SHOWN);
          const overflow = dayEvents.length - MAX_SHOWN;

          return (
            <div key={dayStr} className="border-r border-b border-black/15 p-1 min-h-[72px] sm:min-h-[90px]" style={{ backgroundColor: AN_BG }}>
              <div className={`text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center leading-none ${
                isToday ? 'bg-black text-white rounded-full' : 'text-black'
              }`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {shown.map((ev, i) => (
                  <button
                    key={`${ev.id}-${ev.dateStart}-${i}`}
                    onClick={() => onEventClick(ev)}
                    className="w-full text-left text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 bg-black/10 hover:bg-black/20 active:bg-black/30 rounded text-black truncate transition-colors cursor-pointer"
                    title={ev.name}
                  >
                    <span>{ev.emoji} </span>
                    <span className="font-medium">{ev.name}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayOverflowClick(dayStr, dayEvents)}
                    className="text-[9px] text-black/60 hover:text-black pl-1 font-semibold transition-colors cursor-pointer underline underline-offset-1"
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

// ── Recurring event expansion ──────────────────────────────────────────────────

function classifyRecurrence(label: string | null | undefined): 'weekly' | 'biweekly' | 'monthly' | 'annual' | 'irregular' {
  if (!label) return 'monthly';
  const l = label.toLowerCase();
  if (l.includes('annual') || l.includes('yearly') || l.includes('seasonal')) return 'annual';
  if (l.includes('bi-week') || l.includes('biweek') || l.includes('every other week') ||
      /\d+(st|nd|rd|th)?.{0,5}&.{0,5}\d+(st|nd|rd|th)?/.test(l)) return 'biweekly';
  if (l.includes('week')) return 'weekly';
  if (l.includes('month') || l.includes('every 1st') || l.includes('every first') ||
      l.includes('every last') || /every \d+(st|nd|rd|th)/.test(l)) return 'monthly';
  return 'irregular';
}

function addCalDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addCalMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function expandRecurringEvents(events: ArtEvent[]): ArtEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const result: ArtEvent[] = [];

  for (const ev of events) {
    if (!ev.isRecurring) {
      result.push(ev);
      continue;
    }

    const type = classifyRecurrence(ev.recurrenceLabel);
    const spanDays = ev.dateEnd && ev.dateEnd !== '' && ev.dateEnd !== ev.dateStart
      ? Math.round((new Date(ev.dateEnd + 'T12:00:00').getTime() - new Date(ev.dateStart + 'T12:00:00').getTime()) / 86400000)
      : 0;

    const makeOccurrence = (dateStart: string): ArtEvent => ({
      ...ev,
      dateStart,
      dateEnd: spanDays > 0 ? addCalDays(dateStart, spanDays) : (ev.dateEnd ?? ''),
    });

    if (type === 'annual') {
      // Show this year's occurrence if upcoming; once passed, hide until Jan 1 then show next year
      const monthDay = ev.dateStart.slice(5); // "MM-DD"
      const yr = today.getFullYear();
      const thisYearOcc = `${yr}-${monthDay}`;
      if (thisYearOcc >= todayStr) {
        result.push(makeOccurrence(thisYearOcc));
      } else if (today.getMonth() === 0) {
        // It's January — repopulate with next year's date
        result.push(makeOccurrence(`${yr + 1}-${monthDay}`));
      }
      // Otherwise: between the past event date and Dec 31 → hide
      continue;
    }

    if (type === 'irregular') {
      // Non-standard recurrence: just show 1 next occurrence, monthly cadence
      let d = ev.dateStart;
      while (d < todayStr) d = addCalMonths(d, 1);
      result.push(makeOccurrence(d));
      continue;
    }

    // weekly / biweekly / monthly: show up to 2 upcoming occurrences
    const maxOccurrences = 2;
    const periodDays = type === 'weekly' ? 7 : type === 'biweekly' ? 14 : null;

    let d = ev.dateStart;
    if (periodDays) {
      while (d < todayStr) d = addCalDays(d, periodDays);
    } else {
      while (d < todayStr) d = addCalMonths(d, 1);
    }

    for (let i = 0; i < maxOccurrences; i++) {
      result.push(makeOccurrence(d));
      if (i < maxOccurrences - 1) {
        d = periodDays ? addCalDays(d, periodDays) : addCalMonths(d, 1);
      }
    }
  }

  return result.sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ArtistryNerdery() {
  const [addOpen, setAddOpen] = useState(false);
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
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDay, setFilterDay] = useState("all");
  const [filterDuration, setFilterDuration] = useState("all");

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
  const weekendDateSet = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    if ([5, 6, 0].includes(d.getDay())) weekendDateSet.add(d.toISOString().split('T')[0]);
  }

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
                    <Link href="/" className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🎵 SETLIST SOCIAL FEED
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#FFF8E7] focus:text-black px-4 py-3 cursor-pointer">
                    <Link href="/amuse-bouche" className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                      🍽️ AMUSE-BOUCHE INSIDER
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
          <CalendarMonthView
            filteredEvents={filteredEvents}
            viewYear={calViewYear}
            viewMonth={calViewMonth}
            onPrevMonth={prevCalMonth}
            onNextMonth={nextCalMonth}
            onEventClick={setCalEventDetail}
            onDayOverflowClick={(date, events) => setCalDaySheet({ date, events })}
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
                  <ArtEventRow key={`${ev.id}-${ev.dateStart}`} event={ev} />
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
            <p className="text-xs text-black opacity-50 mb-3 -mt-1 text-center tracking-wide uppercase">Already open · listed by closing date</p>
            <ul className="space-y-0">
              {stillTimeEvents.map(ev => (
                <ArtEventRow key={`still-${ev.id}`} event={ev} />
              ))}
            </ul>
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
                        <ArtEventRow key={`${ev.id}-${ev.dateStart}`} event={ev} />
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
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Link href="/"
              className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline flex items-center gap-1">
              <List className="w-4 h-4" />SETLIST SOCIAL FEED
            </Link>
            <span className="text-black opacity-40">|</span>
            <Link href="/amuse-bouche"
              className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline">
              AMUSE-BOUCHE
            </Link>
            <span className="text-black opacity-40">|</span>
            <button onClick={() => setAddOpen(true)}
              className="text-sm font-bold text-black hover:text-[#41F2EE] transition-colors underline">
              ADD AN EVENT
            </button>
          </div>
          <span className="text-sm text-black">© {new Date().getFullYear()} Artistry/Nerdistry Live</span>
        </div>
      </footer>

      <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} />
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
                <div className="px-6 pt-5 pb-4" style={{ backgroundColor: AN_BG }}>
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
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black">
                            <MoreVertical className="h-3.5 w-3.5 text-black" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); setCalDetailEditOpen(true); }}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => { setCalDetailMenuOpen(false); calDetailSoldOutMutation.mutate(); }}
                            disabled={calDetailSoldOutMutation.isPending}
                            className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          >
                            {ev.soldOut ? "Mark available" : "Sold out"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                            onClick={() => { setCalDetailMenuOpen(false); setTimeout(() => setCalDetailDeleteConfirm(true), 100); }}
                          >
                            Delete
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
