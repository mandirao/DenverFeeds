import { events, type Event, type InsertEvent, upvotes, type Upvote, type InsertUpvote, users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, count, desc, gt } from "drizzle-orm";

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
    if (!sessionId) return undefined;
    const result = await db.select().from(users).where(eq(users.sessionId, sessionId));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(events.date);
  }

  async getEventById(id: number): Promise<Event | undefined> {
    const result = await db.select().from(events).where(eq(events.id, id));
    return result[0];
  }

  async getUpcomingEvents(): Promise<Event[]> {
    // In PostgreSQL, we can directly use date operations for correct handling
    // We want to include all events from the beginning of the current day in Denver time
    
    // Let's use a direct database date comparison approach
    // This explicitly casts events.date to DATE to remove time component
    // And compares with CURRENT_DATE in the database's timezone
    
    // We need to account for the fact that we still need to show today's events
    // Since database may be a day ahead, we'll use "yesterday or later" to include current day
    
    // Get events from the beginning of yesterday (to ensure we include today's events across timezones)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format as ISO string (YYYY-MM-DD)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    // Filter events that are from yesterday's date or later
    return db.select()
      .from(events)
      .where(
        // Use the ISO date strings for comparison, which automatically handles timezone differences
        sql`DATE(${events.date}) >= DATE(${yesterdayStr})`
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
}

// Replace the MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
