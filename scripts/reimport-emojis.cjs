// Script to fix emojis in the database
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Path to CSV files
const csvDirectory = path.join(__dirname, '../attached_assets');

// List of CSV files to process with their configuration
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

async function updateEmoji(artist, venue, dateString, emoji) {
  try {
    // Format the date to match database format
    let date;
    if (dateString) {
      // Parse the date string to get year, month, day
      const [year, month, day] = dateString.split('-').map(Number);
      
      // Create a date with noon time to avoid timezone issues
      date = new Date(year, month - 1, day, 12, 0, 0);
      
      if (isNaN(date.getTime())) {
        console.error(`Invalid date values: ${dateString}`);
        return false;
      }
    }

    // Ensure emoji is only the first character
    if (emoji && emoji.length > 0) {
      emoji = emoji.charAt(0);
    }

    // Update the emoji for matching events
    const updateQuery = `
      UPDATE events 
      SET emoji = $1 
      WHERE artist = $2 AND venue = $3 AND DATE(date) = DATE($4)
      RETURNING id
    `;
    
    const result = await pool.query(updateQuery, [
      emoji,
      artist,
      venue,
      date
    ]);
    
    if (result.rows.length > 0) {
      console.log(`Updated emoji for event ID: ${result.rows[0].id} to ${emoji}`);
      return true;
    } else {
      console.log(`No matching event found for ${artist} at ${venue} on ${dateString}`);
      return false;
    }
  } catch (error) {
    console.error('Error updating emoji:', error);
    return false;
  }
}

async function processAllFiles() {
  let totalUpdated = 0;
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
      
      // Update emojis
      let fileUpdated = 0;
      let fileSkipped = 0;
      
      for (const event of mappedData) {
        // Skip incomplete events
        if (!event.artist || !event.venue || !event.date || !event.emoji) {
          console.log(`Skipping incomplete event: ${JSON.stringify(event)}`);
          fileSkipped++;
          continue;
        }
        
        const success = await updateEmoji(event.artist, event.venue, event.date, event.emoji);
        if (success) {
          fileUpdated++;
        } else {
          fileSkipped++;
        }
      }
      
      console.log(`Updated ${fileUpdated} events from ${file.filename} (skipped ${fileSkipped})`);
      totalUpdated += fileUpdated;
      totalSkipped += fileSkipped;
    } catch (error) {
      console.error(`Error processing ${file.filename}:`, error);
    }
  }
  
  console.log(`Process complete! Total updated: ${totalUpdated}, Total skipped: ${totalSkipped}`);
}

// Run the process
processAllFiles()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });