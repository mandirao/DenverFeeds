import { events, type Event, type InsertEvent, upvotes, type Upvote, type InsertUpvote, users, type User, type InsertUser, playlists, type Playlist, type InsertPlaylist } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, count, desc, gt } from "drizzle-orm";
import { spotifyService } from "./spotify";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserBySessionId(sessionId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Event methods
  getAllEvents(): Promise<Event[]>;
  getEventById(id: number): Promise<Event | undefined>;
  getUpcomingEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, data: Partial<Event>): Promise<Event | undefined>;
  checkDuplicateEvent(event: InsertEvent): Promise<boolean>;
  deleteEvent(id: number): Promise<boolean>;
  
  // Upvote methods
  upvoteEvent(eventId: number, userId: number): Promise<boolean>;
  removeUpvote(eventId: number, userId: number): Promise<boolean>;
  hasUserUpvoted(eventId: number, userId: number): Promise<boolean>;
  setEventScheduled(eventId: number, scheduled: boolean): Promise<Event | undefined>;
  
  // Playlist methods
  getAllPlaylists(): Promise<Playlist[]>;
  getPlaylistById(id: number): Promise<Playlist | undefined>;
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: number, data: Partial<Playlist>): Promise<Playlist | undefined>;
  deletePlaylist(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }
  
  async getUserBySessionId(sessionId: string): Promise<User | undefined> {
    if (!sessionId) {
      console.log("No sessionId provided to getUserBySessionId");
      return undefined;
    }
    
    console.log(`Looking up user by sessionId: ${sessionId}`);
    const result = await db.select().from(users).where(eq(users.sessionId, sessionId));
    
    if (result.length > 0) {
      console.log(`Found user with ID: ${result[0].id} for sessionId: ${sessionId}`);
      return result[0];
    } else {
      console.log(`No user found for sessionId: ${sessionId}`);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log(`Creating new user with data:`, JSON.stringify(insertUser));
    try {
      const result = await db.insert(users).values(insertUser).returning();
      console.log(`Successfully created user with ID: ${result[0].id}`);
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getAllEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(events.date);
  }

  async getEventById(id: number): Promise<Event | undefined> {
    const result = await db.select().from(events).where(eq(events.id, id));
    return result[0];
  }

  async getUpcomingEvents(): Promise<Event[]> {
    // Use the database's CURRENT_DATE directly for date comparison
    // This is the most reliable way to get events from today forward
    // without timezone conversion issues
    
    // Query for events from today's date or later based on the database server's date
    return db.select()
      .from(events)
      .where(
        // This ensures we only get events from today (current_date) or later
        sql`DATE(${events.date}) >= CURRENT_DATE`
      )
      .orderBy(events.date);
  }
  
  async checkDuplicateEvent(event: InsertEvent): Promise<boolean> {
    const result = await db.select().from(events).where(
      and(
        eq(sql`LOWER(${events.artist})`, event.artist.toLowerCase()),
        eq(sql`LOWER(${events.venue})`, event.venue.toLowerCase()),
        eq(events.date, event.date)
      )
    );
    return result.length > 0;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const result = await db.insert(events).values({
      ...insertEvent,
      isScheduled: false,
      upvotes: 0,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updateEvent(id: number, data: Partial<Event>): Promise<Event | undefined> {
    const result = await db.update(events)
      .set(data)
      .where(eq(events.id, id))
      .returning();
    return result[0];
  }

  async upvoteEvent(eventId: number, userId: number): Promise<boolean> {
    // Check if event exists and is not scheduled
    const eventResult = await db.select().from(events).where(eq(events.id, eventId));
    if (!eventResult.length || eventResult[0].isScheduled) return false;

    // Check if user exists
    const userResult = await db.select().from(users).where(eq(users.id, userId));
    if (!userResult.length) return false;
    
    // Check if user already upvoted
    const hasUpvoted = await this.hasUserUpvoted(eventId, userId);
    if (hasUpvoted) return false;
    
    // Add upvote
    await db.insert(upvotes).values({
      userId,
      eventId
    });
    
    // Update event upvote count
    await db.update(events)
      .set({
        upvotes: sql`${events.upvotes} + 1`
      })
      .where(eq(events.id, eventId));
    
    return true;
  }

  async removeUpvote(eventId: number, userId: number): Promise<boolean> {
    // Check if event exists
    const eventResult = await db.select().from(events).where(eq(events.id, eventId));
    if (!eventResult.length) return false;
    
    // Check if user exists
    const userResult = await db.select().from(users).where(eq(users.id, userId));
    if (!userResult.length) return false;
    
    // Check if user has upvoted
    const hasUpvoted = await this.hasUserUpvoted(eventId, userId);
    if (!hasUpvoted) return false;
    
    // Remove the upvote
    await db.delete(upvotes).where(
      and(
        eq(upvotes.eventId, eventId),
        eq(upvotes.userId, userId)
      )
    );
    
    // Update event upvote count (ensure it doesn't go below 0)
    await db.update(events)
      .set({
        upvotes: sql`GREATEST(${events.upvotes} - 1, 0)`
      })
      .where(eq(events.id, eventId));
    
    return true;
  }

  async hasUserUpvoted(eventId: number, userId: number): Promise<boolean> {
    const result = await db.select().from(upvotes).where(
      and(
        eq(upvotes.eventId, eventId),
        eq(upvotes.userId, userId)
      )
    );
    return result.length > 0;
  }

  async setEventScheduled(eventId: number, scheduled: boolean = true): Promise<Event | undefined> {
    const result = await db.update(events)
      .set({ isScheduled: scheduled })
      .where(eq(events.id, eventId))
      .returning();
    return result[0];
  }

  async deleteEvent(id: number): Promise<boolean> {
    try {
      // First delete any upvotes associated with this event
      await db.delete(upvotes).where(eq(upvotes.eventId, id));
      
      // Then delete the event
      const result = await db.delete(events).where(eq(events.id, id)).returning();
      
      // If we got a result back, the deletion was successful
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting event:", error);
      return false;
    }
  }

  // Playlist methods
  async getAllPlaylists(): Promise<Playlist[]> {
    return db.select().from(playlists).where(eq(playlists.isActive, true)).orderBy(desc(playlists.createdAt));
  }

  async getPlaylistById(id: number): Promise<Playlist | undefined> {
    const result = await db.select().from(playlists).where(eq(playlists.id, id));
    return result[0];
  }

  async createPlaylist(insertPlaylist: InsertPlaylist): Promise<Playlist> {
    // Extract Spotify ID from URL
    const spotifyId = spotifyService.extractPlaylistId(insertPlaylist.spotifyUrl);
    
    // Start with base data that matches the insert schema
    let playlistData: any = {
      ...insertPlaylist,
      spotifyId,
      title: 'Loading...', // Will be overwritten by Spotify data
      artist: 'Various Artists', // Default value
      genre: 'MIXED', // Default value
      updatedAt: new Date()
    };

    // Try to fetch metadata from Spotify API
    if (spotifyId) {
      try {
        console.log(`Fetching Spotify metadata for playlist ID: ${spotifyId}`);
        const spotifyData = await spotifyService.getPlaylistDetails(spotifyId);
        
        // Add Spotify metadata to playlist data
        playlistData = {
          ...playlistData,
          title: spotifyData.title,
          artist: 'Various Artists', // Keep the default value
          genre: 'MIXED', // Keep the default value  
          description: spotifyData.description,
          coverUrl: spotifyData.coverUrl,
          trackCount: spotifyData.trackCount,
          followerCount: spotifyData.followerCount,
          featuredArtists: spotifyData.featuredArtists,
          // Keep the provided curator or use Spotify owner as fallback
          curator: insertPlaylist.curator !== 'Community Member' ? insertPlaylist.curator : spotifyData.ownerName
        };
        
        console.log(`Successfully fetched Spotify metadata: ${spotifyData.title} - ${spotifyData.trackCount} tracks`);
      } catch (error) {
        console.error('Failed to fetch Spotify metadata, using provided data:', error);
        // Continue with the original data if Spotify API fails
      }
    }
    
    const result = await db.insert(playlists).values(playlistData).returning();
    return result[0];
  }

  async updatePlaylist(id: number, data: Partial<Playlist>): Promise<Playlist | undefined> {
    const result = await db.update(playlists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playlists.id, id))
      .returning();
    return result[0];
  }

  async deletePlaylist(id: number): Promise<boolean> {
    try {
      const result = await db.update(playlists)
        .set({ isActive: false })
        .where(eq(playlists.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting playlist:", error);
      return false;
    }
  }
}

// Replace the MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
