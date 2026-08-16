/**
 * One-time data migration: split the old "Books & Talks" art_events category
 * into "Book Clubs" (recurring/participatory group reads) and "Talks & Lectures"
 * (author events, expert lectures, panels, symposiums — passive-audience talks
 * not centered on a group discussing a specific book together).
 *
 * Every row below was read individually (name + summary + recurrence) and
 * hand-assigned — not regex-guessed — so this map is the audit trail. Rows
 * whose category has since changed (edited after this script was written) or
 * that no longer exist are reported and skipped rather than silently applied.
 *
 * 4 rows are deliberately left out of both lists — they're book-adjacent
 * retail/party events (a bookstore grand opening, a book-themed movie release
 * party, a plant-and-book pairing event) that don't cleanly fit either new
 * category. They'll print under [UNASSIGNED] for a human to place by hand.
 *
 * Usage:
 *   npx tsx scripts/split-books-talks-category.ts            # dry run (default)
 *   npx tsx scripts/split-books-talks-category.ts --apply    # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const BOOK_CLUBS: number[] = [
  126, // True Stories Book Club
  278, // Silent Pages Society
  125, // Baddies Who Bookclub
  656, // FBC Book Club: Vicious by V.E. Schwab
  514, // Schoolyard Book Club
  800, // 7th Circle Book Club
  793, // Outdoor Bookclub: Nickel Boys
  794, // Outdoor Bookclub: Nickel Boys (recurring instance)
  803, // Subject-only Book Club
  795, // Book Club: Nickel Boys
  796, // Book Club: Nickel Boys
  797, // Book Club: Nickel Boys
  94,  // Horror Book Club
  813, // Exploring Nature (CMC Book Club Meetup)
  208, // Silent Community Read-a-Thon
  252, // Pages in the Park
  333, // Mary Ann's Book Club: Invisible Women
  376, // Pages in the Park (Denver Book Swap Society)
  377, // Curl Up + Read: Book Swap at Cat Cafe
  404, // Fiction Craft Club
];

const TALKS_LECTURES: number[] = [
  148, // Nerd Nite
  624, // 2026 Institute Residential Fellowship Symposium
  637, // Conversation with Jungjin Lee
  711, // Homesick for a World Unknown: An Evening with Author Miriam Horn
  763, // Gallery Talk: George Curtis Levi & Halcyon Levi
  609, // Mixed Taste: Blucifer & Rocky Flats
  571, // 60 Minutes in Space: From the Garage to Mars
  530, // AfterWord Residency: Ross Gay x Arista Alanis
  826, // Ross Gay x Arista Alanis (DPL AfterWord Residency)
  791, // Protest and Power
  806, // The Art of Business
  785, // Preserving Legacies: How to Explore Family House Histories
  610, // Mixed Taste: The Ludlow Mining Strike & Street Fashion
  781, // Witness: Dr. Christopher Hunt on James Baldwin
  166, // Creative Mornings
  638, // Holbein's Wit
  747, // +Milklings+ Ghost Reading // Release Party
  744, // A Night of Island Horror
  788, // The Nickel Boys and the American Juvenile Justice System
  833, // WorldDenver Speaker Series
  783, // Power: Dr. Jasmine Harris on bell hooks
  790, // Protest and Power
  662, // Colorado Startup Week 2026
  816, // Schultz Lecture in Energy
  782, // Futures: Rick Griffith on Octavia Butler
  778, // Meet Author Colson Whitehead
  758, // Everyday Objects, Extraordinary Stories: A Conversation with Dung Ngo
  838, // Author Talk: Hampton Sides on Captain Cook's Final Voyage
  834, // Radical Empathy, Brash Ecology
  836, // Talk: Living (in) an Urban Planner's Dream
  818, // President's Speaker Series
  839, // Author Talk: Joyce Carol Oates
  835, // Conversation with Annabelle Selldorf (CU Denver Architecture Lecture Series)
  831, // TEDxBoulder
  832, // Susman Luminary Lecture
  840, // Author Talk: Virginia Evans
  841, // Author Talk: Ocean Vuong
  842, // Author Talk: Liz Moore
  17,  // Local Author Meet & Greet
  123, // Artist Dialogue with Ana María Hernando
  138, // Henry Hoke x Tom Hagerman: Open Throat Reading & Musical Response
  152, // Spirits, Séances, and Skeptics
  180, // Poetry Book Release Celebration!
  194, // Logan Lecture: Enrique Chagoya
  195, // Curator Conversation: Inside The Stars We Do Not See
  196, // Restitution, Repair, and Reconciliation: The Case of Benin
  291, // What's Wrong With Us: The Psychology of American Politics
  297, // Presidential Seclusion: Camp David Talk
  301, // When Crushes Become Criminal: The Hidden Reality of Modern Cyberstalking
  314, // Night of Ideas 2026: Paving the Way
  343, // AfterWord: Melissa Broder x Courtney Ozaki-Durgin
  356, // Rock Art: An American Story – An Evening With Stephen Alvarez
  366, // DISPLACED: A Live Reading Event
  369, // PowerPoint Party No. 38
  423, // Book Dinner with Jordan Salcito
  427, // Bethany Collins: Moby Dick Transcription Exhibition
  430, // Artist Talk with Joe Palec
  432, // State of Live: Denver's Independent Live Sector
  529, // One Book One Denver 2026 Book Reveal
  531, // Curiosity Collective: Risk
  534, // Kennedy Baker Author Meet & Greet
  557, // Analog Salon: McGrath Family Album
  568, // Saving Birds to Save the Planet with Scott Weidensaul
  604, // Mixed Taste: Cuba & Andy Warhol
  605, // Mixed Taste: The Espinosa Brothers & Nuclear Deterrence
  606, // Mixed Taste: La Llorona & Green Chile
  607, // Mixed Taste: Clara Brown & Hide Tanning
  608, // Mixed Taste: Chinatown & Breakdancing
  684, // South Broadway Press Anthology Release Party
];

async function run() {
  const rows = await db.select().from(artEvents).where(eq(artEvents.category, "Books & Talks"));
  const byId = new Map(rows.map(r => [r.id, r]));
  const assigned = new Set<number>();

  let applied = 0, missing = 0;

  for (const [target, ids] of [["Book Clubs", BOOK_CLUBS], ["Talks & Lectures", TALKS_LECTURES]] as const) {
    for (const id of ids) {
      assigned.add(id);
      const row = byId.get(id);
      if (!row) {
        missing++;
        console.log(`  [MISSING] #${id} — no longer in "Books & Talks" (edited or deleted since this script was written), skipped`);
        continue;
      }
      applied++;
      console.log(`  [${APPLY ? "apply" : "would apply"}] #${id} "${row.name}" -> "${target}"`);
      if (APPLY) await db.update(artEvents).set({ category: target }).where(eq(artEvents.id, id));
    }
  }

  const unassigned = rows.filter(r => !assigned.has(r.id));
  if (unassigned.length > 0) {
    console.log(`\n[UNASSIGNED] ${unassigned.length} row(s) currently in "Books & Talks" have no entry in this script's map — needs a human decision, left untouched:`);
    for (const r of unassigned) console.log(`  #${r.id} "${r.name}"`);
  }

  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${applied}. Missing: ${missing}. Unassigned: ${unassigned.length}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
