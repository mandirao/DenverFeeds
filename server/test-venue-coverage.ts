import { storage } from './storage';

// Venue-specific scraping configurations - Test coverage
const VENUE_SCRAPERS_TEST = {
  'Red Rocks Amphitheatre': 'https://www.redrocksonline.com/events',
  'Mission Ballroom': 'https://www.missionballroom.com/events',
  'Gothic Theatre': 'https://www.gothictheatre.com/events',
  'Ogden Theatre': 'https://www.ogdentheatre.com/events',
  'Hi-Dive': 'https://www.hi-dive.com/events',
  'Marquis Theater': 'https://www.marquistheater.com/events',
  'Bluebird Theater': 'https://www.bluebirdtheater.net/events',
  'Paramount Theatre': 'https://www.paramountdenver.com/events',
  'Ball Arena': 'https://www.ballarena.com/events',
  'Chautauqua Auditorium': 'https://www.chautauqua.com/events',
  'Summit Music Hall': 'https://www.summitmusichall.com/events',
  'Meow Wolf Denver': 'https://meowwolf.com/visit/denver/events',
  'Fiddler\'s Green Amphitheatre': 'https://www.fiddlersgreenamp.com/events',
  'Globe Hall': 'https://www.globehall.com/events',
  'Levitt Pavilion Denver': 'https://www.levittdenver.org/events',
  'Boulder Theater': 'https://www.bouldertheater.com/events',
  'Cervantes\' Masterpiece Ballroom': 'https://www.cervantesdenver.com/events',
  'Fillmore Auditorium': 'https://www.fillmoreauditorium.org/events',
  'Empower Field at Mile High': 'https://www.empowedfieldatmilehigh.com/events',
  'Aggie Theatre': 'https://www.theaggietheatre.com/events',
  'Boettcher Concert Hall': 'https://www.denvercenter.org/events',
  'Fox Theatre': 'https://www.foxtheatre.com/events',
  'HQ': 'https://www.hqdenver.com/events',
  'Larimer Lounge': 'https://www.larimerlounge.com/events',
  'Lost Lake Lounge': 'https://www.lostlakelounge.com/events',
  'The Mishawaka': 'https://www.themishawaka.com/events',
  'Oriental Theater': 'https://www.orientaltheater.org/events',
  'Skylark Lounge': 'https://www.skylarklounge.com/events',
  'Bellco Theatre': 'https://www.bellcotheatre.com/events',
  'Black Sheep': 'https://www.blacksheepcs.com/events',
  'Washington\'s': 'https://www.washingtons.com/events',
  // Additional venues added
  'Cervantes\' Masterpiece Ballroom & Other Side': 'https://www.cervantesdenver.com/events',
  'City Park Jazz': 'https://www.cityparkjazz.org/events',
  'Denver Botanic Gardens': 'https://www.botanicgardens.org/events',
  'Moe\'s Original BBQ': 'https://www.moesoriginalbbq.com/events',
  'Ford Amphitheater': 'https://www.fordamphitheater.com/events',
  'Greek Theater': 'https://www.greektheatreberkeley.com/events',
  'Dick\'s Sporting Goods Park': 'https://www.dickssportinggoodspark.com/events',
  'Swallow Hill Music': 'https://www.swallowhillmusic.org/events'
};

async function testVenueCoverage() {
  console.log('🎯 Analyzing venue scraping coverage...');
  
  try {
    // Get all unique venues from database
    const events = await storage.getAllEvents();
    const dbVenues = [...new Set(events.map(e => e.venue).filter(Boolean))];
    
    console.log(`\n📊 DATABASE ANALYSIS:`);
    console.log(`Total unique venues in database: ${dbVenues.length}`);
    
    // Sort venues by frequency
    const venueCounts = events.reduce((acc, event) => {
      if (event.venue) {
        acc[event.venue] = (acc[event.venue] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sortedVenues = Object.entries(venueCounts)
      .sort(([,a], [,b]) => b - a);
    
    console.log(`\nTOP 15 VENUES BY EVENT COUNT:`);
    sortedVenues.slice(0, 15).forEach(([venue, count]) => {
      const hasScraprer = venue in VENUE_SCRAPERS_TEST;
      const status = hasScraprer ? '✅' : '❌';
      console.log(`  ${status} ${venue}: ${count} events`);
    });
    
    const scraperVenues = Object.keys(VENUE_SCRAPERS_TEST);
    const covered = dbVenues.filter(venue => scraperVenues.includes(venue));
    const missing = dbVenues.filter(venue => !scraperVenues.includes(venue));
    
    console.log(`\n📈 COVERAGE SUMMARY:`);
    console.log(`Venues with scrapers: ${covered.length}/${dbVenues.length} (${Math.round((covered.length / dbVenues.length) * 100)}%)`);
    
    console.log(`\n✅ COVERED VENUES (${covered.length}):`);
    covered.forEach(venue => {
      const count = venueCounts[venue] || 0;
      console.log(`  - ${venue} (${count} events)`);
    });
    
    console.log(`\n❌ MISSING SCRAPERS (${missing.length}):`);
    missing.forEach(venue => {
      const count = venueCounts[venue] || 0;
      console.log(`  - ${venue} (${count} events)`);
    });
    
    // Calculate coverage by event count
    const coveredEventCount = covered.reduce((sum, venue) => sum + (venueCounts[venue] || 0), 0);
    const totalEventCount = Object.values(venueCounts).reduce((sum, count) => sum + count, 0);
    
    console.log(`\n📊 EVENT COVERAGE:`);
    console.log(`Events at venues with scrapers: ${coveredEventCount}/${totalEventCount} (${Math.round((coveredEventCount / totalEventCount) * 100)}%)`);
    
  } catch (error) {
    console.error('❌ Error analyzing venue coverage:', error);
  }
}

testVenueCoverage();