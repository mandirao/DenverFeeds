import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, events, upvotes, insertPlaylistSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { ZodError } from "zod";
import { parse } from "date-fns";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api
  const apiRouter = express.Router();

  // Get all upcoming events
  apiRouter.get("/events", async (req, res) => {
    try {
      const events = await storage.getUpcomingEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Get a single event by ID
  apiRouter.get("/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      const event = await storage.getEventById(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  // Create a new event
  apiRouter.post("/events", async (req, res) => {
    try {
      // Convert date string to Date object if it's not already
      if (req.body.date && typeof req.body.date === 'string') {
        try {
          // Assuming date format is "YYYY-MM-DD"
          const [year, month, day] = req.body.date.split('-').map(Number);
          
          // Create date in local timezone at midnight
          // This preserves the day as entered in the form
          if (year && month && day) {
            req.body.date = new Date(year, month - 1, day, 0, 0, 0);
            console.log(`Single event: Converted date string "${req.body.date}" to Date: ${req.body.date.toISOString()}`);
          } else {
            req.body.date = new Date(req.body.date);
          }
        } catch (dateError) {
          console.error("Date parsing error:", dateError);
        }
      }

      const eventData = insertEventSchema.parse(req.body);
      
      // Check for duplicate
      const isDuplicate = await storage.checkDuplicateEvent(eventData);
      if (isDuplicate) {
        return res.status(409).json({ 
          message: "One or more events skipped because it already exists." 
        });
      }

      const newEvent = await storage.createEvent(eventData);
      res.status(201).json(newEvent);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("ZodError creating event:", error);
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: `Validation error: ${validationError.message}`
        });
      } else if (error instanceof Error) {
        console.error("Error creating event:", error);
      }
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Create multiple events from CSV
  apiRouter.post("/events/bulk", async (req, res) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ message: "Expected array of events" });
      }

      console.log("Received bulk events:", JSON.stringify(req.body));

      const results = {
        created: 0,
        skipped: 0,
        errors: [] as string[],
        events: [] as any[]
      };

      for (const item of req.body) {
        try {
          console.log("Processing item:", JSON.stringify(item));
          
          // Enhanced date validation and parsing
          if (item.date && typeof item.date === 'string') {
            try {
              // Properly validate and parse date format
              const dateStr = item.date.trim();
              console.log(`Processing date: "${dateStr}"`);
              
              // Regex to validate YYYY-MM-DD format
              const dateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
              const match = dateStr.match(dateRegex);
              
              if (!match) {
                throw new Error(`Invalid date format: "${dateStr}" - must be YYYY-MM-DD`);
              }
              
              const year = parseInt(match[1], 10);
              const month = parseInt(match[2], 10);
              const day = parseInt(match[3], 10);
              
              // Validate year, month, day ranges
              if (year < 2024 || year > 2026) {
                throw new Error(`Invalid year: ${year} - must be between 2024 and 2026`);
              }
              
              if (month < 1 || month > 12) {
                throw new Error(`Invalid month: ${month} - must be between 1 and 12`);
              }
              
              const daysInMonth = new Date(year, month, 0).getDate();
              if (day < 1 || day > daysInMonth) {
                throw new Error(`Invalid day: ${day} - must be between 1 and ${daysInMonth} for month ${month}`);
              }
              
              // Create date in local timezone at midnight
              item.date = new Date(year, month - 1, day, 0, 0, 0);
              console.log(`Parsed date: ${item.date.toISOString()}`);
            } catch (dateError) {
              console.error("Date parsing error:", dateError);
              throw dateError; // Rethrow to be caught by the outer try/catch
            }
          }
          
          // Handle genre normalization before Zod validation
          if (item.genre && typeof item.genre === 'string') {
            const genres = [
              'Rock & Alternative',
              'Folk, Country & Americana',
              'Pop & Indie Pop',
              'Electronic & Experimental',
              'Funk, Soul & Jazz',
              'Classical & Orchestral',
              'Hip Hop & R&B'
            ];
            
            const normalizedGenre = item.genre.trim();
            
            // If not a standard genre, try to normalize
            if (!genres.includes(normalizedGenre)) {
              // Try to find a match by normalizing format
              const normalizedGenres = genres.map(g => g.replace(/,/g, '/'));
              const indexBySlash = normalizedGenres.findIndex(g => 
                g.toLowerCase() === normalizedGenre.replace(/,/g, '/').toLowerCase()
              );
              
              if (indexBySlash !== -1) {
                item.genre = genres[indexBySlash]; // Use the canonical format
                console.log(`Normalized genre from "${normalizedGenre}" to "${item.genre}"`);
              } else {
                // Try a more aggressive normalization - strip spaces around commas
                const strippedGenres = genres.map(g => g.replace(/\s*,\s*/g, ','));
                const indexByStripped = strippedGenres.findIndex(g => 
                  g.toLowerCase().replace(/\s*,\s*/g, ',') === 
                  normalizedGenre.toLowerCase().replace(/\s*,\s*/g, ',')
                );
                
                if (indexByStripped !== -1) {
                  item.genre = genres[indexByStripped];
                  console.log(`Normalized genre from "${normalizedGenre}" to "${item.genre}"`);
                }
              }
            }
          }
          
          // Now use Zod to validate the event data
          const eventData = insertEventSchema.parse(item);
          console.log("Parsed event data:", JSON.stringify(eventData));
          
          // Check for duplicate
          const isDuplicate = await storage.checkDuplicateEvent(eventData);
          if (isDuplicate) {
            console.log("Duplicate event found:", JSON.stringify(item));
            results.skipped++;
            results.errors.push(`Duplicate event: ${item.artist} at ${item.venue} on ${item.date}`);
            continue;
          }

          const newEvent = await storage.createEvent(eventData);
          results.created++;
          results.events.push(newEvent);
          console.log("Event created successfully:", newEvent.id);
        } catch (parseError) {
          if (parseError instanceof ZodError) {
            console.error("ZodError parsing event:", parseError);
            const validationError = fromZodError(parseError);
            results.skipped++;
            results.errors.push(`Validation error: ${validationError.message}`);
          } else {
            console.error("Error parsing event:", parseError);
            results.skipped++;
            results.errors.push(`Error parsing: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
          }
        }
      }

      if (results.created === 0 && results.skipped > 0) {
        return res.status(409).json({
          message: "Failed to add events. Please see errors for details.",
          results
        });
      }

      res.status(201).json({
        message: `Successfully added ${results.created} events${results.skipped > 0 ? ` (${results.skipped} skipped)` : ''}.`,
        results
      });
    } catch (error) {
      console.error("Bulk upload error:", error);
      res.status(500).json({ message: "Failed to process bulk events" });
    }
  });

  // Check if a user has upvoted an event
  apiRouter.get("/events/:id/has-upvoted", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      // Get user ID from session
      // @ts-ignore - Session properties are added by express-session
      const sessionId = req.session?.userId;
      
      // Log the session ID for debugging
      console.log(`Has upvoted check - Session ID: ${sessionId}`);
      
      // Create a database user entry if this is the first user action
      let user = await storage.getUserBySessionId(sessionId);
      if (!user) {
        console.log(`Creating new user for session ID: ${sessionId}`);
        user = await storage.createUser({
          username: `user-${Date.now()}`,
          sessionId: sessionId
        });
      } else {
        console.log(`Found existing user ID: ${user.id} for session ID: ${sessionId}`);
      }

      const hasUpvoted = await storage.hasUserUpvoted(eventId, user.id);
      console.log(`User ${user.id} has upvoted event ${eventId}: ${hasUpvoted}`);
      res.json({ hasUpvoted });
    } catch (error) {
      console.error("Error checking upvote status:", error);
      res.status(500).json({ message: "Server error checking upvote status" });
    }
  });

  // Upvote or remove vote for an event
  apiRouter.post("/events/:id/upvote", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      // Get user ID from session
      // @ts-ignore - Session properties are added by express-session
      const sessionId = req.session?.userId;
      
      console.log(`Upvote request - Session ID: ${sessionId}`);
      
      // Get or create the user
      let user = await storage.getUserBySessionId(sessionId);
      if (!user) {
        console.log(`Creating new user for session ID: ${sessionId}`);
        user = await storage.createUser({
          username: `user-${Date.now()}`,
          sessionId: sessionId
        });
        console.log(`Created user with ID: ${user.id}`);
      } else {
        console.log(`Found existing user ID: ${user.id} for session ID: ${sessionId}`);
      }

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.isScheduled) {
        return res.status(400).json({ message: "Cannot vote on a scheduled event" });
      }

      // Directly check in the database to ensure accurate results
      const hasUpvoted = await storage.hasUserUpvoted(eventId, user.id);
      console.log(`User ${user.id} has already upvoted event ${eventId}: ${hasUpvoted}`);
      
      let success = false;
      
      if (hasUpvoted) {
        // User already voted, so remove the vote
        console.log(`Removing upvote for user ${user.id} on event ${eventId}`);
        // Bypass the double-check in removeUpvote by directly deleting the record
        await db.delete(upvotes).where(
          and(
            eq(upvotes.eventId, eventId),
            eq(upvotes.userId, user.id)
          )
        );
        
        // Update the event upvote count regardless of delete result
        // This ensures the count is synchronized
        await db.update(events)
          .set({
            upvotes: sql`GREATEST(${events.upvotes} - 1, 0)`
          })
          .where(eq(events.id, eventId));
        success = true;
      } else {
        // User hasn't voted, add the vote
        console.log(`Adding upvote for user ${user.id} on event ${eventId}`);
        success = await storage.upvoteEvent(eventId, user.id);
      }
      
      console.log(`Upvote operation success: ${success}`);
      
      if (success) {
        const updatedEvent = await storage.getEventById(eventId);
        res.json(updatedEvent);
      } else {
        res.status(400).json({ message: "Failed to process vote" });
      }
    } catch (error) {
      console.error("Error processing vote:", error);
      res.status(500).json({ message: "Server error while processing vote" });
    }
  });

  // Update an existing event
  apiRouter.patch("/events/:id", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      // Get the existing event
      const existingEvent = await storage.getEventById(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Convert date string to Date object if it's not already
      if (req.body.date && typeof req.body.date === 'string') {
        try {
          // Assuming date format is "YYYY-MM-DD"
          const [year, month, day] = req.body.date.split('-').map(Number);
          
          // Create date in local timezone at midnight
          // This preserves the day as entered in the form
          if (year && month && day) {
            req.body.date = new Date(year, month - 1, day, 0, 0, 0);
          } else {
            req.body.date = new Date(req.body.date);
          }
        } catch (dateError) {
          console.error("Date parsing error:", dateError);
        }
      }

      // Validate the update data using the schema
      const eventData = insertEventSchema.parse(req.body);
      
      // Check if this would create a duplicate (except for the current event)
      // Only need to check if one of the key fields is changing
      if (
        eventData.artist !== existingEvent.artist ||
        eventData.venue !== existingEvent.venue ||
        (eventData.date && new Date(eventData.date).getTime() !== new Date(existingEvent.date).getTime())
      ) {
        const isDuplicate = await storage.checkDuplicateEvent(eventData);
        if (isDuplicate) {
          return res.status(409).json({ 
            message: "Another event with this artist, venue, and date already exists." 
          });
        }
      }

      // Update the event
      const updatedEvent = await storage.updateEvent(eventId, eventData);
      res.json(updatedEvent);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("ZodError updating event:", error);
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: `Validation error: ${validationError.message}`
        });
      } else if (error instanceof Error) {
        console.error("Error updating event:", error);
      }
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Delete an event
  apiRouter.delete("/events/:id", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const deleted = await storage.deleteEvent(eventId);
      
      if (deleted) {
        res.status(200).json({ message: "Event deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete event" });
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ message: "Server error deleting event" });
    }
  });

  // Set an event as scheduled
  apiRouter.post("/events/:id/schedule", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const updatedEvent = await storage.setEventScheduled(eventId, true);
      res.json(updatedEvent);
    } catch (error) {
      res.status(500).json({ message: "Failed to schedule event" });
    }
  });
  
  // Unset an event as scheduled (unschedule)
  apiRouter.post("/events/:id/unschedule", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const updatedEvent = await storage.setEventScheduled(eventId, false);
      res.json(updatedEvent);
    } catch (error) {
      res.status(500).json({ message: "Failed to unschedule event" });
    }
  });
  
  // Manually decrease upvote count for an event
  apiRouter.post("/events/:id/decrease-upvote", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if there are any upvotes to decrease
      if (!event.upvotes || event.upvotes <= 0) {
        return res.status(400).json({ message: "Event has no upvotes to decrease" });
      }

      // Decrease the upvote count by one
      const updatedEvent = await storage.updateEvent(eventId, {
        upvotes: Math.max(event.upvotes - 1, 0) // Ensure it doesn't go below 0
      });
      
      res.json(updatedEvent);
    } catch (error) {
      console.error("Error decreasing upvote:", error);
      res.status(500).json({ message: "Failed to decrease upvote" });
    }
  });

  // Playlist routes
  
  // Get all playlists
  apiRouter.get("/playlists", async (req, res) => {
    try {
      const playlists = await storage.getAllPlaylists();
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ message: "Failed to fetch playlists" });
    }
  });

  // Get a single playlist by ID
  apiRouter.get("/playlists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }

      const playlist = await storage.getPlaylistById(id);
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }

      res.json(playlist);
    } catch (error) {
      console.error("Error fetching playlist:", error);
      res.status(500).json({ message: "Failed to fetch playlist" });
    }
  });

  // Create a new playlist
  apiRouter.post("/playlists", async (req, res) => {
    try {
      const playlistData = insertPlaylistSchema.parse(req.body);
      const newPlaylist = await storage.createPlaylist(playlistData);
      res.status(201).json(newPlaylist);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("ZodError creating playlist:", error);
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: `Validation error: ${validationError.message}`
        });
      }
      console.error("Error creating playlist:", error);
      res.status(500).json({ message: "Failed to create playlist" });
    }
  });

  // Update a playlist
  apiRouter.patch("/playlists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }

      const existingPlaylist = await storage.getPlaylistById(id);
      if (!existingPlaylist) {
        return res.status(404).json({ message: "Playlist not found" });
      }

      const playlistData = insertPlaylistSchema.partial().parse(req.body);
      const updatedPlaylist = await storage.updatePlaylist(id, playlistData);
      res.json(updatedPlaylist);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("ZodError updating playlist:", error);
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: `Validation error: ${validationError.message}`
        });
      }
      console.error("Error updating playlist:", error);
      res.status(500).json({ message: "Failed to update playlist" });
    }
  });

  // Delete a playlist (soft delete)
  apiRouter.delete("/playlists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }

      const playlist = await storage.getPlaylistById(id);
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }

      const deleted = await storage.deletePlaylist(id);
      
      if (deleted) {
        res.status(200).json({ message: "Playlist deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete playlist" });
      }
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ message: "Server error deleting playlist" });
    }
  });

  app.use("/api", apiRouter);

  const httpServer = createServer(app);

  return httpServer;
}
