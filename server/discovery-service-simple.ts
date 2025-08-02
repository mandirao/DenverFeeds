import { storage } from './storage';
import { llmService } from './llm-service';
import type { Artist, InsertEvent } from '@shared/schema';

interface DiscoveryStats {
  artistsSearched: number;
  eventsFound: number;
  newEventsAdded: number;
  errors: number;
  duration: number;
}

class SimpleEventDiscoveryService {
  private isRunning = false;
  private currentStats: DiscoveryStats = {
    artistsSearched: 0,
    eventsFound: 0,
    newEventsAdded: 0,
    errors: 0,
    duration: 0
  };

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
    console.log(`Options: priority=${options.priority || 'all'}, limit=${options.limit || 10}, dryRun=${options.dryRun || false}`);

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
          await this.delay(2000);

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
      // Use the improved AI analysis that validates real tour data
      const artistAnalysis = await llmService.analyzeArtist(artist.name);
      
      // Only create events if we have valid venue and date information
      if (!artistAnalysis.suggestedVenue || !artistAnalysis.suggestedDate) {
        console.log(`   No confirmed shows found for ${artist.name}`);
        return;
      }

      // Check if the suggested venue is actually a Denver area venue
      const denverVenues = [
        'Red Rocks Amphitheatre', 'Mission Ballroom', 'Fillmore Auditorium', 'Ogden Theatre',
        'Gothic Theatre', 'Fox Theatre', 'Paramount Theatre', 'Ball Arena', 'Bluebird Theater',
        'Oriental Theater', 'Hi-Dive', 'Globe Hall', 'Larimer Lounge', 'Lost Lake Lounge',
        'Summit Music Hall', 'Marquis Theater'
      ];

      if (!denverVenues.some(venue => venue.toLowerCase() === artistAnalysis.suggestedVenue?.toLowerCase())) {
        console.log(`   No Denver area venue found for ${artist.name} (suggested: ${artistAnalysis.suggestedVenue})`);
        return;
      }

      this.currentStats.eventsFound++;
      console.log(`   ⚠️  DISCOVERY NEEDS MANUAL REVIEW: ${artist.name} at ${artistAnalysis.suggestedVenue} on ${artistAnalysis.suggestedDate}`);
      console.log(`   📝 Summary: ${artistAnalysis.summary}`);
      console.log(`   🎵 Sounds like: ${artistAnalysis.soundsLike}`);

      if (dryRun) {
        console.log(`   🔍 [DRY RUN] Would require manual review: ${artist.name} at ${artistAnalysis.suggestedVenue} on ${artistAnalysis.suggestedDate}`);
        this.currentStats.newEventsAdded++;
        return;
      }

      // For now, don't auto-create events due to data accuracy issues
      // Store findings for manual review instead
      console.log(`   🚫 AUTO-CREATION DISABLED: Events require manual verification to prevent false information`);
      console.log(`   💡 Suggestion: Use Add Show form to manually verify and add this event if it exists`);
      
      // Don't increment newEventsAdded since we're not creating anything
      // this.currentStats.newEventsAdded++;

    } catch (error) {
      console.error(`Failed to search events for ${artist.name}:`, error);
      this.currentStats.errors++;
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

export const discoveryService = new SimpleEventDiscoveryService();