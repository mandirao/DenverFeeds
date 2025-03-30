// Script to import all CSV files in one go
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { Pool } = require('pg');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Path to CSV files
const csvDirectory = path.join(__dirname, '../attached_assets');

// List of CSV files to import
const csvFiles = [
  'april_events_bulletin_extended.csv',
  'may_events_bulletin_extended.csv',
  'june_events_bulletin_extended.csv',
  'july_events_bulletin_extended.csv',
  'august_events_bulletin.csv',
  'september_events_bulletin.csv',
  'followed_artists_may2025.csv',
];

// Map headers to event fields
const headerMap = {
  artist: 'artist',
  venue: 'venue',
  date: 'date',
  emoji: 'emoji',
  summary: 'summary',
  sounds_like: 'soundsLike',
  genre: 'genre',
  'sounds like': 'soundsLike', // Alternative format
};

async function insertEvent(event) {
  try {
    // Fix date parsing: always use local noon time to avoid timezone issues
    let dateString = event.date;
    if (dateString && typeof dateString === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.error(`Invalid date format: ${dateString}`);
        return false;
      }
      
      // Parse the date string, extract year, month, day
      const [year, month, day] = dateString.split('-').map(Number);
      
      // Create date with noon time to avoid timezone issues
      event.date = new Date(year, month - 1, day, 12, 0, 0);
      
      if (isNaN(event.date.getTime())) {
        console.error(`Invalid date values: ${dateString}`);
        return false;
      }
    }

    // Ensure emoji is only first character
    if (event.emoji && event.emoji.length > 0) {
      event.emoji = event.emoji.charAt(0);
    }

    // Check for duplicate
    const checkQuery = `
      SELECT EXISTS (
        SELECT 1 FROM events 
        WHERE artist = $1 AND venue = $2 AND DATE(date) = DATE($3)
      )
    `;
    const checkResult = await pool.query(checkQuery, [
      event.artist, 
      event.venue, 
      event.date
    ]);
    
    if (checkResult.rows[0].exists) {
      console.log(`Skipping duplicate: ${event.artist} at ${event.venue} on ${event.date}`);
      return false;
    }

    // Insert event
    const insertQuery = `
      INSERT INTO events (
        emoji, artist, venue, date, summary, sounds_like, genre, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;
    
    const result = await pool.query(insertQuery, [
      event.emoji, 
      event.artist, 
      event.venue, 
      event.date, 
      event.summary, 
      event.soundsLike, 
      event.genre
    ]);
    
    console.log(`Inserted event ID: ${result.rows[0].id}`);
    return true;
  } catch (error) {
    console.error('Error inserting event:', error);
    return false;
  }
}

async function processCSV(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`Processing ${filePath}...`);
    
    // Read file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

async function mapData(data) {
  // Map fields to correct names based on the header map
  return data.map(row => {
    const mappedRow = {};
    
    // Apply header mapping
    Object.keys(row).forEach(header => {
      const normalizedHeader = header.trim().toLowerCase();
      if (headerMap[normalizedHeader]) {
        mappedRow[headerMap[normalizedHeader]] = row[header].trim();
      }
    });
    
    return mappedRow;
  });
}

async function importCSV() {
  let totalImported = 0;
  let totalSkipped = 0;
  
  for (const file of csvFiles) {
    try {
      // Full path to CSV
      const filePath = path.join(csvDirectory, file);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        continue;
      }
      
      // Parse and process CSV
      const data = await processCSV(filePath);
      const mappedData = await mapData(data);
      
      console.log(`Found ${mappedData.length} events in ${file}`);
      
      // Insert events
      let fileImported = 0;
      let fileSkipped = 0;
      
      for (const event of mappedData) {
        // Skip incomplete events
        if (!event.artist || !event.venue || !event.date || !event.emoji || !event.summary || !event.soundsLike || !event.genre) {
          console.log(`Skipping incomplete event: ${JSON.stringify(event)}`);
          fileSkipped++;
          continue;
        }
        
        const success = await insertEvent(event);
        if (success) {
          fileImported++;
        } else {
          fileSkipped++;
        }
      }
      
      console.log(`Imported ${fileImported} events from ${file} (skipped ${fileSkipped})`);
      totalImported += fileImported;
      totalSkipped += fileSkipped;
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  
  console.log(`Import complete! Total imported: ${totalImported}, Total skipped: ${totalSkipped}`);
}

// Run import
importCSV()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });