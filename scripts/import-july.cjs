// Import script for July events
const fs = require('fs');
const { parse } = require('papaparse');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper function to format dates consistently
function formatDate(dateStr) {
  if (!dateStr) return null;
  
  // Try to parse the date string
  const date = new Date(dateStr);
  
  // Check if it's a valid date
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date format: ${dateStr}`);
    return null;
  }
  
  // Set time to noon (12:00) to avoid timezone issues
  date.setHours(12, 0, 0, 0);
  
  return date.toISOString();
}

// Helper function to get emoji based on genre
function getGenreEmoji(genre) {
  const genreEmojis = {
    'rock & alternative': '🎸',
    'folk, country & americana': '🪕',
    'pop & indie pop': '🎤',
    'electronic & experimental': '🎧',
    'funk/soul/jazz': '🎷',
    'classical & orchestral': '🎻'
  };
  
  const normalizedGenre = genre.toLowerCase().trim();
  return genreEmojis[normalizedGenre] || '🎵'; // default emoji if genre not found
}

// Helper function to normalize genre names
function normalizeGenre(genre) {
  if (!genre) return 'Rock & Alternative'; // Default genre
  
  // Map of common variations to standardized genre names
  const genreMap = {
    'rock': 'Rock & Alternative',
    'alt': 'Rock & Alternative',
    'alternative': 'Rock & Alternative',
    'rock & alt': 'Rock & Alternative',
    'rock and alternative': 'Rock & Alternative',
    'rock & alternative': 'Rock & Alternative',
    
    'folk': 'Folk, Country & Americana',
    'country': 'Folk, Country & Americana',
    'americana': 'Folk, Country & Americana',
    'folk/country': 'Folk, Country & Americana',
    'folk & country': 'Folk, Country & Americana',
    'folk, country & americana': 'Folk, Country & Americana',
    'folk/country & americana': 'Folk, Country & Americana',
    
    'pop': 'Pop & Indie Pop',
    'indie pop': 'Pop & Indie Pop',
    'indie': 'Pop & Indie Pop',
    'pop & indie': 'Pop & Indie Pop',
    'pop & indie pop': 'Pop & Indie Pop',
    
    'electronic': 'Electronic & Experimental',
    'exp': 'Electronic & Experimental',
    'experimental': 'Electronic & Experimental',
    'electronic & exp': 'Electronic & Experimental',
    'electronic and experimental': 'Electronic & Experimental',
    'electronic & experimental': 'Electronic & Experimental',
    
    'funk': 'Funk/Soul/Jazz',
    'soul': 'Funk/Soul/Jazz',
    'jazz': 'Funk/Soul/Jazz',
    'funk/soul': 'Funk/Soul/Jazz',
    'soul/jazz': 'Funk/Soul/Jazz',
    'funk/jazz': 'Funk/Soul/Jazz',
    'funk/soul/jazz': 'Funk/Soul/Jazz',
    
    'classical': 'Classical & Orchestral',
    'orchestral': 'Classical & Orchestral',
    'classical & orchestral': 'Classical & Orchestral',
    'orchestra': 'Classical & Orchestral'
  };
  
  const normalizedInput = genre.toLowerCase().trim();
  return genreMap[normalizedInput] || genre; // Use provided genre if not in map
}

// Check for duplicate events
async function checkDuplicateEvent(event) {
  try {
    const result = await pool.query(
      'SELECT * FROM events WHERE artist = $1 AND venue = $2 AND date = $3',
      [event.artist, event.venue, event.date]
    );
    
    return result.rows.length > 0;
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
    
    // Extract only the first emoji character if multiple are provided
    let emojiToUse = "";
    if (event.emoji) {
      // Use a regex that matches a single emoji (including compound emojis like flags)
      const emojiMatch = event.emoji.match(/(\p{Emoji}(\u200D\p{Emoji})*)/u);
      emojiToUse = emojiMatch ? emojiMatch[0] : "";
    }
    
    // Use the extracted emoji or fall back to the genre emoji
    const finalEmoji = emojiToUse || getGenreEmoji(event.genre);
    
    console.log(`For ${event.artist}, original emoji: ${event.emoji}, using: ${finalEmoji}`);
    
    const result = await pool.query(
      'INSERT INTO events (artist, venue, date, genre, emoji, summary, sounds_like, is_scheduled, created_at, upvotes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        event.artist, 
        event.venue, 
        event.date, 
        event.genre, 
        finalEmoji, 
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

// Import July events
async function importJulyEvents() {
  try {
    const julyFile = 'attached_assets/july_events_bulletin_extended.csv';
    
    console.log(`Importing July events from ${julyFile}`);
    
    const { imported, skipped } = await processCSV(julyFile);
    
    console.log(`=== Import Complete ===`);
    console.log(`Total July events imported: ${imported}`);
    console.log(`Total July events skipped: ${skipped}`);
    
  } catch (error) {
    console.error('Error importing July events:', error);
  } finally {
    // Close the database connection
    await pool.end();
  }
}

// Run the import
importJulyEvents()
  .then(() => {
    console.log('July events import completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('July events import failed:', error);
    process.exit(1);
  });