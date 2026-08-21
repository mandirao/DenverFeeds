import { Link } from "wouter";
import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Music, Users, Calendar, Ticket } from "lucide-react";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";
import { SiteSwitcher } from "./SiteSwitcher";

// `children`, if passed, renders as a persistent bottom section of this sticky nav
// (e.g. a filter bar) — see Home.tsx for how it's positioned per breakpoint.
//
// `onPlaylistsPage`, when true, swaps the "Playlists" link for a "Shows" link
// back to the main feed — same nav-swap pattern as Amuse-Bouche's Popups/Gems
// links, so the nav never links to the page you're already on.
export function Navbar({ children, onPlaylistsPage }: { children?: ReactNode; onPlaylistsPage?: boolean }) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#FEABDA] shadow-md">
      <div className="container mx-auto px-4 py-3">
        {/* Main navbar row with title and RSVP button */}
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center gap-2">
            <SiteSwitcher
              title="SETLIST SOCIAL FEED"
              titleClassName="text-3xl md:text-4xl text-black group-hover:text-[#41F2EE] transition-colors font-black mb-2 sm:mb-0"
              chevronClassName="h-4 w-4 text-black group-hover:text-[#41F2EE] transition-colors mb-2 sm:mb-0 shrink-0"
            />
          </div>
          <div className="flex items-center space-x-6">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCalendarOpen(true)}
                    className="text-black hover:text-[#41F2EE] transition-colors p-3.5 -m-3.5 md:p-0 md:m-0"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Subscribe to calendar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href="https://www.meetup.com/setlist-social-indie-denver/?eventOrigin=event_home_page" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0"
                  >
                    <Users className="h-4 w-4" />
                    <span>Meetup</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Join our Meetup group</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {onPlaylistsPage ? (
                    <Link
                      href="/"
                      className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0"
                    >
                      <Ticket className="h-4 w-4" />
                      <span>Shows</span>
                    </Link>
                  ) : (
                    <Link
                      href="/playlists"
                      className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1 py-3 -my-3 md:py-0 md:my-0"
                    >
                      <Music className="h-4 w-4" />
                      <span>Playlists</span>
                    </Link>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{onPlaylistsPage ? "Back to the shows feed" : "Browse our curated playlists"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/add"
                    className="bg-black text-[#FEABDA] hover:text-[#41F2EE] rounded-full px-3 py-2.5 md:py-1.5 font-medium transition-colors flex items-center gap-1"
                  >
                    <span>+ Show</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add a new show</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {children}

      <CalendarSubscribeModal open={calendarOpen} onOpenChange={setCalendarOpen} />
    </nav>
  );
}