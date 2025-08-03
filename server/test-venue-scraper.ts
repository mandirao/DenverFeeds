import VenueScraper from './venue-scraper';

// Test the venue scraper with a real venue
async function testVenueScraping() {
  console.log('🧪 Testing venue scraper...');
  
  const scraper = new VenueScraper();
  
  try {
    // Test scraping Red Rocks (this will attempt real scraping)
    const events = await scraper.scrapeVenue('Red Rocks Amphitheatre');
    console.log(`Found ${events.length} events at Red Rocks`);
    
    if (events.length > 0) {
      console.log('Sample events:');
      events.slice(0, 3).forEach(event => {
        console.log(`- ${event.artist} on ${event.date.toDateString()}`);
      });
    }
  } catch (error) {
    console.error('Scraping test failed:', error);
  }
  
  await scraper.closeBrowser();
}

// Only run if called directly
if (require.main === module) {
  testVenueScraping();
}

export { testVenueScraping };