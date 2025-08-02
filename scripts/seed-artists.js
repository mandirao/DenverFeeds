#!/usr/bin/env node

// Seed script to populate artist database with existing artists from events
import { db } from '../server/db.ts';
import { events, artists } from '../shared/schema.ts';
import { sql } from 'drizzle-orm';

async function seedArtistsFromEvents() {
  console.log('🎵 Starting artist database seeding from existing events...');

  try {
    // Get all unique artists from existing events
    const uniqueArtists = await db
      .selectDistinct({ 
        artist: events.artist,
        genre: events.genre 
      })
      .from(events)
      .where(sql`${events.artist} IS NOT NULL AND ${events.artist} != ''`);

    console.log(`Found ${uniqueArtists.length} unique artists in events table`);

    let addedCount = 0;
    let skippedCount = 0;

    for (const { artist, genre } of uniqueArtists) {
      try {
        // Check if artist already exists
        const existingArtist = await db
          .select()
          .from(artists)
          .where(sql`${artists.name} = ${artist}`)
          .limit(1);

        if (existingArtist.length > 0) {
          skippedCount++;
          continue;
        }

        // Add new artist to database
        await db.insert(artists).values({
          name: artist,
          genre: genre || null,
          source: 'existing',
          searchPriority: 'medium',
          isActive: true,
          notes: `Imported from existing events on ${new Date().toISOString().split('T')[0]}`
        });

        addedCount++;
        console.log(`✓ Added: ${artist} (${genre || 'No genre'})`);

      } catch (error) {
        console.error(`✗ Failed to add ${artist}:`, error.message);
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   Added: ${addedCount} new artists`);
    console.log(`   Skipped: ${skippedCount} existing artists`);
    console.log(`   Total artists in database: ${addedCount + skippedCount}`);

  } catch (error) {
    console.error('❌ Error seeding artists:', error);
    process.exit(1);
  }
}

// Run the seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedArtistsFromEvents()
    .then(() => {
      console.log('✅ Artist seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Artist seeding failed:', error);
      process.exit(1);
    });
}

export { seedArtistsFromEvents };