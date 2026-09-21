/**
 * One-time bulk backfill: assigns topic tags (artTopicTags — the subject
 * axis introduced alongside the category/tags IA split, see
 * scripts/introduce-topic-tags.ts) to every art_events row that doesn't have
 * any yet. Unlike introduce-topic-tags.ts (which also had to pick a new
 * FORMAT category for ~147 rows, so was hand-classified line by line), this
 * batch is purely additive tagging on rows whose category is already
 * correct — high enough volume (800+) that an AI pass, not a hand-audited
 * map, is the right tool. Batched (30 events/request) and rate-limited
 * (5 concurrent requests) rather than one call per event.
 *
 * Usage:
 *   npx tsx scripts/backfill-topic-tags.ts            # dry run (default)
 *   npx tsx scripts/backfill-topic-tags.ts --apply     # writes changes
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { artEvents, artTopicTags, type ArtTopicTag } from "@shared/schema";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 30;
const CONCURRENCY = 5;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set.");
  process.exit(1);
}
const client = new Anthropic({ apiKey });

type Row = { id: number; name: string; summary: string; category: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyBatch(rows: Row[]): Promise<Map<number, ArtTopicTag[]>> {
  const list = rows.map(r => `${r.id}: "${r.name}" — ${r.summary} [category: ${r.category}]`).join("\n");
  const prompt = `You are tagging Denver/Boulder cultural events with SUBJECT/TOPIC tags for Artistry & Nerdery Live, a cultural event newsletter. Each event already has a correct FORMAT category (Talks & Lectures, Workshops & Classes, etc.) — do not change that. Your only job is to pick which topic tags apply, if any.

Allowed tags (pick only from this exact list, case-sensitive): ${artTopicTags.join(", ")}

For each event, pick every tag that genuinely applies (usually 0-3 — most events get 0-2, don't force it). Examples: a talk about Saturn gets ["Astronomy & Space", "Science"]; a figure drawing class gets ["Art & Visual Culture"]; a meditation mixer gets ["Wellness & Mindfulness"]; a general concert with no distinctive subject gets [] (Music & Performance as a category already captures "it's a concert" — only add a tag if there's a more specific subject, e.g. a jazz history talk-concert would get ["Music", "History"]). Never invent a tag outside the list.

Two rules to avoid false positives:
- Tag the event's actual SUBJECT, never an incidental amenity mentioned in passing — "dogs welcome" or "pets welcome" as a footnote about the venue does NOT make something Pets & Animals; only tag Pets & Animals when the event is substantively about pets/animals (a dog meetup, a cat cafe hour, an animal encounter).
- "Pets & Animals" means domesticated/companion animals specifically. Wildlife, conservation, or field biology (cheetahs, birds in the wild, insects, marine life) should get "Nature & Outdoors" and/or "Science" instead, not "Pets & Animals".

Events:
${list}

Return ONLY a valid JSON array (no markdown, no commentary), one entry per event, in this exact shape:
[{"id": 123, "tags": ["Science", "Film"]}, {"id": 124, "tags": []}]`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content[0].type === "text" ? message.content[0].text : "[]";
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const parsed: { id: number; tags: string[] }[] = JSON.parse(cleaned);

  const result = new Map<number, ArtTopicTag[]>();
  for (const entry of parsed) {
    if (typeof entry.id !== "number" || !Array.isArray(entry.tags)) continue;
    const validTags = entry.tags.filter((t): t is ArtTopicTag => (artTopicTags as readonly string[]).includes(t));
    result.set(entry.id, validTags);
  }
  return result;
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function run() {
  const rows = (await db.select({ id: artEvents.id, name: artEvents.name, summary: artEvents.summary, category: artEvents.category, tags: artEvents.tags })
    .from(artEvents)) as (Row & { tags: string[] })[];
  const untagged = rows.filter(r => (r.tags?.length ?? 0) === 0);

  console.log(`${untagged.length} events with no tags yet. Batching into groups of ${BATCH_SIZE}, ${CONCURRENCY} concurrent requests.\n`);

  const batches = chunk(untagged, BATCH_SIZE);
  let applied = 0, batchErrors = 0;

  await runWithConcurrency(batches, CONCURRENCY, async (batch, i) => {
    try {
      const result = await classifyBatch(batch);
      for (const row of batch) {
        const tags = result.get(row.id) ?? [];
        if (tags.length === 0) continue;
        console.log(`  [${APPLY ? "apply" : "would apply"}] #${row.id} "${row.name}" -> [${tags.join(", ")}]`);
        applied++;
        if (APPLY) {
          await db.update(artEvents).set({ tags }).where(eq(artEvents.id, row.id));
        }
      }
      console.log(`Batch ${i + 1}/${batches.length} done.`);
    } catch (err) {
      batchErrors++;
      console.error(`Batch ${i + 1}/${batches.length} FAILED:`, (err as Error).message);
    }
  });

  console.log(`\n${APPLY ? "Applied" : "Would apply"} tags to ${applied} events. Failed batches: ${batchErrors}.`);
  if (!APPLY) console.log("Dry run — re-run with --apply to write changes.");
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
