/**
 * One-time pass: add the new "Wildlife" tag to upcoming/ongoing art_events
 * that genuinely have live/wild animals (other than birdwatching) as the
 * subject — spiders, beavers, taxidermy, conservation, etc. "Birding" stays
 * reserved for birdwatching-hobbyist content; "Wildlife" is its sibling for
 * everything else. Hand-reviewed from a keyword sweep, not a regex
 * auto-apply. Past events were left untouched; forward-looking only, same
 * scope as the earlier Holiday/Sport/Tech passes.
 *
 * Considered and rejected: #1131 Trash Meets Birds was close (live raptors
 * at a bar) but is birds-only and arguably still "Birding" territory —
 * tagged Wildlife anyway since the framing is a raptor-rescue wildlife
 * encounter, not a birdwatching outing. #1150 Growl-O-Ween (costumed dogs)
 * and #1139 Harvest Hangout (petting-zoo farm animals as a minor feature)
 * were rejected — domestic/incidental, not wild animals as the subject.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/add-wildlife-tag.ts            # dry run (default)
 *   npx tsx --env-file=.env scripts/add-wildlife-tag.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const ADD_TAGS: Record<number, string> = {
  1131: "Wildlife", // Trash Meets Birds (live raptors, raptor rescue)
  1084: "Wildlife", // Taxidermy Classes
  922: "Wildlife",  // Spiders After Dark
  923: "Wildlife",  // Spiders After Dark (second date)
  1129: "Wildlife", // Leave It to the Beavers Speaker Series
  924: "Wildlife",  // Bugs & Brews: Toxic Terrors
  1113: "Wildlife", // A Wild Affair
  1105: "Wildlife", // Wild & Scenic Film Festival
};

async function run() {
  const rows = await db.select().from(artEvents);
  const byId = new Map(rows.map(r => [r.id, r]));

  let applied = 0, missing = 0, skipped = 0;

  for (const [idStr, tag] of Object.entries(ADD_TAGS)) {
    const id = Number(idStr);
    const row = byId.get(id);
    if (!row) {
      missing++;
      console.log(`  [MISSING] #${id} — no longer found, skipped`);
      continue;
    }
    const tags = row.tags ?? [];
    if (tags.includes(tag)) {
      skipped++;
      console.log(`  [SKIP] #${id} "${row.name}" already has ${tag}`);
      continue;
    }
    const newTags = [...tags, tag];
    applied++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${id} "${row.name}" [${tags.join(", ")}] -> [${newTags.join(", ")}]`);
    if (APPLY) await db.update(artEvents).set({ tags: newTags }).where(eq(artEvents.id, id));
  }

  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${applied}. Missing: ${missing}. Already tagged: ${skipped}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
