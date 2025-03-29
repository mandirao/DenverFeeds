import { events, type Event, type InsertEvent, upvotes, type Upvote, type InsertUpvote, users, type User, type InsertUser } from "@shared/schema";

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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private events: Map<number, Event>;
  private eventUpvotes: Map<number, Upvote[]>;
  currentUserId: number;
  currentEventId: number;
  currentUpvoteId: number;

  constructor() {
    this.users = new Map();
    this.events = new Map();
    this.eventUpvotes = new Map();
    this.currentUserId = 1;
    this.currentEventId = 1;
    this.currentUpvoteId = 1;
    
    // Add a default user for testing
    this.users.set(1, {
      id: 1,
      username: "admin",
      password: "password"
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  async getEventById(id: number): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getUpcomingEvents(): Promise<Event[]> {
    const now = new Date();
    return Array.from(this.events.values())
      .filter(event => new Date(event.date) > now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  
  async checkDuplicateEvent(event: InsertEvent): Promise<boolean> {
    return Array.from(this.events.values()).some(
      existingEvent => 
        existingEvent.artist.toLowerCase() === event.artist.toLowerCase() && 
        existingEvent.venue.toLowerCase() === event.venue.toLowerCase() &&
        new Date(existingEvent.date).getTime() === new Date(event.date).getTime()
    );
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = this.currentEventId++;
    const event: Event = { 
      ...insertEvent, 
      id, 
      isScheduled: false, 
      upvotes: 0,
      createdAt: new Date()
    };
    this.events.set(id, event);
    // Initialize empty upvotes array for this event
    this.eventUpvotes.set(id, []);
    return event;
  }

  async updateEvent(id: number, data: Partial<Event>): Promise<Event | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;

    const updatedEvent = { ...event, ...data };
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }

  async upvoteEvent(eventId: number, userId: number): Promise<boolean> {
    const event = this.events.get(eventId);
    const user = this.users.get(userId);
    
    if (!event || !user || event.isScheduled) return false;
    
    // Check if user already upvoted
    const hasUpvoted = await this.hasUserUpvoted(eventId, userId);
    if (hasUpvoted) return false;
    
    // Add upvote
    const upvote: Upvote = {
      id: this.currentUpvoteId++,
      userId,
      eventId,
      createdAt: new Date()
    };
    
    // Get or initialize upvotes array for this event
    const eventUpvotes = this.eventUpvotes.get(eventId) || [];
    eventUpvotes.push(upvote);
    this.eventUpvotes.set(eventId, eventUpvotes);
    
    // Update event upvote count
    event.upvotes = (event.upvotes || 0) + 1;
    this.events.set(eventId, event);
    
    return true;
  }

  async hasUserUpvoted(eventId: number, userId: number): Promise<boolean> {
    const eventUpvotes = this.eventUpvotes.get(eventId) || [];
    return eventUpvotes.some(upvote => upvote.userId === userId);
  }

  async setEventScheduled(eventId: number, scheduled: boolean = true): Promise<Event | undefined> {
    const event = this.events.get(eventId);
    if (!event) return undefined;
    
    event.isScheduled = scheduled;
    this.events.set(eventId, event);
    return event;
  }
}

export const storage = new MemStorage();
