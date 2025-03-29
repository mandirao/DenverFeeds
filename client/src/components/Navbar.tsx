import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-[#FEABDA] shadow-md px-4 py-3">
      <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center">
        <Link href="/">
          <h1 className="text-2xl md:text-3xl text-black hover:text-[#F4F2EA] transition-colors font-extrabold mb-2 sm:mb-0 cursor-pointer">SETLIST SOCIAL FEED</h1>
        </Link>
        <div className="flex space-x-4 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a 
                  href="https://www.meetup.com/setlist-social-indie-denver/?eventOrigin=event_home_page" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-black text-[#FE6B41] hover:bg-black/90 rounded-full px-4 py-2 font-medium transition-colors"
                >
                  RSVP
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p>Join our Meetup group</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;