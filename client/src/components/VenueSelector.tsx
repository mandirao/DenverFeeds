import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

// Define venue categories and list
export const venueCategories = [
  {
    label: "DENVER/BOULDER AREA",
    venues: [
      "Ball Arena",
      "Bluebird Theater",
      "Boulder Theater",
      "Cervantes' Masterpiece Ballroom",
      "Chautauqua Auditorium",
      "Club Vinyl",
      "Dick's Sporting Goods Park",
      "Dillon Amphitheater",
      "Empower Field at Mile High",
      "Fiddler's Green Amphitheatre",
      "Fillmore Auditorium",
      "Fox Theatre",
      "Globe Hall",
      "Gothic Theatre",
      "Greek Theater",
      "HQ",
      "Hi-Dive",
      "Larimer Lounge",
      "Levitt Pavilion Denver",
      "Lost Lake Lounge",
      "Marquis Theater",
      "Meow Wolf Denver",
      "Mission Ballroom",
      "Moe's Original BBQ",
      "Ogden Theatre",
      "Oriental Theater",
      "Paramount Theatre",
      "Red Rocks Amphitheatre",
      "ReelWorks Denver",
      "Roxy on Broadway",
      "Skylark Lounge",
      "Summit Music Hall",
      "The Church"
    ]
  },
  {
    label: "ROAD TRIP",
    venues: [
      "Aggie Theatre",
      "Black Sheep",
      "Ford Amphitheater",
      "Fort Collins Armory",
      "Gold Hill Inn",
      "New Belgium Brewing Company",
      "Sunset Amphitheater",
      "Surf Hotel",
      "The Coast",
      "The Lyric",
      "The Mishawaka",
      "Washington's"
    ]
  }
];

// Create a flat list of all venues for searching
export const allVenues = [
  "TBD",
  "Other/Festival",
  ...venueCategories.flatMap(category => category.venues)
];

export const isDenverArea = (venue: string): boolean => {
  // Special handling for non-standard venues
  if (venue === "TBD" || venue === "Other/Festival" || venue.trim() === "") {
    return true; // Consider these as Denver area by default
  }
  
  // Check in the Denver/Boulder category
  return venueCategories[0].venues.includes(venue);
};

interface VenueSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  style?: React.CSSProperties;
}

export function VenueSelector({ 
  value, 
  onChange, 
  placeholder = "Select venue...", 
  className,
  error,
  style
}: VenueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isCustomVenue, setIsCustomVenue] = useState(false);
  const [customVenue, setCustomVenue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if the current value is a custom venue
  useEffect(() => {
    if (value === "Other/Festival") {
      setIsCustomVenue(true);
    } else {
      setIsCustomVenue(false);
      setCustomVenue("");
    }
  }, [value]);

  // Handle custom venue input change
  const handleCustomVenueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCustomVenue(newValue);
    onChange(newValue);
  };

  // Focus the custom venue input when "Other/Festival" is selected
  useEffect(() => {
    if (isCustomVenue && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCustomVenue]);

  return (
    <div className="space-y-2">
      {!isCustomVenue ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "w-full justify-between bg-transparent",
                error ? "border-red-500" : "border-gray-300",
                value ? "text-black" : "text-muted-foreground",
                className
              )}
              style={style}
            >
              {value || placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
            <Command>
              <CommandInput placeholder="Search venue..." />
              <CommandEmpty>No venue found.</CommandEmpty>
              
              {/* Special Options */}
              <CommandGroup heading="Options">
                <CommandItem
                  value="TBD"
                  onSelect={() => {
                    onChange("TBD");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "TBD" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  TBD
                </CommandItem>
                <CommandItem
                  value="Other/Festival"
                  onSelect={() => {
                    onChange("Other/Festival");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "Other/Festival" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Other/Festival
                </CommandItem>
              </CommandGroup>
              
              {/* Denver/Boulder Venues */}
              <CommandGroup heading={venueCategories[0].label}>
                {venueCategories[0].venues.map((venue) => (
                  <CommandItem
                    key={venue}
                    value={venue}
                    onSelect={() => {
                      onChange(venue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === venue ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {venue}
                  </CommandItem>
                ))}
              </CommandGroup>
              
              {/* Road Trip Venues */}
              <CommandGroup heading={venueCategories[1].label}>
                {venueCategories[1].venues.map((venue) => (
                  <CommandItem
                    key={venue}
                    value={venue}
                    onSelect={() => {
                      onChange(venue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === venue ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {venue}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="relative">
          <Input
            ref={inputRef}
            placeholder="Enter venue or festival name..."
            value={value === "Other/Festival" ? customVenue : value}
            onChange={handleCustomVenueChange}
            className={cn(
              error ? "border-red-500" : "border-gray-300",
              className
            )}
            style={style}
          />
          <button 
            type="button"
            onClick={() => onChange("")} 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label="Clear custom venue and return to dropdown"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}