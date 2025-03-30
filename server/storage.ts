import { events, type Event, type InsertEvent, upvotes, type Upvote, type InsertUpvote, users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, count, desc, gt } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Event methods
  getAllEvents(): Promise<Event[]>;
  getEventById(id: number): Promise<Event | undefined>;
  getUpcomingEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, data: Partial<Event>): Promise<Event | undefined>;
  checkDuplicateEvent(event: InsertEvent): Promise<boolean>;
  
  // Upvote methods
  upvoteEvent(eventId: number, userId: number): Promise<boolean>;
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
    // Create date at the start of the current day (in UTC to match our storage format)
    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    
    console.log(`API: Getting upcoming events after ${startOfToday.toISOString()}`);
    
    return db.select()
      .from(events)
      .where(gt(events.date, startOfToday))
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
    // Parse the date to ensure proper UTC formatting
    let eventDate = insertEvent.date;
    
    if (typeof eventDate === 'string') {
      try {
        // Parse the date string
        const parsedDate = new Date(eventDate);
        
        // Extract year, month, day and create a UTC date at midnight
        const year = parsedDate.getFullYear();
        const month = parsedDate.getMonth();
        const day = parsedDate.getDate();
        
        // Use UTC to avoid timezone shifts - store all events at midnight UTC
        // this ensures consistent date display regardless of the user's timezone
        eventDate = new Date(Date.UTC(year, month, day));
        
        console.log(`API: Parsed event date from ${insertEvent.date} to ${eventDate.toISOString()}`);
      } catch (error) {
        console.error("Error parsing date:", error);
        // If parsing fails, keep the original date
      }
    } else if (eventDate instanceof Date) {
      // If it's already a Date object, still normalize to midnight UTC
      const year = eventDate.getFullYear();
      const month = eventDate.getMonth();
      const day = eventDate.getDate();
      eventDate = new Date(Date.UTC(year, month, day));
    }
    
    // Ensure emoji is always a single character
    const emoji = insertEvent.emoji ? insertEvent.emoji.charAt(0) : null;
    
    const result = await db.insert(events).values({
      ...insertEvent,
      date: eventDate,
      emoji,
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
}

// Replace the MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
