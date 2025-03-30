// Script to import all CSV files in the attached_assets directory
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

// Insert an event into the database
async function insertEvent(event) {
  try {
    // Check if this is a duplicate event
    const isDuplicate = await checkDuplicateEvent(event);
    if (isDuplicate) {
      console.log(`Skipping duplicate event: ${event.artist} at ${event.venue} on ${event.date}`);
      return null;
    }
    
    const result = await pool.query(
      'INSERT INTO events (artist, venue, date, genre, emoji, description, scheduled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *',
      [
        event.artist, 
        event.venue, 
        event.date, 
        event.genre, 
        event.emoji || getGenreEmoji(event.genre), 
        event.description, 
        event.scheduled || false
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
      // Detect if the file has headers by checking if the first line has the expected column names
      const hasHeaders = fileContent.trim().split('\n')[0].toLowerCase().includes('artist') ||
                         fileContent.trim().split('\n')[0].toLowerCase().includes('venue') ||
                         fileContent.trim().split('\n')[0].toLowerCase().includes('date');
      
      parse(fileContent, {
        header: hasHeaders, // Only use headers if they exist
        skipEmptyLines: true,
        complete: async (results) => {
          console.log(`Found ${results.data.length} events in ${filePath}`);
          
          let importedCount = 0;
          let skippedCount = 0;
          
          for (const row of results.data) {
            try {
              let eventData;
              
              // If no headers, map by position instead of by field name
              if (!hasHeaders) {
                // CSV format expected: artist,venue,date,emoji,description,similar_artists,genre
                if (Array.isArray(row)) {
                  // For papaparse array format
                  eventData = {
                    artist: row[0] || '',
                    venue: row[1] || '',
                    date: formatDate(row[2] || ''),
                    emoji: row[3] || '',
                    description: row[4] || '',
                    similarArtists: row[5] || '',
                    genre: normalizeGenre(row[6] || ''),
                    scheduled: false // Default
                  };
                } else if (typeof row === 'object') {
                  // For papaparse object format without headers
                  const values = Object.values(row);
                  eventData = {
                    artist: values[0] || '',
                    venue: values[1] || '',
                    date: formatDate(values[2] || ''),
                    emoji: values[3] || '',
                    description: values[4] || '',
                    similarArtists: values[5] || '',
                    genre: normalizeGenre(values[6] || ''),
                    scheduled: false // Default
                  };
                }
              } else {
                // If headers exist, map by field name as before
                eventData = await mapData(row);
              }
              
              if (eventData && eventData.artist) {
                const result = await insertEvent(eventData);
                if (result) {
                  importedCount++;
                } else {
                  skippedCount++;
                }
              } else {
                console.warn('Skipping row with missing artist:', row);
                skippedCount++;
              }
            } catch (error) {
              console.error('Error processing row:', error);
              console.error('Row data:', row);
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

// Map CSV data to event fields
async function mapData(row) {
  // Skip if missing critical fields
  if (!row.artist && !row.Artist && !row['Artist Name']) {
    console.warn('Skipping row without artist name:', row);
    return null;
  }
  
  // Get field values with different possible column names
  const artist = row.artist || row.Artist || row['Artist Name'] || '';
  const venue = row.venue || row.Venue || row['Venue Name'] || '';
  let date = row.date || row.Date || row['Event Date'] || '';
  const description = row.description || row.Description || row['Event Description'] || '';
  
  // Handle genre with variations
  let genre = row.genre || row.Genre || row['Music Genre'] || '';
  genre = normalizeGenre(genre);
  
  // Get emoji or use default based on genre
  const emoji = row.emoji || row.Emoji || row['Event Emoji'] || getGenreEmoji(genre);
  
  // Handle scheduled status
  let scheduled = false;
  if (row.scheduled !== undefined) {
    scheduled = row.scheduled === true || row.scheduled === 'true' || row.scheduled === '1';
  } else if (row.Scheduled !== undefined) {
    scheduled = row.Scheduled === true || row.Scheduled === 'true' || row.Scheduled === '1';
  } else if (row['Is Scheduled'] !== undefined) {
    scheduled = row['Is Scheduled'] === true || row['Is Scheduled'] === 'true' || row['Is Scheduled'] === '1';
  }
  
  // Format date properly
  date = formatDate(date);
  
  return {
    artist,
    venue,
    date,
    genre,
    emoji,
    description,
    scheduled
  };
}

// Main function to import all CSV files
async function importCSV() {
  try {
    const assetsDir = path.join('.', 'attached_assets');
    const files = fs.readdirSync(assetsDir)
      .filter(file => file.endsWith('.csv'))
      .map(file => path.join(assetsDir, file));
    
    console.log(`Found ${files.length} CSV files to import`);
    
    let totalImported = 0;
    let totalSkipped = 0;
    
    for (const file of files) {
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
importCSV()
  .then(() => {
    console.log('CSV import completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('CSV import failed:', error);
    process.exit(1);
  });