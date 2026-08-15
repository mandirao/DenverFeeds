import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sparkles, ImageIcon, FileText, Upload } from "lucide-react";
import { ListingEventFormFields, type SpecificDateEntry } from "./ListingEventFormFields";
import { Field, TextField, TextArea } from "./form-primitives";
import { cn } from "@/lib/utils";
import type { ListingFormConfig, ListingInsertBase } from "@/lib/listingFeedConfig";
import type { RecurrenceRule } from "@shared/recurrence";

export function AddListingEventModal<TInsert extends ListingInsertBase>({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: ListingFormConfig<TInsert>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [blurb, setBlurb] = useState("");
  const [form, setForm] = useState<Partial<TInsert>>(config.BLANK);
  const [instanceNote, setInstanceNote] = useState("");
  const [instanceTitle, setInstanceTitle] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [inputMode, setInputMode] = useState<"screenshot" | "blurb">("screenshot");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [redoLoading, setRedoLoading] = useState(false);
  const [useSpecificDates, setUseSpecificDates] = useState(false);
  const [specificDates, setSpecificDates] = useState<SpecificDateEntry[]>([]);

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

  // Lets a copied screenshot be dropped in with ⌘V instead of only
  // click-to-browse/drag-and-drop — only active on the pre-parse screen.
  useEffect(() => {
    if (open === false || showForm || inputMode !== "screenshot") return;
    const handlePaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      setImageFileName(file.name || "pasted-image");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setImagePreview(dataUrl);
        setImageBase64(dataUrl.split(",")[1]);
        setImageMediaType(file.type);
      };
      reader.readAsDataURL(file);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, showForm, inputMode]);

  const set = (field: keyof TInsert, value: string) => {
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
      endpoint: config.parseEndpoint,
      method: "POST",
      data: {
        blurb,
        ...(imageBase64 ? { imageBase64, imageMediaType, fileName: imageFileName } : {}),
      },
    }),
    onSuccess: (data: any) => {
      const { title, description } = config.applyParseResponse(data, {
        form, blurb, setForm, setInstanceNote, setInstanceTitle, setSpecificDates, setUseSpecificDates,
      });
      setShowForm(true);
      toast({ title, description });
    },
    onError: () => {
      toast({ title: "Parse failed", description: "Fill in the form manually.", variant: "destructive" });
      setShowForm(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TInsert) =>
      apiRequest({ endpoint: config.apiPath, method: "POST", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: config.createToastTitle, description: "It's now on the feed." });
      forceClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't add event.", variant: "destructive" });
    },
  });

  const batchCreateMutation = useMutation({
    // The first entry's title stands in for "Event Name" (hidden while in
    // specific-dates mode) — falls back to form.name if left blank. Any
    // other entry's title fully replaces that resolved primary name for its
    // own date; entries left blank fall back to the primary name.
    mutationFn: (entries: SpecificDateEntry[]) => {
      const primaryName = (entries[0]?.title.trim() || (form.name as string) || "").trim();
      return Promise.all(entries.map(({ date, title }) => {
        const name = title.trim() || primaryName;
        return apiRequest({ endpoint: config.apiPath, method: "POST", data: { ...(form as TInsert), name, dateStart: date, dateEnd: "" } });
      }));
    },
    onSuccess: (_, entries) => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: `${entries.length} events added!`, description: "All dates are live on the feed." });
      forceClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't add all events.", variant: "destructive" });
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
      batchCreateMutation.mutate(validEntries);
      return;
    }
    const missing = config.getMissingField(form);
    if (missing) {
      setErrorField(missing.field);
      toast({ title: `${missing.label} is required`, variant: "destructive" });
      setTimeout(() => document.getElementById(`add-${config.idPrefix}-${missing.field}`)?.focus(), 50);
      return;
    }
    const payload: TInsert = { ...(form as TInsert) };
    if (form.isRecurring && form.dateStart) {
      if (instanceNote.trim()) (payload as any).instanceNotes = { [form.dateStart]: instanceNote.trim() };
      if (instanceTitle.trim()) (payload as any).instanceTitles = { [form.dateStart]: instanceTitle.trim() };
      // A brand-new series' first date is definitionally correct — the admin
      // just typed it in, so it doesn't need the "Verify date" round-trip
      // that later, computed-forward occurrences of a TBD-cadence series do.
      const rule = form.recurrenceRule as RecurrenceRule | null | undefined;
      if (rule?.monthlyMode === "tbd") (payload as any).verifiedThroughDate = form.dateStart;
    }
    createMutation.mutate(payload);
  };

  const hasContent = () => {
    const formHasContent = Object.values(form).some(v => v && v.toString().trim() !== "");
    return formHasContent || blurb.trim() !== "" || !!imageBase64;
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

  const forceClose = () => {
    onClose();
    setBlurb("");
    setForm(config.BLANK);
    setInstanceNote("");
    setInstanceTitle("");
    setShowForm(false);
    setInputMode("screenshot");
    setImagePreview(null);
    setImageBase64(null);
    setImageMediaType(null);
    setImageFileName(null);
    setShowConfirmClose(false);
    setErrorField(null);
    setUseSpecificDates(false);
    setSpecificDates([]);
  };

  const handleClose = () => {
    if (hasContent()) setShowConfirmClose(true);
    else forceClose();
  };

  return (
    <>
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: config.dialogBg }}>
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
      <DialogContent className="event-form-theme w-full max-w-xl border-2 border-primary rounded-none text-card-foreground max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: config.dialogBg }}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="font-display text-2xl text-card-foreground uppercase tracking-tight">
              {config.addModalTitle}
            </DialogTitle>
            {showForm && (
              <button type="button" onClick={() => setShowForm(false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-none border-2 border-accent px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
                Fill with AI
              </button>
            )}
          </div>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">

            {/* Mode toggle */}
            <div role="tablist" aria-label="Input type" className="grid grid-cols-2 gap-1 rounded-none border-2 border-field-border bg-field p-1">
              <button
                type="button" role="tab" aria-selected={inputMode === "screenshot"}
                onClick={() => switchMode("screenshot")}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-none text-sm font-semibold transition-colors",
                  inputMode === "screenshot" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-card-foreground",
                )}
              >
                <ImageIcon className="w-4 h-4" />Screenshot
              </button>
              <button
                type="button" role="tab" aria-selected={inputMode === "blurb"}
                onClick={() => switchMode("blurb")}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-none text-sm font-semibold transition-colors",
                  inputMode === "blurb" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-card-foreground",
                )}
              >
                <FileText className="w-4 h-4" />Text
              </button>
            </div>

            {/* Screenshot mode */}
            {inputMode === "screenshot" && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col items-center justify-center gap-3 rounded-none border-2 border-dashed border-field-border bg-field cursor-pointer hover:bg-muted/40 transition-colors py-6 px-3">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="max-h-48 max-w-full object-contain border-2 border-field-border" />
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); setImagePreview(null); setImageBase64(null); setImageMediaType(null); }}
                        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs leading-none"
                      >×</button>
                    </div>
                  ) : (
                    <>
                      <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <ImageIcon className="size-6" />
                      </span>
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-sm font-semibold text-card-foreground">
                          Press <kbd className="rounded border border-field-border bg-field px-1.5 py-0.5 text-xs">⌘V</kbd> to paste
                        </span>
                        <span className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                          <Upload className="size-3.5" />
                          or drag &amp; drop / click to browse
                        </span>
                        <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF</span>
                      </span>
                    </>
                  )}
                </label>
                <p className="text-xs leading-relaxed text-muted-foreground">{config.screenshotIntro}</p>
              </div>
            )}

            {/* Blurb mode */}
            {inputMode === "blurb" && (
              <div className="flex flex-col gap-2">
                <TextArea rows={5}
                  placeholder={config.blurbPlaceholder}
                  value={blurb} onChange={e => setBlurb(e.target.value)}
                  className="resize-none" />
                <p className="text-xs leading-relaxed text-muted-foreground">{config.blurbIntro}</p>
              </div>
            )}

            <Field label="Original post link" hint="helps people watch for updates">
              <TextField
                value={form.sourceUrl || ""}
                onChange={e => set("sourceUrl" as keyof TInsert, e.target.value)}
                placeholder={config.sourceUrlPlaceholder} />
            </Field>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(true)}
                className="inline-flex h-11 items-center justify-center rounded-none border-2 border-field-border bg-field px-5 text-sm font-semibold text-field-foreground transition-colors hover:bg-muted/60">
                Enter manually
              </button>
              <button onClick={() => parseMutation.mutate()}
                disabled={(!blurb.trim() && !imageBase64) || parseMutation.isPending}
                className={cn(
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-none px-5 text-sm font-bold uppercase tracking-wide transition-colors",
                  (blurb.trim() || imageBase64)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed border-2 border-dashed border-primary/40 bg-transparent text-muted-foreground",
                )}>
                {(blurb.trim() || imageBase64) && <Sparkles className="w-4 h-4" />}
                {parseMutation.isPending ? "Parsing…" : (blurb.trim() || imageBase64) ? "Autofill event details" : `Add ${inputMode === "screenshot" ? "a screenshot" : "text"} to continue`}
              </button>
            </div>
          </div>
        ) : (
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
              occurrenceDate={form.dateStart}
              redoLoading={redoLoading}
              onRedoAI={handleRedoAI}
              config={config}
              mode="add"
              specificDatesState={config.features.specificDatesBatchAdd ? {
                useSpecificDates, setUseSpecificDates,
                specificDates, setSpecificDates,
                onEnterSpecificDates: () => {
                  setUseSpecificDates(true);
                  setSpecificDates([{ date: (form.dateStart as string) || "", title: (form.name as string) || "" }]);
                  set("dateStart" as keyof TInsert, ""); set("dateEnd" as keyof TInsert, "");
                },
              } : undefined}
            />

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={createMutation.isPending || batchCreateMutation.isPending}
                className="h-11 w-full rounded-none bg-primary px-5 text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {(() => {
                  const validCount = specificDates.filter(e => e.date).length;
                  if (batchCreateMutation.isPending) return `Adding ${validCount} events…`;
                  if (createMutation.isPending) return "Adding…";
                  if (useSpecificDates && validCount > 1) return `Add ${validCount} Events`;
                  return config.addSubmitLabel;
                })()}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

export default AddListingEventModal;
