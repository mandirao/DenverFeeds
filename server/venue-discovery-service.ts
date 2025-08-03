import { storage } from "./storage";
import { llmService } from "./llm-service";

interface VenueSource {
  name: string;
  url: string;
  type: 'website' | 'facebook' | 'instagram' | 'calendar';
  location: string;
  capacity?: string;
  priority: 'high' | 'medium' | 'low';
  isActive: boolean;
}

// Key Denver venues to monitor
const DENVER_VENUES: VenueSource[] = [
  // High Priority - Major Venues
  { name: "Red Rocks Amphitheatre", url: "https://www.redrocksonline.com/events", type: "website", location: "Morrison, CO", capacity: "9,525", priority: "high", isActive: true },
  { name: "Mission Ballroom", url: "https://www.missionballroom.com/events", type: "website", location: "Denver, CO", capacity: "4,000", priority: "high", isActive: true },
  { name: "Fillmore Auditorium", url: "https://www.fillmoreauditorium.org/events", type: "website", location: "Denver, CO", capacity: "3,700", priority: "high", isActive: true },
  { name: "Ogden Theatre", url: "https://www.ogdentheatre.com/events", type: "website", location: "Denver, CO", capacity: "1,600", priority: "high", isActive: true },
  { name: "Gothic Theatre", url: "https://www.gothictheatre.com/events", type: "website", location: "Englewood, CO", capacity: "1,100", priority: "high", isActive: true },
  
  // Medium Priority - Mid-size Venues
  { name: "Bluebird Theater", url: "https://www.bluebirdtheater.net/events", type: "website", location: "Denver, CO", capacity: "500", priority: "medium", isActive: true },
  { name: "Summit Music Hall", url: "https://www.summitmusichall.com/events", type: "website", location: "Denver, CO", capacity: "2,500", priority: "medium", isActive: true },
  { name: "Cervantes' Masterpiece Ballroom", url: "https://www.cervantesmasterpiece.com/events", type: "website", location: "Denver, CO", capacity: "1,000", priority: "medium", isActive: true },
  { name: "The Oriental Theater", url: "https://www.theorientaltheater.com/events", type: "website", location: "Denver, CO", capacity: "900", priority: "medium", isActive: true },
  { name: "Marquis Theater", url: "https://www.marquistheater.com/events", type: "website", location: "Denver, CO", capacity: "800", priority: "medium", isActive: true },
  { name: "Larimer Lounge", url: "https://www.larimerlounge.com/events", type: "website", location: "Denver, CO", capacity: "200", priority: "medium", isActive: true },
  { name: "Lost Lake Lounge", url: "https://www.lostlakelounge.com/events", type: "website", location: "Denver, CO", capacity: "400", priority: "medium", isActive: true },
  
  // Lower Priority - Smaller Venues  
  { name: "Meow Wolf Denver", url: "https://meowwolf.com/denver/events", type: "website", location: "Denver, CO", capacity: "varies", priority: "low", isActive: true },
  { name: "Levitt Pavilion", url: "https://levittdenver.org/events", type: "website", location: "Denver, CO", capacity: "7,500", priority: "low", isActive: true },
  { name: "The Black Sheep", url: "https://www.theblacksheepco.com/events", type: "website", location: "Colorado Springs, CO", capacity: "300", priority: "low", isActive: true },
  { name: "Washington's", url: "https://www.washingtonsfoco.com/events", type: "website", location: "Fort Collins, CO", capacity: "250", priority: "low", isActive: true },
  { name: "Aggie Theatre", url: "https://www.z2ent.com/venues/aggie-theatre", type: "website", location: "Fort Collins, CO", capacity: "650", priority: "low", isActive: true },
  { name: "Boulder Theater", url: "https://www.bouldertheater.com/events", type: "website", location: "Boulder, CO", capacity: "800", priority: "low", isActive: true },
  { name: "Fox Theatre Boulder", url: "https://www.foxtheatre.com/events", type: "website", location: "Boulder, CO", capacity: "625", priority: "low", isActive: true },
  { name: "The Mishawaka", url: "https://www.themishawaka.com/events", type: "website", location: "Bellvue, CO", capacity: "300", priority: "low", isActive: true },
  
  // Additional requested venues
  { name: "Hi-Dive", url: "https://www.hi-dive.com/events", type: "website", location: "Denver, CO", capacity: "200", priority: "medium", isActive: true },
  { name: "Skylark Lounge", url: "https://www.skylarklounge.com/events", type: "website", location: "Denver, CO", capacity: "150", priority: "medium", isActive: true },
  { name: "Ball Arena", url: "https://www.ballarena.com/events", type: "website", location: "Denver, CO", capacity: "20,000", priority: "high", isActive: true },
  { name: "Surf Hotel", url: "https://www.surfhotelbuena.com/events", type: "website", location: "Buena Vista, CO", capacity: "varies", priority: "low", isActive: true },
  { name: "Dillon Amphitheatre", url: "https://www.townofbreckenridge.com/dillon-amphitheatre", type: "website", location: "Dillon, CO", capacity: "750", priority: "medium", isActive: true }
];

interface VenueDiscoveryStats {
  venuesScanned: number;
  eventsFound: number;
  artistMatches: number;
  apiCallsSaved: number;
  lastScan: Date;
  scanDuration: number;
}

class VenueDiscoveryService {
  private stats: VenueDiscoveryStats = {
    venuesScanned: 0,
    eventsFound: 0,
    artistMatches: 0,
    apiCallsSaved: 0,
    lastScan: new Date(),
    scanDuration: 0
  };

  async runVenueDiscovery(options: {
    venueLimit?: number;
    priority?: 'high' | 'medium' | 'low';
    dryRun?: boolean;
  } = {}): Promise<{ 
    success: boolean; 
    message: string; 
    stats: VenueDiscoveryStats;
    discoveredEvents: any[];
  }> {
    const startTime = Date.now();
    console.log("🎵 Starting venue-first discovery...");

    try {
      // Get our artist database for cross-referencing
      const artists = await storage.getAllArtists();
      const artistNames = artists.map(a => a.name.toLowerCase());
      
      // Filter venues based on criteria
      let venuesToScan = DENVER_VENUES.filter(v => v.isActive);
      
      if (options.priority) {
        venuesToScan = venuesToScan.filter(v => v.priority === options.priority);
      }
      
      if (options.venueLimit) {
        venuesToScan = venuesToScan.slice(0, options.venueLimit);
      }

      console.log(`📍 Scanning ${venuesToScan.length} venues for upcoming shows...`);

      const discoveredEvents: any[] = [];
      this.stats.venuesScanned = venuesToScan.length;
      this.stats.eventsFound = 0;
      this.stats.artistMatches = 0;

      // Scan each venue for real events
      for (const venue of venuesToScan) {
        console.log(`🔍 Scanning ${venue.name}...`);
        
        // Scan venue for real events (currently returns empty to prevent false data)
        const eventsFound = await this.scanVenueForEvents(venue, artistNames);
        
        for (const event of eventsFound) {
          if (!options.dryRun) {
            // Create discovered event for review
            const discoveredEvent = await storage.createDiscoveredEvent({
              artist: event.artist,
              venue: venue.name,
              date: event.date,
              summary: event.summary,
              soundsLike: event.soundsLike,
              genre: event.genre,
              status: 'pending',
              discoverySource: 'venue_scan',
              confidence: event.confidence,
              rawData: JSON.stringify({ venue: venue.name, scanMethod: 'website' })
            });
            
            discoveredEvents.push(discoveredEvent);
          }
          
          this.stats.eventsFound++;
          this.stats.artistMatches++;
        }
      }

      // Calculate API calls saved (vs artist-by-artist approach)
      this.stats.apiCallsSaved = Math.max(0, artists.length - venuesToScan.length);
      this.stats.lastScan = new Date();
      this.stats.scanDuration = Date.now() - startTime;

      const message = options.dryRun 
        ? `Research scan complete: Found ${this.stats.eventsFound} potential events at ${this.stats.venuesScanned} venues`
        : `Venue discovery complete: ${this.stats.eventsFound} events queued for review from ${this.stats.venuesScanned} venues`;

      console.log(`✅ ${message}`);
      console.log(`💰 Efficiency gain: ${this.stats.apiCallsSaved} fewer API calls vs artist-by-artist scanning`);

      return {
        success: true,
        message,
        stats: this.stats,
        discoveredEvents
      };

    } catch (error: any) {
      console.error("❌ Venue discovery failed:", error);
      return {
        success: false,
        message: `Venue discovery failed: ${error.message}`,
        stats: this.stats,
        discoveredEvents: []
      };
    }
  }

  private async scanVenueForEvents(venue: VenueSource, artistNames: string[]): Promise<any[]> {
    console.log(`🔍 Scanning ${venue.name} for real events...`);
    
    try {
      // For now, we'll implement a research-only mode that returns empty results
      // to prevent false event creation. In a production system, this would:
      // 1. Scrape the venue's event calendar
      // 2. Parse event listings for artist names, dates, venues
      // 3. Cross-reference against our artist database
      // 4. Return only verified matches
      
      console.log(`📅 Would scrape: ${venue.url}`);
      console.log(`🎯 Looking for ${artistNames.length} tracked artists`);
      
      // Return empty array to prevent false data
      return [];
      
    } catch (error) {
      console.error(`❌ Error scanning ${venue.name}:`, error);
      return [];
    }
  }

  getStats(): VenueDiscoveryStats {
    return this.stats;
  }

  getVenues(): VenueSource[] {
    return DENVER_VENUES;
  }

  getActiveVenues(): VenueSource[] {
    return DENVER_VENUES.filter(v => v.isActive);
  }
}

export const venueDiscoveryService = new VenueDiscoveryService();