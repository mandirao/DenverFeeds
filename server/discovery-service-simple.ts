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
      // Search for upcoming shows using the existing LLM service
      const searchResults = await llmService.searchUpcomingShows(artist.name);
      
      if (searchResults.length === 0) {
        console.log(`   No events found for ${artist.name}`);
        return;
      }

      // Look for Denver-related results
      const denverResults = searchResults.filter(result => {
        const text = `${result.title} ${result.snippet}`.toLowerCase();
        return text.includes('denver') || text.includes('colorado') || 
               text.includes('red rocks') || text.includes('mission ballroom') ||
               text.includes('boulder') || text.includes('fort collins');
      });

      if (denverResults.length === 0) {
        console.log(`   No Denver area events found for ${artist.name}`);
        return;
      }

      this.currentStats.eventsFound += denverResults.length;
      console.log(`   Found ${denverResults.length} potential Denver events for ${artist.name}`);

      // Use AI to analyze artist and generate event
      const artistAnalysis = await llmService.analyzeArtist(artist.name);
      
      if (dryRun) {
        console.log(`   🔍 [DRY RUN] Would add event for ${artist.name} based on search results`);
        this.currentStats.newEventsAdded++;
        return;
      }

      // Check if we already have a recent event for this artist
      const isDuplicate = await storage.checkDuplicateEvent({
        emoji: artistAnalysis.emoji,
        artist: artist.name,
        venue: artistAnalysis.suggestedVenue || 'TBD Venue',
        date: new Date(artistAnalysis.suggestedDate || '2025-06-01'),
        summary: artistAnalysis.summary,
        soundsLike: artistAnalysis.soundsLike,
        genre: artistAnalysis.genre,
        requester: 'Automated Discovery'
      });

      if (isDuplicate) {
        console.log(`   ⚠️  Similar event already exists for ${artist.name}`);
        return;
      }

      // Create the event
      await storage.createEvent({
        emoji: artistAnalysis.emoji,
        artist: artist.name,
        venue: artistAnalysis.suggestedVenue || 'TBD Venue',
        date: new Date(artistAnalysis.suggestedDate || '2025-06-01'),
        summary: artistAnalysis.summary,
        soundsLike: artistAnalysis.soundsLike,
        genre: artistAnalysis.genre,
        requester: 'Automated Discovery'
      });
      
      // Update artist's last found event timestamp
      await storage.updateArtist(artist.id, { lastFoundEvent: new Date() });
      
      this.currentStats.newEventsAdded++;
      console.log(`   ✅ Added event: ${artist.name} at ${artistAnalysis.suggestedVenue} on ${artistAnalysis.suggestedDate}`);

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