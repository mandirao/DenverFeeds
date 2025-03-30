// Import script for July events - test version
const fs = require('fs');
const { parse } = require('papaparse');
const { Pool } = require('pg');

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

// Test with the content from the user's July CSV file
async function testJulyEmojis() {
  try {
    const filePath = 'attached_assets/july_events_bulletin_extended.csv';
    
    console.log(`Testing emoji extraction from ${filePath}`);
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log(`Found ${results.data.length} events in the CSV file`);
        
        for (const row of results.data) {
          try {
            const artist = row.artist || '';
            const emoji = row.emoji || '';
            const genre = normalizeGenre(row.genre || '');
            
            // Extract only the first emoji character if multiple are provided
            let emojiToUse = "";
            if (emoji) {
              // Use a regex that matches a single emoji (including compound emojis like flags)
              const emojiMatch = emoji.match(/(\p{Emoji}(\u200D\p{Emoji})*)/u);
              emojiToUse = emojiMatch ? emojiMatch[0] : "";
            }
            
            // Use the extracted emoji or fall back to the genre emoji
            const finalEmoji = emojiToUse || getGenreEmoji(genre);
            
            console.log(`Artist: ${artist}, Original emoji: ${emoji}, Extracted: ${emojiToUse}, Final: ${finalEmoji}`);
          } catch (error) {
            console.error('Error processing row:', error);
          }
        }
      },
      error: (error) => {
        console.error(`Error parsing CSV file:`, error);
      }
    });
  } catch (error) {
    console.error('Error testing July emojis:', error);
  }
}

// Run the test
testJulyEmojis()
  .then(() => {
    console.log('July emoji test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('July emoji test failed:', error);
    process.exit(1);
  });