import { useState } from "react";
import { Event } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatDate, createGoogleCalendarUrl, createGoogleMapsUrl, createSpotifySearchUrl, isRecentlyAdded } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowUp, Check } from "lucide-react";

interface EventItemProps {
  event: Event;
}

export function EventItem({ event }: EventItemProps) {
  const queryClient = useQueryClient();
  const [isHoveringArtist, setIsHoveringArtist] = useState(false);
  const [isHoveringVenue, setIsHoveringVenue] = useState(false);
  const [isHoveringDate, setIsHoveringDate] = useState(false);

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${event.id}/upvote`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    }
  });

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${event.id}/schedule`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    }
  });

  const handleUpvote = () => {
    upvoteMutation.mutate();
  };

  const handleSchedule = () => {
    scheduleMutation.mutate();
  };

  // Format date for display
  const formattedDate = formatDate(event.date);
  
  // Create URLs for interactive elements
  const calendarUrl = createGoogleCalendarUrl(event);
  const mapsUrl = createGoogleMapsUrl(event.venue);
  const spotifyUrl = createSpotifySearchUrl(event.artist);
  
  // Check if the event was added in the last week
  const justAdded = isRecentlyAdded(event.createdAt);

  return (
    <li className="border-b border-gray-200 pb-3 relative">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl">{event.emoji}</span>
        
        {/* Artist Name (Spotify link) */}
        <TooltipProvider>
          <Tooltip open={isHoveringArtist}>
            <TooltipTrigger asChild>
              <a 
                href={spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold hover:underline cursor-pointer"
                onMouseEnter={() => setIsHoveringArtist(true)}
                onMouseLeave={() => setIsHoveringArtist(false)}
              >
                {event.artist}
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>Search on Spotify</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <span className="text-gray-600">@</span>
        
        {/* Venue (Google Maps) */}
        <TooltipProvider>
          <Tooltip open={isHoveringVenue}>
            <TooltipTrigger asChild>
              <a 
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline cursor-pointer"
                onMouseEnter={() => setIsHoveringVenue(true)}
                onMouseLeave={() => setIsHoveringVenue(false)}
              >
                {event.venue}
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>View on Google Maps</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* Date (Google Calendar) */}
        <TooltipProvider>
          <Tooltip open={isHoveringDate}>
            <TooltipTrigger asChild>
              <a 
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline cursor-pointer text-gray-600"
                onMouseEnter={() => setIsHoveringDate(true)}
                onMouseLeave={() => setIsHoveringDate(false)}
              >
                ({formattedDate})
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add to Google Calendar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <span className="ml-1">{event.summary}</span>
        <span className="italic ml-1">like: {event.soundsLike}</span>
        
        {/* "Just added" badge */}
        {justAdded && (
          <span className="bg-[#FEABDA] text-xs font-bold uppercase px-2 py-1 rounded-full ml-2">
            Just added!
          </span>
        )}
        
        {/* Show either Upvote button or Scheduled badge */}
        <div className="ml-auto">
          {event.isScheduled ? (
            <span className="bg-green-500 text-white text-sm px-3 py-1 rounded-full flex items-center">
              <Check className="mr-1 h-4 w-4" /> Scheduled!
            </span>
          ) : (
            <div className="flex space-x-2">
              {/* Optional: Admin-only Schedule button */}
              <Button 
                variant="outline2" 
                size="sm" 
                className="text-sm" 
                onClick={handleSchedule}
                disabled={scheduleMutation.isPending}
              >
                Schedule
              </Button>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline2" 
                      size="sm"
                      onClick={handleUpvote}
                      disabled={upvoteMutation.isPending || upvoteMutation.isError}
                      className="text-sm flex items-center gap-1"
                    >
                      <ArrowUp className="h-4 w-4" /> {event.upvotes || 0}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Upvote this show</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default EventItem;
