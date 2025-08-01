
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
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
    this.searchApiKey = process.env.SERPER_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('LLM API key not found in environment variables');
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
4. Their primary genre from this exact list: Rock & Alternative, Folk Country & Americana, Pop & Indie Pop, Electronic & Experimental, Funk Soul & Jazz, Classical & Orchestral, Hip Hop & R&B

${searchContext}

Respond in JSON format:
{
  "emoji": "🎸",
  "summary": "Brief description of sound",
  "soundsLike": "Similar Artist 1 & Similar Artist 2",
  "genre": "Rock & Alternative"
}`;

    if (process.env.ANTHROPIC_API_KEY) {
      return this.callClaude(prompt);
    } else if (process.env.OPENAI_API_KEY) {
      return this.callOpenAI(prompt);
    } else {
      throw new Error('No supported LLM API key found');
    }
  }

  private async callClaude(prompt: string): Promise<ArtistAnalysis> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  private async callOpenAI(prompt: string): Promise<ArtistAnalysis> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }
}

export const llmService = new LLMService();
