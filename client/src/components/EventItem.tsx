import React, { useState, useEffect } from "react";
import { Event } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatDate, createGoogleCalendarUrl, createGoogleMapsUrl, createSpotifySearchUrl, isRecentlyAdded } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowUp, Check, Trash2, MoreVertical, Edit } from "lucide-react";
import EditEventModal from "@/components/EditEventModal";

interface EventItemProps {
  event: Event;
}

function EventItem({ event }: EventItemProps) {
  const queryClient = useQueryClient();
  const [isHoveringArtist, setIsHoveringArtist] = useState(false);
  const [isHoveringVenue, setIsHoveringVenue] = useState(false);
  const [isHoveringDate, setIsHoveringDate] = useState(false);
  const [showUpvoteTooltip, setShowUpvoteTooltip] = useState(false);
  const [showRequesterTooltip, setShowRequesterTooltip] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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
  
  // Decrease upvote mutation (for admin use)
  const decreaseUpvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${event.id}/decrease-upvote`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
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
    else if (hasUpvotedQuery.data && !hasUpvotedQuery.data.hasUpvoted) {
      setHasVoted(false);
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
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/events/${event.id}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    }
  });

  const handleUpvote = () => {
    upvoteMutation.mutate(undefined, {
      onSuccess: (data) => {
        // The actual state will be updated by the query invalidation and useEffect
        // We don't need to manually toggle hasVoted here
        
        // Show the tooltip with appropriate message
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
  
  const handleDelete = () => {
    deleteMutation.mutate();
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
    <>
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
              
              {/* Requester information with bell emoji for non-Mandi requesters */}
              {event.requester && event.requester !== 'Mandi' && (
                <span className="inline-block align-middle ml-2">
                  <TooltipProvider>
                    <Tooltip open={showRequesterTooltip}>
                      <TooltipTrigger asChild>
                        <span 
                          className="text-base inline-flex items-center cursor-pointer"
                          style={{ position: 'relative', top: '-1px' }}
                          onClick={() => {
                            // Show tooltip for 2 seconds when clicked
                            setShowRequesterTooltip(true);
                            setTimeout(() => {
                              setShowRequesterTooltip(false);
                            }, 2000);
                          }}
                          onMouseEnter={() => setShowRequesterTooltip(true)}
                          onMouseLeave={() => setShowRequesterTooltip(false)}
                        >
                          🛎️
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Added by {event.requester}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              )}
              
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
                        <p>Added within the last week</p>
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
                            disabled={upvoteMutation.isPending || upvoteMutation.isError}
                            className={`${hasVoted ? 'bg-[#25428A] text-white hover:opacity-90' : 'bg-black text-[#F26241] hover:text-[#41F2EE]'} rounded-full text-xs flex items-center gap-1 h-5 px-2 py-0 cursor-pointer`}
                            aria-label={hasVoted ? 'You already voted for this one' : 'Upvote this show'}
                          >
                            <ArrowUp className="h-3 w-3" /> {event.upvotes || 0}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{hasVoted ? 'Click to remove your vote' : 'Upvote this show'}</p>
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
                          className="bg-[#f5f5f5] text-black text-xs font-bold uppercase px-1 py-0.5 inline-flex items-center h-5"
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
            
            {/* Right-aligned 3-dot menu */}
            <div className="flex items-center">
              <div className="ml-auto pl-2" style={{ position: 'relative', top: '2px' }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full bg-transparent opacity-40"
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32 border-none bg-gray-100 shadow-md rounded-sm font-sans">
                    <DropdownMenuItem 
                      onClick={() => setIsEditModalOpen(true)}
                      className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                    >
                      Edit
                    </DropdownMenuItem>
                    {event.isScheduled ? (
                      <DropdownMenuItem 
                        onClick={handleSchedule}
                        disabled={scheduleMutation.isPending}
                        className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                      >
                        Unschedule
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        onClick={handleSchedule}
                        disabled={scheduleMutation.isPending}
                        className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                      >
                        Schedule
                      </DropdownMenuItem>
                    )}
                    
                    {/* New Unvote option to manually decrease upvotes */}
                    {(event.upvotes ?? 0) > 0 && (
                      <DropdownMenuItem 
                        onClick={() => decreaseUpvoteMutation.mutate()}
                        disabled={decreaseUpvoteMutation.isPending}
                        className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                      >
                        Unvote (-1)
                      </DropdownMenuItem>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                          onSelect={(e) => e.preventDefault()} // Prevent the dropdown from closing
                        >
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Event</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this event? This action cannot be undone.
                            <p className="mt-2">
                              <strong>{event.artist}</strong> @ {event.venue} ({formattedDate})
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleDelete}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </li>
      
      {/* Edit Event Modal */}
      {isEditModalOpen && (
        <EditEventModal
          event={event}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </>
  );
}

export default EventItem;