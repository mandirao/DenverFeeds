#!/usr/bin/env tsx

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

async function debugOMR() {
  try {
    const url = 'https://losangeles.ohmyrockness.com/shows/recommended';
    console.log(`🔍 Debugging OMR structure: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Concert Discovery Bot)'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('📄 Total HTML length:', html.length);
    
    // Look for artist links
    const artistLinks = $('a[href*="/bands/"]');
    console.log(`🎵 Found ${artistLinks.length} artist links`);
    
    // Show first 10 artist links with their context
    artistLinks.slice(0, 10).each((i, el) => {
      const $link = $(el);
      const name = $link.text().trim();
      const href = $link.attr('href');
      const parent = $link.parent().get(0)?.tagName || 'unknown';
      const parentClass = $link.parent().attr('class') || 'no-class';
      console.log(`${i + 1}. "${name}" -> ${href} (parent: ${parent}.${parentClass})`);
    });
    
    // Look for common show container patterns
    console.log('\n📦 Looking for show containers...');
    const containers = [
      { selector: '.show', name: 'show class' },
      { selector: '[class*="show"]', name: 'show in class name' },
      { selector: '.event', name: 'event class' },
      { selector: '.listing', name: 'listing class' },
      { selector: '.recommended-show', name: 'recommended-show class' },
      { selector: 'div:has(a[href*="/bands/"])', name: 'divs with band links' }
    ];
    
    containers.forEach(({ selector, name }) => {
      const elements = $(selector);
      console.log(`  ${name}: ${elements.length} elements`);
    });
    
    // Look for actual text patterns like from the web fetch
    console.log('\n🔍 Looking for expected artist names in body text...');
    const bodyText = $('body').text();
    
    const expectedArtists = ['Adrian Quesada', 'Colleen Green', 'Kaytranada', 'Thee Heart Tones'];
    expectedArtists.forEach(artist => {
      const found = bodyText.includes(artist);
      console.log(`  ${artist}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });
    
    // Show sample of body text structure
    console.log('\n📄 Sample body text structure:');
    const firstChars = bodyText.substring(0, 1000).replace(/\s+/g, ' ');
    console.log(firstChars);
    
    // Look for date patterns
    const dateMatches = bodyText.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{2}\/\d{2}/g);
    console.log('\n📅 Found date patterns:', dateMatches?.slice(0, 5));
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugOMR();