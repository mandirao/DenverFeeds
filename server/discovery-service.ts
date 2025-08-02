import { storage } from './storage';
import { llmService } from './llm-service';
import type { Artist, InsertEvent } from '@shared/schema';

interface EventSearchResult {
  artist: string;
  venue: string;
  date: string;
  source: string;
  confidence: number;
}

interface DiscoveryStats {
  artistsSearched: number;
  eventsFound: number;
  newEventsAdded: number;
  errors: number;
  duration: number;
}

class EventDiscoveryService {
  private isRunning = false;
  private currentStats: DiscoveryStats = {
    artistsSearched: 0,
    eventsFound: 0,
    newEventsAdded: 0,
    errors: 0,
    duration: 0
  };

  // Denver area venues to help validate searches
  private denverVenues = [
    'Red Rocks Amphitheatre', 'Ball Arena', 'Pepsi Center', 'Paramount Theatre',
    'Ogden Theatre', 'Bluebird Theater', 'Gothic Theatre', 'Cervantes Masterpiece',
    'Cervantes Other Side', 'Hi-Dive', 'Lost Lake', 'Larimer Lounge',
    'Globe Hall', 'Summit Music Hall', 'Boulder Theater', 'Fox Theatre',
    'Aggie Theatre', 'Washington Park', 'Fiddlers Green Amphitheatre',
    'Mission Ballroom', 'National Ballroom', 'Meow Wolf Denver', 
    'Sculpture Park', 'Denver Botanic Gardens', 'Great Divide Brewing',
    'Number Thirty Eight', 'Your Mom\'s House', 'Ophelia\'s Electric Soapbox'
  ];

  async runDiscovery(options: {
    priority?: 'high' | 'medium' | 'low';
    limit?: number;
    dryRun?: boolean;
  } = {}): Promise<DiscoveryStats> {
    
    if (this.isRunning) {
      throw new Error('Discovery already running');
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    this.currentStats = {
      artistsSearched: 0,
      eventsFound: 0,
      newEventsAdded: 0,
      errors: 0,
      duration: 0
    };

    console.log('🔍 Starting automated event discovery...');
    console.log(`Options: priority=${options.priority || 'all'}, limit=${options.limit || 50}, dryRun=${options.dryRun || false}`);

    try {
      // Get artists to search for
      const artists = await storage.getArtistsForSearch(options.priority, options.limit);
      console.log(`Found ${artists.length} artists to search`);

      // Search for events for each artist
      for (const artist of artists) {
        try {
          await this.searchArtistEvents(artist, options.dryRun);
          this.currentStats.artistsSearched++;
          
          // Update artist search timestamp
          if (!options.dryRun) {
            await storage.updateArtistSearchDate(artist.id);
          }

          // Add small delay to avoid rate limiting
          await this.delay(1000);

        } catch (error) {
          console.error(`Error searching for ${artist.name}:`, error);
          this.currentStats.errors++;
        }
      }

      this.currentStats.duration = Date.now() - startTime;
      
      console.log('🎉 Discovery complete!');
      console.log(`Stats: ${this.currentStats.artistsSearched} artists searched, ${this.currentStats.eventsFound} events found, ${this.currentStats.newEventsAdded} new events added`);
      
      return { ...this.currentStats };

    } catch (error) {
      console.error('Discovery failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async searchArtistEvents(artist: Artist, dryRun = false): Promise<void> {
    console.log(`🎵 Searching for ${artist.name} events...`);

    try {
      // Search for artist tour dates and Denver shows
      const searchResults = await this.searchForTourDates(artist.name);
      
      if (searchResults.length === 0) {
        console.log(`   No events found for ${artist.name}`);
        return;
      }

      this.currentStats.eventsFound += searchResults.length;
      console.log(`   Found ${searchResults.length} potential events for ${artist.name}`);

      // Process each search result
      for (const result of searchResults) {
        if (await this.isDenverAreaEvent(result)) {
          await this.processEvent(result, artist, dryRun);
        }
      }

    } catch (error) {
      console.error(`Failed to search events for ${artist.name}:`, error);
      throw error;
    }
  }

  private async searchForTourDates(artistName: string): Promise<EventSearchResult[]> {
    // Use the LLM service to search for tour dates
    const searchQuery = `${artistName} tour dates Denver Colorado 2025 concerts upcoming shows`;
    
    try {
      const searchResults = await llmService.searchWeb(searchQuery);
      
      // Parse search results to extract event information
      const events = await this.parseSearchResults(artistName, searchResults);
      return events;
      
    } catch (error) {
      console.error(`Web search failed for ${artistName}:`, error);
      return [];
    }
  }

  private async parseSearchResults(artistName: string, searchResults: string): Promise<EventSearchResult[]> {
    // Use AI to parse the search results and extract Denver-area events
    const prompt = `
Analyze these search results for ${artistName} tour dates and extract any Denver-area concerts.
Look for events in Denver, Boulder, Fort Collins, or nearby Colorado venues.

Search Results:
${searchResults}

Return a JSON array of events with this structure:
[
  {
    "artist": "Artist Name",
    "venue": "Venue Name", 
    "date": "YYYY-MM-DD",
    "source": "source_website",
    "confidence": 0.8
  }
]

Only include events with dates in 2025 or later. Set confidence based on how certain you are about the details.
If no Denver-area events found, return an empty array [].
`;

    try {
      const response = await llmService.analyzeContent(prompt);
      const events = JSON.parse(response);
      
      return Array.isArray(events) ? events : [];
    } catch (error) {
      console.error(`Failed to parse search results for ${artistName}:`, error);
      return [];
    }
  }

  private async isDenverAreaEvent(event: EventSearchResult): Promise<boolean> {
    // Check if venue is in our known Denver venues list
    const isKnownVenue = this.denverVenues.some(venue => 
      venue.toLowerCase().includes(event.venue.toLowerCase()) ||
      event.venue.toLowerCase().includes(venue.toLowerCase())
    );

    if (isKnownVenue) return true;

    // Check if venue name suggests Denver area
    const denverKeywords = ['denver', 'boulder', 'colorado', 'co ', 'arvada', 'lakewood', 'aurora', 'fort collins'];
    return denverKeywords.some(keyword => 
      event.venue.toLowerCase().includes(keyword)
    );
  }

  private async processEvent(eventResult: EventSearchResult, artist: Artist, dryRun = false): Promise<void> {
    try {
      // Check if event already exists
      const isDuplicate = await storage.checkDuplicateEvent({
        artist: eventResult.artist,
        venue: eventResult.venue,
        date: new Date(eventResult.date),
        summary: `${eventResult.artist} live at ${eventResult.venue}`,
        soundsLike: '',
        genre: artist.genre || 'To Be Determined',
        requester: 'Automated Discovery'
      });

      if (isDuplicate) {
        console.log(`   ⚠️  Event already exists: ${eventResult.artist} at ${eventResult.venue} on ${eventResult.date}`);
        return;
      }

      if (dryRun) {
        console.log(`   🔍 [DRY RUN] Would add: ${eventResult.artist} at ${eventResult.venue} on ${eventResult.date}`);
        this.currentStats.newEventsAdded++;
        return;
      }

      // Use AI to generate event details
      const eventDetails = await this.generateEventDetails(eventResult, artist);
      
      // Create the event
      await storage.createEvent(eventDetails);
      
      // Update artist's last found event timestamp
      await storage.updateArtist(artist.id, { lastFoundEvent: new Date() });
      
      this.currentStats.newEventsAdded++;
      console.log(`   ✅ Added event: ${eventResult.artist} at ${eventResult.venue} on ${eventResult.date}`);

    } catch (error) {
      console.error(`Failed to process event for ${eventResult.artist}:`, error);
      this.currentStats.errors++;
    }
  }

  private async generateEventDetails(eventResult: EventSearchResult, artist: Artist): Promise<InsertEvent> {
    // Use AI to generate a compelling event summary and sounds-like
    const prompt = `
Generate event details for this concert in the casual cool style of Oh My Rockness and Pitchfork:

Artist: ${eventResult.artist}
Venue: ${eventResult.venue}
Date: ${eventResult.date}
Genre: ${artist.genre || 'Alternative'}

Provide:
1. A compelling 75-character summary that captures the artist's vibe
2. Two artists they sound like (comma-separated, no "and" or "&")

Be confident but not exaggerated. Use relatable descriptions.
Return JSON: {"summary": "...", "soundsLike": "Artist One, Artist Two"}
`;

    try {
      const response = await llmService.analyzeContent(prompt);
      const details = JSON.parse(response);
      
      return {
        artist: eventResult.artist,
        venue: eventResult.venue,
        date: new Date(eventResult.date),
        summary: details.summary || `${eventResult.artist} live at ${eventResult.venue}`,
        soundsLike: details.soundsLike || 'To Be Determined, TBD',
        genre: artist.genre || 'To Be Determined',
        requester: 'Automated Discovery'
      };
      
    } catch (error) {
      console.error('Failed to generate event details:', error);
      
      // Fallback to basic details
      return {
        artist: eventResult.artist,
        venue: eventResult.venue,
        date: new Date(eventResult.date),
        summary: `${eventResult.artist} live at ${eventResult.venue}`,
        soundsLike: 'To Be Determined, TBD',
        genre: artist.genre || 'To Be Determined',
        requester: 'Automated Discovery'
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): DiscoveryStats {
    return { ...this.currentStats };
  }

  isDiscoveryRunning(): boolean {
    return this.isRunning;
  }
}

export const discoveryService = new EventDiscoveryService();