import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Event schema
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  emoji: varchar("emoji", { length: 5 }).notNull(),
  artist: varchar("artist", { length: 50 }).notNull(),
  venue: varchar("venue", { length: 50 }).notNull(),
  date: timestamp("date").notNull(),
  summary: varchar("summary", { length: 50 }).notNull(),
  soundsLike: varchar("sounds_like", { length: 50 }).notNull(),
  genre: varchar("genre", { length: 30 }).notNull(),
  isScheduled: boolean("is_scheduled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  upvotes: integer("upvotes").default(0),
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  isScheduled: true,
  createdAt: true,
  upvotes: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Upvotes schema to track user votes
export const upvotes = pgTable("upvotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  eventId: integer("event_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUpvoteSchema = createInsertSchema(upvotes).omit({
  id: true,
  createdAt: true,
});

export type InsertUpvote = z.infer<typeof insertUpvoteSchema>;
export type Upvote = typeof upvotes.$inferSelect;

export const genres = [
  'Indie Rock',
  'Garage Rock & Psych',
  'Post-Punk & Darkwave',
  'Punk & Hardcore',
  'Shoegaze & Dream Pop',
  'Indie Folk & Singer-Songwriter',
  'Americana & Alt-Country',
  'Classic & Outlaw Country',
  'Alt-Pop & Electro-Pop',
  'Synthpop & New Wave',
  'Singer-Songwriter Pop',
  'Electronic & Dance',
  'Ambient & Experimental',
  'Drum & Bass & House',
  'Neo-Soul & R&B',
  'Funk & Jam Bands',
  'Jazz & Afrobeat',
  'Symphonic & Contemporary Classical'
];