import { useEffect, useMemo } from "react";
import { DAYS } from "@/lib/eventUtils";
import { describeRecurrenceRule, type RecurrenceRule, type RecurrenceFreq } from "@shared/recurrence";
import { Field, SelectField, controlBase } from "./form-primitives";
import { cn } from "@/lib/utils";

// "Biweekly" isn't a distinct RecurrenceFreq — it's freq:"weekly" with
// interval:2, same as the underlying data has always supported. Exposing it
// as its own dropdown option is purely a UI simplification.
type FreqButtonValue = RecurrenceFreq | "biweekly";
const FREQ_OPTIONS: { value: FreqButtonValue; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annually" },
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

const dayBtn = (active: boolean) =>
  cn(
    "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "border-field-border bg-field text-field-foreground hover:bg-muted/60",
  );

function freqSelectValue(rule: RecurrenceRule | null): FreqButtonValue | "" {
  if (!rule) return "";
  if (rule.freq === "weekly") return rule.interval === 2 ? "biweekly" : "weekly";
  return rule.freq;
}

function buildRuleForFreq(freq: FreqButtonValue, current: RecurrenceRule | null): RecurrenceRule {
  if (freq === "weekly" || freq === "biweekly") {
    return {
      freq: "weekly",
      byWeekdays: current?.byWeekdays ?? (current?.byWeekday !== undefined ? [current.byWeekday] : []),
      interval: freq === "biweekly" ? 2 : 1,
    };
  }
  if (freq === "monthly") {
    return { freq, monthlyMode: current?.monthlyMode ?? "day-of-month", byWeekday: current?.byWeekday, weekdayOrdinal: current?.weekdayOrdinal };
  }
  if (freq === "quarterly") {
    // No nth-weekday equivalent for quarterly — always day-of-month math,
    // "tbd" only changes how the "On the" field describes it.
    return { freq, monthlyMode: current?.monthlyMode === "tbd" ? "tbd" : "day-of-month" };
  }
  if (freq === "annual") {
    return { freq, monthlyMode: current?.monthlyMode === "tbd" ? "tbd" : undefined };
  }
  return { freq };
}

/** Compact frequency dropdown — sits next to the weekday/monthly-pattern
 * picker. The display label is always the system-generated one (no manual
 * override), so every rule change reports both the rule and its label. */
export function RecurrenceFreqSelect({
  rule,
  onChange,
}: {
  rule: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule, label: string) => void;
}) {
  return (
    <Field label="Repeats" required htmlFor="recurrence-freq" className="w-36">
      <SelectField
        id="recurrence-freq"
        value={freqSelectValue(rule)}
        onChange={e => {
          const next = buildRuleForFreq(e.target.value as FreqButtonValue, rule);
          onChange(next, describeRecurrenceRule(next));
        }}
      >
        <option value="" disabled>Frequency</option>
        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectField>
    </Field>
  );
}

function parseDateLocal(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Derives the natural monthly/quarterly/annual recurrence patterns from a
 * start date.
 * - `numberedOrdinal`: the "Nth weekday" option (null when the date is a 5th occurrence).
 * - `showLast`: whether a distinct "last weekday" option applies. When a date is BOTH the
 *   4th and the final occurrence of its weekday, we surface both so the user can pin the
 *   pattern to the numbered week or to whichever week is last (they diverge in 5-week months).
 * - `monthName`: full month name of the start date, for quarterly ("23rd of August") and
 *   annual ("August 23 each year") labels — monthly doesn't need it (no month in its label).
 */
function deriveMonthly(dateStart: string) {
  const date = parseDateLocal(dateStart);
  if (!date) return null;
  const day = date.getDate();
  const weekday = date.getDay();
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const weekIndex = Math.ceil(day / 7); // 1..5
  const isLast = day + 7 > daysInMonth;
  const numberedOrdinal: 1 | 2 | 3 | 4 | null = weekIndex <= 4 ? (weekIndex as 1 | 2 | 3 | 4) : null;
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  // Quarterly's "On the" option describes the pattern going forward (the
  // next quarter's edition), not the anchor date itself — "Starts" already
  // shows the anchor, so restating its own month there would be redundant.
  // E.g. an event created/starting Aug 23 reads "23rd of November".
  const quarterlyMonthName = new Date(date.getFullYear(), date.getMonth() + 3, 1)
    .toLocaleDateString("en-US", { month: "long" });
  return { day, weekday, numberedOrdinal, showLast: isLast, monthName, quarterlyMonthName };
}

/** Weekday chips (weekly/biweekly), or a contextual "On the" dropdown
 * (monthly) offering the date/Nth-weekday/last-weekday patterns naturally
 * implied by the series' start date. Renders nothing for annual or once no
 * rule is set yet. */
export function RecurrencePicker({
  rule,
  dateStart,
  onRuleChange,
}: {
  rule: RecurrenceRule | null;
  dateStart: string;
  onRuleChange: (rule: RecurrenceRule, label: string) => void;
}) {
  const applyRule = (next: RecurrenceRule) => onRuleChange(next, describeRecurrenceRule(next));
  const derived = useMemo(() => deriveMonthly(dateStart), [dateStart]);

  // Keep the stored weekday/ordinal attached to whatever the start date
  // naturally implies — mirrors the mock's behavior when Starts changes.
  useEffect(() => {
    if (!rule || rule.freq !== "monthly" || rule.monthlyMode !== "nth-weekday" || !derived) return;
    const defOrd = derived.numberedOrdinal ?? -1;
    if (rule.byWeekday === derived.weekday && rule.weekdayOrdinal === defOrd) return;
    applyRule({ ...rule, byWeekday: derived.weekday, weekdayOrdinal: defOrd });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, rule?.freq, rule?.monthlyMode]);

  if (!rule) return null;

  if (rule.freq === "weekly") {
    const days = rule.byWeekdays ?? (rule.byWeekday !== undefined ? [rule.byWeekday] : []);
    return (
      <Field label="On days" required hint="pick one or more" className="flex-1 min-w-[12rem]">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const active = days.includes(i);
            return (
              <button key={d} type="button" aria-label={d}
                onClick={() => {
                  const next = active ? days.filter(x => x !== i) : [...days, i].sort((a, b) => a - b);
                  if (next.length === 0) return; // at least one day must stay selected
                  applyRule({ ...rule, byWeekdays: next, byWeekday: undefined });
                }}
                className={dayBtn(active)}>
                {d[0]}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }

  if (rule.freq === "monthly") {
    const monthlyValue = rule.monthlyMode === "nth-weekday" ? `weekday:${rule.weekdayOrdinal ?? 1}`
      : rule.monthlyMode === "tbd" ? "tbd" : "date";
    const onMonthlyChange = (v: string) => {
      if (v === "date") {
        applyRule({ ...rule, monthlyMode: "day-of-month" });
      } else if (v === "tbd") {
        applyRule({ ...rule, monthlyMode: "tbd" });
      } else {
        const ord = Number(v.slice("weekday:".length)) as 1 | 2 | 3 | 4 | -1;
        applyRule({ ...rule, monthlyMode: "nth-weekday", weekdayOrdinal: ord, byWeekday: derived?.weekday ?? rule.byWeekday ?? 0 });
      }
    };
    return (
      <Field label="On the" required htmlFor="monthly-pattern" className="flex-1 min-w-[12rem]">
        {derived ? (
          <SelectField id="monthly-pattern" value={monthlyValue} onChange={e => onMonthlyChange(e.target.value)}>
            <option value="date">{ordinalSuffix(derived.day)}</option>
            {derived.numberedOrdinal && (
              <option value={`weekday:${derived.numberedOrdinal}`}>
                {ORDINAL_LABELS[derived.numberedOrdinal]} {WEEKDAY_NAMES[derived.weekday]}
              </option>
            )}
            {derived.showLast && (
              <option value="weekday:-1">Last {WEEKDAY_NAMES[derived.weekday]}</option>
            )}
            <option value="tbd">Exact date TBD</option>
          </SelectField>
        ) : (
          <div className={cn(controlBase, "flex items-center text-muted-foreground")}>Set a start date first</div>
        )}
      </Field>
    );
  }

  if (rule.freq === "quarterly") {
    // Only the anchor day-of-month, or "TBD" — no weekday-of-month option
    // (wrong mental model for a once-a-quarter cadence).
    const quarterlyValue = rule.monthlyMode === "tbd" ? "tbd" : "date";
    const onQuarterlyChange = (v: string) => applyRule({ ...rule, monthlyMode: v === "tbd" ? "tbd" : "day-of-month" });
    return (
      <Field label="On the" required htmlFor="quarterly-pattern" className="flex-1 min-w-[12rem]">
        {derived ? (
          <SelectField id="quarterly-pattern" value={quarterlyValue} onChange={e => onQuarterlyChange(e.target.value)}>
            <option value="date">{ordinalSuffix(derived.day)} of {derived.quarterlyMonthName}</option>
            <option value="tbd">Exact date TBD</option>
          </SelectField>
        ) : (
          <div className={cn(controlBase, "flex items-center text-muted-foreground")}>Set a start date first</div>
        )}
      </Field>
    );
  }

  if (rule.freq === "annual") {
    const annualValue = rule.monthlyMode === "tbd" ? "tbd" : "date";
    const onAnnualChange = (v: string) => applyRule({ ...rule, monthlyMode: v === "tbd" ? "tbd" : "day-of-month" });
    return (
      <Field label="On" required htmlFor="annual-pattern" className="flex-1 min-w-[12rem]">
        {derived ? (
          <SelectField id="annual-pattern" value={annualValue} onChange={e => onAnnualChange(e.target.value)}>
            <option value="date">{derived.monthName} {derived.day} each year</option>
            <option value="tbd">Exact date TBD</option>
          </SelectField>
        ) : (
          <div className={cn(controlBase, "flex items-center text-muted-foreground")}>Set a start date first</div>
        )}
      </Field>
    );
  }

  return null;
}

export default RecurrencePicker;
