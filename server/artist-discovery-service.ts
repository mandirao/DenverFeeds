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
      // Try multiple pages to get more diverse results
      const pages = ['https://pitchfork.com/reviews/best/albums/', 'https://pitchfork.com/reviews/best/albums/?page=2'];
      const maxPerPage = Math.ceil(limit / pages.length);
      
      for (const pageUrl of pages) {
        if (artists.length >= limit) break;
        
        console.log(`📰 Scraping Pitchfork page: ${pageUrl}`);
        const response = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch ${pageUrl}: HTTP ${response.status}`);
          continue;
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
              // Check for duplicates within this scraping session
              const isDuplicate = artists.some(a => 
                a.name.toLowerCase() === artistName.toLowerCase()
              );
              
              if (!isDuplicate) {
                artists.push({
                  name: artistName,
                  genre: 'Indie Rock', // Will be refined by AI analysis
                  source: 'pitchfork',
                  albumTitle,
                  rating,
                  description: $review.find('.review__abstract').text().trim().substring(0, 200)
                });
              }
            }
          } catch (error) {
            console.error(`Error parsing Pitchfork review ${index}:`, error);
          }
        });
        
        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Sort by rating (highest first) to prioritize better-reviewed artists
      artists.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      console.log(`📰 Found ${artists.length} unique artists from Pitchfork (sorted by rating)`);
      return artists.slice(0, limit);

    } catch (error) {
      console.error('Pitchfork scraping error:', error);
      return [];
    }
  }

  private async scrapeOhMyRockness(limit: number): Promise<DiscoveredArtist[]> {
    const artists: DiscoveredArtist[] = [];
    
    try {
      // Try multiple sections for more diversity
      const urls = [
        'https://www.ohmyrockness.com/recommended',
        'https://www.ohmyrockness.com/artists',
        'https://www.ohmyrockness.com/featured'
      ];
      
      for (const url of urls) {
        if (artists.length >= limit) break;
        
        console.log(`🎸 Scraping Oh My Rockness: ${url}`);
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
            }
          });

          if (!response.ok) {
            console.warn(`Failed to fetch ${url}: HTTP ${response.status}`);
            continue;
          }

          const html = await response.text();
          const $ = cheerio.load(html);

          // Try multiple selectors for different page layouts
          const selectors = [
            '.artist-entry', '.recommendation', '.featured-artist',
            '.artist-card', '.band-entry', '.artist-listing',
            'article', '.post', '.entry'
          ];

          for (const selector of selectors) {
            $(selector).each((index, element) => {
              if (artists.length >= limit) return false;

              try {
                const $entry = $(element);
                
                // Try multiple ways to extract artist name
                let artistName = '';
                const nameSelectors = ['.artist-name', 'h1', 'h2', 'h3', '.title', '.name', '.band-name'];
                
                for (const nameSelector of nameSelectors) {
                  const name = $entry.find(nameSelector).first().text().trim();
                  if (name && name.length > 1 && name.length < 100) {
                    artistName = name;
                    break;
                  }
                }
                
                if (!artistName) {
                  // Try the element's direct text
                  artistName = $entry.text().trim().split('\n')[0].substring(0, 50);
                }

                const description = $entry.find('.description, .bio, .excerpt, p').text().trim();
                
                // Extract genre from description or use default
                let genre = 'Indie Rock';
                const genreMatch = description.match(/(indie|rock|pop|electronic|folk|punk|metal|hip.hop|r&b|alternative|experimental)/i);
                if (genreMatch) {
                  genre = genreMatch[0].charAt(0).toUpperCase() + genreMatch[0].slice(1);
                }

                if (artistName && artistName.length > 1 && artistName.length < 100) {
                  // Check for duplicates within this scraping session
                  const isDuplicate = artists.some(a => 
                    a.name.toLowerCase() === artistName.toLowerCase()
                  );
                  
                  if (!isDuplicate) {
                    artists.push({
                      name: artistName,
                      genre,
                      source: 'oh_my_rockness',
                      description: description.substring(0, 200),
                      url
                    });
                  }
                }
              } catch (error) {
                console.error(`Error parsing OMR entry ${index}:`, error);
              }
            });
            
            if (artists.length > 0) break; // Found some artists with this selector
          }
          
          // Small delay between URLs
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.warn(`Error scraping ${url}:`, error);
        }
      }

      // Sort alphabetically for consistent ordering
      artists.sort((a, b) => a.name.localeCompare(b.name));

      console.log(`🎸 Found ${artists.length} unique artists from Oh My Rockness`);
      return artists.slice(0, limit);

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