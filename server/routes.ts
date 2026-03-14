import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, events, upvotes, insertPlaylistSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { ZodError } from "zod";
import { parse } from "date-fns";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { spotifyService } from "./spotify";
import { llmService } from "./llm-service";

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
            
            // Genre keyword mapping for simplified genre names
            const genreKeywordMap: Record<string, string> = {
              'punk': 'Rock & Alternative',
              'rock': 'Rock & Alternative',
              'alt rock': 'Rock & Alternative',
              'alternative': 'Rock & Alternative',
              'indie rock': 'Rock & Alternative',
              'indie/alt rock': 'Rock & Alternative',
              'post-punk': 'Rock & Alternative',
              'psych rock': 'Rock & Alternative',
              'indie/psych': 'Rock & Alternative',
              'americana': 'Folk, Country & Americana',
              'folk': 'Folk, Country & Americana',
              'country': 'Folk, Country & Americana',
              'bluegrass': 'Folk, Country & Americana',
              'country/americana': 'Folk, Country & Americana',
              'folk/soul': 'Folk, Country & Americana',
              'indie folk': 'Folk, Country & Americana',
              'pop': 'Pop & Indie Pop',
              'indie pop': 'Pop & Indie Pop',
              'electronic': 'Electronic & Experimental',
              'experimental': 'Electronic & Experimental',
              'ambient': 'Electronic & Experimental',
              'funk': 'Funk, Soul & Jazz',
              'soul': 'Funk, Soul & Jazz',
              'jazz': 'Funk, Soul & Jazz',
              'soul/jazz': 'Funk, Soul & Jazz',
              'classical': 'Classical & Orchestral',
              'orchestral': 'Classical & Orchestral',
              'hip hop': 'Hip Hop & R&B',
              'r&b': 'Hip Hop & R&B',
              'hip hop & r&b': 'Hip Hop & R&B'
            };
            
            const normalizedGenre = item.genre.trim();
            
            // If not a standard genre, try to normalize
            if (!genres.includes(normalizedGenre)) {
              // First try keyword mapping (case-insensitive)
              const lowerGenre = normalizedGenre.toLowerCase();
              if (genreKeywordMap[lowerGenre]) {
                item.genre = genreKeywordMap[lowerGenre];
                console.log(`Normalized genre from "${normalizedGenre}" to "${item.genre}" (keyword map)`);
              } else {
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

  // Artist management endpoints
  apiRouter.get("/artists", async (req, res) => {
    try {
      const artists = await storage.getAllArtists();
      res.json(artists);
    } catch (error) {
      console.error("Error fetching artists:", error);
      res.status(500).json({ error: "Failed to fetch artists" });
    }
  });

  apiRouter.post("/artists", async (req, res) => {
    try {
      const { name, genre, priority, source } = req.body;
      
      if (!name || !genre) {
        return res.status(400).json({ error: "Name and genre are required" });
      }

      const artist = await storage.createArtist({
        name: name.trim(),
        genre: genre.trim(),
        searchPriority: priority || 'medium',
        source: source || 'manual'
      });

      res.status(201).json(artist);
    } catch (error) {
      console.error("Create artist error:", error);
      res.status(500).json({ error: "Failed to create artist" });
    }
  });

  apiRouter.delete("/artists/:id", async (req, res) => {
    try {
      const artistId = parseInt(req.params.id);
      if (isNaN(artistId)) {
        return res.status(400).json({ error: "Invalid artist ID" });
      }

      await storage.deleteArtist(artistId);
      res.json({ message: "Artist deleted successfully" });
    } catch (error) {
      console.error("Delete artist error:", error);
      res.status(500).json({ error: "Failed to delete artist" });
    }
  });

  apiRouter.get("/artists/seed", async (req, res) => {
    try {
      // For now, return success without actually seeding
      res.json({ message: "Artist database seeding not implemented yet" });
    } catch (error) {
      console.error("Error seeding artists:", error);
      res.status(500).json({ error: "Failed to seed artists" });
    }
  });

  // Discovered Events endpoints for review queue
  apiRouter.get("/discovered-events", async (req, res) => {
    try {
      const discoveredEvents = await storage.getAllDiscoveredEvents();
      res.json(discoveredEvents);
    } catch (error) {
      console.error("Error fetching discovered events:", error);
      res.status(500).json({ error: "Failed to fetch discovered events" });
    }
  });

  apiRouter.post("/discovered-events/:id/approve", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      const newEvent = await storage.approveDiscoveredEvent(eventId);
      if (!newEvent) {
        return res.status(404).json({ error: "Discovered event not found" });
      }

      res.json({ message: "Event approved and added to main feed", event: newEvent });
    } catch (error) {
      console.error("Error approving discovered event:", error);
      res.status(500).json({ error: "Failed to approve event" });
    }
  });

  apiRouter.post("/discovered-events/:id/reject", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      const updatedEvent = await storage.rejectAndHideDiscoveredEvent(eventId);
      if (!updatedEvent) {
        return res.status(404).json({ error: "Discovered event not found" });
      }

      res.json({ message: "Event rejected and hidden", event: updatedEvent });
    } catch (error) {
      console.error("Error rejecting discovered event:", error);
      res.status(500).json({ error: "Failed to reject event" });
    }
  });

  apiRouter.delete("/discovered-events/:id", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      const deleted = await storage.deleteDiscoveredEvent(eventId);
      if (!deleted) {
        return res.status(404).json({ error: "Discovered event not found" });
      }

      res.json({ message: "Discovered event deleted" });
    } catch (error) {
      console.error("Error deleting discovered event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // Event discovery endpoints
  apiRouter.post("/discovery/run", async (req, res) => {
    try {
      const { discoveryService } = await import('./discovery-service-simple');
      
      if (discoveryService.isDiscoveryRunning()) {
        return res.status(409).json({ error: "Discovery already running" });
      }

      const options = {
        priority: req.body.priority || undefined,
        limit: req.body.limit || 5, // Smaller limit for testing
        dryRun: req.body.dryRun || false
      };

      const stats = await discoveryService.runDiscovery(options);
      res.json({ message: "Discovery completed", stats });
    } catch (error) {
      console.error("Error running discovery:", error);
      res.status(500).json({ error: "Failed to run discovery" });
    }
  });

  apiRouter.get("/discovery/status", async (req, res) => {
    try {
      const { discoveryService } = await import('./discovery-service-simple');
      res.json({
        isRunning: discoveryService.isDiscoveryRunning(),
        stats: discoveryService.getStats()
      });
    } catch (error) {
      console.error("Error getting discovery status:", error);
      res.status(500).json({ error: "Failed to get discovery status" });
    }
  });

  // iCalendar feed endpoint for calendar subscription
  apiRouter.get("/calendar/feed.ics", async (req, res) => {
    try {
      // Get all upcoming events for the public calendar feed
      const upcomingEvents = await storage.getUpcomingEvents();
      
      // RFC 5545 line folding: lines must be <= 75 octets
      const foldLine = (line: string): string => {
        const maxLen = 75;
        if (line.length <= maxLen) return line;
        
        const parts: string[] = [];
        parts.push(line.substring(0, maxLen));
        let remaining = line.substring(maxLen);
        
        while (remaining.length > 0) {
          // Continuation lines start with space, so max is 74 chars of content
          parts.push(' ' + remaining.substring(0, maxLen - 1));
          remaining = remaining.substring(maxLen - 1);
        }
        
        return parts.join('\r\n');
      };
      
      // Escape text for iCal format (RFC 5545 compliant)
      const escapeIcal = (text: string) => {
        return text
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n');
      };
      
      // Generate iCalendar format
      const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Setlist Social//Concert Feed//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Setlist Social Shows',
        'X-WR-TIMEZONE:America/Denver',
        'X-WR-CALDESC:Denver area concerts curated by Setlist Social',
      ];
      
      upcomingEvents.forEach(event => {
        const eventDate = new Date(event.date);
        
        // Format as YYYYMMDD for all-day events
        const dateStr = eventDate.toISOString().split('T')[0].replace(/-/g, '');
        
        // Create a unique ID for the event
        const uid = `event-${event.id}@setlistsocial.com`;
        
        // Build description without emojis for better compatibility
        let descParts: string[] = [];
        descParts.push(`${event.artist} at ${event.venue}`);
        if (event.summary) {
          descParts.push(event.summary);
        }
        if (event.soundsLike) {
          descParts.push(`Sounds like: ${event.soundsLike}`);
        }
        descParts.push(`Genre: ${event.genre}`);
        const description = descParts.join('\n');
        
        // Clean summary (remove emoji for compatibility)
        const summary = `${event.artist} @ ${event.venue}`;
        
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uid}`);
        lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
        lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
        lines.push(foldLine(`SUMMARY:${escapeIcal(summary)}`));
        lines.push(foldLine(`DESCRIPTION:${escapeIcal(description)}`));
        lines.push(foldLine(`LOCATION:${escapeIcal(event.venue)}`));
        lines.push('STATUS:CONFIRMED');
        lines.push('TRANSP:TRANSPARENT');
        lines.push('END:VEVENT');
      });
      
      lines.push('END:VCALENDAR');
      
      const icalContent = lines.join('\r\n');
      
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="setlist-social.ics"');
      res.send(icalContent);
    } catch (error) {
      console.error("Error generating iCal feed:", error);
      res.status(500).json({ message: "Failed to generate calendar feed" });
    }
  });

  // Venue-first discovery endpoints
  apiRouter.get("/discovery/venues", async (req, res) => {
    try {
      const { venueDiscoveryService } = await import('./venue-discovery-service');
      const venues = venueDiscoveryService.getActiveVenues();
      res.json(venues);
    } catch (error) {
      console.error("Error getting venues:", error);
      res.status(500).json({ error: "Failed to get venues" });
    }
  });

  apiRouter.post("/discovery/venue-scan", async (req, res) => {
    try {
      const { venueLimit = 10, priority, dryRun = false } = req.body;
      
      console.log(`Starting venue-first discovery with limit: ${venueLimit}, priority: ${priority}, dryRun: ${dryRun}`);
      
      const { venueDiscoveryService } = await import('./venue-discovery-service');
      const result = await venueDiscoveryService.runVenueDiscovery({
        venueLimit,
        priority,
        dryRun
      });
      
      res.json(result);
    } catch (error) {
      console.error("Venue discovery error:", error);
      res.status(500).json({ 
        error: "Venue discovery failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  apiRouter.get("/discovery/venue-stats", async (req, res) => {
    try {
      const { venueDiscoveryService } = await import('./venue-discovery-service');
      const stats = venueDiscoveryService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting venue stats:", error);
      res.status(500).json({ error: "Failed to get venue stats" });
    }
  });

  // Artist discovery endpoints
  apiRouter.post("/discovery/artist-scan", async (req, res) => {
    try {
      const { sources = ['pitchfork', 'oh_my_rockness'], limit = 20, dryRun = false } = req.body;
      
      console.log(`Starting artist discovery with sources: ${sources.join(', ')}, limit: ${limit}, dryRun: ${dryRun}`);
      
      const { artistDiscoveryService } = await import('./artist-discovery-service');
      const result = await artistDiscoveryService.runArtistDiscovery({
        sources,
        limit,
        dryRun
      });
      
      res.json(result);
    } catch (error) {
      console.error("Artist discovery error:", error);
      res.status(500).json({ 
        error: "Artist discovery failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  apiRouter.get("/discovery/artist-stats", async (req, res) => {
    try {
      const { artistDiscoveryService } = await import('./artist-discovery-service');
      const stats = artistDiscoveryService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting artist discovery stats:", error);
      res.status(500).json({ error: "Failed to get artist discovery stats" });
    }
  });

  // AI Artist Analysis route
  apiRouter.post("/ai/analyze-artist", async (req, res) => {
    try {
      const { artist } = req.body;
      
      if (!artist || typeof artist !== 'string') {
        return res.status(400).json({ message: "Artist name is required" });
      }

      console.log(`Analyzing artist: ${artist}`);
      
      const analysis = await llmService.analyzeArtist(artist);
      
      console.log(`AI Analysis result for ${artist}:`, analysis);
      
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing artist:", error);
      res.status(500).json({ 
        message: "Failed to analyze artist",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Venue tracking routes
  
  // Get all venues
  apiRouter.get("/venues", async (req, res) => {
    try {
      const venues = await storage.getAllVenues();
      res.json(venues);
    } catch (error) {
      console.error("Error fetching venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Get a single venue by ID
  apiRouter.get("/venues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid venue ID" });
      }

      const venue = await storage.getVenueById(id);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      res.json(venue);
    } catch (error) {
      console.error("Error fetching venue:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Update venue tracking information
  apiRouter.put("/venues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid venue ID" });
      }

      const updatedVenue = await storage.updateVenue(id, req.body);
      if (!updatedVenue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      res.json(updatedVenue);
    } catch (error) {
      console.error("Error updating venue:", error);
      res.status(500).json({ message: "Failed to update venue" });
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

  // Refresh playlist data from Spotify
  apiRouter.post("/playlists/:id/refresh", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }

      const existingPlaylist = await storage.getPlaylistById(id);
      if (!existingPlaylist || !existingPlaylist.spotifyId) {
        return res.status(404).json({ message: "Playlist not found or missing Spotify ID" });
      }

      // Fetch fresh data from Spotify
      const spotifyData = await spotifyService.getPlaylistDetails(existingPlaylist.spotifyId);
      
      // Update the playlist with fresh data including featuredArtists
      const updatedPlaylist = await storage.updatePlaylist(id, {
        title: spotifyData.title,
        description: spotifyData.description,
        coverUrl: spotifyData.coverUrl,
        trackCount: spotifyData.trackCount,
        followerCount: spotifyData.followerCount,
        featuredArtists: spotifyData.featuredArtists,
        updatedAt: new Date()
      });

      res.json(updatedPlaylist);
    } catch (error) {
      console.error("Error refreshing playlist:", error);
      res.status(500).json({ message: "Failed to refresh playlist data" });
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

  // Refresh playlist metadata from Spotify
  apiRouter.post("/playlists/:id/refresh", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }

      const existingPlaylist = await storage.getPlaylistById(id);
      if (!existingPlaylist) {
        return res.status(404).json({ message: "Playlist not found" });
      }

      if (!existingPlaylist.spotifyId) {
        return res.status(400).json({ message: "Playlist has no Spotify ID to refresh from" });
      }

      // Import the spotify service here to avoid circular dependencies
      const { spotifyService } = await import("./spotify");
      
      try {
        console.log(`Refreshing Spotify metadata for playlist ID: ${existingPlaylist.spotifyId}`);
        const spotifyData = await spotifyService.getPlaylistDetails(existingPlaylist.spotifyId);
        
        const refreshedPlaylist = await storage.updatePlaylist(id, {
          title: spotifyData.title,
          description: spotifyData.description,
          coverUrl: spotifyData.coverUrl,
          trackCount: spotifyData.trackCount,
          followerCount: spotifyData.followerCount,
        });
        
        console.log(`Successfully refreshed playlist: ${spotifyData.title}`);
        res.json(refreshedPlaylist);
      } catch (spotifyError) {
        console.error("Spotify API error during refresh:", spotifyError);
        res.status(400).json({ message: "Failed to fetch updated data from Spotify" });
      }
    } catch (error) {
      console.error("Error refreshing playlist:", error);
      res.status(500).json({ message: "Server error refreshing playlist" });
    }
  });

  app.use("/api", apiRouter);

  // Discovered Artists API routes
  app.get("/api/discovered-artists", async (req, res) => {
    try {
      const discoveredArtists = await storage.getAllDiscoveredArtists();
      res.json(discoveredArtists);
    } catch (error) {
      console.error("Failed to fetch discovered artists:", error);
      res.status(500).json({ error: "Failed to fetch discovered artists" });
    }
  });

  app.post("/api/discovered-artists/:id/approve", async (req, res) => {
    try {
      const artistId = parseInt(req.params.id);
      const approvedArtist = await storage.approveDiscoveredArtist(artistId);
      res.json(approvedArtist);
    } catch (error) {
      console.error("Failed to approve discovered artist:", error);
      res.status(500).json({ error: "Failed to approve discovered artist" });
    }
  });

  app.post("/api/discovered-artists/:id/reject", async (req, res) => {
    try {
      const artistId = parseInt(req.params.id);
      await storage.updateDiscoveredArtistStatus(artistId, 'rejected');
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to reject discovered artist:", error);
      res.status(500).json({ error: "Failed to reject discovered artist" });
    }
  });

  app.delete("/api/discovered-artists/:id", async (req, res) => {
    try {
      const artistId = parseInt(req.params.id);
      const deleted = await storage.deleteDiscoveredArtist(artistId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Failed to delete discovered artist:", error);
      res.status(500).json({ error: "Failed to delete discovered artist" });
    }
  });

  // Add sample discovered artist for testing
  app.post("/api/test-add-sample-artist", async (req, res) => {
    try {
      const sampleArtist = await storage.createDiscoveredArtist({
        name: "Test Discovery Artist",
        genre: "Rock & Alternative",
        source: "pitchfork_best_new",
        description: "A sample artist discovered from Pitchfork's Best New Albums for testing the review system",
        confidence: 0.85,
        rawData: { 
          url: "https://pitchfork.com/reviews/albums/test",
          reviewText: "Sample review text for testing",
          albumTitle: "Sample Album Title",
          rating: 8.2
        },
        isReviewed: false
      });
      res.json(sampleArtist);
    } catch (error) {
      console.error("Failed to create sample artist:", error);
      res.status(500).json({ error: "Failed to create sample artist" });
    }
  });

  // ── Amuse Bouche – Food Events ───────────────────────────────────────────
  app.get("/api/food-events", async (req, res) => {
    try {
      const events = await storage.getAllFoodEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch food events" });
    }
  });

  app.post("/api/food-events", async (req, res) => {
    try {
      const { insertFoodEventSchema } = await import("@shared/schema");
      const parsed = insertFoodEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Validation failed" });
      }
      const event = await storage.createFoodEvent(parsed.data);
      res.status(201).json(event);
    } catch (error) {
      console.error("Failed to create food event:", error);
      res.status(500).json({ message: "Failed to create food event" });
    }
  });

  app.patch("/api/food-events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateFoodEvent(id, req.body);
      if (!updated) return res.status(404).json({ message: "Food event not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update food event" });
    }
  });

  app.delete("/api/food-events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteFoodEvent(id);
      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete food event" });
    }
  });

  app.post("/api/food-events/:id/duplicate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const original = await storage.getFoodEventById(id);
      if (!original) return res.status(404).json({ message: "Food event not found" });
      const { id: _id, createdAt: _ca, upvotes: _up, ...rest } = original as any;
      const copy = await storage.createFoodEvent(rest);
      res.status(201).json(copy);
    } catch (error) {
      res.status(500).json({ message: "Failed to duplicate food event" });
    }
  });

  app.post("/api/food-events/:id/upvote", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.upvoteFoodEvent(id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ message: "Failed to upvote" });
    }
  });

  // AI blurb parser for Amuse Bouche
  app.post("/api/ai/parse-blurb", async (req, res) => {
    try {
      const { blurb, imageBase64, imageMediaType, fileName } = req.body;
      if (!blurb && !imageBase64) {
        return res.status(400).json({ message: "blurb or image is required" });
      }
      const result = await llmService.parseBlurb(blurb || "", imageBase64, imageMediaType, fileName);
      res.json(result);
    } catch (error) {
      console.error("Blurb parse error:", error);
      res.status(500).json({ message: "Failed to parse blurb" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
