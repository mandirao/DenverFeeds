/**
 * One-time data-consistency pass: make every recurring Food/Art event's
 * free-text `recurrenceLabel` match exactly what the current picker UI would
 * generate for it — no drift like "Weekly Thursdays" (should be "Thursdays"),
 * bare "Weekly" (should name the day), or "Annual" surviving from an older
 * labeling scheme.
 *
 * - Rows that already have a structured `recurrenceRule`: regenerate the
 *   label from it via describeRecurrenceRule (the single source of truth the
 *   picker itself uses) — covers backfill-recurrence-rules.ts having set the
 *   rule but never touched the label.
 * - Rows without a rule: try parseLegacyRecurrenceLabel first (same as
 *   backfill-recurrence-rules.ts) and, on success, set both rule + label.
 * - Rows without a rule where the label doesn't confidently parse (e.g.
 *   "Ongoing series", a made-up name) are left untouched and reported
 *   separately — these need a human decision, not a guess.
 *
 * Usage:
 *   npx tsx scripts/normalize-recurrence-labels.ts            # dry run (default)
 *   npx tsx scripts/normalize-recurrence-labels.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { foodEvents, artEvents } from "@shared/schema";
import { parseLegacyRecurrenceLabel, describeRecurrenceRule, type RecurrenceRule } from "@shared/recurrence";

const APPLY = process.argv.includes("--apply");

interface Row {
  id: number;
  name: string;
  venue: string;
  dateStart: string;
  isRecurring: boolean | null;
  recurrenceLabel: string | null;
  recurrenceRule: RecurrenceRule | null;
}

async function normalize<T extends Row>(feed: string, table: any) {
  const rows: T[] = await db.select().from(table).where(eq(table.isRecurring, true));
  let labelFixed = 0, ruleBackfilled = 0, rogue = 0, alreadyCorrect = 0;

  console.log(`\n=== ${feed}: ${rows.length} recurring row(s) ===`);

  for (const row of rows) {
    if (row.recurrenceRule) {
      const desired = describeRecurrenceRule(row.recurrenceRule);
      if (desired === row.recurrenceLabel) { alreadyCorrect++; continue; }
      labelFixed++;
      console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" @ ${row.venue}: label "${row.recurrenceLabel}" -> "${desired}"`);
      if (APPLY) await db.update(table).set({ recurrenceLabel: desired }).where(eq(table.id, row.id));
      continue;
    }

    const inferred = parseLegacyRecurrenceLabel(row.recurrenceLabel, row.dateStart);
    if (!inferred) {
      rogue++;
      console.log(`  [ROGUE] #${row.id} "${row.name}" @ ${row.venue} (starts ${row.dateStart}): label "${row.recurrenceLabel}" doesn't confidently parse — needs a human decision, left untouched`);
      continue;
    }
    ruleBackfilled++;
    const desired = describeRecurrenceRule(inferred);
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" @ ${row.venue}: "${row.recurrenceLabel}" -> rule ${JSON.stringify(inferred)}, label "${desired}"`);
    if (APPLY) await db.update(table).set({ recurrenceRule: inferred, recurrenceLabel: desired }).where(eq(table.id, row.id));
  }

  console.log(`${feed}: ${alreadyCorrect} already correct, ${labelFixed} label(s) regenerated, ${ruleBackfilled} rule+label backfilled, ${rogue} rogue (needs review)`);
  return { alreadyCorrect, labelFixed, ruleBackfilled, rogue };
}

async function main() {
  console.log(APPLY
    ? "Running normalize in APPLY mode — this writes to the live database."
    : "Running normalize in DRY-RUN mode — no writes will be made. Pass --apply to write.");
  const food = await normalize("FOOD", foodEvents);
  const art = await normalize("ART", artEvents);
  console.log(`\nTotal: ${food.alreadyCorrect + art.alreadyCorrect} already correct, ${food.labelFixed + art.labelFixed} labels regenerated, ${food.ruleBackfilled + art.ruleBackfilled} rule+label backfilled, ${food.rogue + art.rogue} rogue.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
