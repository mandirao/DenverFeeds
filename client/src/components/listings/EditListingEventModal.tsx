import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListingEventFormFields, type SpecificDateEntry } from "./ListingEventFormFields";
import type { ListingEventBase, ListingFormConfig, ListingInsertBase } from "@/lib/listingFeedConfig";
import { computeOccurrences, type RecurrenceRule } from "@shared/recurrence";
import { localDateStr } from "@/lib/eventUtils";

export function EditListingEventModal<T extends ListingEventBase, TInsert extends ListingInsertBase>({
  event,
  onClose,
  config,
}: {
  event: T;
  onClose: () => void;
  config: ListingFormConfig<TInsert>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [redoLoading, setRedoLoading] = useState(false);
  const [useSpecificDates, setUseSpecificDates] = useState(false);
  const [specificDates, setSpecificDates] = useState<SpecificDateEntry[]>([]);
  // Only used to seed the initial note/title state below — the date actually
  // being edited (for display and for save-time keying) is currentOccurrenceDate,
  // which tracks form.dateStart so an AI Refresh date correction (or a manual
  // edit) keeps the note/title attached to the right occurrence instead of
  // silently orphaning them under the date the modal happened to open on.
  const originalOccurrenceDate = event.dateStart;
  const [instanceNote, setInstanceNote] = useState<string>(
    (event.instanceNotes as Record<string, string> | null | undefined)?.[originalOccurrenceDate] ?? ""
  );
  const [instanceTitle, setInstanceTitle] = useState<string>(
    (event.instanceTitles as Record<string, string> | null | undefined)?.[originalOccurrenceDate] ?? ""
  );
  const [form, setForm] = useState<Partial<TInsert>>({
    emoji: event.emoji || "",
    name: event.name || "",
    venue: event.venue || "",
    neighborhood: event.neighborhood || "",
    dateStart: event.dateStart || "",
    dateEnd: event.dateEnd || "",
    startTime: event.startTime || "",
    summary: event.summary || "",
    [config.categoryFieldKey]: (event as any)[config.categoryFieldKey] || "",
    price: event.price || "",
    ticketUrl: event.ticketUrl || "",
    sourceUrl: event.sourceUrl || "",
    requester: event.requester || "",
    announcedAt: event.announcedAt || "",
    selloutRisk: event.selloutRisk ?? undefined,
    isRecurring: event.isRecurring ?? false,
    recurrenceLabel: event.recurrenceLabel || "",
    recurrenceRule: event.recurrenceRule ?? null,
    excludedDates: event.excludedDates ?? [],
  } as Partial<TInsert>);
  const currentOccurrenceDate = (form.dateStart as string) || event.dateStart;
  const [orphanConfirm, setOrphanConfirm] = useState<{
    payload: Partial<TInsert> & { instanceNotes?: Record<string, string>; instanceTitles?: Record<string, string> };
    orphaned: { date: string; kind: "note" | "title"; text: string }[];
  } | null>(null);

  const set = (field: keyof TInsert, value: string) => {
    setErrorField(null);
    setForm(f => ({ ...f, [field]: value }));
  };

  const isDirty = () => {
    const keys = ["emoji", "name", "venue", "neighborhood", "dateStart", "dateEnd", "startTime", "summary",
      config.categoryFieldKey, "price", "ticketUrl", "sourceUrl", "requester", "announcedAt", "recurrenceLabel"] as (keyof TInsert)[];
    const originalNote = (event.instanceNotes as Record<string, string> | null | undefined)?.[originalOccurrenceDate] ?? "";
    const originalTitle = (event.instanceTitles as Record<string, string> | null | undefined)?.[originalOccurrenceDate] ?? "";
    return keys.some(k => ((form[k] as string) || "") !== (((event as any)[k] as string) || ""))
      || (form.selloutRisk ?? undefined) !== (event.selloutRisk ?? undefined)
      || (form.isRecurring ?? false) !== (event.isRecurring ?? false)
      || JSON.stringify(form.recurrenceRule ?? null) !== JSON.stringify(event.recurrenceRule ?? null)
      || JSON.stringify(form.excludedDates ?? []) !== JSON.stringify(event.excludedDates ?? [])
      || instanceNote !== originalNote
      || instanceTitle !== originalTitle;
  };

  const updateMutation = useMutation({
    mutationFn: (data: Partial<TInsert> & { instanceNotes?: Record<string, string> }) =>
      apiRequest({ endpoint: `${config.apiPath}/${event.id}`, method: "PATCH", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: "Saved!", description: `${form.name} updated.` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't save changes.", variant: "destructive" });
    },
  });

  const batchExpandMutation = useMutation({
    // The first entry's title stands in for "Event Name" (hidden while in
    // specific-dates mode) — falls back to form.name if left blank. Later
    // entries suffix onto that resolved primary name, same as before.
    mutationFn: async (entries: SpecificDateEntry[]) => {
      const basePayload = { ...(form as TInsert), instanceNotes: undefined, instanceTitles: undefined };
      const primaryName = (entries[0]?.title.trim() || (form.name as string) || "").trim();
      await apiRequest({ endpoint: `${config.apiPath}/${event.id}`, method: "PATCH", data: { ...basePayload, name: entries[0].title.trim() || primaryName, dateStart: entries[0].date, dateEnd: "" } });
      if (entries.length > 1) {
        await Promise.all(entries.slice(1).map(({ date, title }) =>
          apiRequest({ endpoint: config.apiPath, method: "POST", data: { ...basePayload, name: title.trim() ? `${primaryName}: ${title.trim()}` : primaryName, dateStart: date, dateEnd: "" } })
        ));
      }
    },
    onSuccess: (_, entries) => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: entries.length > 1 ? `Event split into ${entries.length} dates!` : "Updated!", description: "Changes saved." });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't save.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.features.specificDatesBatchAdd && useSpecificDates) {
      const validEntries = specificDates.filter(entry => entry.date);
      if (validEntries.length < 1) {
        toast({ title: "Add at least one date", variant: "destructive" });
        return;
      }
      const primaryName = validEntries[0]?.title.trim() || (form.name as string)?.trim() || "";
      if (!primaryName) {
        setErrorField("name");
        toast({ title: "Event name is required", variant: "destructive" });
        return;
      }
      const baseChecks = ["requester", "venue", "emoji", config.categoryFieldKey] as (keyof TInsert)[];
      for (const field of baseChecks) {
        if (!(form as any)[field]?.trim()) {
          setErrorField(field as string);
          toast({ title: `${field === "requester" ? "Your name" : String(field).charAt(0).toUpperCase() + String(field).slice(1)} is required`, variant: "destructive" });
          return;
        }
      }
      batchExpandMutation.mutate(validEntries);
      return;
    }
    const missing = config.getMissingField(form);
    if (missing) {
      setErrorField(missing.field);
      toast({ title: `${missing.label} is required`, variant: "destructive" });
      setTimeout(() => document.getElementById(`edit-${config.idPrefix}-${missing.field}`)?.focus(), 50);
      return;
    }
    // Note/title are keyed to currentOccurrenceDate (not the date the modal
    // opened on) so a date correction moves them to the right slot instead of
    // leaving a stale duplicate behind under the old date.
    const existingNotes = (event.instanceNotes as Record<string, string> | null | undefined) ?? {};
    const updatedNotes = { ...existingNotes };
    if (currentOccurrenceDate !== originalOccurrenceDate) delete updatedNotes[originalOccurrenceDate];
    if (instanceNote.trim()) {
      updatedNotes[currentOccurrenceDate] = instanceNote.trim();
    } else {
      delete updatedNotes[currentOccurrenceDate];
    }
    const existingTitles = (event.instanceTitles as Record<string, string> | null | undefined) ?? {};
    const updatedTitles = { ...existingTitles };
    if (currentOccurrenceDate !== originalOccurrenceDate) delete updatedTitles[originalOccurrenceDate];
    if (instanceTitle.trim()) {
      updatedTitles[currentOccurrenceDate] = instanceTitle.trim();
    } else {
      delete updatedTitles[currentOccurrenceDate];
    }
    // `event.dateStart` here is whichever occurrence this row happened to be
    // expanded to (e.g. this month's vs. next month's meetup), not the row's
    // real stored anchor — only event.seriesAnchorDate is that. If the date
    // field wasn't actually touched (no AI Refresh correction, no manual
    // edit), keep persisting the real anchor instead of snapping it forward
    // to whichever occurrence was opened, which would make future schedule
    // computation skip any occurrence still due before it. A genuine date
    // change (AI Refresh or manual) is still honored as a real anchor move,
    // same as before.
    const dateStartToPersist =
      form.isRecurring && currentOccurrenceDate === originalOccurrenceDate
        ? ((event.seriesAnchorDate ?? event.dateStart) as string)
        : (form.dateStart as string);
    const payload = { ...form, dateStart: dateStartToPersist, instanceNotes: updatedNotes, instanceTitles: updatedTitles };

    // If this save changes the schedule, check whether any existing
    // per-occurrence notes/titles are keyed to a date the new schedule won't
    // produce — those would silently stop showing up. Only checks
    // today-or-later entries: a note attached to a date that's already in
    // the past stopped showing up purely because time moved on, not because
    // of anything this save changed, and re-flagging it on every future edit
    // (of any other occurrence) would permanently block the series.
    const newRule = (form.recurrenceRule as RecurrenceRule | null | undefined) ?? null;
    const seriesStart = dateStartToPersist || event.dateStart;
    if (form.isRecurring && newRule && (Object.keys(updatedNotes).length > 0 || Object.keys(updatedTitles).length > 0)) {
      const todayStr = localDateStr();
      const validDates = new Set(computeOccurrences(newRule, seriesStart, todayStr, 24));
      const orphaned = [
        ...Object.entries(updatedNotes).filter(([date]) => date >= todayStr && !validDates.has(date)).map(([date, text]) => ({ date, kind: "note" as const, text })),
        ...Object.entries(updatedTitles).filter(([date]) => date >= todayStr && !validDates.has(date)).map(([date, text]) => ({ date, kind: "title" as const, text })),
      ];
      if (orphaned.length > 0) {
        setOrphanConfirm({ payload, orphaned });
        return;
      }
    }
    updateMutation.mutate(payload);
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
        endpoint: config.redoEndpoint,
        method: "POST",
        data: config.buildRedoPayload(form, instanceNote, instanceTitle),
      });
      const { title, description } = config.applyRedoResponse(res, { setForm, setInstanceNote, setInstanceTitle });
      toast({ title, description });
    } catch (e: any) {
      toast({ title: "AI refresh failed", description: e?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setRedoLoading(false);
    }
  };

  return (
    <>
      <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: config.dialogBg }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase">Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>{config.discardDescriptionEdit}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-black uppercase text-sm">Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} className="bg-black text-white border-2 border-black rounded-none font-black uppercase text-sm hover:text-[#41F2EE]">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!orphanConfirm} onOpenChange={(open) => { if (!open) setOrphanConfirm(null); }}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: config.dialogBg }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase">Schedule change affects saved notes</AlertDialogTitle>
            <AlertDialogDescription>
              This schedule won't produce the date{orphanConfirm && orphanConfirm.orphaned.length > 1 ? "s" : ""} these are attached to — they'll stop showing up:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-sm space-y-1 -mt-2">
            {orphanConfirm?.orphaned.map(({ date, kind, text }) => (
              <li key={`${kind}-${date}`}>
                <strong>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong>
                {" "}({kind === "title" ? "title addition" : "note"}): {text}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-black uppercase text-sm" onClick={() => setOrphanConfirm(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (orphanConfirm) updateMutation.mutate(orphanConfirm.payload); setOrphanConfirm(null); }}
              className="bg-black text-white border-2 border-black rounded-none font-black uppercase text-sm hover:text-[#41F2EE]">
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open onOpenChange={handleClose}>
        <DialogContent className="event-form-theme w-full max-w-xl border-2 border-primary rounded-none text-card-foreground max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: config.dialogBg }}>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-card-foreground uppercase tracking-tight">
              {config.editModalTitle}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <ListingEventFormFields
              form={form}
              set={set}
              setForm={setForm}
              errorField={errorField}
              setErrorField={setErrorField}
              instanceNote={instanceNote}
              setInstanceNote={setInstanceNote}
              instanceTitle={instanceTitle}
              setInstanceTitle={setInstanceTitle}
              occurrenceDate={currentOccurrenceDate}
              dateNeedsVerification={!!event.isDateUnverified}
              redoLoading={redoLoading}
              onRedoAI={handleRedoAI}
              config={config}
              mode="edit"
              specificDatesState={config.features.specificDatesBatchAdd ? {
                useSpecificDates, setUseSpecificDates,
                specificDates, setSpecificDates,
                onEnterSpecificDates: () => {
                  setUseSpecificDates(true);
                  setSpecificDates([{ date: event.dateStart || "", title: (form.name as string) || "" }]);
                },
              } : undefined}
            />

            <DialogFooter className="pt-1 flex gap-3">
              <button type="button" onClick={handleClose}
                className="inline-flex h-11 items-center justify-center rounded-none border-2 border-field-border bg-field px-5 text-sm font-semibold text-field-foreground transition-colors hover:bg-muted/60">
                Cancel
              </button>
              <button type="submit" disabled={updateMutation.isPending || batchExpandMutation.isPending}
                className="h-11 flex-1 rounded-none bg-primary px-5 text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {(() => {
                  const validCount = specificDates.filter(e => e.date).length;
                  if (updateMutation.isPending || batchExpandMutation.isPending) return "Saving…";
                  if (useSpecificDates && validCount > 1) return `Save as ${validCount} events`;
                  return "Save changes";
                })()}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EditListingEventModal;
