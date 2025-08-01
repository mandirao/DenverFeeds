import Anthropic from '@anthropic-ai/sdk';

interface ArtistAnalysis {
  emoji: string;
  summary: string;
  soundsLike: string;
  genre: string;
}

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export class LLMService {
  private apiKey: string;
  private searchApiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.searchApiKey = process.env.SERP_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key not found in environment variables');
    }
  }

  async searchArtistInfo(artistName: string): Promise<SearchResult[]> {
    if (!this.searchApiKey) {
      console.warn('No search API key found, skipping web search');
      return [];
    }

    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.searchApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: `${artistName} band music genre style sound`,
          num: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }

      const data = await response.json();
      return data.organic?.slice(0, 3) || [];
    } catch (error) {
      console.error('Search API error:', error);
      return [];
    }
  }

  async analyzeArtist(artistName: string): Promise<ArtistAnalysis> {
    // First, search for artist information
    const searchResults = await this.searchArtistInfo(artistName);
    const searchContext = searchResults.length > 0 
      ? `\n\nWeb search results about ${artistName}:\n${searchResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`
      : '';

    const prompt = `Analyze the musical artist "${artistName}" and provide the following information:

1. An emoji that represents their musical vibe (just one emoji, no text)
2. A brief 1-2 sentence description of their sound (max 75 characters)
3. Two similar artists they sound like, formatted as "Artist A & Artist B" (max 75 characters)
4. Their primary genre from this exact list: Rock & Alternative, Folk, Country & Americana, Pop & Indie Pop, Electronic & Experimental, Funk, Soul & Jazz, Classical & Orchestral, Hip Hop & R&B

${searchContext}

Respond in JSON format:
{
  "emoji": "🎸",
  "summary": "Dream pop duo with ethereal soundscapes",
  "soundsLike": "Cocteau Twins & Mazzy Star",
  "genre": "Pop & Indie Pop"
}`;

    try {
      // Use Anthropic API
      const anthropic = new Anthropic({
        apiKey: this.apiKey,
      });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const result = JSON.parse(content.text);
        
        // Validate and clean the response
        return {
          emoji: result.emoji || '🎵',
          summary: (result.summary || '').substring(0, 75),
          soundsLike: (result.soundsLike || '').substring(0, 75),
          genre: this.validateGenre(result.genre)
        };
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('LLM API error:', error);
      // Return fallback values
      return {
        emoji: '🎵',
        summary: 'Innovative musical artist',
        soundsLike: 'Various Artists',
        genre: 'Rock & Alternative'
      };
    }
  }

  private validateGenre(genre: string): string {
    const validGenres = [
      'Rock & Alternative',
      'Folk, Country & Americana', 
      'Pop & Indie Pop',
      'Electronic & Experimental',
      'Funk, Soul & Jazz',
      'Classical & Orchestral',
      'Hip Hop & R&B'
    ];
    
    return validGenres.includes(genre) ? genre : 'Rock & Alternative';
  }
}

export const llmService = new LLMService();