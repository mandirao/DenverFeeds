// Script to populate the database with events from multiple CSV files
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

// Define the paths to the CSV files
const csvFiles = [
  './attached_assets/april_events_bulletin_extended.csv',
  './attached_assets/may_events_bulletin_extended.csv',
  './attached_assets/june_events_bulletin_extended.csv',
  './attached_assets/july_events_bulletin_extended.csv',
  './attached_assets/august_events_bulletin.csv',
  './attached_assets/september_events_bulletin.csv'
];

// Function to read and parse CSV content
function readAndParseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, 'utf8');
  
  // Check if the first line has headers by checking for "artist" field
  const hasHeader = csvContent.trim().toLowerCase().startsWith('artist,') || 
                    csvContent.trim().toLowerCase().startsWith('"artist",');
  
  const results = Papa.parse(csvContent, {
    header: hasHeader,
    skipEmptyLines: true,
  });
  
  return {
    data: results.data,
    hasHeader
  };
}

// Function to insert event into the database
async function insertEvent(event, hasHeader) {
  let artist, venue, date, emoji, summary, soundsLike, genre;
  
  if (hasHeader) {
    // For CSVs with headers
    artist = event.artist;
    venue = event.venue;
    date = event.date;
    emoji = event.emoji;
    summary = event.summary;
    soundsLike = event.sounds_like;
    genre = event.genre;
  } else {
    // For CSVs without headers
    [artist, venue, date, emoji, summary, soundsLike, genre] = event;
  }
  
  if (!artist || !venue || !date) {
    console.log(`Skipping incomplete event data: ${artist || 'Unknown artist'}`);
    return false;
  }
  
  // Parse and format the date to ensure it's stored correctly
  // Always store date in UTC at 00:00 to ensure consistent display
  try {
    // First, handle the basic date parsing regardless of format
    let eventDate = new Date(date);
    
    // Store all events with UTC midnight time to ensure consistent date display
    // regardless of browser timezone
    const year = eventDate.getFullYear();
    const month = eventDate.getMonth();
    const day = eventDate.getDate();
    
    // Create date at 00:00:00 UTC for consistent date comparison/grouping
    const formattedDate = new Date(Date.UTC(year, month, day));
    
    // Convert to ISO format for database
    date = formattedDate.toISOString();
    
    console.log(`Processed date: Original "${date}" -> UTC midnight: ${formattedDate.toISOString()}`);
  } catch (error) {
    console.error(`Error parsing date '${date}' for ${artist} @ ${venue}:`, error);
    return false;
  }
  
  // Set createdAt to 30 days ago to avoid "new" tag
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - 30);
  
  try {
    const query = `
      INSERT INTO events (artist, venue, date, emoji, summary, sounds_like, genre, is_scheduled, upvotes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, 0, $8)
      ON CONFLICT (artist, venue, date) DO NOTHING
      RETURNING id;
    `;
    
    const values = [artist, venue, date, emoji ? emoji.charAt(0) : null, summary, soundsLike, genre, createdAt];
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
      console.log(`Inserted event: ${artist} @ ${venue} on ${date}`);
      return true;
    } else {
      console.log(`Skipped duplicate event: ${artist} @ ${venue} on ${date}`);
      return false;
    }
  } catch (error) {
    console.error(`Error inserting event: ${artist} @ ${venue}`);
    console.error(error);
    return false;
  }
}

// Function to delete the test entry
async function deleteTestEntry() {
  try {
    const query = `
      DELETE FROM events 
      WHERE artist = 'Test Artist' 
      AND venue = 'Test Venue'
    `;
    
    const result = await pool.query(query);
    
    if (result.rowCount > 0) {
      console.log(`Deleted test entry: Test Artist @ Test Venue`);
      return true;
    } else {
      console.log(`No test entry found to delete`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting test entry`);
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
    
    console.log('Starting database population...');
    
    // Delete test entry first
    await deleteTestEntry();
    
    // Process each CSV file
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (const csvFile of csvFiles) {
      try {
        console.log(`Processing file: ${csvFile}`);
        const { data: events, hasHeader } = readAndParseCsv(csvFile);
        
        let fileInserted = 0;
        let fileSkipped = 0;
        
        for (const event of events) {
          const success = await insertEvent(event, hasHeader);
          if (success) {
            fileInserted++;
            totalInserted++;
          } else {
            fileSkipped++;
            totalSkipped++;
          }
        }
        
        console.log(`File ${csvFile} complete: ${fileInserted} inserted, ${fileSkipped} skipped`);
      } catch (error) {
        console.error(`Error processing file ${csvFile}:`);
        console.error(error);
      }
    }
    
    console.log(`Database population complete.`);
    console.log(`Total Inserted: ${totalInserted} events`);
    console.log(`Total Skipped: ${totalSkipped} events`);
  } catch (error) {
    console.error('Error populating database:');
    console.error(error);
  } finally {
    // Close the connection pool
    await pool.end();
  }
}

// Run the main function
populateDatabase();