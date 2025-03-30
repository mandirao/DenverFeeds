// Script to import May events with duplicate detection and proper genre handling
const fs = require('fs');
const pg = require('pg');
const Papa = require('papaparse');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Path to the CSV file
const csvFile = './attached_assets/full_may_2025_indie_meetup_events.csv';

// Define the valid genres in our database
const validGenres = [
  'Rock & Alternative',
  'Folk, Country & Americana',
  'Pop & Indie Pop',
  'Electronic & Experimental',
  'Funk, Soul & Jazz',
  'Classical & Orchestral'
];

// Function to read and parse CSV content
function readAndParseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  
  // Clean up and validate each entry
  const cleanedEvents = [];
  const errors = [];
  
  // Track duplicates
  const seenEvents = new Set();
  
  results.data.forEach((row, index) => {
    try {
      // Skip completely empty rows
      if (!row.artist && !row.venue && !row.date) {
        return;
      }
      
      // Create a unique key for this event to detect duplicates
      const eventKey = `${row.artist}|${row.venue}|${row.date}`;
      if (seenEvents.has(eventKey)) {
        errors.push(`Row ${index + 2}: Duplicate event (${row.artist} at ${row.venue})`);
        return;
      }
      
      // Validate required fields
      if (!row.artist || !row.venue || !row.date || !row.emoji || !row.summary || !row.genre) {
        errors.push(`Row ${index + 2}: Missing required fields`);
        return;
      }
      
      // Parse date
      let parsedDate;
      try {
        const [year, month, day] = row.date.split('-').map(Number);
        
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          throw new Error(`Invalid date: ${row.date}`);
        }
        
        // Create date in local timezone at midnight
        parsedDate = new Date(year, month - 1, day, 0, 0, 0);
      } catch (error) {
        errors.push(`Row ${index + 2}: Invalid date format: ${row.date}`);
        return;
      }
      
      // Check if genre is valid or normalize it
      let normalizedGenre = row.genre.trim();
      
      // If not already valid, try to normalize
      if (!validGenres.includes(normalizedGenre)) {
        // Log the invalid genre for debugging
        console.log(`Invalid genre: "${normalizedGenre}"`);
      }
      
      // Create the event object
      const event = {
        artist: row.artist.trim(),
        venue: row.venue.trim(),
        date: parsedDate,
        emoji: row.emoji.trim(),
        summary: row.summary.trim(),
        soundsLike: row.sounds_like?.trim() || '',
        genre: normalizedGenre
      };
      
      cleanedEvents.push(event);
      seenEvents.add(eventKey);
    } catch (error) {
      errors.push(`Row ${index + 2}: Unexpected error - ${error.message}`);
    }
  });
  
  return { cleanedEvents, errors };
}

// Function to insert event into the database
async function insertEvent(event) {
  try {
    const query = `
      INSERT INTO events (artist, venue, date, emoji, summary, sounds_like, genre, is_scheduled, upvotes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, 0, $8)
      ON CONFLICT (artist, venue, date) DO NOTHING
      RETURNING id;
    `;
    
    // Set createdAt to current time
    const createdAt = new Date();
    
    const values = [
      event.artist, 
      event.venue, 
      event.date, 
      event.emoji, 
      event.summary, 
      event.soundsLike, 
      event.genre, 
      createdAt
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
      console.log(`Inserted event: ${event.artist} @ ${event.venue}`);
      return true;
    } else {
      console.log(`Skipped duplicate event: ${event.artist} @ ${event.venue}`);
      return false;
    }
  } catch (error) {
    console.error(`Error inserting event: ${event.artist} @ ${event.venue}`);
    console.error(error);
    return false;
  }
}

// Main function to populate the database
async function populateDatabase() {
  try {
    // Add constraint for unique artist, venue, date if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'events_artist_venue_date_key'
        ) THEN
          ALTER TABLE events 
          ADD CONSTRAINT events_artist_venue_date_key 
          UNIQUE (artist, venue, date);
        END IF;
      END $$;
    `);
    
    console.log('Starting import of May events...');
    
    const { cleanedEvents, errors } = readAndParseCsv(csvFile);
    
    console.log(`\nValidation complete:`);
    console.log(`- Valid events: ${cleanedEvents.length}`);
    console.log(`- Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors found:');
      errors.forEach(error => console.log(` - ${error}`));
    }
    
    if (cleanedEvents.length === 0) {
      console.log('No valid events to import. Please check the CSV file and try again.');
      return;
    }
    
    console.log(`\nStarting import of ${cleanedEvents.length} validated events...`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const event of cleanedEvents) {
      const success = await insertEvent(event);
      if (success) {
        inserted++;
      } else {
        skipped++;
      }
    }
    
    console.log(`\nImport complete:`);
    console.log(`- Inserted: ${inserted} events`);
    console.log(`- Skipped: ${skipped} events`);
    
  } catch (error) {
    console.error('Error during import:');
    console.error(error);
  } finally {
    // Close the connection pool
    await pool.end();
  }
}

// Run the main function
populateDatabase().catch(error => {
  console.error('Unhandled error during database population:');
  console.error(error);
  process.exit(1);
});