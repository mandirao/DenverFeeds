import Anthropic from '@anthropic-ai/sdk';

interface ArtistAnalysis {
  emoji: string;
  summary: string;
  soundsLike: string;
  genre: string;
  suggestedVenue?: string;
  suggestedDate?: string;
  concertSource?: string;
}

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

interface ConcertMatch {
  venue: string;
  date: string;
  source: string;
}

const COLORADO_VENUES = [
  'Ball Arena', 'Bellco Theatre', 'Bluebird Theater', 'Boettcher Concert Hall',
  "Cervantes' Masterpiece Ballroom", 'City Park', 'Club Vinyl', 'Coors Field',
  'Dazzle Denver', 'Denver Botanic Gardens', "Dick's Sporting Goods Park",
  'Empower Field at Mile High', 'Fiddlers Green Amphitheatre', 'Fillmore Auditorium',
  'Globe Hall', 'Gothic Theatre', 'Greek Theater', 'HQ', 'Hi-Dive',
  'Larimer Lounge', 'Levitt Pavilion Denver', 'Lost Lake Lounge', 'Marquis Theater',
  'Meow Wolf Denver', 'Mission Ballroom', "Moe's Original BBQ", 'Newman Center',
  'Ogden Theatre', "Ophelia's", 'Oriental Theater', 'Paramount Theatre',
  'Red Rocks Amphitheatre', 'ReelWorks Denver', 'Roxy on Broadway', 'Skylark Lounge',
  'Sound Bar', 'Summit Music Hall', 'Swallow Hill', 'The Brighton', 'The Church',
  'The Meadowlark', 'The Velvet Elk Lounge',
  'Aggie Theatre', 'Black Sheep', 'Boulder Theater', 'Broadmoor World Arena',
  'Chautauqua Auditorium', 'Folsom Field', 'Ford Amphitheater', 'Fort Collins Armory',
  'Fox Theatre', "Lulu's Downtown", 'New Belgium Brewing Company', 'The Lyric', "Washington's",
  'Belly Up Aspen', 'Dillon Amphitheater', 'Ford Park', 'Gerald R. Ford Amphitheater',
  'Gold Hill Inn', 'Surf Hotel', 'The Mishawaka'
];

const COLORADO_CITIES = ['Denver', 'Boulder', 'Fort Collins', 'Colorado Springs', 'Englewood', 'Morrison', 'Aspen', 'Vail', 'Buena Vista', 'Bellvue', 'Greeley', 'Dillon', 'Golden'];

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

  private async serperSearch(query: string, num: number = 5): Promise<SearchResult[]> {
    if (!this.searchApiKey) return [];

    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.searchApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num })
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }

      const data = await response.json();
      return data.organic?.slice(0, num) || [];
    } catch (error) {
      console.error('Search API error:', error);
      return [];
    }
  }

  private matchVenue(text: string): string | null {
    const lowerText = text.toLowerCase();
    for (const venue of COLORADO_VENUES) {
      if (lowerText.includes(venue.toLowerCase())) {
        return venue;
      }
    }

    const venueAliases: Record<string, string> = {
      'red rocks': 'Red Rocks Amphitheatre',
      'mission ballroom': 'Mission Ballroom',
      'the fillmore': 'Fillmore Auditorium',
      'the ogden': 'Ogden Theatre',
      'the gothic': 'Gothic Theatre',
      'the bluebird': 'Bluebird Theater',
      'the fox': 'Fox Theatre',
      'fiddler\'s green': 'Fiddlers Green Amphitheatre',
      'fiddlers green': 'Fiddlers Green Amphitheatre',
      'ball arena': 'Ball Arena',
      'pepsi center': 'Ball Arena',
      'cervantes': "Cervantes' Masterpiece Ballroom",
      'meow wolf': 'Meow Wolf Denver',
      'belly up': 'Belly Up Aspen',
      'the mishawaka': 'The Mishawaka',
      'mishawaka': 'The Mishawaka',
      'chautauqua': 'Chautauqua Auditorium',
    };

    for (const [alias, venue] of Object.entries(venueAliases)) {
      if (lowerText.includes(alias)) {
        return venue;
      }
    }

    return null;
  }

  private extractDate(text: string): string | null {
    const currentYear = new Date().getFullYear();

    const patterns = [
      /(\d{4})-(\d{2})-(\d{2})/,
      /(\w+)\s+(\d{1,2}),?\s*(\d{4})/,
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let date: Date;
          if (pattern === patterns[0]) {
            date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
          } else if (pattern === patterns[2]) {
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            date = new Date(`${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T12:00:00`);
          } else {
            date = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
          }

          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            if (year >= currentYear && year <= currentYear + 1) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (date >= today) {
                return date.toISOString().split('T')[0];
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private isColoradoMention(text: string): boolean {
    const lowerText = text.toLowerCase();
    return COLORADO_CITIES.some(city => lowerText.includes(city.toLowerCase())) ||
      lowerText.includes('colorado') || lowerText.includes(' co ') ||
      lowerText.includes(', co') || lowerText.includes('red rocks');
  }

  async searchStructuredConcertData(artistName: string): Promise<ConcertMatch | null> {
    if (!this.searchApiKey) return null;

    console.log(`[Concert Search] Tier 1: Searching structured sources for "${artistName}"...`);

    const queries = [
      `site:bandsintown.com "${artistName}" Denver Colorado`,
      `site:songkick.com "${artistName}" Denver Colorado`,
      `"${artistName}" site:axs.com Denver OR Boulder OR "Red Rocks" OR Morrison`,
      `"${artistName}" site:dice.fm Denver Colorado`,
    ];

    const results = await Promise.all(queries.map(q => this.serperSearch(q, 3)));
    const allResults = results.flat();

    console.log(`[Concert Search] Tier 1: Found ${allResults.length} structured results`);

    for (const result of allResults) {
      const combined = `${result.title} ${result.snippet}`;

      if (this.isColoradoMention(combined)) {
        const venue = this.matchVenue(combined);
        const date = this.extractDate(combined);

        if (venue && date) {
          const source = result.link.includes('bandsintown') ? 'Bandsintown' :
            result.link.includes('songkick') ? 'Songkick' :
            result.link.includes('axs.com') ? 'AXS' :
            result.link.includes('dice.fm') ? 'Dice' : 'Structured search';
          console.log(`[Concert Search] Tier 1 HIT: ${venue} on ${date} via ${source}`);
          return { venue, date, source };
        }

        if (venue && !date) {
          console.log(`[Concert Search] Tier 1: Found venue "${venue}" but no date`);
        }
        if (date && !venue) {
          console.log(`[Concert Search] Tier 1: Found date "${date}" but no venue match`);
        }
      }
    }

    for (const result of allResults) {
      const combined = `${result.title} ${result.snippet}`;
      if (this.isColoradoMention(combined)) {
        const venue = this.matchVenue(combined);
        const date = this.extractDate(combined);
        if (venue || date) {
          const source = result.link.includes('bandsintown') ? 'Bandsintown' :
            result.link.includes('songkick') ? 'Songkick' :
            result.link.includes('axs.com') ? 'AXS' :
            result.link.includes('dice.fm') ? 'Dice' : 'Structured search';
          console.log(`[Concert Search] Tier 1 PARTIAL: venue=${venue || 'unknown'}, date=${date || 'unknown'} via ${source}`);
          return { venue: venue || '', date: date || '', source };
        }
      }
    }

    console.log(`[Concert Search] Tier 1: No structured results found`);
    return null;
  }

  async searchGeneralConcertData(artistName: string): Promise<ConcertMatch | null> {
    if (!this.searchApiKey) return null;

    console.log(`[Concert Search] Tier 2: General web search for "${artistName}" Denver shows...`);

    const queries = [
      `"${artistName}" concert Denver Colorado 2026 tickets`,
      `"${artistName}" tour Denver Boulder Colorado 2026`,
    ];

    const results = await Promise.all(queries.map(q => this.serperSearch(q, 5)));
    const allResults = results.flat();

    console.log(`[Concert Search] Tier 2: Found ${allResults.length} general results`);

    for (const result of allResults) {
      const combined = `${result.title} ${result.snippet}`;

      if (this.isColoradoMention(combined)) {
        const venue = this.matchVenue(combined);
        const date = this.extractDate(combined);

        if (venue || date) {
          console.log(`[Concert Search] Tier 2 MATCH: venue=${venue || 'unknown'}, date=${date || 'unknown'} via web search`);
          return { venue: venue || '', date: date || '', source: 'Web search' };
        }
      }
    }

    console.log(`[Concert Search] Tier 2: No Denver shows found in general results`);
    return null;
  }

  async searchArtistInfo(artistName: string): Promise<SearchResult[]> {
    return this.serperSearch(`${artistName} band music genre style sound`, 5);
  }

  async analyzeArtist(artistName: string): Promise<ArtistAnalysis> {
    const [artistResults, concertMatch] = await Promise.all([
      this.searchArtistInfo(artistName),
      this.searchStructuredConcertData(artistName)
    ]);

    let finalConcertMatch = concertMatch;
    if (!finalConcertMatch || (!finalConcertMatch.venue && !finalConcertMatch.date)) {
      finalConcertMatch = await this.searchGeneralConcertData(artistName);
    }

    const artistContext = artistResults.length > 0
      ? `\n\nWeb search results about ${artistName}:\n${artistResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`
      : '';

    let concertContext = '';
    if (finalConcertMatch && (finalConcertMatch.venue || finalConcertMatch.date)) {
      concertContext = `\n\nCONFIRMED Denver/Colorado show found via ${finalConcertMatch.source}:`;
      if (finalConcertMatch.venue) concertContext += `\n- Venue: ${finalConcertMatch.venue}`;
      if (finalConcertMatch.date) concertContext += `\n- Date: ${finalConcertMatch.date}`;
      concertContext += `\nUse these exact values for suggestedVenue and suggestedDate.`;
    }

    const prompt = `You're writing for a casual cool music newsletter inspired by Oh My Rockness and Pitchfork. Analyze "${artistName}" with this specific style:

TONE: Casual and descriptive but compelling—no forced hype. Describe sound with confidence, not exaggeration. Slightly wry rather than breathless. Keep it tight, direct, and useful.

1. EMOJI: One emoji that captures their actual vibe (not generic music symbols)
2. SUMMARY (max 55 chars): Ultra-concise signature sound description. Focus on their specific sonic vibe, not genre. Examples:
   - "Neo-soul queen with astral vibes and witty flow"
   - "Industrial punk intensity with cathartic vocals"
   - "Shoegazey dream pop with an emo undercurrent"
   - "Fragile, poetic alt-folk with spiritual weight"
   - "Dance-punk frenzy with cowbell and chaos"
3. SOUNDS LIKE: Two artists separated by comma only (format: "Artist One, Artist Two")
4. GENRE: Pick from this list: Rock & Alternative, Folk, Country & Americana, Pop & Indie Pop, Electronic & Experimental, Funk, Soul & Jazz, Classical & Orchestral, Hip Hop & R&B
5. VENUE: ${finalConcertMatch?.venue ? `Use exactly: "${finalConcertMatch.venue}"` : 'Return empty string — no confirmed Denver show found'}
6. DATE: ${finalConcertMatch?.date ? `Use exactly: "${finalConcertMatch.date}"` : 'Return empty string — no confirmed date found'}

${artistContext}${concertContext}

Respond with ONLY valid JSON, no markdown formatting:
{
  "emoji": "🌙",
  "summary": "Dreamy indie rock with crystalline vocals",
  "soundsLike": "Beach House, Slowdive",
  "genre": "Pop & Indie Pop",
  "suggestedVenue": "",
  "suggestedDate": ""
}`;

    try {
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
        let text = content.text.trim();
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          text = jsonMatch[1].trim();
        }
        const result = JSON.parse(text);

        const validatedVenue = result.suggestedVenue && finalConcertMatch?.venue
          ? finalConcertMatch.venue : '';
        const validatedDate = result.suggestedDate && finalConcertMatch?.date
          ? this.validateDate(finalConcertMatch.date) || '' : '';

        return {
          emoji: result.emoji || '🎵',
          summary: (result.summary || '').substring(0, 55),
          soundsLike: (result.soundsLike || '').substring(0, 75),
          genre: this.validateGenre(result.genre),
          suggestedVenue: validatedVenue,
          suggestedDate: validatedDate,
          concertSource: finalConcertMatch?.source || undefined,
        };
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('LLM API error:', error);
      throw error;
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

  async parseBlurb(blurb: string, imageBase64?: string, imageMediaType?: string): Promise<{
    name: string;
    venue: string;
    neighborhood: string;
    dateStart: string;
    dateEnd: string;
    emoji: string;
    summary: string;
    cuisine: string;
    price: string;
    ticketUrl: string;
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are parsing a food popup event in Denver, CO from social media content. Extract details and return ONLY valid JSON.

Today's date: ${today}
${blurb ? `\nBlurb:\n"""\n${blurb}\n"""` : ''}${imageBase64 ? '\n\nAn image from the post is also attached — scan it for any text, dates, prices, or details not captured in the blurb.' : ''}

Return this exact JSON structure (no markdown, no code blocks):
{
  "name": "short punchy event name (e.g. 'Hot Pot Pop-Up Nights')",
  "venue": "restaurant or location name",
  "neighborhood": "Denver neighborhood if mentioned, else empty string",
  "dateStart": "YYYY-MM-DD or empty string if unknown",
  "dateEnd": "YYYY-MM-DD for last day if multi-day, else empty string",
  "emoji": "single food-related emoji that fits the event",
  "summary": "one punchy sentence description, max 75 chars, casual cool tone",
  "cuisine": "one of: Hot Pot & Shabu, Japanese, Korean, Chinese, Thai & Southeast Asian, Indian & South Asian, Mexican & Latin, Italian, French, Mediterranean, Seafood, BBQ & Southern, Brunch & Breakfast, Dessert & Pastry, Cocktails & Wine, Tasting Menu, Farm-to-Table, Fusion, American, Other",
  "price": "price string like '$55/person' or empty string if unknown",
  "ticketUrl": "reservation/ticket URL if mentioned or clearly implied platform URL, else empty string"
}

Rules:
- Use current year (${new Date().getFullYear()}) unless another year is clearly stated
- If a date range is mentioned (e.g. March 26-28), dateStart=first date, dateEnd=last date
- Keep summary under 75 chars, casual and descriptive
- Pick the most specific cuisine type that fits
- Combine all sources (blurb text + image text) for the most accurate result`;

    const userContent: any[] = [];

    if (imageBase64 && imageMediaType) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      });
    }

    userContent.push({ type: 'text', text: prompt });

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    const result = JSON.parse(cleaned);
    return {
      name: result.name || '',
      venue: result.venue || '',
      neighborhood: result.neighborhood || '',
      dateStart: result.dateStart || '',
      dateEnd: result.dateEnd || '',
      emoji: result.emoji || '🍴',
      summary: result.summary || '',
      cuisine: result.cuisine || 'Other',
      price: result.price || '',
      ticketUrl: result.ticketUrl || '',
    };
  }

  private validateDate(dateString: string): string | null {
    if (!dateString) return null;

    try {
      const date = new Date(dateString + 'T12:00:00');
      if (isNaN(date.getTime())) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (date <= today) return null;

      const currentYear = new Date().getFullYear();
      const year = date.getFullYear();
      if (year < currentYear || year > currentYear + 1) return null;

      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }
}

export const llmService = new LLMService();
