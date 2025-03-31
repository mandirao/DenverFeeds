import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { insertEventSchema, genres, venueOptions } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { AlertCircle, ChevronDown, CalendarIcon, X, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
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
const addEventSchema = insertEventSchema.extend({
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
  date: z.string().min(1, "Date is required"),
  genre: z.string().min(1, "Genre is required"),
});

type FormValues = z.infer<typeof addEventSchema>;

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [csvError, setCsvError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [venueSearchOpen, setVenueSearchOpen] = useState(false);
  const [customVenueMode, setCustomVenueMode] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(addEventSchema),
    defaultValues: {
      emoji: "",
      artist: "",
      venue: "",
      date: "",
      summary: "",
      soundsLike: "",
      genre: "",
    },
  });

  // Add single event mutation
  const addEventMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest({
        endpoint: "/api/events",
        method: "POST",
        data
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Added",
        description: "The event has been added successfully!",
      });
      navigate("/");
    },
    onError: (error: any) => {
      console.error("Single event add error:", error);
      
      if (error.response?.status === 409 || error.message?.includes("already exists")) {
        setDuplicateError("This event already exists in the database.");
      } else if (error.response?.status === 400) {
        // Handle validation errors
        toast({
          title: "Validation Error",
          description: error.response?.data?.message || "Please check your form inputs.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add event. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  // Add multiple events (CSV) mutation
  const addEventsBulkMutation = useMutation({
    mutationFn: async (events: any[]) => {
      return apiRequest({
        endpoint: "/api/events/bulk",
        method: "POST",
        data: events
      });
    },
    onSuccess: (data) => {
      console.log("Bulk upload response:", data);
      
      // Update the results display
      if (data.results?.skipped > 0) {
        setDuplicateError(
          data.results.errors?.length > 0 
            ? `Some events couldn't be added: ${data.results.errors[0]}${data.results.errors.length > 1 ? ` and ${data.results.errors.length - 1} more` : ''}`
            : "One or more events skipped because they already exist."
        );
      }
      
      if (data.results?.created > 0) {
        toast({
          title: "Events Added",
          description: data.message || `Added ${data.results.created} events successfully!`,
        });
        
        if (data.results.skipped === 0) {
          navigate("/");
        }
      } else {
        setCsvError("No events were added. Please check the CSV format and try again.");
      }
    },
    onError: (error: any) => {
      console.error("Bulk upload error:", error);
      
      // Handle structured error responses
      if (error.response?.data?.results?.errors?.length > 0) {
        const errors = error.response.data.results.errors;
        setCsvError(`Upload failed: ${errors.join(", ")}`);
      } else if (error.message?.includes("409")) {
        setCsvError("All events already exist in the database.");
      } else {
        toast({
          title: "Error",
          description: "Failed to add events from CSV. Please check the format and try again.",
          variant: "destructive",
        });
        setCsvError(error.message || "Upload failed");
      }
    },
  });

  // Handle form submission
  const onSubmit = (data: FormValues) => {
    setDuplicateError(null);
    addEventMutation.mutate(data);
  };

  // Handle CSV upload
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    setDuplicateError(null);
    
    const file = event.target.files?.[0];
    if (!file) return;
    
    Papa.parse(file, {
      header: true, // Always use header: true for more reliable parsing
      skipEmptyLines: true,
      quoteChar: '"', // Properly handle quoted fields
      escapeChar: '"',
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setCsvError(`Error parsing CSV file: ${results.errors[0].message || "Invalid format"}`);
          return;
        }
        
        try {
          console.log("CSV headers:", results.meta.fields);
          console.log("Raw parsed data:", results.data);
          
          // Check for required headers
          const requiredHeaders = ['artist', 'venue', 'date', 'emoji', 'summary', 'genre'];
          const missingHeaders = requiredHeaders.filter(header => 
            !results.meta.fields?.some(field => 
              field.toLowerCase() === header.toLowerCase() || 
              (header === 'soundsLike' && field.toLowerCase() === 'sounds_like')
            )
          );
          
          if (missingHeaders.length > 0) {
            setCsvError(`CSV is missing required headers: ${missingHeaders.join(', ')}`);
            return;
          }
          
          // Track validation errors
          const errors: string[] = [];
          
          // Filter out empty rows and process valid ones
          const events = results.data
            .filter((row: any, index: number) => {
              // Skip empty rows
              if (!row || Object.values(row).every(val => !val)) {
                return false;
              }
              
              // Check for required fields
              const missingFields = [];
              if (!row.artist) missingFields.push('artist');
              if (!row.venue) missingFields.push('venue');
              if (!row.date) missingFields.push('date');
              if (!row.emoji) missingFields.push('emoji');
              if (!row.summary) missingFields.push('summary');
              if (!row.genre) missingFields.push('genre');
              
              if (missingFields.length > 0) {
                errors.push(`Row ${index + 2}: Missing fields: ${missingFields.join(', ')}`);
                return false;
              }
              
              // Validate date format with enhanced message
              if (row.date) {
                // Regex to validate YYYY-MM-DD format
                const dateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
                const match = row.date.trim().match(dateRegex);
                
                if (!match) {
                  errors.push(`Row ${index + 2}: Invalid date format: "${row.date}" - must be YYYY-MM-DD`);
                  return false;
                }
                
                const year = parseInt(match[1], 10);
                const month = parseInt(match[2], 10);
                const day = parseInt(match[3], 10);
                
                // Basic validation ranges
                if (year < 2024 || year > 2026) {
                  errors.push(`Row ${index + 2}: Invalid year: ${year} - must be between 2024 and 2026`);
                  return false;
                }
                
                if (month < 1 || month > 12) {
                  errors.push(`Row ${index + 2}: Invalid month: ${month} - must be between 1 and 12`);
                  return false;
                }
                
                const daysInMonth = new Date(year, month, 0).getDate();
                if (day < 1 || day > daysInMonth) {
                  errors.push(`Row ${index + 2}: Invalid day: ${day} - must be between 1 and ${daysInMonth} for month ${month}`);
                  return false;
                }
              }
              
              return true;
            })
            .map((row: any) => {
              // Normalize the genre - ensure it's one of our valid genres
              let normalizedGenre = row.genre.trim();
              const validGenre = genres.find(g => g === normalizedGenre);
              
              if (!validGenre) {
                // Try to find a match by normalizing format
                const normalizedGenres = genres.map(g => g.replace(/,/g, '/'));
                const index = normalizedGenres.findIndex(g => 
                  g.toLowerCase() === normalizedGenre.replace(/,/g, '/').toLowerCase()
                );
                
                if (index !== -1) {
                  normalizedGenre = genres[index]; // Use the canonical format
                } else {
                  // Try a more aggressive normalization - strip spaces around commas
                  const strippedGenres = genres.map(g => g.replace(/\s*,\s*/g, ','));
                  const indexByStripped = strippedGenres.findIndex(g => 
                    g.toLowerCase().replace(/\s*,\s*/g, ',') === 
                    normalizedGenre.toLowerCase().replace(/\s*,\s*/g, ',')
                  );
                  
                  if (indexByStripped !== -1) {
                    normalizedGenre = genres[indexByStripped];
                  } else {
                    console.warn(`Genre "${normalizedGenre}" not found in valid genres list`);
                  }
                }
              }
              
              return {
                artist: row.artist.trim(),
                venue: row.venue.trim(),
                date: row.date.trim(), // Send as string, server will parse
                emoji: row.emoji.trim(),
                summary: row.summary.trim(),
                soundsLike: (row.sounds_like || row.soundsLike || "").trim(),
                genre: normalizedGenre,
              };
            });
            
          console.log("Processed events:", events);
          console.log("Validation errors:", errors);
          
          if (errors.length > 0) {
            // Show first 3 errors with count of remaining
            const errorMessage = errors.length <= 3 
              ? errors.join('\n') 
              : `${errors.slice(0, 3).join('\n')}\n...and ${errors.length - 3} more errors`;
            
            setCsvError(`CSV validation failed:\n${errorMessage}`);
            return;
          }
          
          if (events.length > 0) {
            addEventsBulkMutation.mutate(events);
          } else {
            setCsvError("No valid events found in CSV file.");
          }
        } catch (error) {
          console.error("CSV processing error:", error);
          setCsvError("Error processing CSV data. Please check the format and ensure all required fields are present.");
        }
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        setCsvError("Failed to read CSV file.");
      }
    });
  };

  // Use genres directly from schema.ts instead of hardcoding them here
  
  // Handle venue selection
  const handleVenueSelect = (value: string) => {
    if (value === "other") {
      // Enter "other" custom venue mode
      setCustomVenueMode(true);
      form.setValue("venue", "");
      setVenueSearchOpen(false);
      
      // Focus the input field after a brief delay to allow rendering
      setTimeout(() => {
        const venueInput = document.getElementById("venue");
        if (venueInput) {
          venueInput.focus();
        }
      }, 100);
    } else if (value === "tbd") {
      // Set TBD value
      form.setValue("venue", "TBD");
      setVenueSearchOpen(false);
      setCustomVenueMode(false);
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

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar showFilters={false} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-[#FEABDA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton font-black uppercase">ADD A SHOW</h2>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              
              <span className="flex-none text-xl">@</span>
              
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
                      className="ml-1 text-gray-700 hover:text-black transition-colors"
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
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                          <CommandGroup heading="Quick Options">
                            <CommandItem
                              value="tbd"
                              onSelect={handleVenueSelect}
                              className="cursor-pointer"
                            >
                              TBD
                            </CommandItem>
                            <CommandItem
                              value="other"
                              onSelect={handleVenueSelect}
                              className="cursor-pointer"
                            >
                              Other/Festival (custom)
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading="Denver/Boulder Area">
                            {venueOptions
                              .filter(venue => venue.group === "denver_boulder" && venue.label.toLowerCase().includes(searchValue.toLowerCase()))
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
                              .filter(venue => venue.group === "road_trip" && venue.label.toLowerCase().includes(searchValue.toLowerCase()))
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
                <span className="flex-none text-xl mr-0 pr-0">(</span>
                <div className="inline-flex flex-col relative">
                  <div className="relative">
                    <div className="relative">
                      <div
                        className={`inline-flex items-center justify-between border-0 border-b-2 border-black bg-transparent p-2 pl-0 pr-0 min-w-[135px] text-left text-xl ${!form.getValues("date") ? "text-black/20" : "text-black"} cursor-pointer`}
                        onClick={() => {
                          // This technique creates a simulated click on the date input
                          const dateInput = document.getElementById('date-input') as HTMLInputElement;
                          if (dateInput) {
                            const event = new MouseEvent('click', {
                              view: window,
                              bubbles: true,
                              cancelable: true,
                            });
                            dateInput.dispatchEvent(event);
                          }
                        }}
                      >
                        <span className="flex-1">
                          {form.getValues("date") 
                            ? new Date(form.getValues("date")).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric"
                              })
                            : "Select date"}
                        </span>
                        <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </div>
                      <input
                        id="date-input"
                        type="date"
                        className="w-full h-full absolute top-0 left-0 opacity-0 cursor-pointer"
                        onChange={(e) => {
                          form.setValue("date", e.target.value, { shouldValidate: true });
                          form.trigger("date");
                        }}
                      />
                      <input
                        id="date"
                        type="hidden"
                        {...form.register("date")}
                      />
                    </div>
                  </div>
                  <Label htmlFor="date" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">DATE</Label>
                  {form.formState.errors.date && (
                    <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.date.message}</p>
                  )}
                </div>
                <span className="flex-none text-xl ml-0 pl-0">).</span>
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
              
              <span className="flex-none text-xl">like</span>
              
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
                <span className="flex-none text-xl ml-0 pl-0">.</span>
              </div>
              
              {/* Genre Field - Dropdown */}
              <div className="inline-flex flex-col relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-label="Select genre"
                      className={`inline-flex items-center justify-between border-0 border-b-2 border-black bg-transparent p-2 pl-0 min-w-[270px] text-left text-xl ${!form.getValues("genre") ? "text-black/20" : "text-black"}`}
                    >
                      <span>{form.getValues("genre") || "Genre"}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Search genres..." 
                        className="h-9 border-none focus:ring-0"
                      />
                      <CommandList>
                        <CommandEmpty>No genre found.</CommandEmpty>
                        <CommandGroup>
                          {genres.map(genre => (
                            <CommandItem
                              key={genre}
                              value={genre}
                              onSelect={(value) => {
                                form.setValue("genre", value);
                                // Force re-render to update the display text
                                form.trigger("genre");
                              }}
                              className="cursor-pointer"
                            >
                              {genre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <input 
                  type="hidden" 
                  id="genre"
                  {...form.register("genre")}
                />
                <Label htmlFor="genre" className="absolute -bottom-5 left-0 text-[11px] text-gray-700 font-sora font-bold">GENRE</Label>
                {form.formState.errors.genre && (
                  <p className="absolute top-full left-0 text-red-500 text-[12px] whitespace-nowrap mt-6">{form.formState.errors.genre.message}</p>
                )}
              </div>
              
              {/* Add Show Button - positioned very close to the genre dropdown */}
              <div className="inline-flex items-baseline ml-1">
                <Button 
                  type="submit"
                  variant="default"
                  className="bg-black hover:bg-black text-[#FE6B41] hover:text-[#41F2EE] rounded-full px-4 py-2 font-medium transition-colors"
                  disabled={addEventMutation.isPending}
                >
                  {addEventMutation.isPending ? "ADDING..." : "ADD SHOW"}
                </Button>
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
        </div>
        
        {/* CSV Upload Section - outside the form on orange background */}
        <div className="mt-1 p-6 bg-[#FE6B41] rounded-lg">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="csv-upload" className="border-0">
              <AccordionTrigger className="p-0 hover:no-underline" hideChevron>
                <h3 className="text-sm text-black font-anton text-left flex items-center">
                  CSV <ChevronDown className="h-4 w-4 ml-1 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                </h3>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <Input
                  type="file"
                  id="csv-upload"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="block w-full p-3 border-2 border-black bg-[#FEABDA] rounded-none file:text-black file:opacity-20"
                />
                <div className="text-sm text-black mt-2 bg-[#FEABDA] p-3 rounded-md">
                  <p className="font-medium mb-1">CSV Format Requirements:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Must include header row with column names</li>
                    <li>Required columns: artist, venue, date, emoji, summary, sounds_like, genre</li>
                    <li>Date format must be YYYY-MM-DD (e.g., 2025-06-15)</li>
                    <li>Genre must match one of the standard options</li>
                    <li>Text fields limited to 75 characters</li>
                    <li>Emojis limited to 5 characters</li>
                  </ul>
                  <p className="mt-2 italic">Tip: Download any CSV import errors, fix them, and try uploading again.</p>
                </div>
                {csvError && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mt-2 rounded relative">
                    <div className="font-bold">CSV Upload Error</div>
                    <div className="whitespace-pre-line">{csvError}</div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>
      <Footer />
    </div>
  );
}
