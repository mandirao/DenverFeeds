import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { storage } from "./storage";
import { llmService } from "./llm-service";

interface DiscoveredArtist {
  name: string;
  genre: string;
  source: 'pitchfork' | 'oh_my_rockness';
  description?: string;
  albumTitle?: string;
  rating?: number;
  url?: string;
}

interface ArtistDiscoveryStats {
  artistsFound: number;
  newArtistsAdded: number;
  duplicatesSkipped: number;
  errors: number;
  lastScan: Date;
  scanDuration: number;
}

class ArtistDiscoveryService {
  private stats: ArtistDiscoveryStats = {
    artistsFound: 0,
    newArtistsAdded: 0,
    duplicatesSkipped: 0,
    errors: 0,
    lastScan: new Date(),
    scanDuration: 0
  };

  async runArtistDiscovery(options: {
    sources?: ('pitchfork' | 'oh_my_rockness')[];
    limit?: number;
    dryRun?: boolean;
  } = {}): Promise<{
    success: boolean;
    message: string;
    stats: ArtistDiscoveryStats;
    discoveredArtists: DiscoveredArtist[];
  }> {
    const startTime = Date.now();
    console.log("🎵 Starting artist discovery...");

    try {
      const sources = options.sources || ['pitchfork', 'oh_my_rockness'];
      const limit = options.limit || 20;
      
      // Get existing artists to avoid duplicates
      const existingArtists = await storage.getAllArtists();
      const existingArtistNames = existingArtists.map(a => a.name.toLowerCase());

      this.stats.artistsFound = 0;
      this.stats.newArtistsAdded = 0;
      this.stats.duplicatesSkipped = 0;
      this.stats.errors = 0;

      const allDiscoveredArtists: DiscoveredArtist[] = [];

      // Scrape Pitchfork Best New Albums
      if (sources.includes('pitchfork')) {
        console.log("📰 Scraping Pitchfork Best New Albums...");
        try {
          const pitchforkArtists = await this.scrapePitchfork(limit / sources.length);
          allDiscoveredArtists.push(...pitchforkArtists);
        } catch (error) {
          console.error("❌ Pitchfork scraping failed:", error);
          this.stats.errors++;
        }
      }

      // Scrape Oh My Rockness recommendations
      if (sources.includes('oh_my_rockness')) {
        console.log("🎸 Scraping Oh My Rockness recommendations...");
        try {
          const omrArtists = await this.scrapeOhMyRockness(limit / sources.length);
          allDiscoveredArtists.push(...omrArtists);
        } catch (error) {
          console.error("❌ Oh My Rockness scraping failed:", error);
          this.stats.errors++;
        }
      }

      this.stats.artistsFound = allDiscoveredArtists.length;

      // Filter out duplicates and add new artists
      const finalArtists: DiscoveredArtist[] = [];
      
      for (const artist of allDiscoveredArtists) {
        const artistNameLower = artist.name.toLowerCase();
        
        // Check if artist already exists in database
        if (existingArtistNames.includes(artistNameLower)) {
          console.log(`⏭️  Skipping duplicate: ${artist.name}`);
          this.stats.duplicatesSkipped++;
          continue;
        }

        // Check if we already found this artist in this session
        const alreadyFound = finalArtists.some(a => 
          a.name.toLowerCase() === artistNameLower
        );
        
        if (alreadyFound) {
          this.stats.duplicatesSkipped++;
          continue;
        }

        finalArtists.push(artist);

        if (!options.dryRun) {
          try {
            // Add artist to database
            await storage.createArtist({
              name: artist.name,
              genre: artist.genre,
              priority: 'medium',
              source: artist.source,
              searchHistory: 0
            });

            console.log(`✅ Added new artist: ${artist.name} (${artist.genre})`);
            this.stats.newArtistsAdded++;
          } catch (error) {
            console.error(`❌ Failed to add artist ${artist.name}:`, error);
            this.stats.errors++;
          }
        }
      }

      this.stats.lastScan = new Date();
      this.stats.scanDuration = Date.now() - startTime;

      const message = options.dryRun 
        ? `Artist discovery research: Found ${this.stats.artistsFound} artists, ${finalArtists.length} would be new additions`
        : `Artist discovery complete: Added ${this.stats.newArtistsAdded} new artists from ${this.stats.artistsFound} discovered`;

      console.log(`✅ ${message}`);
      console.log(`📊 Stats: ${this.stats.duplicatesSkipped} duplicates skipped, ${this.stats.errors} errors`);

      return {
        success: true,
        message,
        stats: this.stats,
        discoveredArtists: finalArtists
      };

    } catch (error: any) {
      console.error("❌ Artist discovery failed:", error);
      return {
        success: false,
        message: `Artist discovery failed: ${error.message}`,
        stats: this.stats,
        discoveredArtists: []
      };
    }
  }

  private async scrapePitchfork(limit: number): Promise<DiscoveredArtist[]> {
    const artists: DiscoveredArtist[] = [];
    
    try {
      const response = await fetch('https://pitchfork.com/reviews/best/albums/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Pitchfork uses specific selectors for album reviews
      $('.review').each((index, element) => {
        if (artists.length >= limit) return false;

        try {
          const $review = $(element);
          const artistAlbum = $review.find('.review__title-album').text().trim();
          const rating = parseFloat($review.find('.score').text().trim()) || 0;
          
          // Extract artist name (usually before the colon or em-dash)
          const artistMatch = artistAlbum.match(/^([^:—]+)/);
          if (!artistMatch) return;
          
          const artistName = artistMatch[1].trim();
          const albumTitle = artistAlbum.replace(artistMatch[0], '').replace(/^[:\s—]+/, '').trim();

          if (artistName && artistName.length > 1) {
            artists.push({
              name: artistName,
              genre: 'Indie Rock', // Will be refined by AI analysis
              source: 'pitchfork',
              albumTitle,
              rating,
              description: $review.find('.review__abstract').text().trim().substring(0, 200)
            });
          }
        } catch (error) {
          console.error(`Error parsing Pitchfork review ${index}:`, error);
        }
      });

      console.log(`📰 Found ${artists.length} artists from Pitchfork`);
      return artists;

    } catch (error) {
      console.error('Pitchfork scraping error:', error);
      return [];
    }
  }

  private async scrapeOhMyRockness(limit: number): Promise<DiscoveredArtist[]> {
    const artists: DiscoveredArtist[] = [];
    
    try {
      const response = await fetch('https://www.ohmyrockness.com/recommended', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Oh My Rockness uses specific selectors for recommended artists
      $('.artist-entry, .recommendation, .featured-artist').each((index, element) => {
        if (artists.length >= limit) return false;

        try {
          const $entry = $(element);
          const artistName = $entry.find('.artist-name, h3, .title').first().text().trim();
          const description = $entry.find('.description, .bio').text().trim();
          
          // Extract genre from description or use default
          let genre = 'Indie Rock';
          const genreMatch = description.match(/(indie|rock|pop|electronic|folk|punk|metal|hip.hop|r&b)/i);
          if (genreMatch) {
            genre = genreMatch[0].charAt(0).toUpperCase() + genreMatch[0].slice(1);
          }

          if (artistName && artistName.length > 1) {
            artists.push({
              name: artistName,
              genre,
              source: 'oh_my_rockness',
              description: description.substring(0, 200)
            });
          }
        } catch (error) {
          console.error(`Error parsing OMR entry ${index}:`, error);
        }
      });

      console.log(`🎸 Found ${artists.length} artists from Oh My Rockness`);
      return artists;

    } catch (error) {
      console.error('Oh My Rockness scraping error:', error);
      return [];
    }
  }

  getStats(): ArtistDiscoveryStats {
    return this.stats;
  }
}

export const artistDiscoveryService = new ArtistDiscoveryService();
export { ArtistDiscoveryService, DiscoveredArtist };