/**
 * One-time pass: add the new "Holiday" tag to upcoming/ongoing art_events
 * that genuinely warrant it. Every future/ongoing event matching a broad
 * keyword sweep (halloween, christmas, hanukkah, day of the dead, holiday
 * market, etc. — across all categories, not just the obvious ones) was
 * reviewed by hand; this ID list is the audit trail, not a regex
 * auto-apply. Past events were left untouched; forward-looking only, same
 * scope as the earlier Politics/Sport/Tech tag passes.
 *
 * "Holiday" is reserved for events genuinely CENTERED on a specific
 * holiday or seasonal occasion (Halloween, Día de los Muertos, Christmas,
 * Hanukkah, a "holiday market"), not just events that happen to fall near
 * one or mention costumes/fall vibes in passing.
 *
 * Considered and rejected (kept existing tags, not genuinely holiday-themed):
 * - All Oktoberfest-family events (#894 Highlands Oktoberfest, #885
 *   Breckenridge Oktoberfest, #886 Denver Oktoberfest, #1060
 *   Cherry Creektoberfest, #911 Dachshund Dash) — a beer/cultural festival
 *   tradition, not one of the calendar holidays this tag targets.
 * - #1139 Harvest Hangout — generic fall farm market ("fall vibes",
 *   pumpkin beer), not tied to a specific named holiday.
 * - #1154 Immersive Movie Night: Alice in Wonderland — optional costumes,
 *   but the subject is the film, not a holiday.
 * - #1159 The Dreamer's Gala: A Court of Crafts & Costumes — a book-release
 *   costume gala (ACOTAR), not a holiday celebration.
 * - #1132 Tipsy Twelfth Night — Shakespeare's play by that name, not the
 *   Twelfth Night holiday itself.
 * - #94 Horror Book Club, #595 Colorado Shakespeare Festival, #598
 *   Wildflower Festival, #589 Sunday Bluegrass, #908 Hedwig and the Angry
 *   Inch, #887 Denver Arts Week, #1061 Evergreen Open Door Studios, #760
 *   "What We've Been Up To: People", #174 Mending Circle, #109 Thursday
 *   Figure Drawing — keyword false positives (Santa Fe street name,
 *   "spooky" coffee-shop branding, etc.) or simply not holiday-themed.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/add-holiday-tag.ts            # dry run (default)
 *   npx tsx --env-file=.env scripts/add-holiday-tag.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const ADD_HOLIDAY: number[] = [
  1112, // Big Boy No. 4014 Holiday Tour Stop
  1008, // The Masquerade (Halloween ball)
  351,  // Warm & Fuzzy: ASLD Small Works Holiday Salon
  924,  // Bugs & Brews: Toxic Terrors (Halloween costume contest)
  1119, // Spirits & Spirits: Victorian Spiritualism & Silent Film Halloween
  884,  // ELF The Musical
  891,  // Broadway Halloween Bar Crawl
  906,  // Cherry Creek Holiday Market
  881,  // Home Alone in Concert
  880,  // Too Hot to Handel
  882,  // Celtic Woman: Silver Bells Christmas Tour 2026
  877,  // Witches' Tea
  970,  // Día de los Muertos
  1141, // Glow at the Gardens (10/15)
  1142, // Glow at the Gardens (10/23)
  1143, // Glow at the Gardens (10/21)
  1144, // Glow at the Gardens (10/22)
  1145, // Glow at the Gardens (10/24)
  1146, // Glow at the Gardens (10/18)
  1147, // Glow at the Gardens (10/17)
  1148, // Glow at the Gardens (10/16)
  1150, // Growl-O-Ween
  1103, // Freaky Friday Fright Night Flicks
  1153, // Stoney's Annual Pumpkin Carve
  1155, // Chaotic Singles Halloween Party
  1156, // Bao Buns and Boogies: Late Night Halloween Party
  1152, // Park Hill Halloween Parade + Crafternoon
  1160, // Halloween Edition Pottery Workshop
  1161, // Unbridled Wine Club: Spooky Sips
  1162, // Boos & Brews Halloween 5K
  1091, // Denver Community Media Halloween Spooktacular
  1094, // Dracula: A Comedy of Terrors
  971,  // Broadway Halloween Parade
  883,  // Holiday Brass
];

async function run() {
  const rows = await db.select().from(artEvents);
  const byId = new Map(rows.map(r => [r.id, r]));

  let applied = 0, missing = 0, skipped = 0;

  for (const id of ADD_HOLIDAY) {
    const row = byId.get(id);
    if (!row) {
      missing++;
      console.log(`  [MISSING] #${id} — no longer found, skipped`);
      continue;
    }
    const tags = row.tags ?? [];
    if (tags.includes("Holiday")) {
      skipped++;
      console.log(`  [SKIP] #${id} "${row.name}" already has Holiday`);
      continue;
    }
    const newTags = [...tags, "Holiday"];
    applied++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${id} "${row.name}" [${tags.join(", ")}] -> [${newTags.join(", ")}]`);
    if (APPLY) await db.update(artEvents).set({ tags: newTags }).where(eq(artEvents.id, id));
  }

  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${applied}. Missing: ${missing}. Already tagged: ${skipped}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
