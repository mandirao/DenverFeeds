// Script to populate the database with August and September events
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
  './attached_assets/august_events_bulletin.csv',
  './attached_assets/september_events_bulletin.csv'
];

// Function to read and parse CSV content
function readAndParseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const results = Papa.parse(csvContent, {
    header: false, // These files don't have headers
    skipEmptyLines: true,
  });
  
  // Map the raw data to the event structure
  return results.data.map(row => {
    if (row.length < 6) return {}; // Skip rows with too few columns
    
    return {
      artist: row[0],
      venue: row[1],
      date: row[2],
      emoji: row[3],
      summary: row[4],
      sounds_like: row[5],
      genre: row[6]
    };
  }).filter(event => event.artist && event.venue && event.date); // Filter out incomplete rows
}

// Function to insert event into the database
async function insertEvent(event) {
  // Extract event data
  const artist = event.artist;
  const venue = event.venue;
  const date = event.date;
  const emoji = event.emoji;
  // Trim summary to 75 characters to fit database field constraint
  const summary = event.summary ? event.summary.substring(0, 75) : '';
  const soundsLike = event.sounds_like;
  const genre = event.genre;
  
  if (!artist || !venue || !date) {
    console.log(`Skipping incomplete event data: ${artist || 'Unknown artist'}`);
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
    console.log('Starting August and September database population...');
    
    // Process each CSV file
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (const csvFile of csvFiles) {
      try {
        console.log(`Processing file: ${csvFile}`);
        const events = readAndParseCsv(csvFile);
        
        let fileInserted = 0;
        let fileSkipped = 0;
        
        for (const event of events) {
          const success = await insertEvent(event);
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
    
    console.log(`August and September events database population complete.`);
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