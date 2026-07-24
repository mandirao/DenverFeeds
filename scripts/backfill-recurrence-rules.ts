/**
 * One-time backfill: infer a structured RecurrenceRule for existing recurring
 * Food/Art events that don't have one yet (everything created before the
 * structured-recurrence work). Best-effort — parseLegacyRecurrenceLabel
 * returns null for anything ambiguous, and those rows are left untouched,
 * continuing to use the legacy keyword-fallback expansion.
 *
 * Usage:
 *   npx tsx scripts/backfill-recurrence-rules.ts            # dry run (default)
 *   npx tsx scripts/backfill-recurrence-rules.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { foodEvents, artEvents } from "@shared/schema";
import { parseLegacyRecurrenceLabel, describeRecurrenceRule } from "@shared/recurrence";

const APPLY = process.argv.includes("--apply");

async function backfillFoodEvents() {
  const rows = await db.select().from(foodEvents).where(and(eq(foodEvents.isRecurring, true), isNull(foodEvents.recurrenceRule)));
  let matched = 0, skipped = 0;
  console.log(`\nfood_events: ${rows.length} recurring row(s) without a structured rule`);
  for (const row of rows) {
    const rule = parseLegacyRecurrenceLabel(row.recurrenceLabel, row.dateStart);
    if (!rule) {
      skipped++;
      console.log(`  [skip] #${row.id} "${row.name}" — label "${row.recurrenceLabel}" not confidently parseable, stays on legacy fallback`);
      continue;
    }
    matched++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" — "${row.recurrenceLabel}" → ${JSON.stringify(rule)} (generates "${describeRecurrenceRule(rule)}")`);
    if (APPLY) await db.update(foodEvents).set({ recurrenceRule: rule }).where(eq(foodEvents.id, row.id));
  }
  console.log(`food_events: ${matched} matched, ${skipped} left on fallback`);
  return { matched, skipped };
}

async function backfillArtEvents() {
  const rows = await db.select().from(artEvents).where(and(eq(artEvents.isRecurring, true), isNull(artEvents.recurrenceRule)));
  let matched = 0, skipped = 0;
  console.log(`\nart_events: ${rows.length} recurring row(s) without a structured rule`);
  for (const row of rows) {
    const rule = parseLegacyRecurrenceLabel(row.recurrenceLabel, row.dateStart);
    if (!rule) {
      skipped++;
      console.log(`  [skip] #${row.id} "${row.name}" — label "${row.recurrenceLabel}" not confidently parseable, stays on legacy fallback`);
      continue;
    }
    matched++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" — "${row.recurrenceLabel}" → ${JSON.stringify(rule)} (generates "${describeRecurrenceRule(rule)}")`);
    if (APPLY) await db.update(artEvents).set({ recurrenceRule: rule }).where(eq(artEvents.id, row.id));
  }
  console.log(`art_events: ${matched} matched, ${skipped} left on fallback`);
  return { matched, skipped };
}

async function main() {
  console.log(APPLY
    ? "Running backfill in APPLY mode — this writes to the live database."
    : "Running backfill in DRY-RUN mode — no writes will be made. Pass --apply to write.");
  const food = await backfillFoodEvents();
  const art = await backfillArtEvents();
  console.log(`\nTotal: ${food.matched + art.matched} matched, ${food.skipped + art.skipped} left on legacy fallback.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
