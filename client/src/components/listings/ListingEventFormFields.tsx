import { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { riskPips, RISK_LABELS } from "@/lib/eventUtils";
import { cn } from "@/lib/utils";
import type { ListingFormConfig, ListingInsertBase, SpecificDateEntry } from "@/lib/listingFeedConfig";
import { RecurrenceFreqSelect, RecurrencePicker } from "./RecurrencePicker";
import { SegmentedControl } from "./segmented-control";
import { Field, TextField, TextArea, controlBase } from "./form-primitives";
import { describeRecurrenceRule, type RecurrenceRule } from "@shared/recurrence";

export type { SpecificDateEntry };

export interface SpecificDatesState {
  useSpecificDates: boolean;
  setUseSpecificDates: (v: boolean) => void;
  specificDates: SpecificDateEntry[];
  setSpecificDates: (updater: SpecificDateEntry[] | ((prev: SpecificDateEntry[]) => SpecificDateEntry[])) => void;
  /** Seeds specificDates/clears date-range fields — differs slightly between Add (seeds from form) and Edit (seeds from the fixed event prop). */
  onEnterSpecificDates: () => void;
}

/** Drives which schedule fields render — a pure UI concept layered over the
 * existing isRecurring/dateEnd/useSpecificDates flags, not a new data field. */
type WhenMode = "once" | "range" | "recurring" | "irregular";

function deriveInitialWhenMode<T extends ListingInsertBase>(form: Partial<T>, useSpecificDates: boolean): WhenMode {
  if (useSpecificDates) return "irregular";
  if (form.isRecurring) return "recurring";
  if (form.dateEnd && form.dateEnd !== form.dateStart) return "range";
  return "once";
}

/** Small circular icon badge used on collapsible section headers — "+" when
 * collapsed, chevron when expanded, matching the mock's treatment. */
function CollapseIcon({ open }: { open: boolean }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      {open ? <ChevronDown className="size-3.5" /> : <Plus className="size-3.5" />}
    </span>
  );
}

export function ListingEventFormFields<TInsert extends ListingInsertBase>({
  form,
  set,
  setForm,
  errorField,
  setErrorField,
  instanceNote,
  setInstanceNote,
  instanceTitle,
  setInstanceTitle,
  occurrenceDate,
  dateNeedsVerification,
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
  instanceTitle: string;
  setInstanceTitle: (s: string) => void;
  occurrenceDate?: string | null;
  /** True when this occurrence's date is an unconfirmed guess for a 'tbd'
   * recurrence rule — surfaces a hint on the Starts field pointing the admin
   * at what to fix. */
  dateNeedsVerification?: boolean;
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

  const [whenMode, setWhenMode] = useState<WhenMode>(() =>
    deriveInitialWhenMode(form, !!(canUseSpecificDates && specificDatesState!.useSpecificDates))
  );
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showInstanceCustomize, setShowInstanceCustomize] = useState(false);

  const selectWhenMode = (next: WhenMode) => {
    if (next === whenMode) return;
    if (whenMode === "irregular" && canUseSpecificDates) {
      const first = specificDatesState!.specificDates[0];
      const restoredName = first?.title.trim() || (form.name as string) || "";
      if (restoredName) set("name" as keyof TInsert, restoredName);
      specificDatesState!.setUseSpecificDates(false);
      specificDatesState!.setSpecificDates([]);
    }
    if (next === "irregular" && canUseSpecificDates) {
      specificDatesState!.onEnterSpecificDates();
    } else {
      setForm(f => ({
        ...f,
        isRecurring: next === "recurring",
        dateEnd: next === "range" ? (f.dateEnd || "") : "",
      } as Partial<TInsert>));
    }
    setWhenMode(next);
  };

  const rule = (form.recurrenceRule as RecurrenceRule | null | undefined) ?? null;
  const setUntil = (until: string) => {
    setForm(f => {
      const current = (f.recurrenceRule as RecurrenceRule | null | undefined) ?? null;
      const nextRule: RecurrenceRule = current ? { ...current, until: until || undefined } : { freq: "weekly", until: until || undefined };
      return { ...f, recurrenceRule: nextRule, recurrenceLabel: describeRecurrenceRule(nextRule) } as Partial<TInsert>;
    });
  };

  const whenOptions = [
    { value: "once" as const, label: "Once" },
    { value: "range" as const, label: "Range" },
    { value: "recurring" as const, label: "Recurring" },
    ...(canUseSpecificDates ? [{ value: "irregular" as const, label: "Irregular" }] : []),
  ];

  const selloutRisk = form.selloutRisk ?? 0;
  const showAnnouncedOnSurface = selloutRisk >= 4;

  return (
    <div className="flex flex-col gap-5">
      {/* WHEN — drives every other schedule-related field below */}
      <Field label="When" required>
        <SegmentedControl ariaLabel="Event cadence" value={whenMode} onChange={selectWhenMode} options={whenOptions} />
      </Field>

      {whenMode === "irregular" ? (
        <Field label="Event name & date" required hint="each date is its own event">
          <div className="flex flex-col rounded-none border-2 border-field-border/40 bg-field/40">
            {specificDatesState!.specificDates.map((entry, i) => (
              <div key={i} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
                <TextField aria-label="Title for this date" value={entry.title}
                  onChange={e => specificDatesState!.setSpecificDates(prev => prev.map((p, pi) => pi === i ? { ...p, title: e.target.value } : p))}
                  placeholder={i === 0 ? config.namePlaceholder : "Same as first—edit to override"} />
                <div className="flex items-center gap-2">
                  <TextField type="date" aria-label="Date" className="w-full sm:max-w-[10.5rem]" value={entry.date}
                    onChange={e => specificDatesState!.setSpecificDates(prev => prev.map((p, pi) => pi === i ? { ...p, date: e.target.value } : p))} />
                  <button type="button" aria-label="Remove date"
                    disabled={specificDatesState!.specificDates.length <= 1}
                    onClick={() => specificDatesState!.setSpecificDates(prev => prev.filter((_, pi) => pi !== i))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-card-foreground disabled:opacity-30">
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => specificDatesState!.setSpecificDates(prev => [...prev, { date: "", title: "" }])}
              className="flex items-center gap-1.5 border-t border-field-border/30 px-2.5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-muted/40">
              <Plus className="size-4" />
              Add date
            </button>
          </div>
        </Field>
      ) : (
        <Field label="Event name" required htmlFor={idFor("name")}>
          <TextField id={idFor("name")} value={form.name || ""} onChange={e => set("name" as keyof TInsert, e.target.value)}
            className={fieldErr("name")} placeholder={config.namePlaceholder} />
        </Field>
      )}

      {/* Category + Emoji */}
      <div className="flex gap-3">
        <Field label={config.categoryLabel} required htmlFor={idFor(config.categoryFieldKey)} className="flex-1">
          <Select value={category} onValueChange={v => { setErrorField(null); set(config.categoryFieldKey as keyof TInsert, v); }}>
            <SelectTrigger id={idFor(config.categoryFieldKey)} className={cn(controlBase, "w-full", fieldErr(config.categoryFieldKey))}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            {/* SelectContent renders through a Radix Portal to document.body,
                outside the .event-form-theme class on DialogContent — CSS
                custom properties don't cascade to portaled content across
                that DOM boundary. Re-applying the class here redeclares the
                tokens directly on this node instead of relying on inheritance. */}
            <SelectContent className="event-form-theme max-h-[280px] overflow-y-auto">
              {config.categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Emoji" required htmlFor={idFor("emoji")} className="w-16 shrink-0">
          <TextField id={idFor("emoji")} value={form.emoji || ""} onChange={e => set("emoji" as keyof TInsert, e.target.value)}
            className={cn("px-0 text-center text-lg", fieldErr("emoji"))} placeholder={config.emojiPlaceholder} />
        </Field>
      </div>

      {/* Description */}
      <Field htmlFor={idFor("summary")}>
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-baseline gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-card-foreground">
            Description
            <span className="font-medium normal-case tracking-normal text-muted-foreground">recommended</span>
          </span>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onRedoAI} disabled={redoLoading}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80 disabled:opacity-40"
              title={form.isRecurring ? "Search for this occurrence's latest details + polish description" : "Polish description with latest web info"}>
              ✨ {redoLoading ? "Searching…" : "AI Refresh"}
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">{(form.summary || "").length}/200</span>
          </div>
        </div>
        <TextArea id={idFor("summary")} value={form.summary || ""} onChange={e => set("summary" as keyof TInsert, e.target.value)}
          rows={3} maxLength={200}
          placeholder={mode === "add" ? config.descriptionPlaceholderAdd : config.descriptionPlaceholderEdit} />
      </Field>

      {/* Date/schedule block — shape depends entirely on whenMode */}
      {whenMode === "once" && (
        <Field label="Date" required htmlFor={idFor("dateStart")} className="max-w-[16rem]">
          <TextField id={idFor("dateStart")} type="date" value={form.dateStart || ""} onChange={e => set("dateStart" as keyof TInsert, e.target.value)}
            className={fieldErr("dateStart")} />
        </Field>
      )}

      {whenMode === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required htmlFor={idFor("dateStart")}>
            <TextField id={idFor("dateStart")} type="date" value={form.dateStart || ""} onChange={e => set("dateStart" as keyof TInsert, e.target.value)}
              className={fieldErr("dateStart")} />
          </Field>
          <Field label="End date" required htmlFor="dateEnd">
            <TextField id="dateEnd" type="date" value={form.dateEnd || ""} onChange={e => set("dateEnd" as keyof TInsert, e.target.value)} />
          </Field>
        </div>
      )}

      {whenMode === "recurring" && (
        <div className="flex flex-col gap-4">
          <div className={cn("rounded-none border-2 transition-colors", showInstanceCustomize ? "border-field-border/40" : "border-field-border/50 bg-muted/40")}>
            <button type="button" aria-expanded={showInstanceCustomize} onClick={() => setShowInstanceCustomize(v => !v)}
              className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-semibold text-card-foreground">
              <CollapseIcon open={showInstanceCustomize} />
              <span className="flex flex-1 flex-col">
                <span>Customize the first date</span>
                {!showInstanceCustomize && (
                  <span className="text-xs font-medium text-muted-foreground">
                    a subtitle or note just for this occurrence
                    {occurrenceDate && ` — ${new Date(occurrenceDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
                  </span>
                )}
              </span>
              {!showInstanceCustomize && <span className="shrink-0 text-xs font-semibold text-accent">Add</span>}
            </button>
            {showInstanceCustomize && (
              <div className="flex flex-col gap-4 border-t border-field-border/30 p-3">
                <Field label="Subtitle for this date">
                  <TextField value={instanceTitle} onChange={e => setInstanceTitle(e.target.value)} placeholder={config.instanceTitlePlaceholder} />
                </Field>
                <Field label="Note shown in feed">
                  <TextArea rows={2} value={instanceNote} onChange={e => setInstanceNote(e.target.value)} placeholder={config.instanceNotePlaceholder} />
                </Field>
                <p className="text-xs leading-relaxed text-muted-foreground">Won't affect other dates in the series.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" required htmlFor={idFor("dateStart")}
              hint={dateNeedsVerification ? "date TBD — set the confirmed date to clear this" : undefined}>
              <TextField id={idFor("dateStart")} type="date" value={form.dateStart || ""} onChange={e => {
                const value = e.target.value;
                set("dateStart" as keyof TInsert, value);
                // Correcting the date from the "Verify date" flow is what
                // resolves it — flips the rule off "tbd" so this occurrence
                // (and the series going forward) stops being flagged as an
                // unconfirmed guess. Mirrors RecurrencePicker's own "date" vs
                // "tbd" toggle so the resulting rule is one it would produce.
                if (dateNeedsVerification && rule?.monthlyMode === "tbd") {
                  const confirmedRule: RecurrenceRule = { ...rule, monthlyMode: rule.freq === "annual" ? undefined : "day-of-month" };
                  setForm(f => ({ ...f, recurrenceRule: confirmedRule, recurrenceLabel: describeRecurrenceRule(confirmedRule) } as Partial<TInsert>));
                }
              }}
                className={fieldErr("dateStart")} />
            </Field>
            <Field label="Ends" hint="optional" htmlFor="recurrence-until">
              <TextField id="recurrence-until" type="date" value={rule?.until || ""} onChange={e => setUntil(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <RecurrenceFreqSelect rule={rule} onChange={(r, label) => setForm(f => ({ ...f, recurrenceRule: r, recurrenceLabel: label } as Partial<TInsert>))} />
            {rule && (
              <RecurrencePicker rule={rule} dateStart={form.dateStart || ""} onRuleChange={(r, label) => setForm(f => ({ ...f, recurrenceRule: r, recurrenceLabel: label } as Partial<TInsert>))} />
            )}
          </div>

          {(form.excludedDates?.length ?? 0) > 0 && (
            <Field label="Skipped dates" hint="won't appear in the feed">
              <div className="flex flex-col rounded-none border-2 border-field-border/40 bg-field/40">
                {(form.excludedDates ?? []).map((date, i) => (
                  <div key={date} className={cn("flex items-center justify-between gap-2 px-2.5 py-2", i > 0 && "border-t border-field-border/30")}>
                    <span className="text-sm text-card-foreground">
                      {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <button type="button" aria-label="Restore this date"
                      onClick={() => setForm(f => ({ ...f, excludedDates: (f.excludedDates ?? []).filter(d => d !== date) } as Partial<TInsert>))}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-card-foreground">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      {/* Venue / Neighborhood */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={config.venueLabel} required htmlFor={idFor("venue")}>
          <TextField id={idFor("venue")} value={form.venue || ""} onChange={e => set("venue" as keyof TInsert, e.target.value)}
            className={fieldErr("venue")} placeholder={config.venuePlaceholder} />
        </Field>
        <Field label="Neighborhood" htmlFor={idFor("neighborhood")}>
          <TextField id={idFor("neighborhood")} value={form.neighborhood || ""} onChange={e => set("neighborhood" as keyof TInsert, e.target.value)}
            placeholder={config.neighborhoodPlaceholder} />
        </Field>
      </div>

      {/* Announced auto-surfaces for high-demand events */}
      {showAnnouncedOnSurface && (
        <Field label="Date announced" hint="high demand—worth logging" htmlFor="announced-surface" className="max-w-[16rem]">
          <TextField id="announced-surface" type="date" value={(form.announcedAt as string) || ""}
            onChange={e => set("announcedAt" as keyof TInsert, e.target.value)} />
        </Field>
      )}

      {/* More details — collapsed by default */}
      <div className={cn("rounded-none border-2 transition-colors", showMoreDetails ? "border-field-border/40" : "border-field-border/50 bg-muted/40")}>
        <button type="button" aria-expanded={showMoreDetails} onClick={() => setShowMoreDetails(v => !v)}
          className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-semibold text-card-foreground">
          <CollapseIcon open={showMoreDetails} />
          <span className="flex flex-1 flex-col">
            <span>{showMoreDetails ? "More details" : "Add more details"}</span>
            {!showMoreDetails && (
              <span className="text-xs font-medium text-muted-foreground">
                time, price, tickets, links{showAnnouncedOnSurface ? "" : ", announce date"}, demand
              </span>
            )}
          </span>
          {!showMoreDetails && <span className="shrink-0 text-xs font-semibold text-accent">Show</span>}
        </button>
        {showMoreDetails && (
          <div className="flex flex-col gap-4 border-t border-field-border/30 p-3">
            {whenMode !== "range" && (
              <Field label="Start time" hint="recommended" htmlFor={idFor("startTime")} className="max-w-[16rem]">
                <TextField id={idFor("startTime")} type="time" value={form.startTime || ""} onChange={e => set("startTime" as keyof TInsert, e.target.value)} />
                {whenMode === "irregular" && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Applies to all dates—edit individually after adding if needed.</p>
                )}
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Price" htmlFor={idFor("price")}>
                <TextField id={idFor("price")} value={form.price || ""} onChange={e => set("price" as keyof TInsert, e.target.value)} placeholder={config.pricePlaceholder} />
              </Field>
              <Field label="Ticket URL" htmlFor={idFor("ticketUrl")}>
                <TextField id={idFor("ticketUrl")} type="url" value={form.ticketUrl || ""} onChange={e => set("ticketUrl" as keyof TInsert, e.target.value)} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Original post link" htmlFor={idFor("sourceUrl")}>
              <TextField id={idFor("sourceUrl")} type="url" value={form.sourceUrl || ""} onChange={e => set("sourceUrl" as keyof TInsert, e.target.value)} placeholder={config.sourceUrlPlaceholder} />
            </Field>
            <Field label="Sellout risk" hint="how likely to fill up">
              <div className="flex flex-col gap-1.5">
                <div role="radiogroup" aria-label="Sellout risk" className="grid grid-cols-5 gap-1 rounded-full border-2 border-field-border bg-field p-1">
                  {[1, 2, 3, 4, 5].map(n => {
                    const isCurrent = form.selloutRisk === n;
                    const filled = !!form.selloutRisk && n <= form.selloutRisk;
                    return (
                      <button key={n} type="button" role="radio" aria-checked={isCurrent} aria-label={`Level ${n}`}
                        onClick={() => setForm(f => ({ ...f, selloutRisk: f.selloutRisk === n ? undefined : n }))}
                        className={cn("h-9 rounded-full text-sm font-semibold transition-colors", filled ? "bg-primary text-primary-foreground" : "text-field-foreground hover:bg-muted/60")}>
                        {n}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-muted-foreground">
                  {form.selloutRisk ? `${RISK_LABELS[form.selloutRisk]} — ${riskPips(form.selloutRisk)}` : "Not set"}
                </span>
              </div>
            </Field>
            {!showAnnouncedOnSurface && (
              <Field label="Date announced" hint="when it was made public" htmlFor={idFor("announcedAt")} className="max-w-[16rem]">
                <TextField id={idFor("announcedAt")} type="date" value={(form.announcedAt as string) || ""} onChange={e => set("announcedAt" as keyof TInsert, e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>

      {/* Your Name — last, before submit */}
      <Field label="Your name" required htmlFor={idFor("requester")} className="max-w-[16rem]">
        <TextField id={idFor("requester")} value={form.requester || ""} onChange={e => set("requester" as keyof TInsert, e.target.value)}
          className={fieldErr("requester")} placeholder="Who's adding this?" />
      </Field>
    </div>
  );
}

export default ListingEventFormFields;
