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

// List of CSV files to import with their configuration
const csvFiles = [
  {
    filename: 'april_events_bulletin_extended.csv',
    hasHeaders: false,
    columns: ['artist', 'venue', 'date', 'emoji', 'summary', 'soundsLike', 'genre']
  },
  {
    filename: 'may_events_bulletin_extended.csv',
    hasHeaders: false,
    columns: ['artist', 'venue', 'date', 'emoji', 'summary', 'soundsLike', 'genre']
  },
  {
    filename: 'june_events_bulletin_extended.csv',
    hasHeaders: true
  },
  {
    filename: 'july_events_bulletin_extended.csv',
    hasHeaders: true
  },
  {
    filename: 'august_events_bulletin.csv',
    hasHeaders: false,
    columns: ['artist', 'venue', 'date', 'emoji', 'summary', 'soundsLike', 'genre']
  },
  {
    filename: 'september_events_bulletin.csv',
    hasHeaders: false,
    columns: ['artist', 'venue', 'date', 'emoji', 'summary', 'soundsLike', 'genre']
  },
  {
    filename: 'followed_artists_may2025.csv',
    hasHeaders: true
  }
];

// Map headers to event fields
const headerMap = {
  artist: 'artist',
  venue: 'venue',
  date: 'date',
  emoji: 'emoji',
  summary: 'summary',
  sounds_like: 'soundsLike',
  'sounds like': 'soundsLike', // Alternative format
  soundslike: 'soundsLike',
  genre: 'genre'
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

async function processCSV(filePath, hasHeaders, columns) {
  return new Promise((resolve, reject) => {
    console.log(`Processing ${filePath}...`);
    
    // Read file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse options
    const parseOptions = {
      skipEmptyLines: true,
      complete: (results) => {
        if (hasHeaders) {
          resolve(results.data);
        } else {
          // For files without headers, map each row to an object with column names
          const mapped = results.data.map(row => {
            const obj = {};
            columns.forEach((col, index) => {
              if (index < row.length) {
                obj[col] = row[index];
              }
            });
            return obj;
          });
          resolve(mapped);
        }
      },
      error: (error) => {
        reject(error);
      }
    };
    
    // Add header option only if the file has headers
    if (hasHeaders) {
      parseOptions.header = true;
    }
    
    // Parse CSV
    Papa.parse(fileContent, parseOptions);
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
      } else {
        // If we don't have a mapping, keep the original
        mappedRow[normalizedHeader] = row[header].trim();
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
      const filePath = path.join(csvDirectory, file.filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        continue;
      }
      
      // Parse and process CSV
      const data = await processCSV(filePath, file.hasHeaders, file.columns);
      const mappedData = await mapData(data);
      
      console.log(`Found ${mappedData.length} events in ${file.filename}`);
      
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
      
      console.log(`Imported ${fileImported} events from ${file.filename} (skipped ${fileSkipped})`);
      totalImported += fileImported;
      totalSkipped += fileSkipped;
    } catch (error) {
      console.error(`Error processing ${file.filename}:`, error);
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