import type { ReactNode } from "react";
import type { RecurrenceRule } from "@shared/recurrence";

// Structural shape shared by FoodEvent and ArtEvent — the fields the shared
// listing components (row, calendar, add/edit modals) actually touch.
// Feed-specific fields (cuisine vs category, etc.) are read via config
// accessor functions instead of being baked in here.
export interface ListingEventBase {
  id: number;
  emoji: string;
  name: string;
  venue: string;
  neighborhood?: string | null;
  dateStart: string;
  dateEnd?: string | null;
  startTime?: string | null;
  summary: string;
  price?: string | null;
  ticketUrl?: string | null;
  sourceUrl?: string | null;
  requester?: string | null;
  soldOut?: boolean | null;
  announcedAt?: string | null;
  selloutRisk?: number | null;
  isRecurring?: boolean | null;
  recurrenceLabel?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  instanceNotes?: Record<string, string> | null;
  instanceTitles?: Record<string, string> | null;
  excludedDates?: string[] | null;
  /** Date of the most recent occurrence a human explicitly confirmed as
   * real — only meaningful alongside recurrenceRule.monthlyMode 'tbd'. */
  verifiedThroughDate?: string | null;
  /** Weekday subset (0=Sun..6=Sat) a bounded Range-mode event actually runs
   * on — null/empty means every day in [dateStart, dateEnd] counts. See
   * shared/schema.ts's activeWeekdays column comment. */
  activeWeekdays?: number[] | null;
  /** Set only on occurrences produced by expandRecurringEvents — the row's
   * real persisted dateStart (the recurrence anchor), distinct from this
   * particular occurrence's computed date living in `dateStart` itself. */
  seriesAnchorDate?: string | null;
  /** Set only on occurrences produced by expandRecurringEvents for a 'tbd'
   * recurrence rule — true when this occurrence's date doesn't match
   * verifiedThroughDate (nobody's confirmed this specific occurrence yet). */
  isDateUnverified?: boolean | null;
}

// Per-feed configuration for <ListingEventRow>. Anything that's a genuine
// behavioral/visual difference between feeds (copy, colors, which secondary
// badge shows) is a config field or render prop here rather than baked into
// the shared component — that's the on/off switch mechanism.
export interface ListingRowConfig<T extends ListingEventBase> {
  apiPath: string;          // e.g. "/api/food-events"
  queryKey: string;         // usually same as apiPath
  dialogBg: string;         // delete-confirm dialog background color
  deleteTitle: string;      // "Delete this popup?" / "Delete this event?"
  soldOutRestoreLabel: string; // toast shown when un-marking sold out
  ticketLabel: string;      // "Reserve" / "Tickets"
  ticketTextColorClass: string; // tailwind text color class for the ticket button
  getCategory: (event: T) => string | null | undefined; // cuisine vs category
  /** Renders the "↳ note" line under a recurring event's instance note, if any. */
  renderInstanceNote: (note: string) => ReactNode;
  EditModal: React.ComponentType<{ event: T; onClose: () => void }>;
}

// Per-feed configuration for <ListingCalendarMonthView>.
export interface ListingCalendarConfig<T extends ListingEventBase> {
  cellBg: string;
  /** Darker "card" tint for the mobile day-scroll view, matching the feed's alternating-day rows. */
  cardBg: string;
  /**
   * Whether a multi-day event's spillover into this month's first cell should
   * skip recurring events. Art guards against this (recurring events are
   * already expanded into discrete occurrences elsewhere); Food doesn't.
   * NOTE: this divergence is one of the "working inconsistently" spots
   * flagged for a later pass — preserved as-is for now, just made explicit.
   */
  guardRecurringMultiDaySpillover: boolean;
}

// Structural shape shared by InsertFoodEvent and InsertArtEvent. Nullable
// (not just optional) because that's what drizzle-zod infers for nullable
// text/jsonb columns.
export interface ListingInsertBase {
  emoji?: string | null;
  name?: string | null;
  venue?: string | null;
  neighborhood?: string | null;
  dateStart?: string | null;
  dateEnd?: string | null;
  startTime?: string | null;
  summary?: string | null;
  price?: string | null;
  ticketUrl?: string | null;
  sourceUrl?: string | null;
  rawBlurb?: string | null;
  requester?: string | null;
  announcedAt?: string | null;
  selloutRisk?: number | null;
  isRecurring?: boolean | null;
  recurrenceLabel?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  instanceNotes?: Record<string, string> | null;
  instanceTitles?: Record<string, string> | null;
  excludedDates?: string[] | null;
  verifiedThroughDate?: string | null;
  activeWeekdays?: number[] | null;
}

export interface RedoAIResult {
  title: string;
  description: string;
}

/** One row in the specific-dates list. `title`, when set, becomes "Event
 * Name: title" on the row created for that date — each date produces its
 * own independent event, so the modifier is baked into that row's own name
 * rather than routed through the recurring-occurrence instanceTitles map. */
export interface SpecificDateEntry {
  date: string;
  title: string;
}

export interface ParseAIContext<TInsert> {
  form: Partial<TInsert>;
  blurb: string;
  setForm: (updater: Partial<TInsert>) => void;
  setInstanceNote: (note: string) => void;
  setInstanceTitle: (title: string) => void;
  setSpecificDates: (dates: SpecificDateEntry[]) => void;
  setUseSpecificDates: (v: boolean) => void;
}

// Per-feed configuration shared by <AddListingEventModal> and <EditListingEventModal>.
// features.specificDatesBatchAdd (split one event into several discrete
// dates in one submit) and recurring are both baseline capabilities of
// every listing feed — the flag exists in case a future feed wants it off,
// not because it's currently feed-specific.
export interface ListingFormConfig<TInsert extends ListingInsertBase> {
  idPrefix: string;   // "ab" | "an" — used to build stable element ids for focus-on-error
  apiPath: string;    // e.g. "/api/food-events"
  queryKey: string;
  dialogBg: string;

  categoryFieldKey: keyof TInsert & string; // "cuisine" | "category"
  categoryLabel: string;   // "Cuisine" / "Category"
  categoryOptions: readonly string[];

  venueLabel: string;               // "Venue / Restaurant" / "Venue"
  namePlaceholder: string;
  venuePlaceholder: string;
  neighborhoodPlaceholder: string;
  emojiPlaceholder: string;
  pricePlaceholder: string;
  instanceNotePlaceholder: string;
  instanceTitlePlaceholder: string;
  descriptionPlaceholderAdd: string;
  descriptionPlaceholderEdit: string;
  sourceUrlPlaceholder: string;

  addModalTitle: string;   // "Add a Popup" / "Add an Event"
  editModalTitle: string;  // "Edit Popup" / "Edit Event"
  addSubmitLabel: string;  // "Add Popup" / "Add Event"
  createToastTitle: string; // "Popup added!" / "Event added!"
  discardDescriptionEdit: string; // "You have unsaved edits…" / "You have unsaved changes."

  screenshotIntro: string;
  blurbIntro: string;
  blurbPlaceholder: string;

  parseEndpoint: string;
  redoEndpoint: string;
  buildRedoPayload: (form: Partial<TInsert>, instanceNote: string, instanceTitle: string) => Record<string, unknown>;
  applyRedoResponse: (res: any, ctx: { setForm: (updater: (f: Partial<TInsert>) => Partial<TInsert>) => void; setInstanceNote: (note: string) => void; setInstanceTitle: (title: string) => void }) => RedoAIResult;
  applyParseResponse: (data: any, ctx: ParseAIContext<TInsert>) => RedoAIResult;

  getMissingField: (form: Partial<TInsert>) => { field: string; label: string } | null;
  BLANK: Partial<TInsert>;

  features: {
    specificDatesBatchAdd: boolean;
  };
}
