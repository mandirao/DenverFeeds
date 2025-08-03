import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { storage } from "./storage";
import { llmService } from "./llm-service";
import { omrHeadlessScraper } from './omr-headless-scraper';

interface DiscoveredArtist {
  name: string;
  genre: string;
  source: string;
  description?: string;
  confidence: number;
  rawData?: any;
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
      
      // Also get already discovered artists to avoid re-discovery
      const existingDiscoveredArtists = await storage.getAllDiscoveredArtists();
      const existingDiscoveredNames = existingDiscoveredArtists.map(a => a.name.toLowerCase());
      
      // Combine both lists for comprehensive duplicate checking
      const allExistingNames = [...existingArtistNames, ...existingDiscoveredNames];

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
      
      // Sort discovered artists by priority (Pitchfork confidence first, then alphabetical)
      allDiscoveredArtists.sort((a, b) => {
        // Pitchfork artists with higher confidence first
        if (a.source === 'pitchfork' && b.source === 'pitchfork') {
          return (b.confidence || 0) - (a.confidence || 0);
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
        
        // Check if artist already exists in database or discovered artists (fuzzy matching)
        const isDuplicate = allExistingNames.some(existing => {
          const existingLower = existing.toLowerCase().trim();
          return existingLower === artistNameLower || 
                 existingLower.includes(artistNameLower) ||
                 artistNameLower.includes(existingLower);
        });
        
        if (isDuplicate) {
          console.log(`⏭️  Skipping duplicate: ${artist.name} (already exists in database or discovered)`);
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
            // Add artist to discovered artists table for review
            await storage.createDiscoveredArtist({
              name: artist.name,
              genre: artist.genre,
              source: artist.source,
              description: artist.description,
              confidence: artist.confidence,
              rawData: artist.rawData,
              isReviewed: false
            });

            console.log(`✅ Added discovered artist for review: ${artist.name} (${artist.genre})`);
            this.stats.newArtistsAdded++;
          } catch (error) {
            console.error(`❌ Failed to add discovered artist ${artist.name}:`, error);
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

      // Debug: Check what we're actually getting
      const bodyText = $('body').text();
      console.log(`📄 Page contains ${bodyText.length} characters of text`);
      
      const allLinks = $('a').length;
      const reviewLinks = $('a[href*="/reviews/albums/"]').length;
      console.log(`🔗 Found ${allLinks} total links, ${reviewLinks} review links`);
      
      // Debug: Show some sample links
      $('a[href*="/reviews/albums/"]').slice(0, 3).each((i, el) => {
        const href = $(el).attr('href');
        console.log(`📝 Sample review link ${i}: ${href}`);
      });
      
      // Find album review links and extract artist names from the URL structure
      $('a[href*="/reviews/albums/"]').each((index, element) => {
        if (artists.length >= limit) return false;

        try {
          const $link = $(element);
          const href = $link.attr('href') || '';
          
          if (!href.includes('/reviews/albums/')) return;
          
          // Extract artist name from URL path (most reliable method for Pitchfork)
          // URLs are like: /reviews/albums/ryan-davis-and-the-roadhouse-band-new-threats-from-the-soul/
          const urlSegment = href.replace('/reviews/albums/', '').replace(/\/$/, '');
          
          // Split by last dash to separate artist from album
          const parts = urlSegment.split('-');
          
          // Common patterns: artist-name-album-name or just artist-name
          let artistParts: string[] = [];
          let albumParts: string[] = [];
          
          // Known patterns to split artist from album title
          const splitKeywords = ['new', 'album', 'ep', 'lp', 'vol', 'volume', 'part', 'chapter'];
          let splitIndex = -1;
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].toLowerCase();
            if (splitKeywords.includes(part) && i > 1) {
              splitIndex = i;
              break;
            }
          }
          
          if (splitIndex > 0) {
            artistParts = parts.slice(0, splitIndex);
            albumParts = parts.slice(splitIndex);
          } else {
            // For known artists, handle manually
            if (urlSegment.includes('ryan-davis-and-the-roadhouse-band')) {
              artistParts = ['ryan', 'davis', '&', 'the', 'roadhouse', 'band'];
              albumParts = parts.slice(6); // Everything after the band name
            } else if (urlSegment.includes('alex-g')) {
              artistParts = ['alex', 'g'];
              albumParts = parts.slice(2);
            } else if (urlSegment.includes('open-mike-eagle')) {
              artistParts = ['open', 'mike', 'eagle'];
              albumParts = parts.slice(3);
            } else if (urlSegment.includes('nick-leon')) {
              artistParts = ['nick', 'león']; // Handle special characters
              albumParts = parts.slice(2);
            } else if (urlSegment.includes('billy-woods')) {
              artistParts = ['billy', 'woods'];
              albumParts = parts.slice(2);
            } else if (urlSegment.includes('fka-twigs')) {
              artistParts = ['fka', 'twigs'];
              albumParts = parts.slice(2);
            } else if (urlSegment.includes('bad-bunny')) {
              artistParts = ['bad', 'bunny'];
              albumParts = parts.slice(2);
            } else {
              // Default: assume first 1-2 parts are artist name
              artistParts = parts.slice(0, Math.min(2, Math.floor(parts.length / 2)));
              albumParts = parts.slice(artistParts.length);
            }
          }
          
          // Convert parts back to readable names
          let artistName = artistParts
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
            .replace(/\bAnd\b/g, '&');
            
          let albumTitle = albumParts
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');

          // Manual corrections for known artists
          if (urlSegment.includes('ryan-davis')) {
            artistName = 'Ryan Davis & the Roadhouse Band';
          }
          
          if (artistName && artistName.length > 1 && artistName.length < 100) {
            // Check for duplicates
            const isDuplicate = artists.some(a => 
              a.name.toLowerCase() === artistName.toLowerCase()
            );
            
            if (!isDuplicate) {
              // Determine genre from surrounding context or URL patterns
              let genre = 'Rock & Alternative';
              const linkText = $link.text().toLowerCase();
              const parentText = $link.parent().text().toLowerCase();
              const context = (linkText + ' ' + parentText).toLowerCase();
              
              if (context.includes('electronic') || urlSegment.includes('koze') || urlSegment.includes('barker')) {
                genre = 'Electronic & Experimental';
              } else if (context.includes('rap') || context.includes('hip hop') || 
                        urlSegment.includes('woods') || urlSegment.includes('bunny') || urlSegment.includes('saba')) {
                genre = 'Hip Hop & R&B';
              } else if (context.includes('pop') || context.includes('r&b') || urlSegment.includes('twigs') || urlSegment.includes('sza')) {
                genre = 'Pop & Indie Pop';
              } else if (context.includes('folk') || context.includes('country')) {
                genre = 'Country & Americana';
              }
              
              console.log(`🎵 Found Pitchfork artist: ${artistName} - ${albumTitle || 'Unknown Album'} (${genre})`);
              
              artists.push({
                name: artistName,
                genre,
                source: 'pitchfork_best_new',
                description: `Featured on Pitchfork's Best New Albums`,
                confidence: 0.85,
                rawData: {
                  url: `https://pitchfork.com${href}`,
                  albumTitle: albumTitle || undefined
                }
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing Pitchfork URL ${href}:`, error);
        }
      });

      console.log(`📰 Found ${artists.length} unique artists from Pitchfork Best New Albums`);
      return artists.slice(0, limit);

    } catch (error) {
      console.error('Pitchfork Best New Albums scraping error:', error);
      return [];
    }
  }

  private async scrapeOhMyRockness(limit: number, city: string = 'nyc'): Promise<DiscoveredArtist[]> {
    console.log(`🎸 Scraping Oh My Rockness ${city.toUpperCase()} with enhanced parsing...`);
    
    const artists: DiscoveredArtist[] = [];
    
    try {
      // Map city codes to URLs  
      const cityUrls = {
        'nyc': 'https://ohmyrockness.com/shows/recommended',
        'chicago': 'https://chicago.ohmyrockness.com/shows/recommended', 
        'la': 'https://losangeles.ohmyrockness.com/shows/recommended'
      };
      
      const url = cityUrls[city as keyof typeof cityUrls] || cityUrls.nyc;
      
      console.log(`📄 Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        console.log(`⚠️  HTTP ${response.status} response from OMR`);
        return [];
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Based on screenshot structure, look for artist names that appear as links or text
      // The shows appear to have a structure with artists, venues, and dates
      const bodyText = $('body').text();
      
      // Try to find artist patterns based on screenshot showing "Built to Spill", "Patti Smith & Her Band", etc
      const knownPatterns = [
        /Built to Spill/gi,
        /Patti Smith & Her Band/gi, 
        /Hot Mulligan/gi,
        /Drug Church/gi,
        /Larry Yes/gi,
        /Braided Waves/gi
      ];
      
      let foundAny = false;
      knownPatterns.forEach(pattern => {
        const matches = bodyText.match(pattern);
        if (matches) {
          foundAny = true;
          console.log(`✓ Found expected artist pattern: ${matches[0]}`);
        }
      });
      
      if (foundAny) {
        console.log(`🎵 Content appears to be loading. OMR shows dynamic content that requires browser rendering.`);
        console.log(`💡 Static HTML parsing limitation: Show listings require JavaScript execution for full content.`);
      } else {
        console.log(`⚠️  Expected artist content not found in static HTML. This confirms dynamic loading.`);
      }
      
      // For now, acknowledge the limitation and focus on Pitchfork
      console.log(`🔧 Oh My Rockness requires browser automation. Focusing on Pitchfork for reliable artist discovery.`);
      
      return artists;

    } catch (error) {
      console.error(`❌ Error scraping OMR ${city}:`, error);
      this.stats.errors++;
      return [];
    }
  }

  getStats(): ArtistDiscoveryStats {
    return this.stats;
  }
}

export const artistDiscoveryService = new ArtistDiscoveryService();
export { ArtistDiscoveryService, DiscoveredArtist };