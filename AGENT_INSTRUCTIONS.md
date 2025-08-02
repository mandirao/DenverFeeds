# Agent Instructions: Artist Database + Automated Event Discovery

## Overview
Build and maintain a curated database of artists, then use this database for weekly automated event discovery. This approach ensures quality control while building your own taste-driven artist collection over time.

## Phase 1: Artist Database Creation

### 1.1 Create Artist Database Schema
- Create new `artists` table with fields:
  - `id`, `name`, `genre`, `source` (existing/pitchfork/ohmyrockness/manual)
  - `added_date`, `last_searched`, `is_active`, `search_priority`
  - `notes` (for manual curation notes)

### 1.2 Seed Database with Existing Artists
- Extract all unique artists from current `events` table
- Populate new `artists` table with these as "existing" source
- This gives you ~200+ artists to start searching for

### 1.3 Build Artist Management Interface
- Admin page to view/add/remove artists from search database
- Ability to set search priority (high/medium/low)
- Quick-add interface for discovered artists

## Phase 2: Weekly Artist Discovery

### 2.1 Scrape New Artist Sources  
- **Pitchfork Best New Albums**: https://pitchfork.com/reviews/best/albums/
- **Oh My Rockness Recommended Shows**: https://www.ohmyrockness.com/shows/recommended
- Add discovered artists to database with appropriate source tags
- Avoid duplicates, update existing entries if found

## Phase 3: Weekly Event Search

### 3.1 Search Strategy  
For each artist in the database:
- Use Serper API to search for: `"[Artist Name]" tour dates 2025 Denver Colorado concerts tickets`
- Search for venue announcements, Bandsintown, official artist pages
- Focus on Denver/Boulder area venues from our venue list
- Update `last_searched` timestamp for each artist

### 3.2 Event Discovery & Analysis
When tour dates are found:
- Use existing `LLMService.analyzeArtist()` for event details
- Generate all required fields: emoji, summary, sounds_like, genre, venue, date
- Cross-reference with actual tour announcements when possible
- Prioritize artists with confirmed Denver dates

### 3.3 Quality Control & Event Creation
- Only create events that meet quality standards
- Maintain existing tone and format patterns
- Use actual venue names from our venue list when possible
- Set realistic dates based on tour announcements
- Handle duplicates gracefully with existing logic

## Phase 4: Database Maintenance

### 4.1 Artist Database Updates
- Track search success rates per artist
- Identify artists who never have tour dates (mark as low priority)
- Add new artists discovered through event searches
- Regular cleanup of inactive/irrelevant artists

### 4.2 Weekly Processing Stats
- Log: artists searched, events found, events created, new artists added
- Track source effectiveness (which sources provide best results)
- Monitor for website structure changes in scraping targets

## Phase 5: Automation & Scheduling

### 5.1 Weekly Schedule  
- **Monday Morning Routine**:
  1. Scrape Pitchfork/Oh My Rockness for new artists (add to database)
  2. Search tour dates for ~50 high-priority artists from database
  3. Create 8-12 quality events from discovered shows
  4. Update artist search timestamps and priority rankings

### 5.2 Search Prioritization
- **High Priority**: Recently added artists, artists with frequent tours
- **Medium Priority**: Established artists in database, rotate weekly
- **Low Priority**: Artists who rarely tour, search monthly
- Focus search time on artists most likely to have announcements

## Technical Implementation

### New Database Schema:
```sql
CREATE TABLE artists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  genre VARCHAR(50),
  source VARCHAR(50), -- 'existing', 'pitchfork', 'ohmyrockness', 'manual'
  search_priority VARCHAR(20) DEFAULT 'medium', -- 'high', 'medium', 'low'
  last_searched TIMESTAMP,
  last_found_event TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Key Files to Create/Update:
- `shared/schema.ts` - Add artists table schema
- `server/routes.ts` - Add artist management endpoints  
- `server/storage.ts` - Add artist CRUD operations
- `scripts/seed-artists.js` - Extract artists from existing events
- `scripts/weekly-discovery.js` - Main automation script

### Environment Variables Required:
- `ANTHROPIC_API_KEY` - For artist analysis
- `SERPER_API_KEY` - For web search functionality  
- `DATABASE_URL` - PostgreSQL connection

## Success Criteria
1. Build artist database of 300+ curated artists within first month
2. Maintain 80%+ search success rate (finding relevant tour info)
3. Generate 8-12 quality events per week from artist database
4. Keep false positive rate under 10% (unsuitable events created)
5. Continuously grow and refine artist database based on discoveries

## Implementation Priority:
1. **Week 1**: Create artist database schema and seed with existing artists
2. **Week 2**: Build basic artist management interface
3. **Week 3**: Implement artist search automation for existing database
4. **Week 4**: Add Pitchfork/Oh My Rockness scraping to grow database
5. **Week 5+**: Full automation with monitoring and refinement