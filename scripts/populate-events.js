// Script to populate the database with events from the CSV file
import fs from 'fs';
import pg from 'pg';
import Papa from 'papaparse';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Read the CSV file
const csvFile = fs.readFileSync('./attached_assets/april_events_bulletin_extended.csv', 'utf8');

// Parse the CSV file
const results = Papa.parse(csvFile, {
  header: false,
  skipEmptyLines: true,
});

// Function to insert event into the database
async function insertEvent(event) {
  const [artist, venue, date, emoji, summary, soundsLike, genre] = event;
  
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
    
    const values = [artist, venue, date, emoji, summary, soundsLike, genre, createdAt];
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
      console.log(`Inserted event: ${artist} @ ${venue}`);
      return true;
    } else {
      console.log(`Skipped duplicate event: ${artist} @ ${venue}`);
      return false;
    }
  } catch (error) {
    console.error(`Error inserting event: ${artist} @ ${venue}`);
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
    let inserted = 0;
    let skipped = 0;
    
    for (const event of results.data) {
      const success = await insertEvent(event);
      if (success) {
        inserted++;
      } else {
        skipped++;
      }
    }
    
    console.log(`Database population complete.`);
    console.log(`Inserted: ${inserted} events`);
    console.log(`Skipped: ${skipped} events`);
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