/**
 * One-time pass: add the new "Politics" tag to upcoming/ongoing art_events
 * that genuinely warrant it. Every future event was reviewed by hand (via a
 * broad keyword sweep across all categories — including Tours & Outings, to
 * catch anything hiding outside Talks & Lectures) rather than regex-applied,
 * so this ID list is the audit trail. Past events were left untouched;
 * this is a forward-looking cleanup only.
 *
 * Considered and rejected as not genuinely political (kept their existing
 * tags): #819 "In the Shadows" (immigrant experience, not policy), #829
 * "Logan Lecture: David Huffman" (art talk that references politics as an
 * aesthetic influence, not a political event), #1021 "Rosenberry Lecture"
 * (generic Colorado history series), #1026 "Big Dreams in Denver's Little
 * Saigon" (immigrant community history).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/add-politics-tag.ts            # dry run (default)
 *   npx tsx --env-file=.env scripts/add-politics-tag.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const ADD_POLITICS: number[] = [
  1081, // A Century of Service: Portraits of American Diplomacy
  1082, // Ruth Wright Distinguished Lecture in Natural Resources (explicitly environmental policy)
  1083, // President's Speaker Series: Janet Yellen on Economics & Public Policy
];

async function run() {
  const rows = await db.select().from(artEvents);
  const byId = new Map(rows.map(r => [r.id, r]));

  let applied = 0, missing = 0, skipped = 0;

  for (const id of ADD_POLITICS) {
    const row = byId.get(id);
    if (!row) {
      missing++;
      console.log(`  [MISSING] #${id} — no longer found, skipped`);
      continue;
    }
    const tags = row.tags ?? [];
    if (tags.includes("Politics")) {
      skipped++;
      console.log(`  [SKIP] #${id} "${row.name}" already has Politics`);
      continue;
    }
    const newTags = [...tags, "Politics"];
    applied++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${id} "${row.name}" [${tags.join(", ")}] -> [${newTags.join(", ")}]`);
    if (APPLY) await db.update(artEvents).set({ tags: newTags }).where(eq(artEvents.id, id));
  }

  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${applied}. Missing: ${missing}. Already tagged: ${skipped}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
