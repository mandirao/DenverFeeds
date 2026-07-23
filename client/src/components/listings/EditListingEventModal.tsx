import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListingEventFormFields } from "./ListingEventFormFields";
import type { ListingEventBase, ListingFormConfig, ListingInsertBase } from "@/lib/listingFeedConfig";

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
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [newDateInput, setNewDateInput] = useState("");
  const occurrenceDate = event.dateStart;
  const [instanceNote, setInstanceNote] = useState<string>(
    (event.instanceNotes as Record<string, string> | null | undefined)?.[occurrenceDate] ?? ""
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
  } as Partial<TInsert>);

  const set = (field: keyof TInsert, value: string) => {
    setErrorField(null);
    setForm(f => ({ ...f, [field]: value }));
  };

  const isDirty = () => {
    const keys = ["emoji", "name", "venue", "neighborhood", "dateStart", "dateEnd", "startTime", "summary",
      config.categoryFieldKey, "price", "ticketUrl", "sourceUrl", "requester", "announcedAt", "recurrenceLabel"] as (keyof TInsert)[];
    const originalNote = (event.instanceNotes as Record<string, string> | null | undefined)?.[occurrenceDate] ?? "";
    return keys.some(k => ((form[k] as string) || "") !== (((event as any)[k] as string) || ""))
      || (form.selloutRisk ?? undefined) !== (event.selloutRisk ?? undefined)
      || (form.isRecurring ?? false) !== (event.isRecurring ?? false)
      || instanceNote !== originalNote;
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
    mutationFn: async (dates: string[]) => {
      const basePayload = { ...(form as TInsert), instanceNotes: undefined };
      await apiRequest({ endpoint: `${config.apiPath}/${event.id}`, method: "PATCH", data: { ...basePayload, dateStart: dates[0], dateEnd: "" } });
      if (dates.length > 1) {
        await Promise.all(dates.slice(1).map(date =>
          apiRequest({ endpoint: config.apiPath, method: "POST", data: { ...basePayload, dateStart: date, dateEnd: "" } })
        ));
      }
    },
    onSuccess: (_, dates) => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: dates.length > 1 ? `Event split into ${dates.length} dates!` : "Updated!", description: "Changes saved." });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't save.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.features.specificDatesBatchAdd && useSpecificDates) {
      if (specificDates.length < 1) {
        toast({ title: "Add at least one date", variant: "destructive" });
        return;
      }
      const baseChecks = ["requester", "name", "venue", "emoji", config.categoryFieldKey] as (keyof TInsert)[];
      for (const field of baseChecks) {
        if (!(form as any)[field]?.trim()) {
          setErrorField(field as string);
          toast({ title: `${field === "requester" ? "Your name" : String(field).charAt(0).toUpperCase() + String(field).slice(1)} is required`, variant: "destructive" });
          return;
        }
      }
      batchExpandMutation.mutate(specificDates);
      return;
    }
    const missing = config.getMissingField(form);
    if (missing) {
      setErrorField(missing.field);
      toast({ title: `${missing.label} is required`, variant: "destructive" });
      setTimeout(() => document.getElementById(`edit-${config.idPrefix}-${missing.field}`)?.focus(), 50);
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
        endpoint: config.redoEndpoint,
        method: "POST",
        data: config.buildRedoPayload(form, instanceNote),
      });
      const { title, description } = config.applyRedoResponse(res, { setForm, setInstanceNote });
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

      <Dialog open onOpenChange={handleClose}>
        <DialogContent className="w-full max-w-lg md:max-w-3xl border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: config.dialogBg }}>
          <DialogHeader>
            <DialogTitle className="text-3xl text-black uppercase tracking-tight">
              {config.editModalTitle}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <ListingEventFormFields
              form={form}
              set={set}
              setForm={setForm}
              errorField={errorField}
              setErrorField={setErrorField}
              instanceNote={instanceNote}
              setInstanceNote={setInstanceNote}
              occurrenceDate={occurrenceDate}
              redoLoading={redoLoading}
              onRedoAI={handleRedoAI}
              config={config}
              mode="edit"
              specificDatesState={config.features.specificDatesBatchAdd ? {
                useSpecificDates, setUseSpecificDates,
                specificDates, setSpecificDates,
                newDateInput, setNewDateInput,
                onEnterSpecificDates: () => {
                  setUseSpecificDates(true);
                  setSpecificDates(event.dateStart ? [event.dateStart] : []);
                },
                enterSpecificDatesLabel: "+ Split into specific dates (series / irregular schedule)",
              } : undefined}
            />

            <DialogFooter className="pt-1 flex gap-2">
              <button type="button" onClick={handleClose}
                className="px-4 py-2.5 border-2 border-black bg-white font-black uppercase tracking-wide text-sm hover:bg-black hover:text-white transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={updateMutation.isPending || batchExpandMutation.isPending}
                className="flex-1 px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {(updateMutation.isPending || batchExpandMutation.isPending)
                  ? "Saving…"
                  : useSpecificDates && specificDates.length > 1
                    ? `Save as ${specificDates.length} Events`
                    : "Save Changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EditListingEventModal;
