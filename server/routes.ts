import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { ZodError } from "zod";
import { parse } from "date-fns";

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
          
          // Convert date string to Date object if it's not already
          if (item.date && typeof item.date === 'string') {
            try {
              item.date = new Date(item.date);
            } catch (dateError) {
              console.error("Date parsing error:", dateError);
            }
          }
          
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
      res.status(500).json({ message: "Failed to process bulk events" });
    }
  });

  // Upvote an event
  apiRouter.post("/events/:id/upvote", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ message: "Invalid event ID" });
      }

      // For now, use the default user ID (1) since we don't have auth
      const userId = 1;

      const event = await storage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.isScheduled) {
        return res.status(400).json({ message: "Cannot upvote a scheduled event" });
      }

      const hasUpvoted = await storage.hasUserUpvoted(eventId, userId);
      if (hasUpvoted) {
        return res.status(400).json({ message: "You have already upvoted this event" });
      }

      const success = await storage.upvoteEvent(eventId, userId);
      if (success) {
        const updatedEvent = await storage.getEventById(eventId);
        res.json(updatedEvent);
      } else {
        res.status(400).json({ message: "Failed to upvote event" });
      }
    } catch (error) {
      res.status(500).json({ message: "Server error while upvoting" });
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

      const updatedEvent = await storage.setEventScheduled(eventId);
      res.json(updatedEvent);
    } catch (error) {
      res.status(500).json({ message: "Failed to schedule event" });
    }
  });

  app.use("/api", apiRouter);

  const httpServer = createServer(app);

  return httpServer;
}
