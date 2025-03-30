// Script to import the initial CSV files without "new" tags
const fs = require('fs');
const path = require('path');
const { parse } = require('papaparse');
const { Pool } = require('pg');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get the genre emoji based on genre
function getGenreEmoji(genre) {
  switch (genre) {
    case 'Rock & Alternative':
      return '🎸';
    case 'Folk, Country & Americana':
    case 'Folk/Country & Americana':
      return '🪕';
    case 'Pop & Indie Pop':
      return '🎤';
    case 'Electronic & Experimental':
      return '🎛️';
    case 'Funk, Soul & Jazz':
    case 'Funk/Soul/Jazz':
      return '🎷';
    case 'Classical & Orchestral':
      return '🎻';
    default:
      return '🎵';
  }
}

// Function to standardize and normalize genre names
function normalizeGenre(genre) {
  if (!genre) return 'Rock & Alternative'; // Default genre
  
  // Map variations to standard names
  const genreMap = {
    'Folk/Country & Americana': 'Folk, Country & Americana',
    'Folk & Country': 'Folk, Country & Americana',
    'Funk/Soul/Jazz': 'Funk, Soul & Jazz',
    'Electronic': 'Electronic & Experimental',
    'Rock': 'Rock & Alternative',
    'Pop': 'Pop & Indie Pop',
    'Classical': 'Classical & Orchestral'
  };
  
  return genreMap[genre] || genre;
}

// Format date into ISO format making sure it's noon on the specified day
function formatDate(dateStr) {
  // If already in ISO format, return as is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return dateStr;
  }
  
  try {
    // Parse various date formats (MM/DD/YYYY, DD-MM-YYYY, etc.)
    const parts = dateStr.split(/[\/\-\.]/);
    let day, month, year;
    
    // Try to determine format based on parts
    if (parts.length === 3) {
      // If year is likely in the first position (YYYY-MM-DD)
      if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      } 
      // Assume MM/DD/YYYY format (most common in US)
      else {
        month = parts[0];
        day = parts[1];
        year = parts[2];
      }
      
      // Ensure 4-digit year
      if (year.length === 2) {
        year = '20' + year;
      }
      
      // Pad month and day with leading zeros if needed
      month = month.padStart(2, '0');
      day = day.padStart(2, '0');
      
      // Create date at noon UTC to avoid timezone issues
      const formattedDate = `${year}-${month}-${day}T12:00:00.000Z`;
      return formattedDate;
    }
  } catch (error) {
    console.error(`Error parsing date: ${dateStr}`, error);
  }
  
  // If we couldn't parse the date, return original
  return dateStr;
}

// Check if an event already exists in the database (duplicate check)
async function checkDuplicateEvent(event) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM events WHERE artist = $1 AND date = $2 AND venue = $3',
      [event.artist, event.date, event.venue]
    );
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('Error checking for duplicate event:', error);
    return false;
  }
}

// Insert an event into the database with an older created_at timestamp
async function insertEvent(event) {
  try {
    // Check if this is a duplicate event
    const isDuplicate = await checkDuplicateEvent(event);
    if (isDuplicate) {
      console.log(`Skipping duplicate event: ${event.artist} at ${event.venue} on ${event.date}`);
      return null;
    }
    
    // Create a date that's 5 days old to avoid "new" tag
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const result = await pool.query(
      'INSERT INTO events (artist, venue, date, genre, emoji, summary, sounds_like, is_scheduled, created_at, upvotes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        event.artist, 
        event.venue, 
        event.date, 
        event.genre, 
        event.emoji || getGenreEmoji(event.genre), 
        event.summary, 
        event.soundsLike || '',
        event.scheduled || false,
        fiveDaysAgo.toISOString(), // Set created_at to 5 days ago
        0 // Initial upvote count
      ]
    );
    
    console.log(`Added event: ${event.artist} at ${event.venue} on ${event.date}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error inserting event:', error);
    console.error('Event data:', event);
    return null;
  }
}

// Process a CSV file and import events
async function processCSV(filePath) {
  console.log(`Processing file: ${filePath}`);
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    return new Promise((resolve, reject) => {
      // Check if the file has headers
      const firstLine = fileContent.trim().split('\n')[0].toLowerCase();
      const hasHeaders = firstLine.includes('artist') && 
                         firstLine.includes('venue') && 
                         firstLine.includes('date');
      
      parse(fileContent, {
        header: hasHeaders,
        skipEmptyLines: true,
        complete: async (results) => {
          console.log(`Found ${results.data.length} events in ${filePath}`);
          
          let importedCount = 0;
          let skippedCount = 0;
          
          for (const row of results.data) {
            try {
              let eventData;
              
              if (hasHeaders) {
                // CSV with headers - Use column names
                const artist = row.artist || row.Artist || '';
                const venue = row.venue || row.Venue || '';
                let date = row.date || row.Date || '';
                const emoji = row.emoji || row.Emoji || '';
                const summary = row.summary || row.Summary || '';
                const soundsLike = row.sounds_like || row['sounds like'] || row.soundsLike || '';
                let genre = row.genre || row.Genre || '';
                
                // Skip if no artist
                if (!artist) {
                  console.warn('Skipping row without artist name');
                  skippedCount++;
                  continue;
                }
                
                // Format date
                date = formatDate(date);
                
                // Normalize genre
                genre = normalizeGenre(genre);
                
                eventData = {
                  artist,
                  venue,
                  date,
                  emoji,
                  summary,
                  soundsLike,
                  genre,
                  scheduled: false
                };
              } else {
                // CSV without headers - Use position
                // Expected format: artist,venue,date,emoji,summary,sounds_like,genre
                const values = Array.isArray(row) ? row : Object.values(row);
                
                if (!values[0]) {
                  console.warn('Skipping row without artist name');
                  skippedCount++;
                  continue;
                }
                
                eventData = {
                  artist: values[0],
                  venue: values[1],
                  date: formatDate(values[2]),
                  emoji: values[3],
                  summary: values[4],
                  soundsLike: values[5],
                  genre: normalizeGenre(values[6]),
                  scheduled: false
                };
              }
              
              if (eventData && eventData.artist) {
                const result = await insertEvent(eventData);
                if (result) {
                  importedCount++;
                } else {
                  skippedCount++;
                }
              } else {
                skippedCount++;
              }
            } catch (error) {
              console.error('Error processing row:', error);
              skippedCount++;
            }
          }
          
          console.log(`Imported ${importedCount} events from ${filePath}, skipped ${skippedCount}`);
          resolve({ imported: importedCount, skipped: skippedCount });
        },
        error: (error) => {
          console.error(`Error parsing CSV file ${filePath}:`, error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return { imported: 0, skipped: 0 };
  }
}

// Function to import the specified CSV files
async function importCSVs() {
  try {
    // Specific CSV files to import
    const csvFiles = [
      'attached_assets/april_followed_artists_bulletin.csv',
      'attached_assets/june_followed_artists_bulletin.csv',
      'attached_assets/followed_artists_may2025.csv',
    ];
    
    console.log(`Found ${csvFiles.length} CSV files to import`);
    
    let totalImported = 0;
    let totalSkipped = 0;
    
    for (const file of csvFiles) {
      const { imported, skipped } = await processCSV(file);
      totalImported += imported;
      totalSkipped += skipped;
    }
    
    console.log(`=== Import Complete ===`);
    console.log(`Total events imported: ${totalImported}`);
    console.log(`Total events skipped: ${totalSkipped}`);
    
  } catch (error) {
    console.error('Error importing CSV files:', error);
  } finally {
    // Close the database connection
    await pool.end();
  }
}

// Run the import
importCSVs()
  .then(() => {
    console.log('CSV import completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('CSV import failed:', error);
    process.exit(1);
  });