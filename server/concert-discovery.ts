import { storage } from './storage';
import { LLMService } from './llm-service';

interface ConcertData {
  artist: string;
  venue: string;
  date: Date;
  source: string;
  ticketUrl?: string;
  description?: string;
  genre?: string;
}

export class ConcertDiscoveryService {
  private llmService: LLMService;
  private bandsintown_app_id: string;
  private ticketmaster_api_key: string;

  constructor() {
    this.llmService = new LLMService();
    this.bandsintown_app_id = process.env.BANDSINTOWN_APP_ID || '';
    this.ticketmaster_api_key = process.env.TICKETMASTER_API_KEY || '';
  }

  // Weekly automation - run every Monday
  async runWeeklyDiscovery(): Promise<void> {
    console.log('🔍 Starting weekly concert discovery...');

    const discoveredEvents: ConcertData[] = [];

    try {
      // 1. Get Oh My Rockness recommended shows
      console.log('📱 Checking Oh My Rockness...');
      const omrEvents = await this.getOhMyRocknessEvents();
      console.log(`Found ${omrEvents.length} events from Oh My Rockness`);
      discoveredEvents.push(...omrEvents);

      // 2. Search for trending artists from our existing database
      console.log('📊 Analyzing trending artists...');
      const trendingArtists = await this.getTrendingArtistsFromDatabase();
      console.log(`Found ${trendingArtists.length} trending artists: ${trendingArtists.slice(0, 5).join(', ')}`);
      
      const artistEvents = await this.searchArtistEvents(trendingArtists);
      console.log(`Found ${artistEvents.length} events from trending artists`);
      discoveredEvents.push(...artistEvents);

      // 3. Get local Denver venue events via Ticketmaster
      console.log('🎫 Checking Ticketmaster...');
      const denverEvents = await this.getDenverVenueEvents();
      console.log(`Found ${denverEvents.length} events from Ticketmaster`);
      discoveredEvents.push(...denverEvents);

      console.log(`📋 Total discovered events: ${discoveredEvents.length}`);

      // 4. Process and add events with AI enhancement
      if (discoveredEvents.length > 0) {
        await this.processAndAddEvents(discoveredEvents);
      } else {
        console.log('⚠️ No events discovered from any source');
      }

      console.log(`✅ Weekly discovery complete. Found ${discoveredEvents.length} potential events.`);
    } catch (error) {
      console.error('❌ Error during discovery:', error);
      throw error;
    }
  }

  // Scrape Oh My Rockness for recommended shows
  async getOhMyRocknessEvents(): Promise<ConcertData[]> {
    const events: ConcertData[] = [];
    const cities = [
      { url: 'https://www.ohmyrockness.com/', name: 'NYC' },
      { url: 'https://chicago.ohmyrockness.com/', name: 'Chicago' },
      { url: 'https://losangeles.ohmyrockness.com/', name: 'LA' }
    ];

    for (const city of cities) {
      try {
        console.log(`📱 Checking Oh My Rockness ${city.name}...`);

        // Try RSS first
        const rssEvents = await this.fetchOhMyRocknessRSS(city.url);
        if (rssEvents.length > 0) {
          events.push(...rssEvents);
          continue;
        }

        // Fallback to scraping main page
        const scrapedEvents = await this.scrapeOhMyRockness(city.url, city.name);
        events.push(...scrapedEvents);

      } catch (error) {
        console.error(`❌ Error fetching Oh My Rockness ${city.name}:`, error);
      }
    }

    return events;
  }

  // Try RSS feeds first
  async fetchOhMyRocknessRSS(baseUrl: string): Promise<ConcertData[]> {
    const rssUrls = [
      `${baseUrl}feed`,
      `${baseUrl}rss`,
      `${baseUrl}feeds/all.atom.xml`
    ];

    for (const rssUrl of rssUrls) {
      try {
        const response = await fetch(rssUrl);
        if (response.ok) {
          const rssText = await response.text();
          return this.parseOhMyRocknessRSS(rssText);
        }
      } catch (error) {
        // Continue to next RSS URL
      }
    }

    return [];
  }

  // Parse RSS content for concert data
  parseOhMyRocknessRSS(rssContent: string): ConcertData[] {
    const events: ConcertData[] = [];
    // Simple XML parsing without cheerio for now
    const items = rssContent.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    
    items.forEach((item: string) => {
      const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      
      if (titleMatch) {
        const title = titleMatch[1].trim();
        const description = descMatch?.[1]?.trim() || '';
        const pubDate = dateMatch?.[1]?.trim() || '';

        const event = this.parseOhMyRocknessTitle(title, description);
        if (event) {
          event.source = 'Oh My Rockness (RSS)';
          event.date = new Date(pubDate);
          events.push(event);
        }
      }
    });

    return events;
  }

  // Scrape main pages as fallback
  async scrapeOhMyRockness(url: string, cityName: string): Promise<ConcertData[]> {
    const events: ConcertData[] = [];

    try {
      const response = await fetch(url);
      const html = await response.text();
      
      // Simple regex-based extraction without cheerio
      const showMatches = html.match(/<div[^>]*class="[^"]*show[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];
      
      showMatches.forEach((showHtml: string) => {
        const artistMatch = showHtml.match(/<h[23][^>]*>(.*?)<\/h[23]>/i);
        const venueMatch = showHtml.match(/at\s+([^<\n]+)/i);
        const dateMatch = showHtml.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d+/i);

        if (artistMatch && venueMatch) {
          events.push({
            artist: artistMatch[1].replace(/<[^>]*>/g, '').trim(),
            venue: venueMatch[1].trim(),
            date: this.parseDate(dateMatch?.[0] || '') || new Date(),
            source: `Oh My Rockness ${cityName}`,
            description: showHtml.replace(/<[^>]*>/g, '').trim()
          });
        }
      });

    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
    }

    return events;
  }

  // Parse Oh My Rockness titles to extract artist/venue
  parseOhMyRocknessTitle(title: string, description: string): ConcertData | null {
    // Common formats:
    // "Artist at Venue"
    // "Artist @ Venue" 
    // "Artist - Venue"
    const patterns = [
      /(.+?)\s+at\s+(.+)/i,
      /(.+?)\s+@\s+(.+)/i,
      /(.+?)\s+-\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return {
          artist: match[1].trim(),
          venue: match[2].trim(),
          date: new Date(),
          source: 'Oh My Rockness',
          description
        };
      }
    }

    return null;
  }

  // Get trending artists from our database (most upvoted recently)
  async getTrendingArtistsFromDatabase(): Promise<string[]> {
    try {
      // Get artists with most upvotes in last 30 days
      const recentEvents = await storage.getAllEvents();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const filteredEvents = recentEvents.filter((event: any) => 
        new Date(event.date) >= thirtyDaysAgo
      ).slice(0, 50);

      const artistVotes = new Map<string, number>();
      filteredEvents.forEach((event: any) => {
        const current = artistVotes.get(event.artist) || 0;
        artistVotes.set(event.artist, current + event.upvotes);
      });

      // Return top 20 trending artists
      return Array.from(artistVotes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([artist]) => artist);

    } catch (error) {
      console.error('Error getting trending artists:', error);
      return [];
    }
  }

  // Search Bandsintown for specific artists
  async searchArtistEvents(artists: string[]): Promise<ConcertData[]> {
    if (!this.bandsintown_app_id) {
      console.warn('No Bandsintown API key found');
      return [];
    }

    const events: ConcertData[] = [];

    for (const artist of artists) {
      try {
        const response = await fetch(
          `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?app_id=${this.bandsintown_app_id}&date=upcoming`
        );

        if (response.ok) {
          const bandEvents = await response.json();
          
          for (const event of bandEvents) {
            // Only include Denver/Colorado area events
            const venue = event.venue;
            if (this.isDenverArea(venue.city, venue.region)) {
              events.push({
                artist: artist,
                venue: venue.name,
                date: new Date(event.datetime),
                source: 'Bandsintown',
                ticketUrl: event.offers?.[0]?.url,
                description: event.description
              });
            }
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error fetching events for ${artist}:`, error);
      }
    }

    return events;
  }

  // Get Denver venue events via Ticketmaster
  async getDenverVenueEvents(): Promise<ConcertData[]> {
    if (!this.ticketmaster_api_key) {
      console.warn('No Ticketmaster API key found');
      return [];
    }

    const events: ConcertData[] = [];
    const denverVenues = [
      'Red Rocks Amphitheatre', 'Mission Ballroom', 'Fillmore Auditorium', 
      'Ogden Theatre', 'Gothic Theatre', 'Fox Theatre', 'Ball Arena'
    ];

    try {
      // Search for events in Denver metro area
      const response = await fetch(
        `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${this.ticketmaster_api_key}&city=Denver&stateCode=CO&size=100&sort=date,asc`
      );

      if (response.ok) {
        const data = await response.json();
        
        for (const event of data._embedded?.events || []) {
          const venue = event._embedded?.venues?.[0];
          if (venue && this.isDenverArea(venue.city?.name, venue.state?.stateCode)) {
            events.push({
              artist: event.name,
              venue: venue.name,
              date: new Date(event.dates?.start?.localDate),
              source: 'Ticketmaster',
              ticketUrl: event.url,
              genre: event.classifications?.[0]?.genre?.name
            });
          }
        }
      }

    } catch (error) {
      console.error('Error fetching Ticketmaster events:', error);
    }

    return events;
  }

  // Check if location is Denver area
  isDenverArea(city: string, state: string): boolean {
    const denverCities = [
      'denver', 'boulder', 'fort collins', 'colorado springs', 
      'arvada', 'westminster', 'thornton', 'lakewood', 'morrison'
    ];
    
    return state?.toLowerCase() === 'co' || state?.toLowerCase() === 'colorado' ||
           denverCities.some(denverCity => 
             city?.toLowerCase().includes(denverCity)
           );
  }

  // Process discovered events with AI enhancement
  async processAndAddEvents(discoveredEvents: ConcertData[]): Promise<void> {
    console.log(`🤖 Processing ${discoveredEvents.length} discovered events with AI...`);

    for (const event of discoveredEvents) {
      try {
        // Check if event already exists
        const exists = await this.eventExists(event);
        if (exists) {
          console.log(`⏭️  Skipping existing event: ${event.artist} at ${event.venue}`);
          continue;
        }

        // Enhance with AI analysis
        console.log(`🔮 Analyzing ${event.artist}...`);
        const aiAnalysis = await this.llmService.analyzeArtist(event.artist);

        // Create event with AI-enhanced data
        const enhancedEvent = {
          artist: event.artist,
          venue: event.venue,
          date: event.date,
          emoji: aiAnalysis.emoji,
          summary: aiAnalysis.summary,
          soundsLike: aiAnalysis.soundsLike,
          genre: aiAnalysis.genre || event.genre || 'Rock & Alternative',
          upvotes: 0,
          isScheduled: false,
          requester: 'Auto-Discovery',
          source: event.source,
          ticketUrl: event.ticketUrl
        };

        // Add to database
        await storage.createEvent(enhancedEvent);
        console.log(`✅ Added: ${event.artist} at ${event.venue} on ${event.date.toDateString()}`);

        // Rate limiting for AI calls
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing event ${event.artist}:`, error);
      }
    }
  }

  // Check if event already exists in database
  async eventExists(event: ConcertData): Promise<boolean> {
    try {
      const allEvents = await storage.getAllEvents();
      const dayBefore = new Date(event.date.getTime() - 24 * 60 * 60 * 1000);
      const dayAfter = new Date(event.date.getTime() + 24 * 60 * 60 * 1000);
      
      const existingEvents = allEvents.filter((existing: any) => {
        const existingDate = new Date(existing.date);
        return existing.artist.toLowerCase() === event.artist.toLowerCase() &&
               existing.venue.toLowerCase() === event.venue.toLowerCase() &&
               existingDate >= dayBefore && existingDate <= dayAfter;
      });

      return existingEvents.length > 0;
    } catch (error) {
      console.error('Error checking if event exists:', error);
      return false;
    }
  }

  // Utility function to parse various date formats
  parseDate(dateString: string): Date | null {
    if (!dateString) return null;

    try {
      // Try various date formats
      const patterns = [
        /(\w+)\s+(\d+)/i, // "Jan 15", "March 3"
        /(\d+)\/(\d+)\/(\d+)/i, // "1/15/2025"
        /(\d+)-(\d+)-(\d+)/i, // "2025-01-15"
      ];

      for (const pattern of patterns) {
        const match = dateString.match(pattern);
        if (match) {
          const parsed = new Date(dateString);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
      }

      return new Date(dateString);
    } catch {
      return null;
    }
  }
}

export const concertDiscovery = new ConcertDiscoveryService();