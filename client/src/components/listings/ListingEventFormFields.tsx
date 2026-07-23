import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { riskPips, RISK_LABELS } from "@/lib/eventUtils";
import type { ListingFormConfig, ListingInsertBase } from "@/lib/listingFeedConfig";

export const inputClass = "border-2 border-black rounded-none bg-white text-sm";
export const labelClass = "font-black text-xs uppercase tracking-wide text-black mb-0.5 block";

export interface SpecificDatesState {
  useSpecificDates: boolean;
  setUseSpecificDates: (v: boolean) => void;
  specificDates: string[];
  setSpecificDates: (updater: string[] | ((prev: string[]) => string[])) => void;
  newDateInput: string;
  setNewDateInput: (v: string) => void;
  /** Seeds specificDates/clears date-range fields — differs slightly between Add (seeds from form) and Edit (seeds from the fixed event prop). */
  onEnterSpecificDates: () => void;
  enterSpecificDatesLabel: string;
}

export function ListingEventFormFields<TInsert extends ListingInsertBase>({
  form,
  set,
  setForm,
  errorField,
  setErrorField,
  instanceNote,
  setInstanceNote,
  occurrenceDate,
  redoLoading,
  onRedoAI,
  config,
  mode,
  specificDatesState,
}: {
  form: Partial<TInsert>;
  set: (field: keyof TInsert, value: string) => void;
  setForm: (updater: (f: Partial<TInsert>) => Partial<TInsert>) => void;
  errorField: string | null;
  setErrorField: (f: string | null) => void;
  instanceNote: string;
  setInstanceNote: (s: string) => void;
  occurrenceDate?: string | null;
  redoLoading: boolean;
  onRedoAI: () => void;
  config: ListingFormConfig<TInsert>;
  mode: "add" | "edit";
  specificDatesState?: SpecificDatesState;
}) {
  const fieldErr = (f: string) => errorField === f ? " !border-red-500 ring-2 ring-red-200" : "";
  const idFor = (field: string) => `${mode}-${config.idPrefix}-${field}`;
  const category = (form[config.categoryFieldKey] as string | undefined) || "";
  const canUseSpecificDates = config.features.specificDatesBatchAdd && specificDatesState;

  return (
    <>
      {/* Your Name — always first */}
      <div>
        <label className={labelClass}>Your Name *</label>
        <Input id={idFor("requester")} value={form.requester || ""} onChange={e => set("requester" as keyof TInsert, e.target.value)}
          className={inputClass + fieldErr("requester")} placeholder="Mandi" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-5 gap-y-3 md:gap-y-0">

        {/* Left column — core identity + scheduling */}
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Event Name *</label>
            <Input id={idFor("name")} value={form.name || ""} onChange={e => set("name" as keyof TInsert, e.target.value)}
              className={inputClass + fieldErr("name")} placeholder={config.namePlaceholder} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{config.venueLabel} *</label>
              <Input id={idFor("venue")} value={form.venue || ""} onChange={e => set("venue" as keyof TInsert, e.target.value)}
                className={inputClass + fieldErr("venue")} placeholder={config.venuePlaceholder} />
            </div>
            <div>
              <label className={labelClass}>Neighborhood</label>
              <Input value={form.neighborhood || ""} onChange={e => set("neighborhood" as keyof TInsert, e.target.value)}
                className={inputClass} placeholder={config.neighborhoodPlaceholder} />
            </div>
          </div>

          {canUseSpecificDates && specificDatesState!.useSpecificDates ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Specific Dates *</label>
                <button type="button" onClick={() => {
                  specificDatesState!.setUseSpecificDates(false);
                  if (specificDatesState!.specificDates.length > 0) set("dateStart" as keyof TInsert, specificDatesState!.specificDates[0]);
                  specificDatesState!.setSpecificDates([]);
                }} className="text-xs text-gray-500 underline hover:text-black normal-case font-normal">
                  Switch to date range
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {specificDatesState!.specificDates.map(d => (
                  <span key={d} className="flex items-center gap-1 bg-black text-white text-xs font-bold px-2 py-1">
                    {new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    <button type="button" onClick={() => specificDatesState!.setSpecificDates(prev => prev.filter(x => x !== d))} className="hover:text-[#41F2EE] leading-none ml-0.5">×</button>
                  </span>
                ))}
                {specificDatesState!.specificDates.length === 0 && <span className="text-xs text-gray-400 italic">No dates added yet</span>}
              </div>
              <div className="flex gap-2">
                <Input type="date" value={specificDatesState!.newDateInput} onChange={e => specificDatesState!.setNewDateInput(e.target.value)} className={inputClass + " flex-1"} />
                <button type="button" onClick={() => {
                  const { newDateInput, specificDates, setSpecificDates, setNewDateInput } = specificDatesState!;
                  if (newDateInput && !specificDates.includes(newDateInput)) {
                    setSpecificDates(prev => [...prev, newDateInput].sort());
                    setNewDateInput("");
                  }
                }} className="px-3 py-1.5 bg-black text-white text-xs font-black uppercase border-2 border-black hover:text-[#41F2EE] transition-colors whitespace-nowrap">
                  + Add
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Start Date *</label>
                  <Input id={idFor("dateStart")} type="date" value={form.dateStart || ""} onChange={e => set("dateStart" as keyof TInsert, e.target.value)}
                    className={inputClass + fieldErr("dateStart")} />
                </div>
                <div>
                  <label className={labelClass}>End Date</label>
                  <Input type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd" as keyof TInsert, e.target.value)}
                    className={inputClass} />
                </div>
              </div>
              {canUseSpecificDates && (
                <button type="button" onClick={specificDatesState!.onEnterSpecificDates}
                  className="text-xs text-gray-500 underline hover:text-black normal-case font-normal">
                  {specificDatesState!.enterSpecificDatesLabel}
                </button>
              )}
            </div>
          )}

          {!(canUseSpecificDates && specificDatesState!.useSpecificDates) && !(form.dateEnd && form.dateEnd !== form.dateStart) && (
            <div>
              <label className={labelClass}>Start Time <span className="font-normal normal-case opacity-60">(approximate)</span></label>
              <Input type="time" value={form.startTime || ""} onChange={e => set("startTime" as keyof TInsert, e.target.value)}
                className={inputClass} placeholder="19:00" />
            </div>
          )}

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
                <Input value={form.recurrenceLabel || ""} onChange={e => set("recurrenceLabel" as keyof TInsert, e.target.value)}
                  className={inputClass + " flex-1"} placeholder={config.recurrenceLabelPlaceholder} />
              )}
            </div>
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
                  placeholder={config.instanceNotePlaceholder}
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
              <Input id={idFor("emoji")} value={form.emoji || ""} onChange={e => set("emoji" as keyof TInsert, e.target.value)}
                className={inputClass + fieldErr("emoji")} placeholder={config.emojiPlaceholder} />
            </div>
            <div>
              <label className={labelClass}>{config.categoryLabel} *</label>
              <Select value={category} onValueChange={v => { setErrorField(null); set(config.categoryFieldKey as keyof TInsert, v); }}>
                <SelectTrigger id={idFor(config.categoryFieldKey)} className={inputClass + fieldErr(config.categoryFieldKey)}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px] overflow-y-auto">
                  {config.categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Price</label>
              <Input value={form.price || ""} onChange={e => set("price" as keyof TInsert, e.target.value)}
                className={inputClass} placeholder={config.pricePlaceholder} />
            </div>
            <div>
              <label className={labelClass}>Ticket URL</label>
              <Input value={form.ticketUrl || ""} onChange={e => set("ticketUrl" as keyof TInsert, e.target.value)}
                className={inputClass} placeholder="https://…" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Original post link</label>
            <Input value={form.sourceUrl || ""} onChange={e => set("sourceUrl" as keyof TInsert, e.target.value)}
              className={inputClass} placeholder={config.sourceUrlPlaceholder} />
          </div>
          <div>
            <label className={labelClass}>Announced <span className="font-normal normal-case opacity-60">(optional)</span></label>
            <Input type="date" value={(form.announcedAt as string) || ""} onChange={e => set("announcedAt" as keyof TInsert, e.target.value)}
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
          <button type="button" onClick={onRedoAI} disabled={redoLoading}
            className="flex items-center gap-1 px-2.5 py-1 border-2 border-black bg-white text-xs font-black uppercase tracking-wide hover:bg-black hover:text-[#41F2EE] transition-colors disabled:opacity-40"
            title={form.isRecurring ? "Search for this occurrence's latest details + polish description" : "Polish description with latest web info"}>
            {redoLoading ? "Searching…" : "✨ Refresh AI"}
          </button>
        </div>
        <Textarea value={form.summary || ""} onChange={e => set("summary" as keyof TInsert, e.target.value)}
          className={`${inputClass} resize-none`} rows={3} maxLength={200}
          placeholder={mode === "add" ? config.descriptionPlaceholderAdd : config.descriptionPlaceholderEdit} />
        <p className="text-xs text-gray-400 mt-0.5 text-right">{(form.summary || "").length}/200</p>
      </div>
    </>
  );
}

export default ListingEventFormFields;
