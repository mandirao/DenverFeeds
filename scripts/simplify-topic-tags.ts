/**
 * One-time data migration: rename/merge/split artTopicTags values on existing
 * art_events rows to match the trimmed vocabulary in shared/schema.ts.
 *
 * Simplified to one word (semantics unchanged, just shorter):
 *   Architecture & Design -> Architecture
 *   Art & Visual Culture  -> Art
 *   Astronomy & Space     -> Astronomy
 *   Craft & Making        -> Craft
 *   Culture & Heritage    -> Culture
 *   Horror & Spooky       -> Horror
 *   Kids & Family         -> Family
 *   Pets & Animals        -> Pets
 *   Trains & Railways     -> Trains
 *   Wellness & Mindfulness -> Wellness
 *
 * Merged (low-volume, folded into the dominant art tag):
 *   Cartooning & Illustration -> Art
 *
 * Split (category field disambiguates which half applies):
 *   Literature & Writing -> "Writing" when category is "Workshops & Classes"
 *                           (hands-on writing practice), else "Literature"
 *                           (reading/author/book-discussion content).
 *
 * Tags not listed above (Birding, Film, Food & Drink, Fundraisers & Causes,
 * History, LGBTQ+, Music, Nature & Outdoors, Photography, Science) are left
 * untouched. Results are deduped per row (e.g. an event tagged both
 * "Art & Visual Culture" and "Cartooning & Illustration" collapses to one
 * "Art" tag).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/simplify-topic-tags.ts            # dry run (default)
 *   npx tsx --env-file=.env scripts/simplify-topic-tags.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const DIRECT_RENAMES: Record<string, string> = {
  "Architecture & Design": "Architecture",
  "Art & Visual Culture": "Art",
  "Astronomy & Space": "Astronomy",
  "Cartooning & Illustration": "Art",
  "Craft & Making": "Craft",
  "Culture & Heritage": "Culture",
  "Horror & Spooky": "Horror",
  "Kids & Family": "Family",
  "Pets & Animals": "Pets",
  "Trains & Railways": "Trains",
  "Wellness & Mindfulness": "Wellness",
};

function remapTags(tags: string[], category: string): string[] {
  const out: string[] = [];
  for (const t of tags) {
    let mapped: string;
    if (t === "Literature & Writing") {
      mapped = category === "Workshops & Classes" ? "Writing" : "Literature";
    } else {
      mapped = DIRECT_RENAMES[t] ?? t;
    }
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

async function run() {
  const rows = await db.select().from(artEvents);

  let changed = 0;
  const renameCounts: Record<string, number> = {};

  for (const row of rows) {
    const oldTags = row.tags ?? [];
    const newTags = remapTags(oldTags, row.category);
    const isSame = oldTags.length === newTags.length && oldTags.every((t, i) => t === newTags[i]);
    if (isSame) continue;

    changed++;
    for (const t of oldTags) {
      if (t === "Literature & Writing" || DIRECT_RENAMES[t]) {
        renameCounts[t] = (renameCounts[t] ?? 0) + 1;
      }
    }
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" [${oldTags.join(", ")}] -> [${newTags.join(", ")}]`);
    if (APPLY) await db.update(artEvents).set({ tags: newTags }).where(eq(artEvents.id, row.id));
  }

  console.log(`\nPer-tag occurrences touched:`);
  for (const [tag, count] of Object.entries(renameCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}\t${tag}`);
  }

  console.log(`\n${APPLY ? "Updated" : "Would update"} ${changed} of ${rows.length} rows.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
