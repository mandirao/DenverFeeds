// Script to import March/April events with genre mapping and validation
const fs = require('fs');
const pg = require('pg');
const Papa = require('papaparse');
const dotenv = require('dotenv');
const { z } = require('zod');

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Path to the CSV file
const csvFile = './attached_assets/full_march_april_2025_indie_meetup_events.csv';

// Define the expected genres from our database schema
const validGenres = [
  'Rock & Alternative',
  'Folk, Country & Americana',
  'Pop & Indie Pop',
  'Electronic & Experimental',
  'Funk, Soul & Jazz',
  'Classical & Orchestral'
];

// Create validation schema for event data
const eventSchema = z.object({
  artist: z.string().min(1).max(75),
  venue: z.string().min(1).max(75),
  date: z.date(),
  emoji: z.string().min(1),
  summary: z.string().min(1).max(75),
  soundsLike: z.string().max(75),
  genre: z.enum(validGenres)
});

// Function to parse a date string in YYYY-MM-DD format
function parseDate(dateString) {
  try {
    // Check if the string is in YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(dateString)) {
      throw new Error(`Invalid date format: ${dateString}`);
    }
    
    const [year, month, day] = dateString.split('-').map(Number);
    
    // Validate month and day
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}`);
    }
    
    if (day < 1 || day > 31) {
      throw new Error(`Invalid day: ${day}`);
    }
    
    // Create a date object (using local timezone at midnight)
    return new Date(year, month - 1, day, 0, 0, 0);
  } catch (error) {
    throw new Error(`Failed to parse date "${dateString}": ${error.message}`);
  }
}

// Function to read and parse CSV content
function readAndParseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  
  // Clean up and validate each entry
  const validatedEvents = [];
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
        parsedDate = parseDate(row.date);
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error.message}`);
        return;
      }
      
      // Create the event object
      const event = {
        artist: row.artist.trim(),
        venue: row.venue.trim(),
        date: parsedDate,
        emoji: row.emoji.trim(),
        summary: row.summary.trim(),
        soundsLike: row.sounds_like ? row.sounds_like.trim() : '',
        genre: row.genre.trim()
      };
      
      // Validate through schema
      try {
        eventSchema.parse(event);
        validatedEvents.push(event);
        seenEvents.add(eventKey);
      } catch (zodError) {
        errors.push(`Row ${index + 2}: ${zodError.errors[0].message} (${zodError.errors[0].path})`);
      }
    } catch (error) {
      errors.push(`Row ${index + 2}: Unexpected error - ${error.message}`);
    }
  });
  
  return { validatedEvents, errors };
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
    
    console.log('Starting import of March/April events...');
    
    const { validatedEvents, errors } = readAndParseCsv(csvFile);
    
    console.log(`\nValidation complete:`);
    console.log(`- Valid events: ${validatedEvents.length}`);
    console.log(`- Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors found:');
      errors.forEach(error => console.log(` - ${error}`));
    }
    
    if (validatedEvents.length === 0) {
      console.log('No valid events to import. Please check the CSV file and try again.');
      return;
    }
    
    console.log(`\nStarting import of ${validatedEvents.length} validated events...`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const event of validatedEvents) {
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