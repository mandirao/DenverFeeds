import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { storage } from "./storage";
import { llmService } from "./llm-service";

interface DiscoveredArtist {
  name: string;
  genre: string;
  source: string;
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
    city?: string;
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
        const city = options.city || 'nyc';
        console.log(`🎸 Scraping Oh My Rockness ${city.toUpperCase()} recommendations...`);
        try {
          const omrArtists = await this.scrapeOhMyRockness(limit / sources.length, city);
          allDiscoveredArtists.push(...omrArtists);
        } catch (error) {
          console.error(`❌ Oh My Rockness ${city} scraping failed:`, error);
          this.stats.errors++;
        }
      }

      this.stats.artistsFound = allDiscoveredArtists.length;

      // Filter out duplicates and add new artists with smart prioritization
      const finalArtists: DiscoveredArtist[] = [];
      
      // Sort discovered artists by priority (Pitchfork rating first, then alphabetical)
      allDiscoveredArtists.sort((a, b) => {
        // Pitchfork artists with higher ratings first
        if (a.source === 'pitchfork' && b.source === 'pitchfork') {
          return (b.rating || 0) - (a.rating || 0);
        }
        // Pitchfork artists before Oh My Rockness
        if (a.source === 'pitchfork' && b.source === 'oh_my_rockness') return -1;
        if (a.source === 'oh_my_rockness' && b.source === 'pitchfork') return 1;
        // Within same source, alphabetical
        return a.name.localeCompare(b.name);
      });
      
      for (const artist of allDiscoveredArtists) {
        if (finalArtists.length >= (options.limit || 20)) break;
        
        const artistNameLower = artist.name.toLowerCase().trim();
        
        // Skip invalid names
        if (!artist.name || artist.name.length < 2 || artist.name.length > 100) {
          continue;
        }
        
        // Check if artist already exists in database (fuzzy matching)
        const isDatabaseDuplicate = existingArtistNames.some(existing => {
          const existingLower = existing.toLowerCase().trim();
          return existingLower === artistNameLower || 
                 existingLower.includes(artistNameLower) ||
                 artistNameLower.includes(existingLower);
        });
        
        if (isDatabaseDuplicate) {
          console.log(`⏭️  Skipping database duplicate: ${artist.name}`);
          this.stats.duplicatesSkipped++;
          continue;
        }

        // Check if we already found this artist in this session
        const isSessionDuplicate = finalArtists.some(a => {
          const aNameLower = a.name.toLowerCase().trim();
          return aNameLower === artistNameLower ||
                 aNameLower.includes(artistNameLower) ||
                 artistNameLower.includes(aNameLower);
        });
        
        if (isSessionDuplicate) {
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
      const url = 'https://pitchfork.com/reviews/best/albums/';
      console.log(`📰 Scraping Pitchfork Best New Albums: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Focus specifically on Best New Album reviews
      $('.review, .album-review, .best-new-album').each((index, element) => {
        if (artists.length >= limit) return false;

        try {
          const $review = $(element);
          
          // Try multiple selectors for artist/album title
          let artistAlbum = '';
          const titleSelectors = [
            '.review__title-album',
            '.album-title', 
            '.review-title',
            'h3',
            'h2',
            '.title'
          ];
          
          for (const selector of titleSelectors) {
            const title = $review.find(selector).text().trim();
            if (title && title.length > 0) {
              artistAlbum = title;
              break;
            }
          }
          
          if (!artistAlbum) return;
          
          // Extract rating
          const ratingText = $review.find('.score, .rating, .review-score').text().trim();
          const rating = parseFloat(ratingText) || 0;
          
          // Extract artist name (usually before the colon, em-dash, or "by")
          const artistMatch = artistAlbum.match(/^([^:—]+?)(?:\s*[:—]\s*|\s+by\s+)/i) || 
                              artistAlbum.match(/^([^:—]+)/);
          
          if (!artistMatch) return;
          
          let artistName = artistMatch[1].trim();
          
          // Clean up artist name
          artistName = artistName.replace(/^(the\s+)?(.+)/i, '$1$2').trim();
          
          const albumTitle = artistAlbum.replace(artistMatch[0], '').replace(/^[:\s—]+/, '').trim();

          if (artistName && artistName.length > 1 && artistName.length < 100) {
            // Check for duplicates within this scraping session
            const isDuplicate = artists.some(a => 
              a.name.toLowerCase() === artistName.toLowerCase()
            );
            
            if (!isDuplicate) {
              const description = $review.find('.review__abstract, .abstract, .review-text, p').first().text().trim();
              
              artists.push({
                name: artistName,
                genre: 'Indie Rock',
                source: 'pitchfork_best_new',
                albumTitle,
                rating,
                description: description.substring(0, 200)
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing Pitchfork review ${index}:`, error);
        }
      });

      // Sort by rating (highest first) to prioritize better-reviewed albums
      artists.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      console.log(`📰 Found ${artists.length} unique artists from Pitchfork Best New Albums (sorted by rating)`);
      return artists.slice(0, limit);

    } catch (error) {
      console.error('Pitchfork Best New Albums scraping error:', error);
      return [];
    }
  }

  private async scrapeOhMyRockness(limit: number, city: string = 'nyc'): Promise<DiscoveredArtist[]> {
    const artists: DiscoveredArtist[] = [];
    
    try {
      // Map city codes to URLs
      const cityUrls = {
        'nyc': 'https://www.ohmyrockness.com/shows/recommended',
        'chicago': 'https://chicago.ohmyrockness.com/shows/recommended', 
        'la': 'https://losangeles.ohmyrockness.com/shows/recommended'
      };
      
      const url = cityUrls[city as keyof typeof cityUrls] || cityUrls.nyc;
      
      console.log(`🎸 Scraping Oh My Rockness ${city.toUpperCase()} recommended shows: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Focus on show listings in the recommended feed
      $('.show-listing, .show-entry, .recommended-show, .event-listing, .show').each((index, element) => {
        if (artists.length >= limit) return false;

        try {
          const $show = $(element);
          
          // Extract artist name from show listings
          let artistName = '';
          const nameSelectors = [
            '.artist-name', 
            '.band-name', 
            '.headliner',
            'h3', 
            'h2',
            '.show-title .artist',
            '.artist'
          ];
          
          for (const selector of nameSelectors) {
            const name = $show.find(selector).first().text().trim();
            if (name && name.length > 1 && name.length < 100) {
              artistName = name;
              break;
            }
          }
          
          // If no specific selector worked, try parsing from title/header
          if (!artistName) {
            const titleText = $show.find('h1, h2, h3, .title').first().text().trim();
            // Split on common separators and take first part as artist name
            const possibleName = titleText.split(/\s+at\s+|\s+@\s+|\s+-\s+/i)[0].trim();
            if (possibleName && possibleName.length > 1 && possibleName.length < 100) {
              artistName = possibleName;
            }
          }

          if (artistName && artistName.length > 1 && artistName.length < 100) {
            // Check for duplicates within this scraping session
            const isDuplicate = artists.some(a => 
              a.name.toLowerCase() === artistName.toLowerCase()
            );
            
            if (!isDuplicate) {
              // Extract venue and date info if available
              const venue = $show.find('.venue, .location').text().trim();
              const date = $show.find('.date, .show-date').text().trim();
              
              artists.push({
                name: artistName,
                genre: 'Indie Rock', // Default genre
                source: `oh_my_rockness_${city}`,
                description: `Recommended show in ${city.toUpperCase()}${venue ? ` at ${venue}` : ''}${date ? ` on ${date}` : ''}`.substring(0, 200),
                url
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing OMR show entry ${index}:`, error);
        }
      });

      // Sort alphabetically for consistent ordering
      artists.sort((a, b) => a.name.localeCompare(b.name));

      console.log(`🎸 Found ${artists.length} unique artists from Oh My Rockness ${city.toUpperCase()}`);
      return artists.slice(0, limit);

    } catch (error) {
      console.error(`Oh My Rockness ${city} scraping error:`, error);
      return [];
    }
  }

  getStats(): ArtistDiscoveryStats {
    return this.stats;
  }
}

export const artistDiscoveryService = new ArtistDiscoveryService();
export { ArtistDiscoveryService, DiscoveredArtist };