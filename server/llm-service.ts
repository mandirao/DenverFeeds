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
      console.warn('Warning: ANTHROPIC_API_KEY not set. AI features will be unavailable.');
    }
  }

  private async serperPlaces(query: string): Promise<{ title: string; address: string; category?: string } | null> {
    if (!this.searchApiKey) return null;
    try {
      const response = await fetch('https://google.serper.dev/places', {
        method: 'POST',
        headers: { 'X-API-KEY': this.searchApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'us', hl: 'en' }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const place = data.places?.[0];
      return place ? { title: place.title, address: place.address || '', category: place.category || '' } : null;
    } catch (err) {
      console.log(`[serperPlaces] exception: ${err}`);
      return null;
    }
  }

  private addressToNeighborhood(address: string): string | null {
    if (!address) return null;
    const a = address.toLowerCase();

    // Boulder
    if (/\b(boulder|80301|80302|80303|80304|80305)\b/.test(a)) return 'Boulder';
    // Lakewood
    if (/\b(lakewood|belmar|80214|80215|80226|80227|80228)\b/.test(a)) return 'Lakewood';
    // DTC & Tech Center
    if (/\b(greenwood village|englewood|80111|80112|80237|80246|80222|80224|80231|tech center|dtc)\b/.test(a)) return 'DTC & Tech Center';

    // Street/area name keywords — checked BEFORE zip codes because street names are more specific.
    // (e.g. "2200 E Colfax Ave 80206" should be Capitol Hill & Uptown, not Cherry Creek)
    if (/wynkoop|wazee|blake st|market st|larimer st|lodo|union station|lo ?do/.test(a)) return 'Downtown & LoDo';
    if (/brighton blvd|walnut st|rino|river north|five points|welton/.test(a)) return 'RiNo & Five Points';
    if (/lohi|lo ?hi|highlands|32nd ave|platte st/.test(a)) return 'Highlands & LoHi';
    if (/tennyson|berkeley|38th ave/.test(a)) return 'Sunnyside & Berkeley';
    if (/sunnyside|44th ave/.test(a)) return 'Sunnyside & Berkeley';
    if (/federal blvd|federal boulevard|villa park|barnum|harvey park/.test(a)) return 'Federal Blvd';
    if (/south broadway|s broadway|baker/.test(a)) return 'Baker & South Broadway';
    if (/capitol hill|uptown|colfax|17th ave|18th ave|congress park/.test(a)) return 'Capitol Hill & Uptown';
    if (/cherry creek|2nd ave|fillmore|glendale/.test(a)) return 'Cherry Creek & Glendale';
    if (/university hills|harvard gulch/.test(a)) return 'University Hills';
    if (/wash park|platt park|pearl st s|old south pearl/.test(a)) return 'Wash Park & Platt Park';
    if (/sloan.?s lake|edgewater/.test(a)) return "Sloan's Lake";
    if (/stapleton|central park|northfield/.test(a)) return 'Stapleton & Central Park';
    if (/westminster|orchard town center/.test(a)) return 'Westminster';

    // Zip-code based (fallback when street name doesn't match)
    const zipMatch = address.match(/\b(8\d{4})\b/);
    const zip = zipMatch?.[1];
    const zipMap: Record<string, string> = {
      '80202': 'Downtown & LoDo',
      '80203': 'Capitol Hill & Uptown',
      '80204': 'Highlands & LoHi',
      '80205': 'RiNo & Five Points',
      '80206': 'Cherry Creek & Glendale', // Cherry Creek/Congress Park — street check above handles Colfax addresses
      '80207': 'Stapleton & Central Park',
      '80209': 'Wash Park & Platt Park',
      '80210': 'Wash Park & Platt Park',
      '80211': 'Highlands & LoHi',
      '80212': 'Sunnyside & Berkeley',
      '80218': 'Capitol Hill & Uptown',
      '80219': 'Baker & South Broadway',
      '80220': 'Stapleton & Central Park',
      '80223': 'Baker & South Broadway',
      '80021': 'Westminster',
      '80030': 'Westminster',
      '80031': 'Westminster',
      '80234': 'Westminster',
      '80235': 'Westminster',
    };
    if (zip && zipMap[zip]) return zipMap[zip];

    return null;
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

    const artistLower = artistName.toLowerCase();

    for (const result of allResults) {
      if (!result.title.toLowerCase().includes(artistLower)) {
        console.log(`[Concert Search] Tier 1 SKIP: artist not in title — "${result.title}"`);
        continue;
      }
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
      if (!result.title.toLowerCase().includes(artistLower)) continue;
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

    const artistLower2 = artistName.toLowerCase();

    for (const result of allResults) {
      if (!result.title.toLowerCase().includes(artistLower2)) {
        console.log(`[Concert Search] Tier 2 SKIP: artist not in title — "${result.title}"`);
        continue;
      }
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
        model: "claude-sonnet-4-5",
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

  async parseBlurb(blurb: string, imageBase64?: string, imageMediaType?: string, fileName?: string): Promise<{
    name: string;
    venue: string;
    neighborhood: string;
    dateStart: string;
    dateEnd: string;
    startTime: string;
    emoji: string;
    summary: string;
    cuisine: string;
    price: string;
    ticketUrl: string;
    announcedAt: string;
    selloutRisk: number | null;
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const today = new Date().toISOString().split('T')[0];

    // ── PASS 1: extract structured facts from blurb/image ──────────────────
    const pass1Prompt = `You are parsing a food popup event in Denver, CO from social media content. Extract details and return ONLY valid JSON.

Today's date: ${today}
${fileName ? `Screenshot file name: "${fileName}" — look for date/time patterns like YYYY-MM-DD or YYYYMMDD in this name to determine when the screenshot was taken.` : ''}
${blurb ? `\nBlurb:\n"""\n${blurb}\n"""` : ''}${imageBase64 ? '\n\nAn image from the post is also attached — scan it carefully for any text, dates, prices, venue names, or details. Look for relative post timestamps like "2h", "3d", "1w", "2 days ago" that indicate when the post was published.' : ''}

Return this exact JSON structure (no markdown, no code blocks):
{
  "name": "short punchy event name (e.g. 'Disco & Dumplings')",
  "venue": "restaurant or location name",
  "neighborhood": "Denver neighborhood if mentioned, else empty string",
  "dateStart": "YYYY-MM-DD or empty string if unknown",
  "dateEnd": "YYYY-MM-DD for last day if multi-day, else empty string",
  "emoji": "single food-related emoji that fits the event",
  "draftSummary": "raw factual notes about the event — food, vibe, key details. Not the final summary, just the raw material.",
  "notableNames": ["array of any named chefs, DJs, collaborators, pop-up brands worth researching — empty array if none"],
  "cuisine": "one of: Hot Pot & Shabu, Japanese, Korean, Chinese, Thai & Southeast Asian, Indian & South Asian, Mexican & Latin, Italian, French, Mediterranean, Seafood, BBQ & Southern, Brunch & Breakfast, Dessert & Pastry, Cocktails & Wine, Tasting Menu, Farm-to-Table, Fusion, American, Other",
  "startTime": "HH:MM in 24hr format. Extract if explicitly stated. If not stated: guess based on context — dinner/supper popup → '18:30', brunch event → '10:00', lunch popup → '12:00', cocktails/drinks/happy hour → '17:00', late night → '21:00'. If multi-day (dateEnd differs from dateStart), use empty string. If genuinely no context, default to '18:00'.",
  "price": "price string like '$55/person' or empty string if unknown",
  "ticketUrl": "reservation/ticket URL if mentioned or clearly implied platform URL, else empty string",
  "announcedAt": "YYYY-MM-DD date when this was first announced/posted — check in order: (1) relative timestamp visible in image like '3d' or '2 days ago' subtracted from today, (2) date pattern in file name, (3) empty string if unknown",
  "selloutRisk": integer 1-5 estimating how fast this will sell out based on contextual clues:
    5 = Instant sellout — famous/prestige restaurant (Tavernetta, Beckon, Frasca, Mizuna, Nobu), ticketed tasting menu, explicitly limited seats, single night only, high price
    4 = Sells out within hours — well-known chef or brand collab, Tock/Resy/Eventbrite ticket link present, $60+/person, strong demand signals ("limited spots", "first come first served")
    3 = Moderate risk — recurring popup brand with following, decent price point, multi-day but popular cuisine (omakase, hot pot, Korean BBQ)
    2 = Low-moderate — casual popup, walk-in friendly, multi-day window, mid-range price
    1 = Minimal risk — street food style, ongoing/daily popup, no reservation needed, very casual
    Use null only if there are genuinely no signals to go on.
}

Rules:
- Use current year (${new Date().getFullYear()}) unless another year is clearly stated
- If a date range is mentioned (e.g. March 26-28), dateStart=first date, dateEnd=last date
- Pick the most specific cuisine type that fits
- For announcedAt: '3d' ago means subtract 3 days from today's date; '1w' means subtract 7 days; '2h' means today`;

    const pass1Content: any[] = [];
    if (imageBase64 && imageMediaType) {
      pass1Content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      });
    }
    pass1Content.push({ type: 'text', text: pass1Prompt });

    const pass1Message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: pass1Content }],
    });

    const pass1Raw = pass1Message.content[0].type === 'text' ? pass1Message.content[0].text : '{}';
    const pass1Cleaned = pass1Raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const pass1 = JSON.parse(pass1Cleaned);

    // ── WEB SEARCH: look up venue + event + notable collaborators ──────────
    const searchQueries: string[] = [];
    if (pass1.venue) {
      searchQueries.push(`${pass1.venue} Denver`);
    }
    // Search the event itself by name — often surfaces collaborator names not in the original blurb
    if (pass1.name && pass1.venue) {
      searchQueries.push(`"${pass1.name}" "${pass1.venue}" Denver`);
    } else if (pass1.name) {
      searchQueries.push(`"${pass1.name}" Denver popup event`);
    }
    const notableNames: string[] = Array.isArray(pass1.notableNames) ? pass1.notableNames : [];
    for (const name of notableNames.slice(0, 2)) {
      searchQueries.push(`"${name}" Denver`);
    }

    const searchResults = await Promise.all(
      searchQueries.map(q => this.serperSearch(q, 3))
    );

    const searchContext = searchQueries.map((q, i) => {
      const snippets = searchResults[i]
        .map(r => `• ${r.title}: ${r.snippet}`)
        .join('\n');
      return `Search: "${q}"\n${snippets || '(no results)'}`;
    }).join('\n\n');

    // ── PASS 2: write final summary enriched with web context ──────────────
    const pass2Prompt = `You are writing the final event listing entry for Amuse-Bouche, a Denver food popup newsletter.

Here is what we know from the original post:
- Event: ${pass1.name || 'unknown'}
- Venue: ${pass1.venue || 'unknown'}
- Draft notes: ${pass1.draftSummary || ''}

Here is additional context from web searches about the venue and collaborators:
${searchContext || '(no additional context found)'}

Step 1 — Scan the search results above and identify any named businesses, pop-up brands, cheese shops, chefs, DJ acts, or collaborators mentioned. These are your most important ingredients.

Step 2 — Write the final summary using those real names. If a named collaborator appears in the search results, you MUST use their actual name in the summary.

--- NAMING RULE (HIGHEST PRIORITY) ---
Named collaborators from search results MUST appear in the summary by name.
WRONG: "boards from a local cheese shop" / "curated by an expert cheesemonger" / "a Denver fromage specialist"
RIGHT: "boards from Oh My Gouda" / "cheese by Oh My Gouda's founder"
If the search results say "Oh My Gouda" — write "Oh My Gouda." Never substitute a generic description for a real name.

--- AMUSE-BOUCHE VOICE GUIDE ---
• VOICE: Informed and worldly but conversational. Confidently descriptive — no hedging, no hype.
• TONE: Sensory and evocative — paint the food and atmosphere, not the pitch. NO persuasion language ("Trust us," "you won't want to miss," "show up early," calls to action).
• STRUCTURE: 1-2 tight sentences. Lead with what it actually feels like. No rhetorical hooks.
• WORD CHOICE: Lush but efficient. Concrete sensory nouns, compound adjectives, juxtapositions.
• LENGTH: Hard cap at 200 characters.
• EM DASHES: always write em dashes with no spaces on either side — like this: "word—word" not "word — word".

EXAMPLE SUMMARIES:
- "House and disco, free dumplings at midnight, four DJs — Bao Brewhouse at full tilt on a Saturday night."
- "Six beers, six cheeses, rooftop views of the Rockies — Odell pairs pints with boards from Oh My Gouda, run by an ex-Olympic ski jumper turned fromage obsessive."
- "An omakase pop-up from the team behind Michelin-recognized Kawa Ni: twelve courses, rotating proteins, low-lit and unhurried."

Return ONLY valid JSON (no markdown):
{
  "neighborhood": "corrected Denver neighborhood based on venue address from search, or original if no better info",
  "summary": "final 200-char-max Amuse-Bouche summary — MUST use real names of any collaborators found in search"
}`;

    const pass2Message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: pass2Prompt }],
    });

    const pass2Raw = pass2Message.content[0].type === 'text' ? pass2Message.content[0].text : '{}';
    const pass2Cleaned = pass2Raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const pass2 = JSON.parse(pass2Cleaned);

    return {
      name: pass1.name || '',
      venue: pass1.venue || '',
      neighborhood: pass2.neighborhood || pass1.neighborhood || '',
      dateStart: pass1.dateStart || '',
      dateEnd: pass1.dateEnd || '',
      startTime: pass1.startTime || '',
      emoji: pass1.emoji || '🍴',
      summary: (pass2.summary || pass1.draftSummary || '').substring(0, 200),
      cuisine: pass1.cuisine || 'Other',
      price: pass1.price || '',
      ticketUrl: pass1.ticketUrl || '',
      announcedAt: pass1.announcedAt || '',
      selloutRisk: (typeof pass1.selloutRisk === 'number' && pass1.selloutRisk >= 1 && pass1.selloutRisk <= 5)
        ? Math.round(pass1.selloutRisk) : null,
    };
  }

  async parseArtBlurb(blurb: string, imageBase64?: string, imageMediaType?: string, fileName?: string): Promise<{
    name: string;
    venue: string;
    neighborhood: string;
    dateStart: string;
    dateEnd: string;
    startTime: string;
    emoji: string;
    summary: string;
    category: string;
    price: string;
    ticketUrl: string;
    announcedAt: string;
    selloutRisk: number | null;
    isRecurring: boolean;
    recurrenceLabel: string;
    instanceNote: string;
    specificDates: string[];
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const today = new Date().toISOString().split('T')[0];

    const pass1Prompt = `You are parsing an art, science, or cultural event in Denver/Boulder, CO from social media or promotional content. Extract details and return ONLY valid JSON.

Today's date: ${today}
${fileName ? `Screenshot file name: "${fileName}" — look for date/time patterns like YYYY-MM-DD or YYYYMMDD in this name to determine when the screenshot was taken.` : ''}
${blurb ? `\nBlurb:\n"""\n${blurb}\n"""` : ''}${imageBase64 ? '\n\nAn image is attached — scan it for any text, dates, prices, venue names, or details. Look for relative post timestamps like "2h", "3d", "1w" that indicate when the post was published.' : ''}

Return this exact JSON structure (no markdown, no code blocks):
{
  "name": "short evocative event name",
  "venue": "venue, museum, gallery, theater, or location name",
  "neighborhood": "Denver/Boulder neighborhood if mentioned, else empty string",
  "dateStart": "YYYY-MM-DD or empty string if unknown",
  "dateEnd": "YYYY-MM-DD for last day if multi-day, else empty string",
  "emoji": "single emoji that captures what's SPECIFIC and interesting about THIS event — not its broad category. Think: what is the event actually ABOUT? A story slam → 🦋 (if by the Moth) or 🎤. Ballet → 🩰. A talk about the universe → 🌌. Dinosaur exhibit → 🦕. Pasta dinner with film → 🍝. 2D art exhibit → 🖼️. Sculpture → 🗿. Textile/fiber arts → 🧶. Writing workshop → ✍️. Photography → 📸. Mushrooms/foraging → 🍄. Bees/insects → 🐝. Ocean/marine life → 🐙. Ancient history → 🏺. Renaissance art → 🏛️. Jazz → 🎷. Poetry → 📜. Chess → ♟️. Origami → 🦢. Astronomy → 🔭. Geology → 🪨. Fermentation → 🍶. Plants/botany → 🌱. Choose the emoji that best conveys the specific vibe and subject — make someone curious just from the emoji alone. Avoid generic fallbacks like 🎨 or 📚 unless nothing more specific fits.",
  "draftSummary": "raw factual notes — theme, format, speakers, vibe, key details. Not the final summary.",
  "notableNames": ["array of any named artists, scientists, authors, performers, organizations worth researching — empty array if none"],
  "category": "one of: Theater & Musicals, Comedy & Storytelling, Film & Cinema, Dance & Movement, Music & Performance, Galleries & Exhibitions, Workshops & Classes, Science & Nature, Books & Talks, Markets & Pop-Ups, Wellness & Community, Parties & Social — choose the closest fit: Theater & Musicals = plays/musicals/opera/broadway touring shows; Comedy & Storytelling = stand-up/improv/story slams/storytelling shows/comedy nights; Film & Cinema = film festivals/screenings/documentary events; Dance & Movement = ballet/modern dance/concert dance/dance nights; Music & Performance = live concerts/jazz/classical/open mic/DJ sets; Galleries & Exhibitions = gallery openings/art exhibits/museum shows/studio tours (viewing, not making); Workshops & Classes = hands-on art classes/figure drawing/pottery/craft nights/making workshops (participatory); Science & Nature = astronomy/science talks/nature/natural history; Books & Talks = book clubs/author events/lectures/seminars/literary panels/salons; Markets & Pop-Ups = artisan markets/craft fairs/swap meets/pop-up shops; Wellness & Community = meditation/yoga/community social events/seasonal gatherings; Parties & Social = dance parties/themed parties/club nights/warehouse raves/costume parties/seasonal bashes/social mixers",
  "startTime": "HH:MM in 24hr format. Extract if explicitly stated. If not stated: guess based on category and context — evening events/receptions/openings → '18:00', comedy/theater/film screening/show → '19:30', dance party/rave/club night → '21:00', morning talk/workshop/class → '10:00', afternoon event → '14:00', market/fair → '10:00', book club/salon → '18:30'. If multi-day exhibition (dateEnd differs from dateStart and it's a gallery/museum show), use empty string.",
  "price": "price string like '$15/person' or 'Free' or empty string if unknown",
  "ticketUrl": "ticket/registration URL if mentioned, else empty string",
  "announcedAt": "YYYY-MM-DD date when first announced/posted — check: (1) relative timestamp in image like '3d' or '2 days ago' subtracted from today, (2) date pattern in file name, (3) empty string if unknown",
  "isRecurring": true if this is a recurring/regular event (monthly, weekly, every first Friday, ongoing series, annual, etc.) — false if it's a one-time event,
  "recurrenceLabel": "short human-readable recurrence pattern if isRecurring is true, e.g. 'Monthly', 'Weekly', 'Every 1st Friday', 'Annual', 'Bi-weekly Thursdays' — empty string if not recurring",
  "occurrenceNote": "ONLY for recurring events: if the source explicitly mentions what is SPECIFIC to THIS occurrence (e.g. 'this month we're reading X', 'featuring artist Y', 'theme: Z this week') — extract that detail in ≤120 chars. Empty string if nothing occurrence-specific is mentioned or if isRecurring is false.",
  "specificDates": ["YYYY-MM-DD", ...] // ONLY populate if 2 or more specific non-contiguous dates are explicitly listed (e.g. "Jul 8, Aug 22, Sep 13" or "March 5 & April 2 & May 7"). Return them sorted ascending. Use empty array [] for single dates, continuous ranges, weekly/monthly patterns, or ongoing exhibitions. Never guess dates — only include dates explicitly named in the source.
  "selloutRisk": integer 1-5 estimating how fast this will sell out:
    5 = Instant sellout — famous venue (Denver Art Museum special, Meow Wolf ticketed, Red Rocks comedy), single night, explicitly limited capacity, famous speaker/performer
    4 = Sells out quickly — well-known institution or artist, ticketed + limited seats, $50+/person, strong demand signals
    3 = Moderate risk — recurring event series with following, mid-range capacity, popular topic
    2 = Low-moderate — casual event, walk-in friendly, multi-day, mid-range price
    1 = Minimal risk — free/drop-in, ongoing exhibition, very casual
    Use null if genuinely no signals.
}

Rules:
- Use current year (${new Date().getFullYear()}) unless another year is clearly stated
- If a date range is mentioned (e.g. March 26–28), dateStart=first date, dateEnd=last date
- For announcedAt: '3d' ago means subtract 3 days from today; '1w' means subtract 7 days; '2h' means today`;

    const pass1Content: any[] = [];
    if (imageBase64 && imageMediaType) {
      pass1Content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      });
    }
    pass1Content.push({ type: 'text', text: pass1Prompt });

    const pass1Message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: pass1Content }],
    });

    const pass1Raw = pass1Message.content[0].type === 'text' ? pass1Message.content[0].text : '{}';
    const pass1Cleaned = pass1Raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const pass1 = JSON.parse(pass1Cleaned);

    // Web search for venue + notable names
    const searchQueries: string[] = [];
    if (pass1.venue) searchQueries.push(`${pass1.venue} Denver`);
    if (pass1.name && pass1.venue) {
      searchQueries.push(`"${pass1.name}" "${pass1.venue}" Denver`);
    } else if (pass1.name) {
      searchQueries.push(`"${pass1.name}" Denver event`);
    }
    const notableNames: string[] = Array.isArray(pass1.notableNames) ? pass1.notableNames : [];
    for (const name of notableNames.slice(0, 2)) {
      searchQueries.push(`"${name}" Denver`);
    }

    const searchResults = await Promise.all(searchQueries.map(q => this.serperSearch(q, 3)));
    const searchContext = searchQueries.map((q, i) => {
      const snippets = searchResults[i].map(r => `• ${r.title}: ${r.snippet}`).join('\n');
      return `Search: "${q}"\n${snippets || '(no results)'}`;
    }).join('\n\n');

    // Pass 2: write final summary
    const pass2Prompt = `You are writing the final event listing for Artistry & Nerdery Live, a Denver/Boulder cultural event newsletter covering art, science, literature, and curiosity-driven events.

Here is what we know from the original post:
- Event: ${pass1.name || 'unknown'}
- Venue: ${pass1.venue || 'unknown'}
- Category: ${pass1.category || 'unknown'}
- Draft notes: ${pass1.draftSummary || ''}

Additional context from web searches:
${searchContext || '(no additional context found)'}

--- NAMING RULE ---
Named artists, scientists, authors, performers, or organizations from search results MUST appear in the summary by name. Never substitute generic descriptions for real names.

--- VOICE GUIDE ---
• VOICE: Smart and curious but not academic. The tone of a friend who knows things — informative without being a lecture.
• TONE: Specific and sensory where possible. No hype, no cheerleading ("you won't want to miss," "incredible," "amazing").
• STRUCTURE: 1-2 tight sentences. Lead with what makes this event worth noting.
• WORD CHOICE: Precise and vivid. Concrete nouns, specific details over adjectives.
• LENGTH: Hard cap at 200 characters.
• EM DASHES: always write em dashes with no spaces on either side — like this: "word—word" not "word — word".

EXAMPLE SUMMARIES:
- "James Turrell's light installation at DAM: walk-in, stand still, lose track of time."
- "Author of 'Hidden Figures' reads from the new book, signs copies, takes questions — history nerd paradise at BookBar."
- "Denver Astronomical Society opens the rooftop for Saturn opposition — bring a sweater, the view is worth it."

Return ONLY valid JSON (no markdown):
{
  "neighborhood": "corrected Denver/Boulder neighborhood based on venue from search, or original if no better info",
  "summary": "final 200-char-max summary — must use real names of any collaborators/artists found in search"
}`;

    const pass2Message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: pass2Prompt }],
    });

    const pass2Raw = pass2Message.content[0].type === 'text' ? pass2Message.content[0].text : '{}';
    const pass2Cleaned = pass2Raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const pass2 = JSON.parse(pass2Cleaned);

    return {
      name: pass1.name || '',
      venue: pass1.venue || '',
      neighborhood: pass2.neighborhood || pass1.neighborhood || '',
      dateStart: pass1.dateStart || '',
      dateEnd: pass1.dateEnd || '',
      startTime: pass1.startTime || '',
      emoji: pass1.emoji || '🎨',
      summary: (pass2.summary || pass1.draftSummary || '').substring(0, 200),
      category: pass1.category || 'Other',
      price: pass1.price || '',
      ticketUrl: pass1.ticketUrl || '',
      announcedAt: pass1.announcedAt || '',
      selloutRisk: (typeof pass1.selloutRisk === 'number' && pass1.selloutRisk >= 1 && pass1.selloutRisk <= 5)
        ? Math.round(pass1.selloutRisk) : null,
      isRecurring: pass1.isRecurring === true,
      recurrenceLabel: pass1.recurrenceLabel || '',
      instanceNote: (pass1.isRecurring && typeof pass1.occurrenceNote === 'string') ? pass1.occurrenceNote : '',
      specificDates: Array.isArray(pass1.specificDates)
        ? pass1.specificDates.filter((d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [],
    };
  }

  async redoArtEventAI(params: {
    name: string;
    venue: string;
    category: string;
    isRecurring: boolean;
    recurrenceLabel: string;
    dateStart: string;
    currentSummary: string;
    currentInstanceNote: string;
  }): Promise<{
    status: 'updated' | 'no-info';
    summary?: string;
    instanceNote?: string;
    message?: string;
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const { name, venue, category, isRecurring, recurrenceLabel, dateStart, currentSummary, currentInstanceNote } = params;

    const dateLabel = dateStart
      ? new Date(dateStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    const monthYear = dateStart
      ? new Date(dateStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';

    const searchQueries: string[] = [];
    if (name && venue) searchQueries.push(`"${name}" "${venue}" Denver`);
    else if (name) searchQueries.push(`"${name}" Denver event`);
    if (isRecurring && monthYear) {
      searchQueries.push(`"${name}" ${monthYear} Denver`);
      if (venue) searchQueries.push(`"${venue}" ${monthYear}`);
    } else if (monthYear && name) {
      searchQueries.push(`"${name}" ${monthYear}`);
    }

    const searchResults = await Promise.all(searchQueries.map(q => this.serperSearch(q, 4)));
    const searchContext = searchQueries.map((q, i) => {
      const snippets = searchResults[i].map(r => `• ${r.title}: ${r.snippet}`).join('\n');
      return `Search: "${q}"\n${snippets || '(no results)'}`;
    }).join('\n\n');

    const prompt = `You are improving an event listing for Artistry & Nerdery Live, a Denver/Boulder cultural event newsletter.

EVENT DETAILS:
- Name: ${name}
- Venue: ${venue}
- Category: ${category}
- Date: ${dateLabel || 'unknown'}
- Recurring: ${isRecurring ? `Yes — ${recurrenceLabel || 'recurring series'}` : 'No (one-time event)'}
- Current description: "${currentSummary || '(none yet)'}"
${isRecurring ? `- Current occurrence note: "${currentInstanceNote || '(none yet)'}"` : ''}

WEB SEARCH RESULTS:
${searchContext || '(no results found)'}

TASK A — IMPROVE THE DESCRIPTION:
Rewrite the description to be specific, sensory, and compelling. Max 200 chars.
Voice: smart and curious, not academic. Like a knowledgeable friend, not a press release.
No hype ("amazing," "incredible," "don't miss"). Lead with what makes this worth attending.
Use real names of performers/speakers/artists if found in search results.
If the current description is already excellent and nothing new was found, you may keep it as-is.

${isRecurring ? `TASK B — FIND OCCURRENCE-SPECIFIC DETAILS:
This is a recurring event. Look in the search results for specifics about THIS occurrence on ${dateLabel}:
- Who is speaking/performing/guesting this month
- What book/topic/theme is featured this time
- Any special guest or one-time element

If you found concrete details about THIS specific occurrence → put them in occurrenceNote (max 120 chars, e.g. "March: reading 'Tomorrow and Tomorrow' by Gabrielle Zevin").
If results only contain generic series info with nothing specific to this date → set occurrenceNote to null and noNewInfo to true.
If no search results at all → set occurrenceNote to null and noNewInfo to true.` : ''}

Return ONLY valid JSON (no markdown):
{
  "summary": "improved description max 200 chars",${isRecurring ? `
  "occurrenceNote": "specific detail for this date only max 120 chars, or null",
  "noNewInfo": true or false,
  "noNewInfoReason": "brief reason if noNewInfo is true, else empty string"` : `
  "noNewInfo": false`}
}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const result = JSON.parse(cleaned);

    if (isRecurring && result.noNewInfo) {
      return {
        status: 'no-info',
        summary: (result.summary || currentSummary || '').substring(0, 200),
        message: result.noNewInfoReason || 'No specific details for this occurrence found yet — check back closer to the date.',
      };
    }

    return {
      status: 'updated',
      summary: (result.summary || currentSummary || '').substring(0, 200),
      instanceNote: isRecurring ? (result.occurrenceNote || undefined) : undefined,
    };
  }

  async redoFoodEventAI(params: {
    name: string;
    venue: string;
    cuisine: string;
    dateStart: string;
    currentSummary: string;
  }): Promise<{ status: 'updated' | 'no-info'; summary?: string; message?: string }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const { name, venue, cuisine, dateStart, currentSummary } = params;

    const dateLabel = dateStart
      ? new Date(dateStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    const searchQueries: string[] = [];
    if (name && venue) searchQueries.push(`"${name}" "${venue}" Denver food popup`);
    else if (name) searchQueries.push(`"${name}" Denver food popup`);
    if (name) searchQueries.push(`"${name}" Denver ${cuisine}`);

    const searchResults = await Promise.all(searchQueries.map(q => this.serperSearch(q, 4)));
    const searchContext = searchQueries.map((q, i) => {
      const snippets = searchResults[i].map(r => `• ${r.title}: ${r.snippet}`).join('\n');
      return `Search: "${q}"\n${snippets || '(no results)'}`;
    }).join('\n\n');

    const hasResults = searchResults.some(r => r.length > 0);

    const prompt = `You are improving a food popup listing for Amuse Bouche Insider, a Denver foodie newsletter.

EVENT DETAILS:
- Name: ${name}
- Venue: ${venue}
- Cuisine: ${cuisine}
- Date: ${dateLabel || 'unknown'}
- Current description: "${currentSummary || '(none yet)'}"

WEB SEARCH RESULTS:
${searchContext || '(no results found)'}

TASK: Rewrite the description to be sensory, specific, and compelling. Max 200 chars.
Voice: like a knowledgeable food-obsessed friend — evocative but not breathless.
No hype ("amazing," "incredible," "don't miss"). Lead with what makes this worth eating.
Name the chef or collaborators if found in search results.
If the current description is already excellent and nothing new was found, improve the prose but keep the core content.

Return ONLY valid JSON (no markdown):
{
  "summary": "improved description max 200 chars",
  "noNewInfo": ${hasResults ? 'false' : 'true'}
}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const result = JSON.parse(cleaned);

    if (!hasResults && result.noNewInfo) {
      return {
        status: 'no-info',
        summary: (result.summary || currentSummary || '').substring(0, 200),
        message: 'No additional details found online yet — description polished.',
      };
    }

    return {
      status: 'updated',
      summary: (result.summary || currentSummary || '').substring(0, 200),
    };
  }

  private async fetchUrlText(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RestaurantBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return '';
      const html = await res.text();
      // Strip scripts, styles, and tags; collapse whitespace
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return text.substring(0, 6000);
    } catch {
      return '';
    }
  }

  async fillRestaurantAI(name: string, sourceUrl?: string): Promise<{
    emoji?: string;
    description?: string;
    cuisine?: string[];
    pricePoint?: string;
    neighborhood?: string;
    hotNew?: boolean;
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });

    // Places lookup — gets real street address for neighborhood detection
    const placeResult = await this.serperPlaces(`${name} Denver`);
    const verifiedAddress = placeResult?.address || '';
    const detectedNeighborhood = this.addressToNeighborhood(verifiedAddress);

    const searchQueries = [
      `${name} Denver specialties signature items`,
      `${name} Denver review eater infatuation best of`,
      `${name} Denver atmosphere experience`,
    ];

    // Fetch provided source URL (free — no Serper credits needed)
    let urlContent = '';
    if (sourceUrl?.trim()) {
      urlContent = await this.fetchUrlText(sourceUrl.trim());
    }

    const searchResults = await Promise.all(searchQueries.map(q => this.serperSearch(q, 4)));
    const searchContext = searchQueries.map((q, i) => {
      const snippets = searchResults[i].map(r => `• ${r.title}: ${r.snippet}`).join('\n');
      return `Search: "${q}"\n${snippets || '(no results)'}`;
    }).join('\n\n');

    const currentYear = new Date().getFullYear();

    const foodCuisineOptions = [
      'African','American','BBQ & Southern','British & Irish','Brunch & Breakfast','Chinese',
      'Colombian','Dessert & Pastry','Eastern European','Farm-to-Table','Filipino','French',
      'Fusion','German & Austrian','Hot Pot & Shabu','Indian & South Asian','Islander','Israeli','Italian','Japanese',
      'Jewish Deli','Korean','Mediterranean','Mexican & Latin','Pan Asian','Pan Latin','Pizza','Seafood','Small Plates',
      'Steakhouse','Sushi','Taiwanese','Tasting Menu','Thai & Southeast Asian','Vegan','Vietnamese','Other'
    ];
    const venueAttrOptions = ['Bar','Cafe','Dive','Cocktails','Beer','Wine','Coffee','Tea','Grocery & Market','Happy Hour','Patio'];

    const neighborhoodOptions = [
      'Aurora','Baker & South Broadway','Boulder','Capitol Hill & Uptown','Cherry Creek & Glendale','Downtown & LoDo',
      'DTC & Tech Center','Federal Blvd','Highlands & LoHi','Lakewood',"Sloan's Lake",'RiNo & Five Points',
      'Stapleton & Central Park','Sunnyside & Berkeley','University Hills','Wash Park & Platt Park','Westminster','Other'
    ];

    const neighborhoodMap = `Neighborhood mapping (use this to match what you know to the valid option):
- "Downtown & LoDo" = downtown Denver, LoDo, Union Station, Larimer Square, Wynkoop, Wazee, Blake St, Market St, 16th St Mall
- "RiNo & Five Points" = RiNo, River North, Five Points, Brighton Blvd, Welton St
- "Highlands & LoHi" = LoHi, Lower Highlands, Highland neighborhood, 32nd Ave, Platte St, Tennyson St (south end)
- "Sunnyside & Berkeley" = Sunnyside, Berkeley, Tennyson St (north), 38th Ave, 44th Ave
- "Federal Blvd" = Federal Blvd corridor, Federal Boulevard, Villa Park, Barnum, Harvey Park, West Denver Vietnamese corridor (Little Saigon), Morrison Rd
- "Baker & South Broadway" = Baker, South Broadway, S. Broadway, South Pearl St (lower end)
- "Capitol Hill & Uptown" = Capitol Hill, Uptown, Colfax Ave, 14th–18th Ave corridor, Congress Park
- "Cherry Creek & Glendale" = Cherry Creek, Cherry Creek North, Glendale, 2nd Ave, Fillmore St
- "University Hills" = University Hills, University of Denver area, Colorado Blvd south of Evans, Hampden Ave corridor, Harvard Gulch
- "Wash Park & Platt Park" = Washington Park, Wash Park, Platt Park, South Pearl St (upper end), Old South Pearl
- "Sloan's Lake" = Sloan's Lake, Edgewater, West 17th Ave corridor, West Colfax (inner)
- "Stapleton & Central Park" = Stapleton, Central Park, Northfield, East 29th Ave Town Center
- "DTC & Tech Center" = Denver Tech Center, Greenwood Village, Englewood, Centennial
- "Lakewood" = Lakewood, Belmar, Alameda Corridor west of Sheridan
- "Boulder" = Boulder, Pearl Street Mall, University Hill, The Hill
- "Aurora" = Aurora, Stapleton adjacent east, Fitzsimons, Buckingham Square area
- "Westminster" = Westminster, Broomfield adjacent south, Orchard Town Center, Sheridan Blvd corridor north of Denver`;

    const neighborhoodInstruction = detectedNeighborhood
      ? `NEIGHBORHOOD (CONFIRMED via Google Maps address "${verifiedAddress}"): "${detectedNeighborhood}" — use this exact value, do not change it.`
      : verifiedAddress
        ? `VERIFIED ADDRESS from Google Maps: "${verifiedAddress}"\n${neighborhoodMap}\nMatch the address to the correct neighborhood above. Only use "Other" if completely outside Denver metro.`
        : `NEIGHBORHOOD: Use your knowledge of where "${name}" is in Denver and match it to the correct option using this guide:\n${neighborhoodMap}\nIMPORTANT: "Other" is only for restaurants not covered by any of these areas. If you know the restaurant is in LoHi, RiNo, Wash Park, Capitol Hill, etc. — match it to the combined label above. Do not use "Other" as a fallback when you know the area.`;

    const prompt = `You are filling in a listing for "Best of Denver" — a curated guide for a foodie meetup group. Entries are not always restaurants: they can be bars, pubs, dive bars, specialty grocers, and markets worth knowing about.

RESTAURANT NAME: "${name}"

${neighborhoodInstruction}

${urlContent ? `SOURCE URL CONTENT (treat this as the primary ground truth — use chef names, dishes, and facts directly from here):
${urlContent}

` : ''}WEB SEARCH RESULTS:
${searchContext || '(no results found)'}

TASK: Based on the above, fill in all fields. Return valid JSON only (no markdown).

CUISINE TAGS — food-focused, pick 1–3: ${foodCuisineOptions.join(', ')}

VENUE ATTRIBUTES — pick any that apply (these are separate from cuisine tags, no limit):
- "Bar" = drinking is the primary draw — craft beer spots, whisky bars, British/Irish pubs, cocktail bars, neighborhood bars. Do NOT combine with "Dive".
- "Cafe" = coffee shop or café where sitting and working or lingering is the point — specialty coffee, neighborhood cafes, espresso bars with seating. NOT a restaurant that happens to serve coffee.
- "Dive" = unpretentious, no-frills bar with character — cash only, cheap drinks, sticky floors. Do NOT combine with "Bar".
- "Cocktails" = serious cocktail program — use for craft cocktail bars or alongside "Bar" if relevant.
- "Beer" = notable craft beer focus — brewery taprooms, bottle shops with taps, dedicated beer bars.
- "Wine" = wine-focused — wine bars, natural wine spots, wine shops with pour programs.
- "Coffee" = coffee-focused — specialty cafes, roasters with a cafe, espresso bars.
- "Tea" = tea-focused — tea houses, boba shops, matcha bars, tea rooms.
- "Grocery & Market" = specialty grocer, artisan market, food shop, cheese shop, butcher, wine shop. NOT a restaurant.
- "Happy Hour" = the place is known for a good happy hour deal.
- "Patio" = the place has a notable outdoor seating area — rooftop bar, patio, beer garden, parklet, or sidewalk seating worth mentioning. Apply this proactively; many Denver restaurants and bars have patios.
Valid venue attributes: ${venueAttrOptions.join(', ')}
If the entry is a bar, pub, or market — do NOT describe it as a restaurant. Write the description to match what the place actually is.

VALID NEIGHBORHOODS (pick exactly one): ${neighborhoodOptions.join(', ')}

VALID PRICE POINTS: $, $$, $$$, $$$$

DESCRIPTION — match the tone and density of these real examples exactly:

"James Beard Award 2022, Best Chef Mountain region. Chef Caroline Glover's heartfelt Aurora restaurant. Signatures: grilled beef tongue and marrow toast, roast chicken with bitter greens, ever-changing ice cream sandwiches. Boutique wine list and knockout cocktails seal the feel-good experience."

"One Michelin star. Intimate 18-seat restaurant. Multi-course tasting menu ($215/person) changes with the seasons. Vivacious, unpredictable courses—seared pork belly with rutabaga and apple, snapper with turnip and shiso, chocolate honeycomb with pomegranate pate de fruit."

"Three Michelin recognitions. Old-world Italian ingredients meet modernist touches—beaded tapioca crackers alongside classic tartare, eight-year-aged carnaroli risotto, Castelmagno cheese cheesecake. One of Denver's most consistently acclaimed Italian tables."

"The trendy spot with real culinary chops. Two Mercantile alums in a buzzy RiNo room. Serious technique under the surface. Best new in 2025."

WHAT MAKES THESE WORK: short declarative sentences, real dish names with specific sensory detail, a lead that hooks immediately (award/star/chef/angle), and a landing note on vibe or surprise. Pick 3–4 elements naturally — credentials, signature dishes, drink or format, vibe, unexpected angle, accolade — and weave them together. Do not follow a rigid order.

ACCOLADES ARE MANDATORY: If you know a restaurant has a Michelin star or Bib Gourmand, a James Beard award or nomination, or has been placed on a major national best-of list (Eater, Bon Appétit, NY Times, Food & Wine) — always include it. Always. These are the first things readers look for. Lead with the star if one exists: "One Michelin star." Do not bury or omit a credential you know to be true.

ACCURACY FIRST — THEN CONFIDENCE: Only include specific details (dish names, chef names, awards, origin stories, specific techniques, collaborators) when you are genuinely certain of them from your training data. If you recognize this restaurant and know real facts about it — use them directly and confidently. If you do NOT recognize the specific restaurant — do not invent plausible-sounding dishes, origin stories, or backstory to fill space. A shorter accurate description is far better than a longer fabricated one.

CRITICAL — DO NOT GUESS FROM THE NAME: Never infer cuisine type, menu items, or origin story from the restaurant's name. "BearLeek" does not mean the restaurant serves Eastern European food, leek dishes, or anything bear-related — it is simply a name. "Machete" does not mean Mexican food. "Osaka" does not mean Japanese. Look up what you actually know about the specific restaurant; if you don't know it, describe only what can be confirmed — format, vibe, price point — without inventing specific dishes.

CHEF NAMES — HIGH RISK: Only include a chef's name if you are 100% certain it belongs to THIS specific restaurant. Denver has many acclaimed chefs and it is easy to associate the wrong name with a restaurant. "Chef-driven" or "chef-led" is acceptable when you know the restaurant has serious culinary credentials but cannot confirm the exact name. A missing chef name is far better than a wrong one.

NEVER USE these hedging words or phrases: "likely," "probably," "appears to," "seems to," "expect," "presumably," "one would expect," "should offer," "may feature," "details remain," "scarce," "not much is known," "limited information," "promises," "concept." If you aren't certain of a specific dish name, describe the style and format directly — "Serious technique in a buzzy RiNo room" not "the menu likely features premium cuts."

EM DASHES: always write em dashes with no spaces on either side — like this: "word—word" not "word — word".

BANNED WORDS: amazing, incredible, vibrant, beloved, don't miss, must-try, hidden gem.

hotNew = true only if the restaurant opened in ${currentYear} or late ${currentYear - 1}

Return ONLY valid JSON:
{
  "emoji": "single most fitting emoji for this cuisine/vibe",
  "description": "300-400 char Eater-style description",
  "cuisine": ["FoodTag1", "FoodTag2"],
  "venueAttributes": ["Bar & Pub"],
  "pricePoint": "$$",
  "neighborhood": "one of the valid neighborhoods",
  "hotNew": false
}
"cuisine" = food-focused tags only (max 3). "venueAttributes" = venue type/attribute tags (any from the valid list above, or empty array).`;

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const result = JSON.parse(cleaned);

    console.log(`[fillRestaurantAI] Raw Claude response for "${name}":`, JSON.stringify(result));

    // Normalize cuisine tags — map fuzzy Claude responses to valid exact values
    const normMap: Record<string, string> = {
      'grocery': 'Grocery & Market',
      'market': 'Grocery & Market',
      'specialty market': 'Grocery & Market',
      'specialty grocery': 'Grocery & Market',
      'grocery store': 'Grocery & Market',
      'food market': 'Grocery & Market',
      'bar': 'Bar',
      'pub': 'Bar',
      'bar & pub': 'Bar',
      'bar and pub': 'Bar',
      'beer bar': 'Bar',
      'whisky bar': 'Bar',
      'whiskey bar': 'Bar',
      'cocktail bar': 'Bar',
      'dive bar': 'Dive',
      'dive': 'Dive',
      'cocktails & wine': 'Cocktails',
      'cocktails and wine': 'Cocktails',
      'cocktail': 'Cocktails',
      'wine bar': 'Wine',
      'craft beer': 'Beer',
      'beer garden': 'Patio',
      'bbq': 'BBQ & Southern',
      'southern': 'BBQ & Southern',
      'brunch': 'Brunch & Breakfast',
      'breakfast': 'Brunch & Breakfast',
      'happy hour': 'Happy Hour',
      'patio': 'Patio',
      'rooftop': 'Patio',
      'outdoor': 'Patio',
      'outdoor seating': 'Patio',
      'beer garden': 'Patio',
      'patio & outdoor': 'Patio',
    };
    const validFoodCuisines = new Set([
      'African','American','BBQ & Southern','British & Irish','Brunch & Breakfast','Chinese',
      'Colombian','Dessert & Pastry','Eastern European','Farm-to-Table','Filipino','French',
      'Fusion','German & Austrian','Hot Pot & Shabu','Indian & South Asian','Islander','Israeli','Italian','Japanese',
      'Jewish Deli','Korean','Mediterranean','Mexican & Latin','Pan Asian','Pan Latin','Pizza','Seafood','Small Plates',
      'Steakhouse','Sushi','Taiwanese','Tasting Menu','Thai & Southeast Asian','Vegan','Vietnamese','Other'
    ]);
    const validVenueAttrs = new Set(['Bar','Cafe','Dive','Cocktails','Beer','Wine','Coffee','Tea','Grocery & Market','Happy Hour','Patio']);
    const allValid = new Set([...validFoodCuisines, ...validVenueAttrs]);

    const normalize = (tags: string[], maxFood: number): string[] => {
      const mapped = tags.map(t => {
        if (allValid.has(t)) return t;
        return normMap[t.toLowerCase().trim()] || t;
      }).filter(t => allValid.has(t));
      const food = mapped.filter(t => validFoodCuisines.has(t)).slice(0, maxFood);
      const attrs = mapped.filter(t => validVenueAttrs.has(t));
      return [...food, ...attrs];
    };

    const rawCuisine = Array.isArray(result.cuisine) ? result.cuisine : [];
    const rawAttrs = Array.isArray(result.venueAttributes) ? result.venueAttributes : [];
    // Merge and normalize: food tags capped at 3, venue attrs uncapped
    const mergedRaw = [...rawCuisine, ...rawAttrs];
    const normalizedCuisine = normalize(mergedRaw, 3);
    console.log(`[fillRestaurantAI] Cuisine: raw=${JSON.stringify(mergedRaw)} → normalized=${JSON.stringify(normalizedCuisine)}`);
    console.log(`[fillRestaurantAI] Neighborhood: detected=${detectedNeighborhood} | claude=${result.neighborhood} → using=${detectedNeighborhood || result.neighborhood}`);

    return {
      emoji: result.emoji || undefined,
      description: result.description ? String(result.description).replace(/ — /g, '—').replace(/ – /g, '—').substring(0, 500) : undefined,
      cuisine: normalizedCuisine.length ? normalizedCuisine : undefined,
      pricePoint: result.pricePoint || undefined,
      // Use our deterministic address lookup if available — Claude can't override it
      neighborhood: detectedNeighborhood || result.neighborhood || undefined,
      hotNew: typeof result.hotNew === 'boolean' ? result.hotNew : false,
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
