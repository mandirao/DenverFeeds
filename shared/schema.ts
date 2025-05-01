import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
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
  { value: "Bluebird Theater", label: "Bluebird Theater", group: "denver_boulder" },
  { value: "Boettcher Concert Hall", label: "Boettcher Concert Hall", group: "denver_boulder" },
  { value: "Boulder Theater", label: "Boulder Theater", group: "denver_boulder" },
  { value: "Cervantes' Masterpiece Ballroom", label: "Cervantes' Masterpiece Ballroom", group: "denver_boulder" },
  { value: "Chautauqua Auditorium", label: "Chautauqua Auditorium", group: "denver_boulder" },
  { value: "Club Vinyl", label: "Club Vinyl", group: "denver_boulder" },
  { value: "Dick's Sporting Goods Park", label: "Dick's Sporting Goods Park", group: "denver_boulder" },
  { value: "Empower Field at Mile High", label: "Empower Field at Mile High", group: "denver_boulder" },
  { value: "Fiddler's Green Amphitheatre", label: "Fiddler's Green Amphitheatre", group: "denver_boulder" },
  { value: "Fillmore Auditorium", label: "Fillmore Auditorium", group: "denver_boulder" },
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
  { value: "Ogden Theatre", label: "Ogden Theatre", group: "denver_boulder" },
  { value: "Oriental Theater", label: "Oriental Theater", group: "denver_boulder" },
  { value: "Paramount Theatre", label: "Paramount Theatre", group: "denver_boulder" },
  { value: "Red Rocks Amphitheatre", label: "Red Rocks Amphitheatre", group: "denver_boulder" },
  { value: "ReelWorks Denver", label: "ReelWorks Denver", group: "denver_boulder" },
  { value: "Roxy on Broadway", label: "Roxy on Broadway", group: "denver_boulder" },
  { value: "Skylark Lounge", label: "Skylark Lounge", group: "denver_boulder" },
  { value: "Summit Music Hall", label: "Summit Music Hall", group: "denver_boulder" },
  { value: "The Church", label: "The Church", group: "denver_boulder" },
  { value: "The Meadowlark", label: "The Meadowlark", group: "denver_boulder" },
  
  // Road Trip venues
  { value: "Aggie Theatre", label: "Aggie Theatre", group: "road_trip" },
  { value: "Belly Up Aspen", label: "Belly Up Aspen", group: "road_trip" },
  { value: "Black Sheep", label: "Black Sheep", group: "road_trip" },
  { value: "Dillon Amphitheater", label: "Dillon Amphitheater", group: "road_trip" },
  { value: "Ford Amphitheater", label: "Ford Amphitheater", group: "road_trip" },
  { value: "Fort Collins Armory", label: "Fort Collins Armory", group: "road_trip" },
  { value: "Gerald Ford Amphitheater", label: "Gerald Ford Amphitheater", group: "road_trip" },
  { value: "Gerald R Ford Amphitheater", label: "Gerald R Ford Amphitheater", group: "road_trip" },
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