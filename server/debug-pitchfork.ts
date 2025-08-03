import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

// Debug script to examine Pitchfork structure
async function debugPitchfork() {
  try {
    const url = 'https://pitchfork.com/reviews/best/albums/';
    console.log(`🔍 Debugging Pitchfork structure: ${url}`);
    
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

    console.log('\n📊 Analyzing page structure...');
    
    // Look for common container patterns
    const containers = [
      'article', '.review', '.album-review', '.best-new-album', 
      '.review-item', '.album-item', '[class*="review"]', 
      '[class*="album"]', '.content', '.item'
    ];

    for (const container of containers) {
      const elements = $(container);
      if (elements.length > 0) {
        console.log(`\n✅ Found ${elements.length} elements for: ${container}`);
        
        // Examine first few elements
        elements.slice(0, 3).each((index, element) => {
          const $el = $(element);
          const text = $el.text().trim().substring(0, 200);
          console.log(`  [${index}] Text preview: ${text}...`);
          
          // Look for potential artist/album title elements
          const titleSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', '.title', '[class*="title"]'];
          titleSelectors.forEach(selector => {
            const titleEls = $el.find(selector);
            if (titleEls.length > 0) {
              titleEls.slice(0, 2).each((i, titleEl) => {
                const titleText = $(titleEl).text().trim();
                if (titleText && titleText.length > 5 && titleText.length < 150) {
                  console.log(`    📝 ${selector}: "${titleText}"`);
                }
              });
            }
          });
        });
      }
    }

    // Specifically look for Ryan Davis
    console.log('\n🎯 Looking for "Ryan Davis" specifically...');
    const ryanElements = $('*').filter(function() {
      return $(this).text().toLowerCase().includes('ryan davis');
    });
    
    ryanElements.each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      const tagName = element.tagName;
      const classes = $el.attr('class') || 'no-class';
      console.log(`  Found in <${tagName}> (${classes}): "${text}"`);
    });

  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugPitchfork();