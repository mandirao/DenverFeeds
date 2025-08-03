import * as puppeteer from 'puppeteer';

interface OMRShow {
  date: string;
  artists: string[];
  venue: string;
  url?: string;
}

interface DiscoveredArtist {
  name: string;
  genre: string;
  source: string;
  description?: string;
  confidence: number;
  rawData?: any;
}

export class OMRHeadlessScraper {
  private browser: puppeteer.Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
    }
  }

  async scrapeRecommendedShows(city: string, limit: number = 20): Promise<DiscoveredArtist[]> {
    await this.initialize();
    
    if (!this.browser) {
      throw new Error('Failed to initialize browser');
    }

    const page = await this.browser.newPage();
    const artists: DiscoveredArtist[] = [];

    try {
      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      const url = this.getCityUrl(city);
      console.log(`🎸 Loading OMR ${city} with headless browser: ${url}`);
      
      // Navigate and wait for content
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for the recommended shows section to load
      await page.waitForSelector('.show-list, [class*="show"], .recommended', { timeout: 10000 });
      
      // Wait a bit more for any dynamic content
      await page.waitForTimeout(2000);

      // Extract show data from the page
      const shows = await page.evaluate(() => {
        const showElements = document.querySelectorAll('[class*="show"], .listing, tr');
        const extractedShows: OMRShow[] = [];

        showElements.forEach(element => {
          const text = element.textContent || '';
          
          // Look for date patterns (Sat 11/15, Wed 11/19, etc.)
          const dateMatch = text.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}\/\d{1,2})/);
          
          if (dateMatch) {
            // Extract artists - look for links or text patterns
            const artistLinks = element.querySelectorAll('a[href*="/bands/"]');
            const artists: string[] = [];
            
            artistLinks.forEach(link => {
              const artistName = link.textContent?.trim();
              if (artistName && artistName.length > 1 && artistName.length < 100) {
                // Skip "BAND WE LIKE" entries
                if (!artistName.includes('BAND WE LIKE')) {
                  artists.push(artistName);
                }
              }
            });

            // If no artist links found, try text parsing
            if (artists.length === 0) {
              // Look for artist names in the text - they're typically after the date
              const textAfterDate = text.substring(text.indexOf(dateMatch[0]) + dateMatch[0].length);
              const lines = textAfterDate.split('\n').map(l => l.trim()).filter(l => l.length > 0);
              
              if (lines.length > 0) {
                // First line usually contains artists
                const artistLine = lines[0];
                const possibleArtists = artistLine.split(',').map(a => a.trim());
                
                possibleArtists.forEach(artist => {
                  if (artist.length > 1 && artist.length < 100 && 
                      !artist.includes('tracking') && 
                      !artist.includes('Ages') &&
                      !artist.includes('TICKETS')) {
                    artists.push(artist);
                  }
                });
              }
            }

            // Extract venue info
            let venue = '';
            const venueLinks = element.querySelectorAll('a[href*="/venues/"]');
            if (venueLinks.length > 0) {
              venue = venueLinks[0].textContent?.trim() || '';
            } else {
              // Try to find venue in text
              const venueMatch = text.match(/at\s+([^0-9\n]+?)(?:\s+\d|\s*All\s+Ages|\s+21\+|\s+18\+|$)/i);
              if (venueMatch) {
                venue = venueMatch[1].trim();
              }
            }

            if (artists.length > 0) {
              extractedShows.push({
                date: dateMatch[0],
                artists,
                venue
              });
            }
          }
        });

        return extractedShows;
      });

      console.log(`🎵 Found ${shows.length} shows from OMR ${city}`);

      // Convert shows to discovered artists (headliners only)
      shows.forEach((show: OMRShow) => {
        if (artists.length >= limit) return;
        
        // Take only the first artist (headliner)
        const headliner = show.artists[0];
        if (!headliner) return;

        // Clean up the artist name
        const cleanName = headliner
          .replace(/^\d+\s*/, '') // Remove leading numbers
          .replace(/\s*\*.*$/, '') // Remove asterisk and everything after
          .replace(/\s*\(.*\)$/, '') // Remove parenthetical info
          .trim();

        if (cleanName.length < 2 || cleanName.length > 100) return;

        // Skip duplicates within this scraping session
        const isDuplicate = artists.some(a => 
          a.name.toLowerCase() === cleanName.toLowerCase()
        );

        if (!isDuplicate) {
          // Determine genre based on context
          let genre = 'Indie Rock';
          const context = (headliner + show.venue).toLowerCase();
          if (context.includes('electronic') || context.includes('dj') || context.includes('techno')) {
            genre = 'Electronic & Experimental';
          } else if (context.includes('jazz') || context.includes('blues')) {
            genre = 'Jazz & Blues';
          } else if (context.includes('hip hop') || context.includes('rap')) {
            genre = 'Hip Hop & R&B';
          } else if (context.includes('folk') || context.includes('country')) {
            genre = 'Country & Americana';
          } else if (context.includes('pop')) {
            genre = 'Pop & Indie Pop';
          }

          artists.push({
            name: cleanName,
            genre,
            source: `oh_my_rockness_${city}_headless`,
            description: `Recommended headliner in ${city.toUpperCase()}${show.venue ? ` at ${show.venue}` : ''} on ${show.date}`.substring(0, 200),
            confidence: 0.8, // Higher confidence due to better scraping method
            rawData: {
              url,
              venue: show.venue,
              date: show.date,
              allArtists: show.artists
            }
          });

          console.log(`🎵 Found headliner: ${cleanName} (${genre}) at ${show.venue || 'venue TBD'} on ${show.date}`);
        }
      });

    } catch (error) {
      console.error(`❌ Error scraping OMR ${city}:`, error);
    } finally {
      await page.close();
    }

    return artists;
  }

  private getCityUrl(city: string): string {
    const cityUrls = {
      'nyc': 'https://ohmyrockness.com/shows/recommended',
      'la': 'https://losangeles.ohmyrockness.com/shows/recommended',
      'chicago': 'https://chicago.ohmyrockness.com/shows/recommended'
    };
    
    return cityUrls[city as keyof typeof cityUrls] || cityUrls.nyc;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const omrHeadlessScraper = new OMRHeadlessScraper();