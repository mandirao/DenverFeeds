import { Link } from "wouter";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Music, Users, Calendar } from "lucide-react";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";

export function Navbar() {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#FEABDA] shadow-md px-4 py-3">
      <div className="container mx-auto">
        {/* Main navbar row with title and RSVP button */}
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center gap-2">
            <Link href="/">
              <h1 className="text-3xl md:text-4xl text-black hover:text-[#41F2EE] transition-colors font-black mb-2 sm:mb-0 cursor-pointer">SETLIST SOCIAL FEED</h1>
            </Link>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => setCalendarOpen(true)}
                    className="text-black hover:text-[#41F2EE] transition-colors mb-2 sm:mb-0"
                  >
                    <Calendar className="h-6 w-6" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Subscribe to calendar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center space-x-6">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href="https://www.meetup.com/setlist-social-indie-denver/?eventOrigin=event_home_page" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1"
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
                  <Link 
                    href="/playlists"
                    className="text-black hover:text-[#41F2EE] font-medium transition-colors flex items-center gap-1"
                  >
                    <Music className="h-4 w-4" />
                    <span>Playlists</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Browse our curated playlists</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/add"
                    className="bg-black text-[#FEABDA] hover:text-[#41F2EE] rounded-full px-3 py-1.5 font-medium transition-colors flex items-center gap-1"
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
      
      <CalendarSubscribeModal open={calendarOpen} onOpenChange={setCalendarOpen} />
    </nav>
  );
}