import Anthropic from '@anthropic-ai/sdk';

interface ArtistAnalysis {
  emoji: string;
  summary: string;
  soundsLike: string;
  genre: string;
  suggestedVenue?: string;
  suggestedDate?: string;
}

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export class LLMService {
  private apiKey: string;
  private searchApiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.searchApiKey = process.env.SERPER_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key not found in environment variables');
    }
  }

  async searchArtistInfo(artistName: string): Promise<SearchResult[]> {
    if (!this.searchApiKey) {
      console.warn('No search API key found, skipping web search');
      return [];
    }

    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.searchApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: `${artistName} band music genre style sound`,
          num: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }

      const data = await response.json();
      return data.organic?.slice(0, 3) || [];
    } catch (error) {
      console.error('Search API error:', error);
      return [];
    }
  }

  async searchUpcomingShows(artistName: string): Promise<SearchResult[]> {
    if (!this.searchApiKey) {
      console.warn('No search API key found, skipping concert search');
      return [];
    }

    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.searchApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: `"${artistName}" concert tour dates 2025 Denver Colorado tickets`,
          num: 8
        })
      });

      if (!response.ok) {
        throw new Error(`Concert search API error: ${response.status}`);
      }

      const data = await response.json();
      return data.organic?.slice(0, 5) || [];
    } catch (error) {
      console.error('Concert search API error:', error);
      return [];
    }
  }

  async analyzeArtist(artistName: string): Promise<ArtistAnalysis> {
    // Search for both artist info and upcoming shows
    const [artistResults, concertResults] = await Promise.all([
      this.searchArtistInfo(artistName),
      this.searchUpcomingShows(artistName)
    ]);

    const artistContext = artistResults.length > 0 
      ? `\n\nWeb search results about ${artistName}:\n${artistResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`
      : '';

    const concertContext = concertResults.length > 0 
      ? `\n\nUpcoming tour/concert information:\n${concertResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`
      : '';

    // Denver area venues from our venue list
    const denverVenues = [
      'Red Rocks Amphitheatre', 'Mission Ballroom', 'Fillmore Auditorium', 'Ogden Theatre',
      'Gothic Theatre', 'Fox Theatre', 'Paramount Theatre', 'Ball Arena', 'Bluebird Theater',
      'Oriental Theater', 'Hi-Dive', 'Globe Hall', 'Larimer Lounge', 'Lost Lake Lounge',
      'Summit Music Hall', 'Marquis Theater'
    ];

    const prompt = `You're writing for a casual cool music newsletter inspired by Oh My Rockness and Pitchfork. Analyze "${artistName}" with this specific style:

TONE: Casual, descriptive, compelling but never forced hype. Confident without exaggeration. A little wry, never breathless. Direct and useful.

1. EMOJI: One emoji that captures their actual vibe (not generic music symbols)
2. SUMMARY (max 75 chars): Describe their signature sound in a relatable way. Focus on vibe over genre. Include brief unfussy history/origin if relevant. No "mind-blowing" unless it actually is. Examples:
   - "Seattle duo crafting dreamy indie rock with crystalline vocals"
   - "Brooklyn producer mixing jazz samples with trap beats"
   - "Former Arcade Fire member's solo venture into folk territory"
3. SOUNDS LIKE: Two artists separated by comma only (format: "Artist One, Artist Two")
4. GENRE: Pick from this list: Rock & Alternative, Folk, Country & Americana, Pop & Indie Pop, Electronic & Experimental, Funk, Soul & Jazz, Classical & Orchestral, Hip Hop & R&B
5. VENUE: ONLY suggest venue if you find CONFIRMED Denver/Colorado tour dates in the search results. Must be exact venue match from: ${denverVenues.join(', ')}. If no confirmed Denver dates found, return empty string.
6. DATE: ONLY use EXACT dates from search results if Denver/Colorado show is confirmed. Must be verifiable from search results. If no confirmed date found, return empty string. Format: YYYY-MM-DD

${artistContext}${concertContext}

JSON format:
{
  "emoji": "🌙",
  "summary": "Seattle duo crafting dreamy indie rock with crystalline vocals",
  "soundsLike": "Beach House, Slowdive",
  "genre": "Pop & Indie Pop",
  "suggestedVenue": "Gothic Theatre",
  "suggestedDate": "2025-06-20"
}`;

    try {
      // Use Anthropic API
      const anthropic = new Anthropic({
        apiKey: this.apiKey,
      });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const result = JSON.parse(content.text);
        
        // Validate and clean the response
        return {
          emoji: result.emoji || '🎵',
          summary: (result.summary || '').substring(0, 75),
          soundsLike: (result.soundsLike || '').substring(0, 75),
          genre: this.validateGenre(result.genre),
          suggestedVenue: result.suggestedVenue || '', // Only valid if confirmed from search
          suggestedDate: this.validateDate(result.suggestedDate) || '' // Only valid if confirmed from search
        };
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('LLM API error:', error);
      // Return fallback values
      return {
        emoji: '🎵',
        summary: 'Innovative musical artist',
        soundsLike: 'Various Artists',
        genre: 'Rock & Alternative'
      };
    }
  }

  private validateGenre(genre: string): string {
    const validGenres = [
      'Rock & Alternative',
      'Folk, Country & Americana', 
      'Pop & Indie Pop',
      'Electronic & Experimental',
      'Funk, Soul & Jazz',
      'Classical & Orchestral',
      'Hip Hop & R&B'
    ];
    
    return validGenres.includes(genre) ? genre : 'Rock & Alternative';
  }

  private validateDate(dateString: string): string | null {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      
      // Ensure the date is in the future (after today)
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of today
      
      if (date <= today) return null;
      
      // Ensure the date is within reasonable future (2025-2026)
      const year = date.getFullYear();
      if (year < 2025 || year > 2026) return null;
      
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch {
      return null;
    }
  }
}

export const llmService = new LLMService();