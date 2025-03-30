// Simple script for July events with emoji pairs
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

// Main function to import events
async function importJulyEvents() {
  try {
    const filePath = 'attached_assets/july_followed_artists_bulletin.csv';
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse the CSV
    parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        console.log(`Found ${results.data.length} events in the CSV file`);
        
        // Create a date 5 days ago
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        
        // Process each row
        for (const row of results.data) {
          try {
            const artist = row.artist;
            const venue = row.venue;
            const date = formatDate(row.date);
            const genre = row.genre;
            const summary = row.summary;
            const soundsLike = row.sounds_like || '';
            
            // Extract first emoji only
            const originalEmoji = row.emoji || '';
            const firstEmoji = extractFirstEmoji(originalEmoji);
            const finalEmoji = firstEmoji || getGenreEmoji(genre);
            
            console.log(`Artist: ${artist}, Original emoji: ${originalEmoji}, Using: ${finalEmoji}`);
            
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
            console.error(`Error adding event for ${row.artist}:`, error.message);
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
importJulyEvents();