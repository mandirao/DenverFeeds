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

// Venue-specific scraping configurations - Updated to cover all major venues from database
const VENUE_SCRAPERS: Record<string, VenueConfig> = {
  // Top 10 Venues (highest event count)
  'Red Rocks Amphitheatre': {
    name: 'Red Rocks Amphitheatre',
    url: 'https://www.redrocksonline.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-item, .show-item',
      artistName: '.event-title, .artist-name',
      eventDate: '.event-date, .show-date'
    }
  },
  'Mission Ballroom': {
    name: 'Mission Ballroom',
    url: 'https://www.missionballroom.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-listing, .show',
      artistName: '.artist-name, .headliner',
      eventDate: '.event-date, .date'
    }
  },
  'Gothic Theatre': {
    name: 'Gothic Theatre',
    url: 'https://www.gothictheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show-listing',
      artistName: '.artist, .band-name',
      eventDate: '.date, .show-date'
    }
  },
  'Ogden Theatre': {
    name: 'Ogden Theatre',
    url: 'https://www.ogdentheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.show, .event-item',
      artistName: '.artist, .headliner',
      eventDate: '.show-date, .date'
    }
  },
  'Hi-Dive': {
    name: 'Hi-Dive',
    url: 'https://www.hi-dive.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-item, .show',
      artistName: '.band-name, .artist',
      eventDate: '.event-date, .date'
    }
  },
  'Marquis Theater': {
    name: 'Marquis Theater',
    url: 'https://www.marquistheater.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show-listing',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Bluebird Theater': {
    name: 'Bluebird Theater',
    url: 'https://www.bluebirdtheater.net/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Paramount Theatre': {
    name: 'Paramount Theatre',
    url: 'https://www.paramountdenver.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event-item, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Ball Arena': {
    name: 'Ball Arena',
    url: 'https://www.ballarena.com/events',
    type: 'ticketmaster',
    selectors: {
      eventContainer: '.event, .show-listing',
      artistName: '.artist, .headliner',
      eventDate: '.date, .show-date'
    }
  },
  'Chautauqua Auditorium': {
    name: 'Chautauqua Auditorium',
    url: 'https://www.chautauqua.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },

  // Major Theater & Concert Halls (11-20 events)
  'Summit Music Hall': {
    name: 'Summit Music Hall',
    url: 'https://www.summitmusichall.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Meow Wolf Denver': {
    name: 'Meow Wolf Denver',
    url: 'https://meowwolf.com/visit/denver/events',
    type: 'custom',
    requiresJS: true,
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Fiddler\'s Green Amphitheatre': {
    name: 'Fiddler\'s Green Amphitheatre',
    url: 'https://www.fiddlersgreenamp.com/events',
    type: 'ticketmaster',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .headliner',
      eventDate: '.date, .show-date'
    }
  },
  'Globe Hall': {
    name: 'Globe Hall',
    url: 'https://www.globehall.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show-listing',
      artistName: '.artist, .band',
      eventDate: '.date, .event-date'
    }
  },
  'Levitt Pavilion Denver': {
    name: 'Levitt Pavilion Denver',
    url: 'https://www.levittdenver.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .show-date'
    }
  },

  // Additional Major Venues (6-10 events)
  'Boulder Theater': {
    name: 'Boulder Theater',
    url: 'https://www.bouldertheater.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Cervantes\' Masterpiece Ballroom': {
    name: 'Cervantes\' Masterpiece Ballroom',
    url: 'https://www.cervantesdenver.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Fillmore Auditorium': {
    name: 'Fillmore Auditorium',
    url: 'https://www.fillmoreauditorium.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.headliner, .artist',
      eventDate: '.date, .show-date'
    }
  },
  'Empower Field at Mile High': {
    name: 'Empower Field at Mile High',
    url: 'https://www.empowedfieldatmilehigh.com/events',
    type: 'ticketmaster',
    selectors: {
      eventContainer: '.event, .game',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },

  // Important Smaller Venues (4-5 events)
  'Aggie Theatre': {
    name: 'Aggie Theatre',
    url: 'https://www.theaggietheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Boettcher Concert Hall': {
    name: 'Boettcher Concert Hall',
    url: 'https://www.denvercenter.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .performance',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Fox Theatre': {
    name: 'Fox Theatre',
    url: 'https://www.foxtheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .show-date'
    }
  },
  'HQ': {
    name: 'HQ',
    url: 'https://www.hqdenver.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .dj',
      eventDate: '.date, .event-date'
    }
  },
  'Larimer Lounge': {
    name: 'Larimer Lounge',
    url: 'https://www.larimerlounge.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Lost Lake Lounge': {
    name: 'Lost Lake Lounge',
    url: 'https://www.lostlakelounge.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .event-date'
    }
  },
  'The Mishawaka': {
    name: 'The Mishawaka',
    url: 'https://www.themishawaka.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .show-date'
    }
  },

  // Additional Notable Venues (2-3 events)
  'Oriental Theater': {
    name: 'Oriental Theater',
    url: 'https://www.orientaltheater.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Skylark Lounge': {
    name: 'Skylark Lounge',
    url: 'https://www.skylarklounge.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Bellco Theatre': {
    name: 'Bellco Theatre',
    url: 'https://www.bellcotheatre.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Black Sheep': {
    name: 'Black Sheep',
    url: 'https://www.blacksheepcs.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'Washington\'s': {
    name: 'Washington\'s',
    url: 'https://www.washingtons.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .event-date'
    }
  },

  // Additional venues with significant event counts
  'Cervantes\' Masterpiece Ballroom & Other Side': {
    name: 'Cervantes\' Masterpiece Ballroom & Other Side',
    url: 'https://www.cervantesdenver.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .show-date'
    }
  },
  'City Park Jazz': {
    name: 'City Park Jazz',
    url: 'https://www.cityparkjazz.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Denver Botanic Gardens': {
    name: 'Denver Botanic Gardens',
    url: 'https://www.botanicgardens.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Moe\'s Original BBQ': {
    name: 'Moe\'s Original BBQ',
    url: 'https://www.moesoriginalbbq.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .band',
      eventDate: '.date, .event-date'
    }
  },
  'Ford Amphitheater': {
    name: 'Ford Amphitheater',
    url: 'https://www.fordamphitheater.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .show-date'
    }
  },
  'Greek Theater': {
    name: 'Greek Theater',
    url: 'https://www.greektheatreberkeley.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .show',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
    }
  },
  'Dick\'s Sporting Goods Park': {
    name: 'Dick\'s Sporting Goods Park',
    url: 'https://www.dickssportinggoodspark.com/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .game',
      artistName: '.artist, .team',
      eventDate: '.date, .event-date'
    }
  },
  'Swallow Hill Music': {
    name: 'Swallow Hill Music',
    url: 'https://www.swallowhillmusic.org/events',
    type: 'custom',
    selectors: {
      eventContainer: '.event, .concert',
      artistName: '.artist, .performer',
      eventDate: '.date, .event-date'
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