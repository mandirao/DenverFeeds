import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Event, insertEventSchema, genres, venueOptions } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ChevronDown, CalendarIcon, X, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Function to check if string contains only emoji characters
function containsOnlyEmoji(str: string) {
  // Very permissive emoji check - any non-ascii character is likely an emoji
  // This is a simple approach that should work for drum emoji 🪘 and others
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode < 128 && charCode !== 32) { // Allow spaces, reject ASCII chars
      return false;
    }
  }
  return true;
}

// Extend the event schema with custom validations
export const eventFormSchema = insertEventSchema.extend({
  emoji: z.string()
    .min(1, "Emoji is required")
    .max(5, "Maximum 5 characters")
    .refine(value => containsOnlyEmoji(value), {
      message: "Only emoji characters are allowed"
    }),
  artist: z.string().min(1, "Artist name is required").max(75, "Maximum 75 characters"),
  venue: z.string().min(1, "Venue is required").max(75, "Maximum 75 characters"),
  summary: z.string().min(1, "Summary is required").max(75, "Maximum 75 characters"),
  soundsLike: z.string().min(1, "Sounds like is required").max(75, "Maximum 75 characters"),
  date: z.preprocess(
    (arg) => typeof arg === 'string' ? new Date(arg) : arg,
    z.date({
      required_error: "Date is required",
      invalid_type_error: "That's not a date!",
    })
  ),
  genre: z.string().min(1, "Genre is required"),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  onSubmit: (data: EventFormValues) => void;
  onCancel?: () => void;
  initialData?: Event; 
  submitButtonText?: string;
  isPending?: boolean;
  duplicateError?: string | null;
  extraActions?: React.ReactNode;
}

export default function EventForm({ 
  onSubmit, 
  onCancel, 
  initialData, 
  submitButtonText = "ADD SHOW",
  isPending = false,
  duplicateError = null,
  extraActions
}: EventFormProps) {
  const [venueSearchOpen, setVenueSearchOpen] = useState(false);
  const [customVenueMode, setCustomVenueMode] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Format the date for input field (YYYY-MM-DD format)
  const formatDateForInput = (dateString?: string | Date): string => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
  };

  // Form setup
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      emoji: initialData?.emoji || "",
      artist: initialData?.artist || "",
      venue: initialData?.venue || "",
      date: initialData?.date ? new Date(initialData.date) : undefined,
      summary: initialData?.summary || "",
      soundsLike: initialData?.soundsLike || "",
      genre: initialData?.genre || "",
    },
  });

  // Set custom venue mode if initial venue doesn't match any venue option
  useEffect(() => {
    if (initialData?.venue) {
      const matchingVenue = venueOptions.find(v => v.value === initialData.venue);
      if (!matchingVenue && initialData.venue !== "TBD") {
        setCustomVenueMode(true);
      }
    }
  }, [initialData]);

  // Handle venue selection
  const handleVenueSelect = (value: string) => {
    if (value === "other") {
      // Enter "other" custom venue mode
      setCustomVenueMode(true);
      form.setValue("venue", ""); // Empty field for user to type
      setVenueSearchOpen(false);
      // Focus the input after a short delay to allow the UI to update
      setTimeout(() => {
        document.getElementById("venue")?.focus();
      }, 50);
    } else {
      // Just set the selected venue
      form.setValue("venue", value);
      setVenueSearchOpen(false);
      setCustomVenueMode(false);
    }
  };
  
  // Handle exiting custom venue mode
  const exitCustomVenueMode = () => {
    setCustomVenueMode(false);
    form.setValue("venue", "");
  };

  // Handle form submission
  const handleSubmit = (data: EventFormValues) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Madlib-style form layout */}
      <div className="flex flex-wrap gap-3 gap-y-8 items-baseline text-xl font-medium leading-loose">
        {/* Emoji Field */}
        <div className="inline-flex flex-col relative">
          <Input
            id="emoji"
            {...form.register("emoji")}
            maxLength={5}
            placeholder="🎸"
            className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 w-[40px] max-w-[40px] text-center text-xl placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black !bg-transparent"
          />
          <Label htmlFor="emoji" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">VIBE</Label>
          {form.formState.errors.emoji && (
            <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.emoji.message}</p>
          )}
        </div>
        
        {/* Artist Field */}
        <div className="inline-flex flex-col relative">
          <Input
            id="artist"
            {...form.register("artist")}
            maxLength={75}
            placeholder="Beach House"
            className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 min-w-[135px] placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black text-xl !bg-transparent"
          />
          <Label htmlFor="artist" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">ARTIST NAME</Label>
          {form.formState.errors.artist && (
            <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.artist.message}</p>
          )}
        </div>
        
        <span className="flex-none text-xl text-black">@</span>
        
        {/* Venue Field - Searchable Dropdown */}
        <div className="inline-flex flex-col relative">
          {customVenueMode ? (
            <div className="inline-flex items-center min-w-[200px]">
              <Input
                id="venue"
                {...form.register("venue")}
                maxLength={75}
                placeholder="Type venue name"
                className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 min-w-[170px] placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black text-xl !bg-transparent"
              />
              <button 
                type="button" 
                onClick={exitCustomVenueMode}
                className="ml-1 text-black hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Popover open={venueSearchOpen} onOpenChange={setVenueSearchOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={venueSearchOpen}
                  className="inline-flex items-center justify-between border-0 border-b-2 border-black bg-transparent p-2 pl-0 min-w-[180px] text-left text-xl"
                >
                  <span className={`truncate ${!form.getValues("venue") ? "text-black/20" : "text-black"}`}>
                    {form.getValues("venue") || "Select venue"}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-black" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput 
                    placeholder="Search venues..." 
                    className="h-9 border-none focus:ring-0"
                    value={searchValue}
                    onValueChange={setSearchValue}
                  />
                  <CommandList>
                    <CommandEmpty>No venues found.</CommandEmpty>
                    {/* Special options at the top without a heading */}
                    {(!searchValue || "tbd".includes(searchValue.toLowerCase())) && (
                      <CommandItem
                        value="TBD"
                        onSelect={handleVenueSelect}
                        className="cursor-pointer border-b"
                      >
                        TBD
                      </CommandItem>
                    )}
                    {(!searchValue || "other".includes(searchValue.toLowerCase()) || "festival".includes(searchValue.toLowerCase())) && (
                      <CommandItem
                        value="other"
                        onSelect={handleVenueSelect}
                        className="cursor-pointer border-b"
                      >
                        Other/Festival (custom)
                      </CommandItem>
                    )}
                    
                    <CommandGroup heading="Denver/Boulder Area">
                      {venueOptions
                        .filter(venue => 
                          venue.group === "denver_boulder" && 
                          venue.label.toLowerCase().includes(searchValue.toLowerCase())
                        )
                        .map(venue => (
                          <CommandItem
                            key={venue.value}
                            value={venue.value}
                            onSelect={handleVenueSelect}
                            className="cursor-pointer"
                          >
                            {venue.label}
                          </CommandItem>
                        ))
                      }
                    </CommandGroup>
                    <CommandGroup heading="Road Trip">
                      {venueOptions
                        .filter(venue => 
                          venue.group === "road_trip" && 
                          venue.label.toLowerCase().includes(searchValue.toLowerCase())
                        )
                        .map(venue => (
                          <CommandItem
                            key={venue.value}
                            value={venue.value}
                            onSelect={handleVenueSelect}
                            className="cursor-pointer"
                          >
                            {venue.label}
                          </CommandItem>
                        ))
                      }
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          <input 
            type="hidden" 
            id="venue-hidden" 
            {...form.register("venue")}
          />
          <Label htmlFor="venue" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">VENUE</Label>
          {form.formState.errors.venue && (
            <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.venue.message}</p>
          )}
        </div>
        
        {/* Date Field with attached parentheses */}
        <div className="inline-flex flex-nowrap items-baseline">
          <span className="flex-none text-xl text-black mr-0 pr-0">(</span>
          <div className="inline-flex flex-col relative">
            <div className="relative">
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <div className="relative w-full">
                    <Input
                      id="date"
                      type="date"
                      value={field.value ? formatDateForInput(field.value) : ''}
                      onChange={(e) => {
                        field.onChange(e.target.value ? new Date(e.target.value) : null);
                      }}
                      className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 pr-6 min-w-[135px] text-xl placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black [color-scheme:light] !bg-transparent"
                    />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-black" />
                    </div>
                  </div>
                )}
              />
            </div>
            <Label htmlFor="date" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">DATE</Label>
            {form.formState.errors.date && (
              <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.date.message}</p>
            )}
          </div>
          <span className="flex-none text-xl text-black ml-0 pl-0">).</span>
        </div>
        
        {/* Summary Field */}
        <div className="inline-flex flex-col relative">
          <Input
            id="summary"
            {...form.register("summary")}
            maxLength={75}
            placeholder="Dream-pop royalty with celestial vibes"
            className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 min-w-[378px] placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black text-xl !bg-transparent"
          />
          <Label htmlFor="summary" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">SNAPPY BAND INTRO</Label>
          {form.formState.errors.summary && (
            <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.summary.message}</p>
          )}
        </div>
        
        <span className="flex-none text-xl text-black">like</span>
        
        {/* Sounds Like Field with attached period */}
        <div className="inline-flex flex-nowrap items-baseline">
          <div className="inline-flex flex-col relative mr-0 pr-0">
            <Input
              id="soundsLike"
              {...form.register("soundsLike")}
              maxLength={75}
              placeholder="Mazzy Star, Cocteau Twins"
              className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pl-0 min-w-[225px] placeholder:text-black/20 text-black/20 [&:not(:placeholder-shown)]:text-black text-xl !bg-transparent"
            />
            <Label htmlFor="soundsLike" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">SIMILAR ARTIST(S)</Label>
            {form.formState.errors.soundsLike && (
              <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.soundsLike.message}</p>
            )}
          </div>
          <span className="flex-none text-xl text-black ml-0 pl-0">.</span>
        </div>
        
        {/* Genre Field */}
        <div className="inline-flex flex-col relative">
          <select
            id="genre"
            {...form.register("genre")}
            className="inline-block border-0 border-b-2 border-black bg-transparent focus:bg-transparent p-2 pt-1 pb-3 pl-0 min-w-[270px] text-xl appearance-none text-black/20 h-[43px] [&:not([value=''])]:text-black !bg-transparent"
          >
            <option value="" className="text-black/20">Genre</option>
            {genres.map((genre) => (
              <option key={genre} value={genre} className="text-black">{genre}</option>
            ))}
          </select>
          <Label htmlFor="genre" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">GENRE</Label>
          {form.formState.errors.genre && (
            <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.genre.message}</p>
          )}
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none text-black" />
        </div>
        
        {/* Action Buttons */}
        <div className="inline-flex items-baseline space-x-2 ml-1">
          <Button 
            type="submit"
            variant="default"
            className="bg-black hover:bg-black text-[#FE6B41] hover:text-[#41F2EE] rounded-full px-4 py-2 font-medium transition-colors"
            disabled={isPending}
          >
            {isPending ? "SAVING..." : submitButtonText}
          </Button>
          
          {onCancel && (
            <>
              <Button 
                type="button"
                variant="outline"
                onClick={onCancel}
                className="rounded-full border-black text-black hover:bg-gray-200 hover:text-black px-4 py-2 font-medium transition-colors"
              >
                CANCEL
              </Button>
              {extraActions}
            </>
          )}
        </div>
      </div>
      
      {/* Extra spacing to account for error messages */}
      <div className="h-16"></div>
      
      {/* Duplicate event error message */}
      {duplicateError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4">
          <div className="font-bold flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            Duplicate Event
          </div>
          <div className="whitespace-pre-line mt-1">{duplicateError}</div>
        </div>
      )}
    </form>
  );
}