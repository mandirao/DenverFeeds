import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';

interface ScrapedEvent {
  artist: string;
  date: Date;
  venue: string;
  ticketUrl?: string;
  description?: string;
  price?: string;
}

interface VenueConfig {
  name: string;
  url: string;
  type: 'ticketmaster' | 'songkick' | 'custom' | 'facebook';
  selectors?: {
    eventContainer?: string;
    artistName?: string;
    eventDate?: string;
    eventLink?: string;
    description?: string;
  };
  apiEndpoint?: string;
  requiresJS?: boolean;
}

// Venue-specific scraping configurations
const VENUE_SCRAPERS: Record<string, VenueConfig> = {
  'Red Rocks Amphitheatre': {
    name: 'Red Rocks Amphitheatre',
    url: 'https://www.redrocksonline.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-item',
      artistName: '.event-title',
      eventDate: '.event-date'
    }
  },
  'Mission Ballroom': {
    name: 'Mission Ballroom',
    url: 'https://www.missionballroom.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-listing',
      artistName: '.artist-name',
      eventDate: '.event-date'
    }
  },
  'Fillmore Auditorium': {
    name: 'Fillmore Auditorium',
    url: 'https://www.fillmoreauditorium.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event',
      artistName: '.headliner',
      eventDate: '.date'
    }
  },
  'Ogden Theatre': {
    name: 'Ogden Theatre',
    url: 'https://www.ogdentheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.show',
      artistName: '.artist',
      eventDate: '.show-date'
    }
  },
  'Hi-Dive': {
    name: 'Hi-Dive',
    url: 'https://www.hi-dive.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-item',
      artistName: '.band-name',
      eventDate: '.event-date'
    }
  }
};

class VenueScraper {
  private browser: any = null;

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrapeVenue(venueName: string): Promise<ScrapedEvent[]> {
    const config = VENUE_SCRAPERS[venueName];
    if (!config) {
      console.log(`No scraper configuration for ${venueName}`);
      return [];
    }

    try {
      console.log(`🔍 Scraping ${venueName}...`);

      if (config.requiresJS) {
        return await this.scrapeWithPuppeteer(config);
      } else {
        return await this.scrapeWithFetch(config);
      }
    } catch (error) {
      console.error(`❌ Error scraping ${venueName}:`, error);
      return [];
    }
  }

  private async scrapeWithFetch(config: VenueConfig): Promise<ScrapedEvent[]> {
    try {
      const response = await fetch(config.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseHTML(html, config);
    } catch (error) {
      console.error(`Fetch error for ${config.name}:`, error);
      return [];
    }
  }

  private async scrapeWithPuppeteer(config: VenueConfig): Promise<ScrapedEvent[]> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (compatible; Concert Discovery Bot)');
      await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for events to load
      if (config.selectors?.eventContainer) {
        await page.waitForSelector(config.selectors.eventContainer, { timeout: 10000 });
      }

      const html = await page.content();
      return this.parseHTML(html, config);
    } catch (error) {
      console.error(`Puppeteer error for ${config.name}:`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  private parseHTML(html: string, config: VenueConfig): ScrapedEvent[] {
    const $ = cheerio.load(html);
    const events: ScrapedEvent[] = [];

    if (!config.selectors?.eventContainer) {
      return events;
    }

    $(config.selectors.eventContainer).each((index: number, element: any) => {
      try {
        const $event = $(element);
        
        // Extract artist name
        let artist = '';
        if (config.selectors?.artistName) {
          artist = $event.find(config.selectors.artistName).text().trim();
        }

        // Extract date
        let dateStr = '';
        if (config.selectors?.eventDate) {
          dateStr = $event.find(config.selectors.eventDate).text().trim();
        }

        // Parse date
        const eventDate = this.parseEventDate(dateStr);
        
        // Only include future events with valid artist names
        if (artist && eventDate && eventDate > new Date()) {
          events.push({
            artist: this.cleanArtistName(artist),
            date: eventDate,
            venue: config.name,
            description: $event.find(config.selectors?.description || '').text().trim() || undefined
          });
        }
      } catch (error) {
        console.error(`Error parsing event ${index}:`, error);
      }
    });

    console.log(`📅 Found ${events.length} upcoming events at ${config.name}`);
    return events;
  }

  private parseEventDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
      // Try various date formats
      const patterns = [
        /(\w+)\s+(\d{1,2}),?\s+(\d{4})/i, // "January 15, 2025" or "Jan 15 2025"
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/,   // "01/15/2025"
        /(\d{4})-(\d{2})-(\d{2})/,        // "2025-01-15"
        /(\w+)\s+(\d{1,2})/i              // "Jan 15" (assume current year)
      ];

      for (const pattern of patterns) {
        const match = dateStr.match(pattern);
        if (match) {
          let year, month, day;
          
          if (pattern.source.includes('\\w+')) {
            // Month name format
            const monthName = match[1];
            day = parseInt(match[2]);
            year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            
            const monthMap: Record<string, number> = {
              'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
              'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
              'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
              'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
            };
            
            month = monthMap[monthName.toLowerCase()];
            if (month === undefined) continue;
          } else {
            // Numeric format
            if (pattern.source.includes('\\d{4}-')) {
              // YYYY-MM-DD
              year = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              day = parseInt(match[3]);
            } else {
              // MM/DD/YYYY
              month = parseInt(match[1]) - 1;
              day = parseInt(match[2]);
              year = parseInt(match[3]);
            }
          }
          
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
      
      // Fallback: try native Date parsing
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch (error) {
      console.error(`Error parsing date "${dateStr}":`, error);
      return null;
    }
  }

  private cleanArtistName(artist: string): string {
    return artist
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical info
      .replace(/\s*featuring\s+.*/i, '') // Remove "featuring..." parts
      .replace(/\s*with\s+.*/i, '') // Remove "with..." parts
      .replace(/\s*&\s+.*/i, '') // Remove "& ..." for multi-artist shows (keep main act)
      .trim();
  }

  async scrapeMultipleVenues(venueNames: string[]): Promise<ScrapedEvent[]> {
    const allEvents: ScrapedEvent[] = [];
    
    for (const venueName of venueNames) {
      try {
        const events = await this.scrapeVenue(venueName);
        allEvents.push(...events);
        
        // Delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to scrape ${venueName}:`, error);
      }
    }

    await this.closeBrowser();
    return allEvents;
  }
}

export { VenueScraper, ScrapedEvent };
export default VenueScraper;