import { Buffer } from 'buffer';

interface SpotifyPlaylistResponse {
  id: string;
  name: string;
  description: string;
  images: Array<{
    url: string;
    height: number | null;
    width: number | null;
  }>;
  tracks: {
    total: number;
  };
  followers: {
    total: number;
  };
  owner: {
    display_name: string;
  };
  external_urls: {
    spotify: string;
  };
}

interface SpotifyAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class SpotifyService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      throw new Error('Spotify API credentials not found in environment variables');
    }
    
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get a new access token using Client Credentials flow
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`Failed to get Spotify access token: ${response.status} ${response.statusText}`);
    }

    const tokenData: SpotifyAccessTokenResponse = await response.json();
    this.accessToken = tokenData.access_token;
    // Set expiry to 5 minutes before actual expiry for safety
    this.tokenExpiry = Date.now() + (tokenData.expires_in - 300) * 1000;
    
    return this.accessToken;
  }

  public async getPlaylistDetails(playlistId: string): Promise<{
    title: string;
    description: string | null;
    coverUrl: string | null;
    trackCount: number;
    followerCount: number;
    ownerName: string;
  }> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.error(`Spotify API error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch playlist details: ${response.status}`);
      }

      const playlist: SpotifyPlaylistResponse = await response.json();
      
      return {
        title: playlist.name,
        description: playlist.description || null,
        coverUrl: playlist.images?.[0]?.url || null,
        trackCount: playlist.tracks.total,
        followerCount: playlist.followers.total,
        ownerName: playlist.owner.display_name,
      };
    } catch (error) {
      console.error('Error fetching Spotify playlist details:', error);
      throw error;
    }
  }

  public extractPlaylistId(spotifyUrl: string): string | null {
    const match = spotifyUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
}

export const spotifyService = new SpotifyService();