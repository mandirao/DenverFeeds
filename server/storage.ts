import { events, type Event, type InsertEvent, upvotes, type Upvote, type InsertUpvote, users, type User, type InsertUser, playlists, type Playlist, type InsertPlaylist, artists, type Artist, type InsertArtist, discoveredEvents, type DiscoveredEvent, type InsertDiscoveredEvent, discoveredArtists, type DiscoveredArtist, type InsertDiscoveredArtist, venues, type Venue, type InsertVenue, foodEvents, type FoodEvent, type InsertFoodEvent } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, count, desc, gt, gte } from "drizzle-orm";
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

  // Artist methods for automated discovery
  getAllArtists(): Promise<Artist[]>;
  getArtistById(id: number): Promise<Artist | undefined>;
  getArtistByName(name: string): Promise<Artist | undefined>;
  createArtist(artist: InsertArtist): Promise<Artist>;
  updateArtist(id: number, data: Partial<Artist>): Promise<Artist | undefined>;
  deleteArtist(id: number): Promise<boolean>;
  getArtistsForSearch(priority?: string, limit?: number): Promise<Artist[]>;
  updateArtistSearchDate(id: number): Promise<void>;

  // Discovered Events methods for review queue
  getAllDiscoveredEvents(): Promise<DiscoveredEvent[]>;
  getDiscoveredEventById(id: number): Promise<DiscoveredEvent | undefined>;
  createDiscoveredEvent(event: InsertDiscoveredEvent): Promise<DiscoveredEvent>;
  updateDiscoveredEventStatus(id: number, status: 'approved' | 'rejected'): Promise<DiscoveredEvent | undefined>;
  approveDiscoveredEvent(id: number): Promise<Event | undefined>; // Converts to real event
  deleteDiscoveredEvent(id: number): Promise<boolean>;

  // Discovered Artists methods for review queue
  getAllDiscoveredArtists(): Promise<DiscoveredArtist[]>;
  getDiscoveredArtistById(id: number): Promise<DiscoveredArtist | undefined>;
  createDiscoveredArtist(artist: InsertDiscoveredArtist): Promise<DiscoveredArtist>;
  updateDiscoveredArtistStatus(id: number, status: 'approved' | 'rejected'): Promise<DiscoveredArtist | undefined>;
  approveDiscoveredArtist(id: number): Promise<Artist | undefined>; // Converts to real artist
  deleteDiscoveredArtist(id: number): Promise<boolean>;

  // Food event methods for Amuse Bouche
  getAllFoodEvents(): Promise<FoodEvent[]>;
  getFoodEventById(id: number): Promise<FoodEvent | undefined>;
  createFoodEvent(event: InsertFoodEvent): Promise<FoodEvent>;
  updateFoodEvent(id: number, data: Partial<FoodEvent>): Promise<FoodEvent | undefined>;
  deleteFoodEvent(id: number): Promise<boolean>;
  upvoteFoodEvent(id: number): Promise<boolean>;

  // Venues methods for tracking and scraping
  getAllVenues(): Promise<Venue[]>;
  getVenueById(id: number): Promise<Venue | undefined>;
  getVenueByName(name: string): Promise<Venue | undefined>;
  createVenue(venue: InsertVenue): Promise<Venue>;
  updateVenue(id: number, data: Partial<Venue>): Promise<Venue | undefined>;
  updateVenueEventCount(venueName: string): Promise<void>;
  autoTrackArtistAndVenue(artist: string, venue: string): Promise<void>;
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
    const newEvent = result[0];

    // Auto-track artist and venue when event is created
    try {
      await this.autoTrackArtistAndVenue(insertEvent.artist, insertEvent.venue);
    } catch (error) {
      console.error("Auto-tracking failed but event created successfully:", error);
    }

    return newEvent;
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

  // Artist methods implementation
  async getAllArtists(): Promise<Artist[]> {
    return await db.select().from(artists).orderBy(artists.name);
  }

  async getArtistById(id: number): Promise<Artist | undefined> {
    const [artist] = await db.select().from(artists).where(eq(artists.id, id));
    return artist || undefined;
  }

  async getArtistByName(name: string): Promise<Artist | undefined> {
    const [artist] = await db.select().from(artists).where(eq(artists.name, name));
    return artist || undefined;
  }

  async createArtist(artist: InsertArtist): Promise<Artist> {
    const [newArtist] = await db.insert(artists).values(artist).returning();
    return newArtist;
  }

  async updateArtist(id: number, data: Partial<Artist>): Promise<Artist | undefined> {
    const [updatedArtist] = await db
      .update(artists)
      .set(data)
      .where(eq(artists.id, id))
      .returning();
    return updatedArtist || undefined;
  }

  async deleteArtist(id: number): Promise<boolean> {
    const result = await db.delete(artists).where(eq(artists.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getArtistsForSearch(priority?: string, limit: number = 50): Promise<Artist[]> {
    let query = db.select().from(artists).where(eq(artists.isActive, true));
    
    if (priority) {
      query = query.where(and(eq(artists.isActive, true), eq(artists.searchPriority, priority)));
    }
    
    return await query.orderBy(artists.lastSearched).limit(limit);
  }

  async updateArtistSearchDate(id: number): Promise<void> {
    await db
      .update(artists)
      .set({ lastSearched: new Date() })
      .where(eq(artists.id, id));
  }

  // Discovered Events methods
  async getAllDiscoveredEvents(): Promise<DiscoveredEvent[]> {
    const result = await db.select().from(discoveredEvents)
      .where(eq(discoveredEvents.isHidden, false))
      .orderBy(desc(discoveredEvents.discoveredAt));
    return result;
  }

  async getDiscoveredEventById(id: number): Promise<DiscoveredEvent | undefined> {
    const result = await db.select().from(discoveredEvents).where(eq(discoveredEvents.id, id));
    return result[0];
  }

  async createDiscoveredEvent(event: InsertDiscoveredEvent): Promise<DiscoveredEvent> {
    const result = await db.insert(discoveredEvents).values(event).returning();
    return result[0];
  }

  async updateDiscoveredEventStatus(id: number, status: 'approved' | 'rejected'): Promise<DiscoveredEvent | undefined> {
    const result = await db.update(discoveredEvents)
      .set({ status })
      .where(eq(discoveredEvents.id, id))
      .returning();
    return result[0];
  }

  async rejectAndHideDiscoveredEvent(id: number): Promise<DiscoveredEvent | undefined> {
    const result = await db.update(discoveredEvents)
      .set({ status: 'rejected', isHidden: true })
      .where(eq(discoveredEvents.id, id))
      .returning();
    return result[0];
  }

  async approveDiscoveredEvent(id: number): Promise<Event | undefined> {
    const discoveredEvent = await this.getDiscoveredEventById(id);
    if (!discoveredEvent) return undefined;

    // Create the real event - summary and sounds like will be auto-generated later
    const newEvent = await this.createEvent({
      emoji: "🎵", // Default emoji for discovered events
      artist: discoveredEvent.artist,
      venue: discoveredEvent.venue,
      date: discoveredEvent.date,
      summary: `${discoveredEvent.artist} at ${discoveredEvent.venue}`, // Simple summary for now
      soundsLike: "TBD", // Will be auto-generated after approval
      genre: discoveredEvent.genre,
      requester: 'Discovery AI'
    });

    // Update the discovered event status
    await this.updateDiscoveredEventStatus(id, 'approved');

    return newEvent;
  }

  async deleteDiscoveredEvent(id: number): Promise<boolean> {
    const result = await db.delete(discoveredEvents).where(eq(discoveredEvents.id, id));
    return result.rowCount > 0;
  }

  // Discovered Artists methods
  async getAllDiscoveredArtists(): Promise<DiscoveredArtist[]> {
    return await db.select().from(discoveredArtists).orderBy(desc(discoveredArtists.createdAt));
  }

  async getDiscoveredArtistById(id: number): Promise<DiscoveredArtist | undefined> {
    const [artist] = await db.select().from(discoveredArtists).where(eq(discoveredArtists.id, id));
    return artist || undefined;
  }

  async createDiscoveredArtist(artist: InsertDiscoveredArtist): Promise<DiscoveredArtist> {
    const [newArtist] = await db.insert(discoveredArtists).values(artist).returning();
    return newArtist;
  }

  async updateDiscoveredArtistStatus(id: number, status: 'approved' | 'rejected'): Promise<DiscoveredArtist | undefined> {
    const [updatedArtist] = await db
      .update(discoveredArtists)
      .set({ 
        isReviewed: true, 
        isApproved: status === 'approved' 
      })
      .where(eq(discoveredArtists.id, id))
      .returning();
    
    return updatedArtist || undefined;
  }

  async approveDiscoveredArtist(id: number): Promise<Artist | undefined> {
    const discoveredArtist = await this.getDiscoveredArtistById(id);
    if (!discoveredArtist) return undefined;

    // Create new artist from discovered artist
    const newArtist = await this.createArtist({
      name: discoveredArtist.name,
      genre: discoveredArtist.genre,
      source: discoveredArtist.source,
      priority: 'medium'
    });

    // Mark discovered artist as approved
    await this.updateDiscoveredArtistStatus(id, 'approved');

    return newArtist;
  }

  async deleteDiscoveredArtist(id: number): Promise<boolean> {
    try {
      const [deletedArtist] = await db.delete(discoveredArtists).where(eq(discoveredArtists.id, id)).returning();
      return !!deletedArtist;
    } catch (error) {
      console.error("Failed to delete discovered artist:", error);
      return false;
    }
  }

  // Food Events methods (Amuse Bouche)
  async getAllFoodEvents(): Promise<FoodEvent[]> {
    const todayMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
    return await db.select().from(foodEvents)
      .where(gte(sql`COALESCE(${foodEvents.dateEnd}, ${foodEvents.dateStart})`, todayMT))
      .orderBy(foodEvents.dateStart);
  }

  async getFoodEventById(id: number): Promise<FoodEvent | undefined> {
    const [event] = await db.select().from(foodEvents).where(eq(foodEvents.id, id));
    return event || undefined;
  }

  async createFoodEvent(event: InsertFoodEvent): Promise<FoodEvent> {
    const [newEvent] = await db.insert(foodEvents).values(event).returning();
    return newEvent;
  }

  async updateFoodEvent(id: number, data: Partial<FoodEvent>): Promise<FoodEvent | undefined> {
    const [updated] = await db.update(foodEvents).set(data).where(eq(foodEvents.id, id)).returning();
    return updated || undefined;
  }

  async deleteFoodEvent(id: number): Promise<boolean> {
    try {
      await db.delete(foodEvents).where(eq(foodEvents.id, id));
      return true;
    } catch {
      return false;
    }
  }

  async upvoteFoodEvent(id: number): Promise<boolean> {
    try {
      await db.update(foodEvents)
        .set({ upvotes: sql`${foodEvents.upvotes} + 1` })
        .where(eq(foodEvents.id, id));
      return true;
    } catch {
      return false;
    }
  }

  // Venues methods
  async getAllVenues(): Promise<Venue[]> {
    return await db.select().from(venues).orderBy(desc(venues.eventCount), venues.name);
  }

  async getVenueById(id: number): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.id, id));
    return venue || undefined;
  }

  async getVenueByName(name: string): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.name, name));
    return venue || undefined;
  }

  async createVenue(venue: InsertVenue): Promise<Venue> {
    const [newVenue] = await db.insert(venues).values(venue).returning();
    return newVenue;
  }

  async updateVenue(id: number, data: Partial<Venue>): Promise<Venue | undefined> {
    const [updatedVenue] = await db
      .update(venues)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return updatedVenue || undefined;
  }

  async updateVenueEventCount(venueName: string): Promise<void> {
    // Get current event count for this venue
    const [countResult] = await db
      .select({ count: count() })
      .from(events)
      .where(eq(events.venue, venueName));

    // Get most recent event date for this venue
    const [recentEvent] = await db
      .select({ date: events.date })
      .from(events)
      .where(eq(events.venue, venueName))
      .orderBy(desc(events.date))
      .limit(1);

    // Update or create venue record
    const existingVenue = await this.getVenueByName(venueName);
    
    if (existingVenue) {
      await this.updateVenue(existingVenue.id, {
        eventCount: countResult.count,
        lastEventDate: recentEvent?.date || null,
        updatedAt: new Date()
      });
    } else {
      // Auto-create venue if it doesn't exist
      await this.createVenue({
        name: venueName,
        source: 'auto_detected',
        eventCount: countResult.count,
        lastEventDate: recentEvent?.date || null,
        priority: countResult.count > 10 ? 'high' : countResult.count > 3 ? 'medium' : 'low'
      });
    }
  }

  async autoTrackArtistAndVenue(artist: string, venue: string): Promise<void> {
    console.log(`🔄 Auto-tracking artist: ${artist}, venue: ${venue}`);
    
    // Auto-track artist
    const existingArtist = await this.getArtistByName(artist);
    if (!existingArtist) {
      try {
        await this.createArtist({
          name: artist,
          source: 'auto_detected',
          searchPriority: 'medium',
          notes: `Auto-detected from event creation: ${new Date().toISOString()}`
        });
        console.log(`✅ Auto-added artist: ${artist}`);
      } catch (error) {
        console.log(`⚠️ Artist ${artist} may already exist or failed to create:`, error.message);
      }
    }

    // Auto-track venue and update event count
    await this.updateVenueEventCount(venue);
    console.log(`✅ Updated venue tracking: ${venue}`);
  }
}

// Replace the MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
