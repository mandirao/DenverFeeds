import React, { useState, useEffect } from "react";
import { Event } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatDate, createGoogleCalendarUrl, createGoogleMapsUrl, createSpotifySearchUrl, isRecentlyAdded } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ArrowUp, Check } from "lucide-react";

interface EventItemProps {
  event: Event;
}

function EventItem({ event }: EventItemProps) {
  const queryClient = useQueryClient();
  const [isHoveringArtist, setIsHoveringArtist] = useState(false);
  const [isHoveringVenue, setIsHoveringVenue] = useState(false);
  const [isHoveringDate, setIsHoveringDate] = useState(false);
  const [showUpvoteTooltip, setShowUpvoteTooltip] = useState(false);

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${event.id}/upvote`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${event.id}/has-upvoted`] });
    }
  });
  
  // Track if the user has voted for this event
  const [hasVoted, setHasVoted] = useState(false);
  
  // Define type for our API response
  interface UpvoteResponse {
    hasUpvoted: boolean;
  }
  
  // Check if user has already upvoted this event
  const hasUpvotedQuery = useQuery<UpvoteResponse>({
    queryKey: [`/api/events/${event.id}/has-upvoted`],
    enabled: !!event.id && !event.isScheduled
  });
  
  // Set the voted state based on the query result
  useEffect(() => {
    if (hasUpvotedQuery.data && hasUpvotedQuery.data.hasUpvoted) {
      setHasVoted(true);
      
      // Show the tooltip for first-time load if already voted
      setShowUpvoteTooltip(true);
      
      // Hide it after a brief delay
      const timer = setTimeout(() => {
        setShowUpvoteTooltip(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [hasUpvotedQuery.data]);

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
    // Don't allow upvoting if the user has already voted
    if (hasVoted) return;
    
    upvoteMutation.mutate(undefined, {
      onSuccess: () => {
        setHasVoted(true);
        // Show the tooltip after voting
        setShowUpvoteTooltip(true);
        // Hide the tooltip after a delay
        setTimeout(() => {
          setShowUpvoteTooltip(false);
        }, 3000);
      }
    });
  };

  const handleSchedule = () => {
    scheduleMutation.mutate();
  };

  // Format date for display
  const formattedDate = formatDate(event.date);
  
  // Create URLs for interactive elements
  const calendarUrl = createGoogleCalendarUrl(event);
  const mapsUrl = createGoogleMapsUrl(event.venue, event.artist);
  const spotifyUrl = createSpotifySearchUrl(event.artist);
  
  // Check if the event was added in the last week
  const justAdded = isRecentlyAdded(event.createdAt);

  return (
    <li className="pb-1 relative flex items-start">
      <span className="text-2xl mr-3">{event.emoji}</span>
      
      <div className="flex-1">
        <div className="text-base flex items-start">
          <div className="flex-grow">
            {/* Artist Name (Spotify link) */}
            <TooltipProvider>
              <Tooltip open={isHoveringArtist}>
                <TooltipTrigger asChild>
                  <a 
                    href={spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
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
            
            {" @ "}
            
            {/* Venue (Google Maps) */}
            <TooltipProvider>
              <Tooltip open={isHoveringVenue}>
                <TooltipTrigger asChild>
                  <a 
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
                    onMouseEnter={() => setIsHoveringVenue(true)}
                    onMouseLeave={() => setIsHoveringVenue(false)}
                  >
                    {event.venue}
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Find tickets and venue information</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {" ("}
            
            {/* Date (Google Calendar) */}
            <TooltipProvider>
              <Tooltip open={isHoveringDate}>
                <TooltipTrigger asChild>
                  <a 
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
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
            
            {"). "}
            {event.summary}
            {" like "}
            <span className="italic">{event.soundsLike.split(',').join(', ')}.</span>
            
            {/* "Just added" badge */}
            {justAdded && (
              <span className="inline-block align-middle ml-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span 
                        className="bg-[#FEABDA] text-black text-xs font-bold uppercase px-1 py-0.5 inline-flex items-center h-5"
                        style={{ position: 'relative', top: '-3px' }}
                      >
                        new
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Added within the last three days</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
            
            {/* Upvote button */}
            {!event.isScheduled && (
              <span className="inline-block align-middle ml-2" style={{ position: 'relative', top: '-1px' }}>
                <TooltipProvider delayDuration={100}>
                  <Tooltip open={showUpvoteTooltip}>
                    <TooltipTrigger asChild>
                      <div 
                        className="relative"
                        onMouseEnter={() => setShowUpvoteTooltip(true)}
                        onMouseLeave={() => !upvoteMutation.isPending && setShowUpvoteTooltip(false)}
                      >
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={handleUpvote}
                          disabled={upvoteMutation.isPending || upvoteMutation.isError || hasVoted}
                          className={`${hasVoted ? 'bg-[#25428A] text-white' : 'bg-black text-[#F26241]'} ${!hasVoted && 'hover:text-black'} rounded-full text-xs flex items-center gap-1 h-5 px-2 py-0`}
                          aria-label={hasVoted ? 'You voted for this show' : 'Upvote this show'}
                        >
                          <ArrowUp className="h-3 w-3" /> {event.upvotes || 0}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{hasVoted ? 'You voted for this show' : 'Upvote this show'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
            
            {/* Show scheduled tag */}
            {event.isScheduled && (
              <span className="inline-block align-middle ml-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span 
                        onClick={handleSchedule}
                        className="bg-[#f5f5f5] text-black text-xs font-bold uppercase px-1 py-0.5 inline-flex items-center h-5 cursor-text"
                        style={{ position: 'relative', top: '-1px' }}
                      >
                        <Check className="mr-0.5 h-3 w-3" /> Scheduled
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Learn more at Meetup</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
          </div>
          
          {/* Right-aligned controls - just the scheduling dot */}
          <div className="flex items-center">
            {!event.isScheduled ? (
              <div className="ml-auto pl-2" style={{ position: 'relative', top: '2px' }}>
                {/* Schedule button dot */}
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
                        <div className="w-1.5 h-1.5 rounded-full bg-[#e15a30]"></div>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Schedule this show</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export default EventItem;