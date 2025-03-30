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
  artist: varchar("artist", { length: 75 }).notNull(),
  venue: varchar("venue", { length: 75 }).notNull(),
  date: timestamp("date").notNull(),
  summary: varchar("summary", { length: 75 }).notNull(),
  soundsLike: varchar("sounds_like", { length: 75 }).notNull(),
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

export const genres = [
  'Rock & Alternative',
  'Folk, Country & Americana',
  'Pop & Indie Pop',
  'Electronic & Experimental',
  'Funk, Soul & Jazz',
  'Classical & Orchestral'
];