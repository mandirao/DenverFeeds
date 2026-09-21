/**
 * One-time data migration for the category/tags information-architecture
 * split (see the "layer deeper" IA redesign): "Science & Nature" and
 * "Wellness & Community" were subject categories wearing a format category's
 * clothing — every row in either one gets reassigned to a real FORMAT
 * category (from the trimmed artCategories list) plus one or more subject
 * TAGS (from artTopicTags) that capture what the old category used to imply.
 * The 4 stray rows still sitting in the older, already-deprecated
 * "Books & Talks" value (see scripts/split-books-talks-category.ts) are
 * swept up here too, since they never got a home.
 *
 * Every row below was read individually (name + summary) and hand-assigned —
 * not regex-guessed — so this map is the audit trail, same discipline as
 * scripts/split-books-talks-category.ts. Comments show the event name at the
 * time this was written for that same reason.
 *
 * Usage:
 *   npx tsx scripts/introduce-topic-tags.ts            # dry run (default)
 *   npx tsx scripts/introduce-topic-tags.ts --apply     # writes changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents, type ArtCategory, type ArtTopicTag } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

const SOURCE_CATEGORIES = ["Science & Nature", "Wellness & Community", "Books & Talks"] as const;

type Assignment = { category: ArtCategory; tags: ArtTopicTag[] };

const RECLASSIFY: Record<number, Assignment> = {
  // ── Books & Talks (legacy, orphaned) ──────────────────────────────────
  129: { category: "Parties & Social", tags: ["Film", "Literature & Writing"] }, // Project Hail Mary Movie Release Party
  155: { category: "Parties & Social", tags: ["Literature & Writing"] }, // Little Blue Pigeon Bookstore Grand Opening
  156: { category: "Parties & Social", tags: ["Literature & Writing"] }, // Little Blue Pigeon Bookstore Grand Opening (dup)
  653: { category: "Markets & Pop-Ups", tags: ["Literature & Writing"] }, // Books & Botanicals

  // ── Science & Nature ───────────────────────────────────────────────────
  2: { category: "Talks & Lectures", tags: ["Astronomy & Space", "Science"] }, // Astronomy on Tap Boulder
  6: { category: "Talks & Lectures", tags: ["Astronomy & Space", "Science"] }, // Colorado Skies: A Celestial Talk
  14: { category: "Tours & Outings", tags: ["Astronomy & Space", "Science"] }, // Open House (DU observatory)
  60: { category: "Talks & Lectures", tags: ["Science", "History"] }, // What Dinosaurs Mean to Us
  61: { category: "Film & Cinema", tags: ["Science", "Film"] }, // The Universe in A Grain of Sand
  62: { category: "Comedy & Storytelling", tags: ["Science"] }, // Volcano: A Science Comedy Show
  132: { category: "Talks & Lectures", tags: ["Science"] }, // TEDxCU: Dr. Aimee Bernard
  145: { category: "Talks & Lectures", tags: ["Science", "Film"] }, // Twisters: The Real Science Behind It
  147: { category: "Tours & Outings", tags: ["Astronomy & Space"] }, // Stargazing at Civic Park
  163: { category: "Talks & Lectures", tags: ["Astronomy & Space", "Science"] }, // Quantum & Space, the Next Frontier Symposium
  183: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Urban Foraging Walk
  197: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // CU Astronauts Night
  212: { category: "Workshops & Classes", tags: ["Science"] }, // The Egg Drop Challenge
  248: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Craft & Making"] }, // Foundations of Bonsai in Colorado
  262: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Science"] }, // Big Day of Bugs—Pollinators
  265: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors", "Kids & Family"] }, // Raptor Day at the Gardens
  268: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Science"] }, // Secret Lives of Moss
  298: { category: "Talks & Lectures", tags: ["Science"] }, // Small Microbes Big Stakes
  324: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // Who Will Lead the Next Giant Leap?
  326: { category: "Parties & Social", tags: ["Science", "Nature & Outdoors"] }, // Bugs and Brews: Insect Derby
  329: { category: "Talks & Lectures", tags: ["Science"] }, // Strange Life: Organoids × Fungal Systems
  337: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Craft & Making"] }, // Mushroom Cultivation Workshop
  338: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Craft & Making"] }, // Mushroom Cultivation Workshop (dup)
  355: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // 60 Minutes in Space
  357: { category: "Talks & Lectures", tags: ["Science"] }, // From Beetles To Bodies
  359: { category: "Talks & Lectures", tags: ["Science", "Nature & Outdoors"] }, // Digital Earth: Hurricanes
  370: { category: "Talks & Lectures", tags: ["Science"] }, // Harnessing the Microbiome for Women's Vitality
  391: { category: "Talks & Lectures", tags: ["Birding", "Science"] }, // What Bird Vocalizations Can Teach Us
  398: { category: "Parties & Social", tags: ["Nature & Outdoors"] }, // Adults Only Evening at Butterfly Pavilion
  407: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Breckenridge Wildflower Week
  415: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Spring Foraging: Plant ID Walk
  417: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Herbal First Aid Talk + Walk
  562: { category: "Tours & Outings", tags: ["Astronomy & Space"] }, // Nighttime at Historic Chamberlin Observatory
  563: { category: "Markets & Pop-Ups", tags: ["Science"] }, // Denver Mineral, Fossil and Gem Show
  567: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // 60 Minutes in Space (dup)
  572: { category: "Film & Cinema", tags: ["Science", "Nature & Outdoors"] }, // A Life Illuminated
  576: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // Behind the Scenes: Nancy Grace Roman Space Telescope
  591: { category: "Talks & Lectures", tags: ["Nature & Outdoors"] }, // Animal Trivia
  598: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Wildflower Festival
  614: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // Artemis II Crew at Red Rocks
  615: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] }, // Evening Bird Break: City Park
  616: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] }, // Evening Bird Break: City Park (dup)
  645: { category: "Tours & Outings", tags: ["Nature & Outdoors", "Science"] }, // Hiking with a Geologist at Red Rocks
  651: { category: "Talks & Lectures", tags: ["Astronomy & Space"] }, // Social Study: Who Gets To Go To Space?
  663: { category: "Talks & Lectures", tags: ["Science", "Food & Drink"] }, // Digesting the Evidence
  679: { category: "Tours & Outings", tags: ["Food & Drink"] }, // From Grain to Craft: Denver Field Trip
  709: { category: "Workshops & Classes", tags: ["Science", "Nature & Outdoors"] }, // Math in Bloom Presents Infinity Day
  712: { category: "Talks & Lectures", tags: ["Science", "Nature & Outdoors"] }, // Digital Earth
  720: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Sip & Stroll
  721: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Sip & Stroll (dup)
  722: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Sip & Stroll (dup)
  734: { category: "Tours & Outings", tags: ["Astronomy & Space"] }, // Perseids Meteor Shower Watch Party
  737: { category: "Talks & Lectures", tags: ["Science"] }, // Project Bridge Gong Show
  746: { category: "Talks & Lectures", tags: ["Nature & Outdoors", "Food & Drink"] }, // Free the Seed
  817: { category: "Talks & Lectures", tags: ["Science"] }, // BioFrontiers Lecture Series
  820: { category: "Tours & Outings", tags: ["Trains & Railways", "Nature & Outdoors"] }, // Leadville Railroad Fall Train Ride
  828: { category: "Talks & Lectures", tags: ["Science", "History"] }, // Colorado Scientific Society
  830: { category: "Parties & Social", tags: ["Science", "Horror & Spooky"] }, // Science Lounge: Spooky Halloween
  843: { category: "Talks & Lectures", tags: ["Science"] }, // Social Study
  910: { category: "Parties & Social", tags: ["Nature & Outdoors", "Food & Drink"] }, // Rainforest Dinner
  922: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Spiders After Dark
  923: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Spiders After Dark (dup)
  924: { category: "Parties & Social", tags: ["Nature & Outdoors", "Horror & Spooky"] }, // Bugs & Brews: Toxic Terrors
  925: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors", "Kids & Family"] }, // Flocktoberfest
  933: { category: "Tours & Outings", tags: ["Food & Drink", "Science"] }, // Ready Foods Plant Tour + Tasting + Food-Tech Discussion
  934: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] }, // Public Bird Banding
  938: { category: "Tours & Outings", tags: ["Trains & Railways", "Nature & Outdoors", "Photography"] }, // Georgetown Loop Railroad: Fall Train Rides
  940: { category: "Talks & Lectures", tags: ["Science", "History"] }, // Talk: The Secret Lives of Dinosaurs
  954: { category: "Talks & Lectures", tags: ["Birding", "Science"] }, // Lovebirds: Bird Hybridization
  955: { category: "Talks & Lectures", tags: ["Science", "Nature & Outdoors", "Wellness & Mindfulness"] }, // The Nature of Health: A Science + Art Symposium
  982: { category: "Tours & Outings", tags: ["Science", "Nature & Outdoors"] }, // Natural History Collections Tour
  988: { category: "Talks & Lectures", tags: ["Science"] }, // CU Innovation Day
  1002: { category: "Tours & Outings", tags: ["Architecture & Design", "History"] }, // Doors Open Denver
  1009: { category: "Tours & Outings", tags: ["Art & Visual Culture", "History"] }, // An Evening of Wonder: Office of Collecting and Design Fall Tour
  1022: { category: "Tours & Outings", tags: ["Culture & Heritage", "History"] }, // "Afroconstruct: Black Boulder" Bus Tour
  1023: { category: "Tours & Outings", tags: ["Culture & Heritage", "History"] }, // Japanese-American Farming, Past and Present Bus Tour
  1025: { category: "Tours & Outings", tags: ["Architecture & Design", "History", "Culture & Heritage"] }, // Adobe: Past, Present, Future Overnight Trek
  1036: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] }, // Fall Migration Bird Banding
  1037: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1038: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1039: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1040: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1041: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1042: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1043: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1044: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1045: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1046: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1047: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1048: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1049: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1050: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1051: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1052: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] },
  1053: { category: "Tours & Outings", tags: ["Birding", "Nature & Outdoors"] }, // Fall Migration Bird Banding (last dup)
  1093: { category: "Tours & Outings", tags: ["Nature & Outdoors"] }, // Behind the Web: Private Tarantula Experience

  // ── Wellness & Community ──────────────────────────────────────────────
  8: { category: "Parties & Social", tags: ["Fundraisers & Causes", "LGBTQ+"] }, // Abolish ICE, Have a Slice
  10: { category: "Parties & Social", tags: ["Kids & Family"] }, // Spring Fling & Egg Hunt
  102: { category: "Tours & Outings", tags: ["Literature & Writing"] }, // Audionauts: Roaming Audiobook Walk
  117: { category: "Parties & Social", tags: [] }, // The Adventures of Melat Kiros - Meet and Greet
  119: { category: "Workshops & Classes", tags: ["Craft & Making", "Fundraisers & Causes"] }, // ICE Alert Whistle Prep & Zine Folding Party
  121: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness"] }, // Sip & Sculpt: Pilates + Wine
  130: { category: "Parties & Social", tags: [] }, // Girl Talk Social
  158: { category: "Parties & Social", tags: [] }, // Creative Co-Work
  189: { category: "Workshops & Classes", tags: ["Fundraisers & Causes"] }, // Spring Cleanup on 13th
  209: { category: "Parties & Social", tags: [] }, // Larimer St Block Party
  213: { category: "Games", tags: [] }, // Puzzling Night
  231: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Art & Visual Culture"] }, // Flexi-Verse: Elemental Journey
  232: { category: "Parties & Social", tags: ["Fundraisers & Causes", "Nature & Outdoors"] }, // Hope Blooms
  244: { category: "Talks & Lectures", tags: ["Fundraisers & Causes"] }, // Community Thread: Panel & Donation Event
  249: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Music"] }, // Violins, Vino and Vinyasa Yoga
  288: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness"] }, // Spring Senses: The Q2 Reset
  296: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Fundraisers & Causes"] }, // Earth Day Volunteer with Denver Parks
  299: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Music"] }, // 2000s Emo Yoga
  317: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Pets & Animals"] }, // Mindfulness with Cats
  346: { category: "Parties & Social", tags: ["Fundraisers & Causes", "Craft & Making"] }, // Sunday Sundae
  365: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness"] }, // Full Moon Sound Meditation with Meghan
  381: { category: "Parties & Social", tags: [] }, // Creatives Club Coffee Meetup
  384: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Music"] }, // 3 Week Rhythmic Mindfulness
  428: { category: "Parties & Social", tags: ["Culture & Heritage", "History"] }, // Colorado Day at Denver Union Station
  433: { category: "Parties & Social", tags: ["Nature & Outdoors"] }, // Plant Bingo
  535: { category: "Parties & Social", tags: ["Wellness & Mindfulness"] }, // Larimer Square Run Club
  536: { category: "Parties & Social", tags: ["Wellness & Mindfulness"] }, // Larimer Square Run Club (dup)
  559: { category: "Parties & Social", tags: ["Wellness & Mindfulness", "Music"] }, // Community Yoga & Social
  600: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness", "Fundraisers & Causes"] }, // Strength in the City Festival
  602: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness"] }, // Pilates on the Patio
  612: { category: "Parties & Social", tags: [] }, // Let's Play Hooky! Beach Day
  629: { category: "Parties & Social", tags: ["Culture & Heritage"] }, // Dragon Boat Festival at Sloan's Lake
  668: { category: "Parties & Social", tags: ["Wellness & Mindfulness"] }, // Free Tarot Reading with Sammi
  774: { category: "Workshops & Classes", tags: ["Fundraisers & Causes"] }, // Colfax Ave Clean-Up
  777: { category: "Workshops & Classes", tags: ["Wellness & Mindfulness"] }, // Terrace Vinyasa x CorePower Yoga
  792: { category: "Parties & Social", tags: ["Music", "Literature & Writing"] }, // Soundtrack of Our Lives: A Listening Gathering in the Park
  808: { category: "Parties & Social", tags: ["Nature & Outdoors"] }, // Plant Bingo (dup)
  812: { category: "Parties & Social", tags: ["Wellness & Mindfulness"] }, // Day Camp Wellness
  823: { category: "Parties & Social", tags: ["Pets & Animals"] }, // Dog Day at the Aquarium
  863: { category: "Workshops & Classes", tags: ["Nature & Outdoors", "Fundraisers & Causes"] }, // Love 5280 Creek Sweep Fridays
  911: { category: "Parties & Social", tags: ["Pets & Animals"] }, // Dachshund Dash
  915: { category: "Parties & Social", tags: ["Culture & Heritage"] }, // Arvada Pow Wow
  951: { category: "Workshops & Classes", tags: ["Science", "Nature & Outdoors", "Fundraisers & Causes"] }, // Volunteer Day at Jack's Solar Garden
  971: { category: "Parties & Social", tags: ["Horror & Spooky"] }, // Broadway Halloween Parade
  976: { category: "Parties & Social", tags: ["Fundraisers & Causes"] }, // Secret Garden Fundraiser
  1004: { category: "Parties & Social", tags: ["Nature & Outdoors", "Music"] }, // Labor Day Lift Off Hot Air Balloon Festival
  1010: { category: "Galleries & Exhibitions", tags: ["Art & Visual Culture", "LGBTQ+", "Music"] }, // STILL Museum Community Celebration & SCFD Free Day
};

async function run() {
  const rows = await db.select().from(artEvents);
  const byId = new Map(rows.map(r => [r.id, r]));
  const relevant = rows.filter(r => (SOURCE_CATEGORIES as readonly string[]).includes(r.category));

  let applied = 0, skippedWrongCategory = 0, missing = 0;

  for (const [idStr, assignment] of Object.entries(RECLASSIFY)) {
    const id = Number(idStr);
    const row = byId.get(id);
    if (!row) {
      missing++;
      console.log(`  [MISSING] #${id} — no longer in the DB, skipped`);
      continue;
    }
    if (!(SOURCE_CATEGORIES as readonly string[]).includes(row.category)) {
      skippedWrongCategory++;
      console.log(`  [SKIP] #${id} "${row.name}" — category is now "${row.category}" (changed since this script was written), skipped`);
      continue;
    }
    applied++;
    console.log(`  [${APPLY ? "apply" : "would apply"}] #${id} "${row.name}": "${row.category}" -> "${assignment.category}" + tags [${assignment.tags.join(", ")}]`);
    if (APPLY) {
      await db.update(artEvents)
        .set({ category: assignment.category, tags: assignment.tags })
        .where(eq(artEvents.id, id));
    }
  }

  const unassigned = relevant.filter(r => !(r.id in RECLASSIFY));
  if (unassigned.length > 0) {
    console.log(`\n[UNASSIGNED] ${unassigned.length} row(s) still in a deprecated category have no entry in this script's map — needs a human decision, left untouched:`);
    for (const r of unassigned) console.log(`  #${r.id} "${r.name}" (${r.category})`);
  }

  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${applied}. Wrong category (changed since written): ${skippedWrongCategory}. Missing: ${missing}. Unassigned: ${unassigned.length}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
