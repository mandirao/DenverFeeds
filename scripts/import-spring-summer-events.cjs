// Script to import Spring/Summer 2025 events with better date validation
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
const csvFile = './attached_assets/updated_indie_meetup_events_spring_summer_2025.csv';

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
    // Handle quotes in fields properly
    quoteChar: '"',
    escapeChar: '"',
  });
  
  console.log("Parsed CSV headers:", results.meta.fields);
  console.log("First row sample:", results.data[0]);
  
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
        const missing = [];
        if (!row.artist) missing.push('artist');
        if (!row.venue) missing.push('venue');
        if (!row.date) missing.push('date');
        if (!row.emoji) missing.push('emoji');
        if (!row.summary) missing.push('summary');
        if (!row.genre) missing.push('genre');
        
        errors.push(`Row ${index + 2}: Missing required fields: ${missing.join(', ')}`);
        return;
      }
      
      // Enhanced date validation and parsing
      let parsedDate;
      try {
        // Debug the date format
        console.log(`Parsing date from row ${index + 2}: "${row.date}"`);
        
        // Check for common date format issues
        const dateStr = row.date.trim();
        
        // Regex to validate YYYY-MM-DD format
        const dateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
        const match = dateStr.match(dateRegex);
        
        if (!match) {
          throw new Error(`Invalid date format: "${dateStr}" - must be YYYY-MM-DD`);
        }
        
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        
        // Validate year, month, day ranges
        if (year < 2024 || year > 2026) {
          throw new Error(`Invalid year: ${year} - must be between 2024 and 2026`);
        }
        
        if (month < 1 || month > 12) {
          throw new Error(`Invalid month: ${month} - must be between 1 and 12`);
        }
        
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day < 1 || day > daysInMonth) {
          throw new Error(`Invalid day: ${day} - must be between 1 and ${daysInMonth} for month ${month}`);
        }
        
        // Create date in local timezone at midnight
        parsedDate = new Date(year, month - 1, day, 0, 0, 0);
        console.log(`Parsed date: ${parsedDate.toISOString()}`);
      } catch (error) {
        console.error(`Date error in row ${index + 2}:`, error.message);
        errors.push(`Row ${index + 2}: Invalid date format: ${row.date} - ${error.message}`);
        return;
      }
      
      // Check if genre is valid or normalize it
      let normalizedGenre = row.genre.trim();
      
      // If not already valid, try to normalize
      if (!validGenres.includes(normalizedGenre)) {
        // Debug - show the unexpected genre
        console.log(`Non-standard genre in row ${index + 2}: "${normalizedGenre}"`);
        
        // Try to find a match by normalizing format
        const normalizedGenres = validGenres.map(g => g.replace(/,/g, '/'));
        const indexBySlash = normalizedGenres.findIndex(g => 
          g.toLowerCase() === normalizedGenre.replace(/,/g, '/').toLowerCase()
        );
        
        if (indexBySlash !== -1) {
          normalizedGenre = validGenres[indexBySlash]; // Use the canonical format
          console.log(`  Normalized to: "${normalizedGenre}"`);
        } else {
          // Try a more aggressive normalization - strip spaces around commas
          const strippedGenres = validGenres.map(g => g.replace(/\s*,\s*/g, ','));
          const indexByStripped = strippedGenres.findIndex(g => 
            g.toLowerCase().replace(/\s*,\s*/g, ',') === 
            normalizedGenre.toLowerCase().replace(/\s*,\s*/g, ',')
          );
          
          if (indexByStripped !== -1) {
            normalizedGenre = validGenres[indexByStripped];
            console.log(`  Normalized to: "${normalizedGenre}"`);
          } else {
            errors.push(`Row ${index + 2}: Invalid genre: "${normalizedGenre}" - must be one of: ${validGenres.join(', ')}`);
            return;
          }
        }
      }
      
      // Create the event object with all fields properly trimmed
      const event = {
        artist: row.artist.trim(),
        venue: row.venue.trim(),
        date: parsedDate,
        emoji: row.emoji.trim(),
        summary: row.summary.trim(),
        soundsLike: (row.sounds_like || "").trim(),
        genre: normalizedGenre
      };
      
      cleanedEvents.push(event);
      seenEvents.add(eventKey);
    } catch (error) {
      console.error(`Unexpected error in row ${index + 2}:`, error);
      errors.push(`Row ${index + 2}: Unexpected error - ${error.message}`);
    }
  });
  
  return { cleanedEvents, errors };
}

// Function to insert event into the database
async function insertEvent(event) {
  try {
    // First check if the event already exists
    const checkQuery = `
      SELECT id FROM events 
      WHERE artist = $1 AND venue = $2 AND date = $3
    `;
    
    const checkResult = await pool.query(checkQuery, [event.artist, event.venue, event.date]);
    
    if (checkResult.rows.length > 0) {
      console.log(`Skipped duplicate event: ${event.artist} @ ${event.venue}`);
      return false;
    }
    
    // Insert the event if it doesn't exist
    const insertQuery = `
      INSERT INTO events (artist, venue, date, emoji, summary, sounds_like, genre, is_scheduled, upvotes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, 0, $8)
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
    
    const result = await pool.query(insertQuery, values);
    
    if (result.rows.length > 0) {
      console.log(`Inserted event: ${event.artist} @ ${event.venue}`);
      return true;
    } else {
      console.log(`Failed to insert event: ${event.artist} @ ${event.venue}`);
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
    console.log('Starting import of Spring/Summer 2025 events...');
    
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