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
      // Toggle scheduling
      const endpoint = event.isScheduled 
        ? `/api/events/${event.id}/unschedule` 
        : `/api/events/${event.id}/schedule`;
      const res = await apiRequest("POST", endpoint, undefined);
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
    <li className="pb-1 relative flex items-start">
      <span className="text-2xl mr-3">{event.emoji}</span>
      
      <div className="flex-1">
        <p className="text-base">
          {/* Artist Name (Spotify link) */}
          <TooltipProvider>
            <Tooltip open={isHoveringArtist}>
              <TooltipTrigger asChild>
                <a 
                  href={spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold border-b border-dotted border-black hover:border-none hover:underline cursor-pointer"
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
          
          {" plays at "}
          
          {/* Venue (Google Maps) */}
          <TooltipProvider>
            <Tooltip open={isHoveringVenue}>
              <TooltipTrigger asChild>
                <a 
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-dotted border-black hover:border-none hover:underline cursor-pointer"
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
          
          {" on "}
          
          {/* Date (Google Calendar) */}
          <TooltipProvider>
            <Tooltip open={isHoveringDate}>
              <TooltipTrigger asChild>
                <a 
                  href={calendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-dotted border-black hover:border-none hover:underline cursor-pointer"
                  onMouseEnter={() => setIsHoveringDate(true)}
                  onMouseLeave={() => setIsHoveringDate(false)}
                >
                  {formattedDate}
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add to Google Calendar</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {". "}
          {event.summary}
          {" Like "}
          <span className="italic">{event.soundsLike}.</span>
          
          {/* "Just added" badge */}
          {justAdded && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="bg-[#FEABDA] text-xs font-bold uppercase px-2 py-1 rounded-full ml-2 cursor-help">
                    Just added!
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Added within the last three days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Show either Schedule/Scheduled button or buttons */}
          <span className="ml-2">
            {event.isScheduled ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span 
                      onClick={handleSchedule}
                      className="bg-green-500 text-white text-xs font-bold uppercase px-2 py-1 rounded-full inline-flex items-center cursor-pointer"
                    >
                      <Check className="mr-1 h-3 w-3" /> Scheduled
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to unschedule</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="inline-flex space-x-2">
                {/* Empty checkmark Schedule button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-4 w-4 p-0 flex items-center justify-center rounded-full bg-transparent" 
                        onClick={handleSchedule}
                        disabled={scheduleMutation.isPending}
                      >
                        <div className="w-3 h-3 rounded-full bg-[#e15a30]"></div>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Schedule this show</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline2" 
                        size="sm"
                        onClick={handleUpvote}
                        disabled={upvoteMutation.isPending || upvoteMutation.isError}
                        className="text-xs flex items-center gap-1 h-6 px-2 py-0"
                      >
                        <ArrowUp className="h-3 w-3" /> {event.upvotes || 0}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Upvote this show</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
          </span>
        </p>
      </div>
    </li>
  );
}

export default EventItem;
