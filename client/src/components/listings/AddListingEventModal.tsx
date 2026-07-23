import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sparkles, ImageIcon, FileText } from "lucide-react";
import { ListingEventFormFields, inputClass, labelClass } from "./ListingEventFormFields";
import type { ListingFormConfig, ListingInsertBase } from "@/lib/listingFeedConfig";

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
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [newDateInput, setNewDateInput] = useState("");

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
        form, blurb, setForm, setInstanceNote, setSpecificDates, setUseSpecificDates,
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
    mutationFn: (dates: string[]) =>
      Promise.all(dates.map(date =>
        apiRequest({ endpoint: config.apiPath, method: "POST", data: { ...(form as TInsert), dateStart: date, dateEnd: "" } })
      )),
    onSuccess: (_, dates) => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: `${dates.length} events added!`, description: "All dates are live on the feed." });
      forceClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Couldn't add all events.", variant: "destructive" });
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
      batchCreateMutation.mutate(specificDates);
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
    if (form.isRecurring && instanceNote.trim() && form.dateStart) {
      (payload as any).instanceNotes = { [form.dateStart]: instanceNote.trim() };
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

  const forceClose = () => {
    onClose();
    setBlurb("");
    setForm(config.BLANK);
    setInstanceNote("");
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
    setNewDateInput("");
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
      <DialogContent className="w-full max-w-lg md:max-w-3xl border-2 border-black rounded-none max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: config.dialogBg }}>
        <DialogHeader>
          <DialogTitle className="text-3xl text-black uppercase tracking-tight">
            {config.addModalTitle}
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
                <p className="text-xs text-gray-500">{config.screenshotIntro}</p>
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
                <p className="text-xs text-gray-500">{config.blurbIntro}</p>
                <Textarea rows={5}
                  placeholder={config.blurbPlaceholder}
                  value={blurb} onChange={e => setBlurb(e.target.value)}
                  className={`${inputClass} resize-none`} />
              </div>
            )}

            <div>
              <label className={labelClass}>Original post link <span className="font-normal normal-case opacity-60">(optional)</span></label>
              <Input
                value={form.sourceUrl || ""}
                onChange={e => set("sourceUrl" as keyof TInsert, e.target.value)}
                className={inputClass}
                placeholder={config.sourceUrlPlaceholder} />
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

            <ListingEventFormFields
              form={form}
              set={set}
              setForm={setForm}
              errorField={errorField}
              setErrorField={setErrorField}
              instanceNote={instanceNote}
              setInstanceNote={setInstanceNote}
              occurrenceDate={form.dateStart}
              redoLoading={redoLoading}
              onRedoAI={handleRedoAI}
              config={config}
              mode="add"
              specificDatesState={config.features.specificDatesBatchAdd ? {
                useSpecificDates, setUseSpecificDates,
                specificDates, setSpecificDates,
                newDateInput, setNewDateInput,
                onEnterSpecificDates: () => {
                  setUseSpecificDates(true);
                  if (form.dateStart) { setSpecificDates([form.dateStart]); set("dateStart" as keyof TInsert, ""); set("dateEnd" as keyof TInsert, ""); }
                },
                enterSpecificDatesLabel: "+ Add specific dates instead (series / irregular schedule)",
              } : undefined}
            />

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={createMutation.isPending || batchCreateMutation.isPending}
                className="w-full px-4 py-2.5 border-2 border-black bg-black text-white font-black uppercase tracking-wide text-sm hover:text-[#41F2EE] transition-colors disabled:opacity-50">
                {batchCreateMutation.isPending
                  ? `Adding ${specificDates.length} events…`
                  : createMutation.isPending
                  ? "Adding…"
                  : useSpecificDates && specificDates.length > 1
                  ? `Add ${specificDates.length} Events`
                  : config.addSubmitLabel}
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
