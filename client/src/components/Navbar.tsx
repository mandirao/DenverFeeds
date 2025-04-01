import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Filter, ChevronDown, Music, Users } from "lucide-react";
import { EventFiltersProps, MonthOption } from "@/components/EventFilters";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface NavbarProps {
  showFilters?: boolean;
  filterProps?: EventFiltersProps;
}

export function Navbar({ showFilters = false, filterProps }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 bg-[#FEABDA] shadow-md px-4 py-3">
      <div className="container mx-auto">
        {/* Main navbar row with title and RSVP button */}
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center">
            <Link href="/">
              <h1 className="text-3xl md:text-4xl text-black hover:text-[#41F2EE] transition-colors font-black mb-2 sm:mb-0 cursor-pointer">SETLIST SOCIAL FEED</h1>
            </Link>
            
            {/* Filter moved next to header */}
            {showFilters && filterProps && (
              <div className="ml-4">
                <Accordion type="single" collapsible defaultValue="">
                  <AccordionItem value="filters" className="border-0">
                    <AccordionTrigger className="py-1 hover:no-underline justify-start" hideChevron>
                      <div className="flex items-center gap-1">
                        <Filter className="h-5 w-5" />
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 chevron-icon" />
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                          <select 
                            id="month-filter" 
                            value={filterProps.monthFilter || "all"}
                            onChange={filterProps.onMonthChange}
                            className="text-xs p-0.5 border border-black bg-[#FEABDA] text-black rounded-sm text-[10px] h-5"
                          >
                            <option value="all">All Months</option>
                            {filterProps.months?.map((m: MonthOption) => (
                              <option key={m.key} value={m.key}>{m.display}</option>
                            ))}
                          </select>
                          
                          <select 
                            id="genre-filter" 
                            value={filterProps.genreFilter || "all"}
                            onChange={filterProps.onGenreChange}
                            className="text-xs p-0.5 border border-black bg-[#FEABDA] text-black rounded-sm text-[10px] h-5"
                          >
                            <option value="all">All Genres</option>
                            {filterProps.genres?.map((g: string) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          
                          <select 
                            id="status-filter" 
                            value={filterProps.statusFilter || "all"}
                            onChange={filterProps.onStatusChange}
                            className="text-xs p-0.5 border border-black bg-[#FEABDA] text-black rounded-sm text-[10px] h-5"
                          >
                            <option value="all">Show All</option>
                            <option value="top-voted">Top Voted</option>
                            <option value="just-added">Just Added</option>
                            <option value="scheduled">Scheduled</option>
                          </select>
                        </div>
                        
                        {/* Denver/Boulder area toggle */}
                        <div className="flex items-center justify-start space-x-2 mt-1 ml-2">
                          <div className="relative">
                            <Switch 
                              id="denver-area-only" 
                              checked={filterProps.denverAreaOnlyFilter}
                              onCheckedChange={filterProps.onDenverAreaOnlyChange}
                              className="bg-[#FE6B41] data-[state=checked]:bg-[#41F2EE] h-4 w-7"
                            />
                          </div>
                          <Label htmlFor="denver-area-only" className="text-[10px] font-medium cursor-pointer">
                            {filterProps.denverAreaOnlyFilter ? "Denver/Boulder" : "Roadtrips"}
                          </Label>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href="https://www.meetup.com/setlist-social-indie-denver/?eventOrigin=event_home_page" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-black text-[#FE6B41] hover:text-[#41F2EE] rounded-full px-3 py-1.5 font-medium transition-colors flex items-center gap-1"
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
                  <a 
                    href="https://open.spotify.com/playlist/65hepNEHQKF41ymtEqunGr?si=x_8SYxZyRUWJNhZRG4wvhQ" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-black text-[#1DB954] hover:text-[#41F2EE] rounded-full px-3 py-1.5 font-medium transition-colors flex items-center gap-1"
                  >
                    <Music className="h-4 w-4" />
                    <span>Playlist</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Join our monthly Spotify playlist</p>
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
    </nav>
  );
}

export default Navbar;