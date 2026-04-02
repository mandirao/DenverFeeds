import { Link } from "wouter";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Music, Users, Calendar, ChevronDown } from "lucide-react";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";
import { siteUrls } from "@/lib/siteConfig";

export function Navbar() {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#FEABDA] shadow-md px-4 py-3">
      <div className="container mx-auto">
        {/* Main navbar row with title and RSVP button */}
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 group outline-none">
                <h1 className="text-3xl md:text-4xl text-black group-hover:text-[#41F2EE] transition-colors font-black mb-2 sm:mb-0">SETLIST SOCIAL FEED</h1>
                <ChevronDown className="h-4 w-4 text-black group-hover:text-[#41F2EE] transition-colors mb-2 sm:mb-0 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-none border-2 border-black bg-black text-white p-0 min-w-[240px]">
                <DropdownMenuItem asChild className="rounded-none focus:bg-[#FFF8E7] focus:text-black px-4 py-3 cursor-pointer">
                  <a href={siteUrls.amuseBouche} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                    🍽️ AMUSE-BOUCHE INSIDER
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-none focus:bg-[#F2F0FF] focus:text-black px-4 py-3 cursor-pointer">
                  <a href={siteUrls.artistryNerdistry} className="font-black uppercase tracking-wide text-sm flex items-center gap-2 text-white hover:text-black w-full">
                    🎨 ARTISTRY/NERDISTRY LIVE
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center space-x-6">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => setCalendarOpen(true)}
                    className="text-black hover:text-[#41F2EE] transition-colors"
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