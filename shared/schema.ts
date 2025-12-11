import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define valid genres
export const genres = [
  'Rock & Alternative',
  'Folk, Country & Americana',
  'Pop & Indie Pop',
  'Electronic & Experimental',
  'Funk, Soul & Jazz',
  'Classical & Orchestral',
  'Hip Hop & R&B'
];

export interface VenueOption {
  value: string;
  label: string;
  group: "denver_boulder" | "road_trip" | "other";
}

export const venueOptions: VenueOption[] = [
  // Denver/Boulder Area venues
  { value: "TBD", label: "TBD", group: "denver_boulder" },
  { value: "other", label: "Other/Festival", group: "denver_boulder" },
  { value: "Ball Arena", label: "Ball Arena", group: "denver_boulder" },
  { value: "Bellco Theatre", label: "Bellco Theatre", group: "denver_boulder" },
  { value: "Bluebird Theater", label: "Bluebird Theater", group: "denver_boulder" },
  { value: "Boettcher Concert Hall", label: "Boettcher Concert Hall", group: "denver_boulder" },
  { value: "Boulder Theater", label: "Boulder Theater", group: "denver_boulder" },
  { value: "Cervantes' Masterpiece Ballroom", label: "Cervantes' Masterpiece Ballroom", group: "denver_boulder" },
  { value: "Chautauqua Auditorium", label: "Chautauqua Auditorium", group: "denver_boulder" },
  { value: "City Park", label: "City Park", group: "denver_boulder" },
  { value: "Club Vinyl", label: "Club Vinyl", group: "denver_boulder" },
  { value: "Coors Field", label: "Coors Field", group: "denver_boulder" },
  { value: "Dazzle Denver", label: "Dazzle Denver", group: "denver_boulder" },
  { value: "Denver Botanic Gardens", label: "Denver Botanic Gardens", group: "denver_boulder" },
  { value: "Dick's Sporting Goods Park", label: "Dick's Sporting Goods Park", group: "denver_boulder" },
  { value: "Empower Field at Mile High", label: "Empower Field at Mile High", group: "denver_boulder" },
  { value: "Fiddlers Green Amphitheatre", label: "Fiddlers Green Amphitheatre", group: "denver_boulder" },
  { value: "Fillmore Auditorium", label: "Fillmore Auditorium", group: "denver_boulder" },
  { value: "Folsom Field", label: "Folsom Field", group: "denver_boulder" },
  { value: "Fox Theatre", label: "Fox Theatre", group: "denver_boulder" },
  { value: "Globe Hall", label: "Globe Hall", group: "denver_boulder" },
  { value: "Gothic Theatre", label: "Gothic Theatre", group: "denver_boulder" },
  { value: "Greek Theater", label: "Greek Theater", group: "denver_boulder" },
  { value: "HQ", label: "HQ", group: "denver_boulder" },
  { value: "Hi-Dive", label: "Hi-Dive", group: "denver_boulder" },
  { value: "Larimer Lounge", label: "Larimer Lounge", group: "denver_boulder" },
  { value: "Levitt Pavilion Denver", label: "Levitt Pavilion Denver", group: "denver_boulder" },
  { value: "Lost Lake Lounge", label: "Lost Lake Lounge", group: "denver_boulder" },
  { value: "Marquis Theater", label: "Marquis Theater", group: "denver_boulder" },
  { value: "Meow Wolf Denver", label: "Meow Wolf Denver", group: "denver_boulder" },
  { value: "Mission Ballroom", label: "Mission Ballroom", group: "denver_boulder" },
  { value: "Moe's Original BBQ", label: "Moe's Original BBQ", group: "denver_boulder" },
  { value: "Newman Center", label: "Newman Center", group: "denver_boulder" },
  { value: "Ogden Theatre", label: "Ogden Theatre", group: "denver_boulder" },
  { value: "Ophelia's", label: "Ophelia's", group: "denver_boulder" },
  { value: "Oriental Theater", label: "Oriental Theater", group: "denver_boulder" },
  { value: "Paramount Theatre", label: "Paramount Theatre", group: "denver_boulder" },
  { value: "Red Rocks Amphitheatre", label: "Red Rocks Amphitheatre", group: "denver_boulder" },
  { value: "ReelWorks Denver", label: "ReelWorks Denver", group: "denver_boulder" },
  { value: "Roxy on Broadway", label: "Roxy on Broadway", group: "denver_boulder" },
  { value: "Skylark Lounge", label: "Skylark Lounge", group: "denver_boulder" },
  { value: "Summit Music Hall", label: "Summit Music Hall", group: "denver_boulder" },
  { value: "Swallow Hill", label: "Swallow Hill", group: "denver_boulder" },
  { value: "The Brighton", label: "The Brighton", group: "denver_boulder" },
  { value: "The Church", label: "The Church", group: "denver_boulder" },
  { value: "The Meadowlark", label: "The Meadowlark", group: "denver_boulder" },
  { value: "The Velvet Elk Lounge", label: "The Velvet Elk Lounge", group: "denver_boulder" },
  
  // Road Trip venues
  { value: "Aggie Theatre", label: "Aggie Theatre", group: "road_trip" },
  { value: "Belly Up Aspen", label: "Belly Up Aspen", group: "road_trip" },
  { value: "Black Sheep", label: "Black Sheep", group: "road_trip" },
  { value: "Dillon Amphitheater", label: "Dillon Amphitheater", group: "road_trip" },
  { value: "Ford Amphitheater, CO Springs", label: "Ford Amphitheater, CO Springs", group: "road_trip" },
  { value: "Fort Collins Armory", label: "Fort Collins Armory", group: "road_trip" },
  { value: "Gerald R. Ford Amphitheater, Vail", label: "Gerald R. Ford Amphitheater, Vail", group: "road_trip" },
  { value: "Gold Hill Inn", label: "Gold Hill Inn", group: "road_trip" },
  { value: "Greeley Stampede", label: "Greeley Stampede", group: "road_trip" },
  { value: "Lulu's Downtown", label: "Lulu's Downtown", group: "road_trip" },
  { value: "New Belgium Brewing Company", label: "New Belgium Brewing Company", group: "road_trip" },
  { value: "Sunset Amphitheater", label: "Sunset Amphitheater", group: "road_trip" },
  { value: "Surf Hotel", label: "Surf Hotel", group: "road_trip" },
  { value: "The Coast", label: "The Coast", group: "road_trip" },
  { value: "The Lyric", label: "The Lyric", group: "road_trip" },
  { value: "The Mishawaka", label: "The Mishawaka", group: "road_trip" },
  { value: "Washington's", label: "Washington's", group: "road_trip" }
];

// Helper function to get all Denver/Boulder area venues
export const getDenverBoulderVenues = (): string[] => {
  return venueOptions
    .filter(venue => venue.group === "denver_boulder")
    .map(venue => venue.value);
};

// Define the list of cheap thrills venues (smaller, more affordable venues)
export const cheapThrillsVenues = [
  "Hi-Dive", 
  "Larimer Lounge", 
  "Marquis Theater", 
  "HQ", 
  "Lost Lake Lounge",
  "City Park", 
  "Globe Hall",
  "Moe's Original BBQ",
  "Skylark Lounge"
];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  sessionId: text("session_id").unique(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  sessionId: true,
}).extend({
  password: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Event schema
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  emoji: text("emoji").notNull(),
  artist: varchar("artist", { length: 75 }).notNull(),
  venue: varchar("venue", { length: 75 }).notNull(),
  date: timestamp("date").notNull(),
  summary: varchar("summary", { length: 75 }).notNull(),
  soundsLike: varchar("sounds_like", { length: 75 }).notNull(),
  genre: varchar("genre", { length: 30 }).notNull(),
  requester: varchar("requester", { length: 50 }).default('Mandi'),
  isScheduled: boolean("is_scheduled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  upvotes: integer("upvotes").default(0),
});

// Create a refined insert schema with custom validation
export const insertEventSchema = createInsertSchema(events)
  .omit({
    id: true,
    isScheduled: true,
    createdAt: true,
    upvotes: true,
  })
  .extend({
    // Add custom validation for genre to handle both formats
    genre: z.string().transform((val) => {
      // Check if it's already a valid genre
      if (genres.includes(val)) {
        return val;
      }
      
      // Try to match with a normalized version (replace slashes with commas or vice versa)
      const normalizedGenres = genres.map(g => g.replace(/,/g, '/'));
      const index = normalizedGenres.findIndex(g => g === val.replace(/,/g, '/'));
      if (index !== -1) {
        return genres[index]; // Return the canonical version
      }
      
      // Return the original value - it will be validated by zod enum below
      return val;
    }).refine((val) => genres.includes(val), {
      message: `Genre must be one of: ${genres.join(', ')}`
    }),
    
    // Add custom validation for venue to handle both predefined venues and 'other' entries
    venue: z.string().min(1, "Venue is required").max(75, "Venue must be 75 characters or less"),
    
    // Add validation for requester field
    requester: z.string().min(1, "Your name is required").max(50, "Name must be 50 characters or less")
  });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Upvotes schema to track user votes
export const upvotes = pgTable("upvotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  eventId: integer("event_id").notNull().references(() => events.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUpvoteSchema = createInsertSchema(upvotes).omit({
  id: true,
  createdAt: true,
});

export type InsertUpvote = z.infer<typeof insertUpvoteSchema>;
export type Upvote = typeof upvotes.$inferSelect;

// Playlists schema for curated music collections
export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  curator: varchar("curator", { length: 50 }).notNull(),
  spotifyUrl: varchar("spotify_url", { length: 200 }).notNull(),
  spotifyId: varchar("spotify_id", { length: 50 }), // Extracted from URL for API calls
  coverUrl: varchar("cover_url", { length: 300 }), // Auto-fetched from Spotify
  description: text("description"),
  trackCount: integer("track_count"),
  duration: integer("duration"), // in milliseconds
  followerCount: integer("follower_count"),
  featuredArtists: text("featured_artists").array(), // Array of artist names from tracks
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlaylistSchema = createInsertSchema(playlists)
  .omit({
    id: true,
    title: true, // Auto-fetched from Spotify API
    spotifyId: true, // Auto-extracted from URL
    coverUrl: true, // Auto-fetched from Spotify API
    description: true, // Auto-fetched from Spotify API
    trackCount: true, // Auto-fetched from Spotify API
    duration: true, // Auto-fetched from Spotify API
    followerCount: true, // Auto-fetched from Spotify API
    featuredArtists: true, // Auto-fetched from Spotify API
    isActive: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    spotifyUrl: z.string().url("Must be a valid Spotify URL")
      .refine((url) => url.includes("spotify.com/playlist/"), {
        message: "Must be a Spotify playlist URL"
      }),
  });

export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type Playlist = typeof playlists.$inferSelect;

// Artists table for automated event discovery
export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  genre: varchar("genre", { length: 50 }),
  source: varchar("source", { length: 50 }).notNull(), // 'existing', 'pitchfork', 'ohmyrockness', 'manual'
  searchPriority: varchar("search_priority", { length: 20 }).default('medium'), // 'high', 'medium', 'low'
  lastSearched: timestamp("last_searched"),
  lastFoundEvent: timestamp("last_found_event"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertArtistSchema = createInsertSchema(artists)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    name: z.string().min(1, "Artist name is required").max(100, "Artist name must be 100 characters or less"),
    source: z.enum(['existing', 'pitchfork', 'ohmyrockness', 'manual']),
    searchPriority: z.enum(['high', 'medium', 'low']).default('medium'),
  });

export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artists.$inferSelect;

// Discovered Events table for review queue
export const discoveredEvents = pgTable("discovered_events", {
  id: serial("id").primaryKey(),
  artist: varchar("artist", { length: 75 }).notNull(),
  venue: varchar("venue", { length: 75 }).notNull(),
  date: timestamp("date").notNull(),
  genre: varchar("genre", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).default('pending'), // 'pending', 'approved', 'rejected'
  discoveredAt: timestamp("discovered_at").defaultNow(),
  discoverySource: varchar("discovery_source", { length: 50 }).default('automated'),
  confidence: integer("confidence"), // AI confidence score 1-100
  rawData: text("raw_data"), // Original discovery data for reference
  isHidden: boolean("is_hidden").default(false), // Hide rejected events from view
});

export const insertDiscoveredEventSchema = createInsertSchema(discoveredEvents)
  .omit({
    id: true,
    discoveredAt: true,
  });

export type InsertDiscoveredEvent = z.infer<typeof insertDiscoveredEventSchema>;
export type DiscoveredEvent = typeof discoveredEvents.$inferSelect;

// Discovered Artists schema
export const discoveredArtists = pgTable("discovered_artists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  genre: text("genre").notNull(),
  source: text("source").notNull(), // 'pitchfork_best_new', 'oh_my_rockness_nyc', etc.
  description: text("description"),
  confidence: real("confidence").notNull().default(0.8),
  rawData: jsonb("raw_data"), // Store original scraped data
  isReviewed: boolean("is_reviewed").default(false),
  isApproved: boolean("is_approved"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDiscoveredArtistSchema = createInsertSchema(discoveredArtists).omit({
  id: true,
  createdAt: true,
});

export type InsertDiscoveredArtist = z.infer<typeof insertDiscoveredArtistSchema>;
export type DiscoveredArtist = typeof discoveredArtists.$inferSelect;

// Venues table for tracking all venues for potential scraping
export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  location: varchar("location", { length: 100 }),
  capacity: varchar("capacity", { length: 50 }),
  website: varchar("website", { length: 200 }),
  scrapingConfig: jsonb("scraping_config"), // Store scraper configuration
  lastScraped: timestamp("last_scraped"),
  isScrapable: boolean("is_scrapable").default(false),
  priority: varchar("priority", { length: 20 }).default('medium'), // 'high', 'medium', 'low'
  source: varchar("source", { length: 50 }).notNull(), // 'existing', 'manual', 'auto_detected'
  eventCount: integer("event_count").default(0),
  lastEventDate: timestamp("last_event_date"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venues)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, "Venue name is required").max(100, "Venue name must be 100 characters or less"),
    source: z.enum(['existing', 'manual', 'auto_detected']),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
  });

export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venues.$inferSelect;