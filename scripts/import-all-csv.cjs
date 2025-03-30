// Comprehensive script for importing events from all CSV files
const fs = require('fs');
const { parse } = require('papaparse');
const { Pool } = require('pg');
const path = require('path');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Format date consistently
function formatDate(dateStr) {
  const date = new Date(dateStr);
  date.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
  return date.toISOString();
}

// Get a fallback emoji for the genre
function getGenreEmoji(genre) {
  const genreEmojis = {
    'rock & alternative': '🎸',
    'folk, country & americana': '🪕',
    'pop & indie pop': '🎤',
    'electronic & experimental': '🎧',
    'funk/soul/jazz': '🎷',
    'classical & orchestral': '🎻'
  };
  
  if (!genre) return '🎵';
  
  const normalizedGenre = genre.toLowerCase().trim();
  return genreEmojis[normalizedGenre] || '🎵';
}

// Extract the first emoji from a string with multiple emojis
function extractFirstEmoji(emojiString) {
  if (!emojiString) return "";
  
  const emojiMatch = emojiString.match(/(\p{Emoji}(\u200D\p{Emoji})*)/u);
  return emojiMatch ? emojiMatch[0] : "";
}

// Process a CSV file
async function processCSV(filePath, options = {}) {
  const { clearExisting = false, hasHeaders = false, monthStart, monthEnd } = options;
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    
    console.log(`Processing ${fileName}...`);
    
    // Clear existing events for this month if requested
    if (clearExisting && monthStart && monthEnd) {
      const result = await pool.query(
        'DELETE FROM events WHERE date >= $1 AND date < $2 RETURNING id',
        [monthStart.toISOString(), monthEnd.toISOString()]
      );
      
      console.log(`Removed ${result.rowCount} existing events for the specified period`);
    }
    
    // Create a date 5 days ago (events won't show as "new")
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    // Parse the CSV
    parse(fileContent, {
      header: hasHeaders,
      skipEmptyLines: true,
      complete: async (results) => {
        console.log(`Found ${results.data.length} events in ${fileName}`);
        
        let addedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        // Process each row
        for (const row of results.data) {
          try {
            // Map values - either by header name or by array index
            let artist, venue, date, originalEmoji, summary, soundsLike, genre;
            
            if (hasHeaders) {
              artist = row.artist;
              venue = row.venue;
              date = row.date;
              originalEmoji = row.emoji || '';
              summary = row.summary;
              soundsLike = row.sounds_like || '';
              genre = row.genre;
            } else {
              artist = row[0];
              venue = row[1];
              date = row[2];
              originalEmoji = row[3] || '';
              summary = row[4];
              soundsLike = row[5] || '';
              genre = row[6];
            }
            
            // Skip if missing essential data
            if (!artist || !venue || !date || !genre) {
              console.log(`Skipping incomplete record: ${artist || 'unknown artist'}`);
              skippedCount++;
              continue;
            }
            
            // Format date
            const formattedDate = formatDate(date);
            
            // Truncate summary to 75 characters
            const truncatedSummary = summary ? summary.substring(0, 75) : '';
            
            // Extract first emoji only
            const firstEmoji = extractFirstEmoji(originalEmoji);
            const finalEmoji = firstEmoji || getGenreEmoji(genre);
            
            // Check for existing event with same artist, venue, date (unique constraint)
            const existingCheck = await pool.query(
              'SELECT id FROM events WHERE artist = $1 AND venue = $2 AND date = $3',
              [artist, venue, formattedDate]
            );
            
            if (existingCheck.rowCount > 0) {
              console.log(`Skipping duplicate: ${artist} at ${venue}`);
              skippedCount++;
              continue;
            }
            
            // Insert into database
            const result = await pool.query(
              'INSERT INTO events (artist, venue, date, genre, emoji, summary, sounds_like, is_scheduled, created_at, upvotes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
              [
                artist,
                venue,
                formattedDate,
                genre,
                finalEmoji,
                truncatedSummary,
                soundsLike,
                false,
                fiveDaysAgo.toISOString(),
                0
              ]
            );
            
            console.log(`Added: ${artist} (${finalEmoji}) at ${venue}`);
            addedCount++;
          } catch (error) {
            const artistName = hasHeaders ? row.artist : row[0];
            console.error(`Error adding event for ${artistName || 'unknown artist'}:`, error.message);
            errorCount++;
          }
        }
        
        console.log(`File ${fileName} processed: ${addedCount} added, ${skippedCount} skipped, ${errorCount} errors`);
        
        return { added: addedCount, skipped: skippedCount, errors: errorCount };
      },
      error: (error) => {
        console.error(`CSV parsing error for ${fileName}:`, error);
        return { added: 0, skipped: 0, errors: 1 };
      }
    });
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return { added: 0, skipped: 0, errors: 1 };
  }
}

// Main function to import all CSV files
async function importAllCSV() {
  try {
    console.log('Starting comprehensive CSV import...');
    
    // Define the CSV files to process
    const csvFiles = [
      {
        path: 'attached_assets/april_events_bulletin_extended.csv',
        options: {
          hasHeaders: true,
          clearExisting: true,
          monthStart: new Date('2025-04-01T00:00:00Z'),
          monthEnd: new Date('2025-05-01T00:00:00Z')
        }
      },
      {
        path: 'attached_assets/may_events_bulletin_extended.csv',
        options: {
          hasHeaders: true,
          clearExisting: true,
          monthStart: new Date('2025-05-01T00:00:00Z'),
          monthEnd: new Date('2025-06-01T00:00:00Z')
        }
      },
      {
        path: 'attached_assets/june_events_bulletin_extended.csv',
        options: {
          hasHeaders: true,
          clearExisting: true,
          monthStart: new Date('2025-06-01T00:00:00Z'),
          monthEnd: new Date('2025-07-01T00:00:00Z')
        }
      },
      {
        path: 'attached_assets/july_events_bulletin_extended.csv',
        options: {
          hasHeaders: true,
          clearExisting: true,
          monthStart: new Date('2025-07-01T00:00:00Z'),
          monthEnd: new Date('2025-08-01T00:00:00Z')
        }
      },
      {
        path: 'attached_assets/august_events_bulletin.csv',
        options: {
          hasHeaders: false,
          clearExisting: true,
          monthStart: new Date('2025-08-01T00:00:00Z'),
          monthEnd: new Date('2025-09-01T00:00:00Z')
        }
      },
      {
        path: 'attached_assets/september_events_bulletin.csv',
        options: {
          hasHeaders: false,
          clearExisting: true,
          monthStart: new Date('2025-09-01T00:00:00Z'),
          monthEnd: new Date('2025-10-01T00:00:00Z')
        }
      }
    ];
    
    // Process each CSV file
    let totalStats = { added: 0, skipped: 0, errors: 0 };
    
    for (const file of csvFiles) {
      if (fs.existsSync(file.path)) {
        const result = await processCSV(file.path, file.options);
        totalStats.added += result.added || 0;
        totalStats.skipped += result.skipped || 0;
        totalStats.errors += result.errors || 0;
      } else {
        console.log(`File ${file.path} not found, skipping`);
      }
    }
    
    console.log(`Import completed. Total: ${totalStats.added} added, ${totalStats.skipped} skipped, ${totalStats.errors} errors`);
    
    // Also check the supplementary artist info files
    const artistFiles = [
      'attached_assets/april_followed_artists_bulletin.csv',
      'attached_assets/june_followed_artists_bulletin.csv',
      'attached_assets/july_followed_artists_bulletin.csv'
    ];
    
    for (const file of artistFiles) {
      if (fs.existsSync(file)) {
        console.log(`Note: ${file} exists and can be imported for artist info if needed`);
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error in import process:', error);
    await pool.end();
  }
}

// Run the import
importAllCSV();