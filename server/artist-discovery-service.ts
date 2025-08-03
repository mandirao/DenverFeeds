import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { storage } from "./storage";
import { llmService } from "./llm-service";

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
                confidence: 0.75,
                rawData: {
                  url,
                  venue,
                  date
                }
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