import type { ReactNode } from "react";

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
  instanceNotes?: Record<string, string> | null;
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
  /** The little "live Xd/w · risk pips" (Food) or "recurring · risk pips" (Art) cluster. Returns null to render nothing. */
  renderLiveBadge: (event: T) => ReactNode;
  /** Standalone recurring badge shown before the summary text. Food-only today. */
  renderRecurringNote?: (event: T) => ReactNode;
  /** Renders the "↳ note" line under a recurring event's instance note, if any. */
  renderInstanceNote: (note: string) => ReactNode;
  EditModal: React.ComponentType<{ event: T; onClose: () => void }>;
}

// Per-feed configuration for <ListingCalendarMonthView>.
export interface ListingCalendarConfig<T extends ListingEventBase> {
  cellBg: string;
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
  instanceNotes?: Record<string, string> | null;
}

export interface RedoAIResult {
  title: string;
  description: string;
}

export interface ParseAIContext<TInsert> {
  form: Partial<TInsert>;
  blurb: string;
  setForm: (updater: Partial<TInsert>) => void;
  setInstanceNote: (note: string) => void;
  setSpecificDates: (dates: string[]) => void;
  setUseSpecificDates: (v: boolean) => void;
}

// Per-feed configuration shared by <AddListingEventModal> and <EditListingEventModal>.
// This is the "feature on/off switch" surface for the two capabilities that
// currently differ per feed:
//   - features.specificDatesBatchAdd: Arts-only today (split one event into
//     several discrete dates in one submit).
//   - recurring itself is NOT feature-flagged — both feeds have it, it's a
//     baseline capability of every listing feed.
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
  recurrenceLabelPlaceholder: string;
  instanceNotePlaceholder: string;
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
  buildRedoPayload: (form: Partial<TInsert>, instanceNote: string) => Record<string, unknown>;
  applyRedoResponse: (res: any, ctx: { setForm: (updater: (f: Partial<TInsert>) => Partial<TInsert>) => void; setInstanceNote: (note: string) => void }) => RedoAIResult;
  applyParseResponse: (data: any, ctx: ParseAIContext<TInsert>) => RedoAIResult;

  getMissingField: (form: Partial<TInsert>) => { field: string; label: string } | null;
  BLANK: Partial<TInsert>;

  features: {
    specificDatesBatchAdd: boolean;
  };
}
