/**
 * One-time pass: add the new "Sport" and "Tech" tags to upcoming/ongoing
 * art_events that genuinely warrant them. Every future/ongoing event
 * matching a broad keyword sweep (across all categories, not just the
 * obvious ones) was reviewed by hand — this ID list is the audit trail, not
 * a regex auto-apply. Past events were left untouched; forward-looking only,
 * same scope as the earlier Politics tag pass.
 *
 * Considered and rejected for Sport (kept existing tags, not genuinely
 * about sport as the subject): #894 Highlands Oktoberfest and #885/#886
 * the Breckenridge/Denver Oktoberfests (a "5K" or "keg bowling" is one minor
 * novelty activity in an otherwise beer-festival event, not the subject);
 * #829 Logan Lecture (basketball is a visual/aesthetic reference in the
 * paintings discussed, not a sport event); #869 Spicy Lit Society ("sports"
 * romance is a book subgenre, not the event's subject); #897 Danger Monkey
 * Go Club (the board game Go, a keyword false-positive on "golf").
 *
 * Considered and rejected for Tech: #166 Creative Mornings (an AI
 * co-working space is just the venue, not this month's topic); #1004 Labor
 * Day Lift Off (a drone show is one minor feature of a hot-air-balloon
 * festival); #925 Flocktoberfest (bird festival, keyword false-positive).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/add-sport-tech-tags.ts            # dry run (default)
 *   npx tsx --env-file=.env scripts/add-sport-tech-tags.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const ADD_TAGS: Record<number, string> = {
  980: "Sport", // Fall Block Party & Baker Cornhole Classic
  799: "Sport", // Pickleball & Mahjong Open Play
  321: "Tech",  // Creative Code Denver Meetup
  662: "Tech",  // Colorado Startup Week 2026
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
