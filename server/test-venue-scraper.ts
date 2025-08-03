import fetch from 'node-fetch';

// Test venue scraping capabilities
async function testVenueScrapingUrls() {
  console.log('🧪 Testing venue website accessibility...');
  
  const testVenues = [
    { name: 'Red Rocks Amphitheatre', url: 'https://www.redrocksonline.com/events' },
    { name: 'Mission Ballroom', url: 'https://www.missionballroom.com/events' },
    { name: 'Gothic Theatre', url: 'https://www.gothictheatre.com/events' },
    { name: 'Hi-Dive', url: 'https://www.hi-dive.com/events' },
    { name: 'Globe Hall', url: 'https://www.globehall.com/events' }
  ];
  
  console.log('\n🌐 WEBSITE ACCESSIBILITY TEST:');
  
  for (const venue of testVenues) {
    try {
      console.log(`\n📍 Testing ${venue.name}...`);
      
      const response = await fetch(venue.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000
      });
      
      if (response.ok) {
        const html = await response.text();
        const hasEvents = html.toLowerCase().includes('event') || 
                         html.toLowerCase().includes('show') || 
                         html.toLowerCase().includes('concert');
        
        console.log(`  ✅ ${venue.name}: HTTP ${response.status}`);
        console.log(`  📄 Content size: ${html.length} characters`);
        console.log(`  🎵 Contains event content: ${hasEvents ? 'Yes' : 'No'}`);
        
        // Check for common event-related selectors
        const commonSelectors = ['.event', '.show', '.concert', '.listing', '.artist', '.date'];
        const foundSelectors = commonSelectors.filter(selector => 
          html.includes(selector.replace('.', 'class="')) || 
          html.includes(selector.replace('.', 'id="'))
        );
        
        if (foundSelectors.length > 0) {
          console.log(`  🔍 Found selectors: ${foundSelectors.join(', ')}`);
        }
        
      } else {
        console.log(`  ❌ ${venue.name}: HTTP ${response.status} - ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`  ❌ ${venue.name}: Error - ${error.message}`);
    }
  }
  
  console.log('\n📊 Test complete. Ready for production venue scraping.');
}

testVenueScrapingUrls();