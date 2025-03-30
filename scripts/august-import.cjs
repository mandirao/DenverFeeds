// Import script for August events
const fs = require('fs');
const { parse } = require('papaparse');
const { Pool } = require('pg');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Format date consistently
function formatDate(dateStr) {
  const date = new Date(dateStr);
  date.setHours(12, 0, 0, 0);
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
  
  const normalizedGenre = genre.toLowerCase().trim();
  return genreEmojis[normalizedGenre] || '🎵';
}

// Extract the first emoji from a string with multiple emojis
function extractFirstEmoji(emojiString) {
  if (!emojiString) return "";
  
  const emojiMatch = emojiString.match(/(\p{Emoji}(\u200D\p{Emoji})*)/u);
  return emojiMatch ? emojiMatch[0] : "";
}

// First, let's remove any existing August events
async function clearAugustEvents() {
  try {
    console.log('Checking for existing August events...');
    const august2025 = new Date('2025-08-01T12:00:00Z');
    const september2025 = new Date('2025-09-01T00:00:00Z');
    
    const result = await pool.query(
      'DELETE FROM events WHERE date >= $1 AND date < $2 RETURNING id',
      [august2025.toISOString(), september2025.toISOString()]
    );
    
    console.log(`Removed ${result.rowCount} existing August events`);
  } catch (error) {
    console.error('Error clearing August events:', error.message);
  }
}

// Main function to import events
async function importAugustEvents() {
  try {
    await clearAugustEvents();
    
    const filePath = 'attached_assets/august_events_bulletin.csv';
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse the CSV
    parse(fileContent, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        console.log(`Found ${results.data.length} events in the CSV file`);
        
        // Create a date 5 days ago
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        
        // Process each row
        for (const row of results.data) {
          // Since there are no headers, we'll access by index
          // Expected order: artist,venue,date,emoji,summary,sounds_like,genre
          try {
            // Map array indices to meaningful values
            const artist = row[0];
            const venue = row[1];
            const date = formatDate(row[2]);
            const originalEmoji = row[3] || '';
            const summary = row[4] ? row[4].substring(0, 75) : '';
            const soundsLike = row[5] || '';
            const genre = row[6];
            
            // Extract first emoji only
            const firstEmoji = extractFirstEmoji(originalEmoji);
            const finalEmoji = firstEmoji || getGenreEmoji(genre);
            
            console.log(`Artist: ${artist}, Original emoji: ${originalEmoji}, Using: ${finalEmoji}`);
            
            // Check for existing event with same artist, venue, date (unique constraint)
            const existingCheck = await pool.query(
              'SELECT id FROM events WHERE artist = $1 AND venue = $2 AND date = $3',
              [artist, venue, date]
            );
            
            if (existingCheck.rowCount > 0) {
              console.log(`Skipping duplicate: ${artist} at ${venue} on ${date}`);
              continue;
            }
            
            // Insert into database
            const result = await pool.query(
              'INSERT INTO events (artist, venue, date, genre, emoji, summary, sounds_like, is_scheduled, created_at, upvotes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
              [
                artist,
                venue,
                date,
                genre,
                finalEmoji,
                summary,
                soundsLike,
                false,
                fiveDaysAgo.toISOString(),
                0
              ]
            );
            
            console.log(`Added event ID ${result.rows[0].id}: ${artist} at ${venue}`);
          } catch (error) {
            console.error(`Error adding event for ${row[0] || 'unknown event'}:`, error.message);
          }
        }
        
        console.log('Import completed');
        await pool.end();
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
      }
    });
  } catch (error) {
    console.error('Error importing events:', error);
    await pool.end();
  }
}

// Run the import
importAugustEvents();