import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { insertEventSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

// Extend the event schema with custom validations
const addEventSchema = insertEventSchema.extend({
  emoji: z.string()
    .min(1, "Emoji is required")
    .max(5, "Maximum 5 characters")
    .transform(val => val.charAt(0)), // Take only the first character
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

type FormValues = z.infer<typeof addEventSchema>;

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [csvError, setCsvError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(addEventSchema),
    defaultValues: {
      emoji: "",
      artist: "",
      venue: "",
      date: undefined,
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
      header: true, // Changed to true to use the header row
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setCsvError("Error parsing CSV file. Please check the format.");
          return;
        }
        
        console.log("CSV parse results:", results);
        
        try {
          // Process valid rows
          const events = results.data
            .filter((row: any) => {
              // Skip empty rows
              if (!row || Object.values(row).every(val => !val)) {
                return false;
              }
              return true;
            })
            .map((row: any) => {
              console.log("Processing CSV row:", row);
              
              // Verify we have all required fields
              if (!row.artist || !row.venue || !row.date || !row.emoji || !row.summary || !row.genre) {
                console.error("Missing required fields in row:", row);
                throw new Error(`Missing required fields in row: ${JSON.stringify(row)}`);
              }
              
              // For the "sounds_like" field, handle potential empty values
              const soundsLike = row.sounds_like || ""; 
              
              return {
                artist: row.artist,
                venue: row.venue,
                date: row.date, // Send as string, server will parse
                emoji: row.emoji?.charAt(0) || "", // Only take first character from emoji
                summary: row.summary,
                soundsLike: soundsLike,
                genre: row.genre,
              };
            })
            .filter(Boolean);
            
          console.log("Processed events:", events);
          
          if (events.length > 0) {
            addEventsBulkMutation.mutate(events);
          } else {
            setCsvError("No valid events found in CSV file.");
          }
        } catch (error) {
          setCsvError("Error processing CSV data. Please check the format.");
        }
      },
      error: () => {
        setCsvError("Failed to read CSV file.");
      }
    });
  };

  const genres = [
    'Rock & Alternative',
    'Folk, Country & Americana',
    'Pop & Indie Pop',
    'Electronic & Experimental',
    'Funk, Soul & Jazz',
    'Classical & Orchestral'
  ];

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar showFilters={false} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-[#FEABDA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton">ADD NEW SHOW</h2>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="artist" className="block text-black mb-2 font-sora">ARTIST NAME</Label>
                <Input
                  id="artist"
                  {...form.register("artist")}
                  maxLength={75}
                  placeholder="Artist name"
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.artist && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.artist.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="venue" className="block text-black mb-2 font-sora">VENUE</Label>
                <Input
                  id="venue"
                  {...form.register("venue")}
                  maxLength={75}
                  placeholder="Venue name"
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.venue && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.venue.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="date" className="block text-black mb-2 font-sora">DATE</Label>
                <Input
                  id="date"
                  type="date"
                  {...form.register("date")}
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.date && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.date.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="emoji" className="block text-black mb-2 font-sora">EMOJI</Label>
                <Input
                  id="emoji"
                  {...form.register("emoji")}
                  maxLength={5}
                  placeholder="Choose an emoji (only first character will be used)"
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.emoji && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.emoji.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="summary" className="block text-black mb-2 font-sora">SUMMARY</Label>
                <Input
                  id="summary"
                  {...form.register("summary")}
                  maxLength={75}
                  placeholder="Brief description of the music"
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.summary && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.summary.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="soundsLike" className="block text-black mb-2 font-sora">SOUNDS LIKE</Label>
                <Input
                  id="soundsLike"
                  {...form.register("soundsLike")}
                  maxLength={75}
                  placeholder="Similar artist"
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                />
                {form.formState.errors.soundsLike && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.soundsLike.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="genre" className="block text-black mb-2 font-sora">GENRE</Label>
                <select
                  id="genre"
                  {...form.register("genre")}
                  className="w-full p-3 border-2 border-black bg-[#FEABDA] placeholder-[#FEABDA]/60 rounded-none focus:bg-white"
                >
                  <option value="" disabled>Select a genre</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
                {form.formState.errors.genre && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.genre.message}</p>
                )}
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl text-black mb-4 font-anton">OR UPLOAD CSV</h3>
              <Input
                type="file"
                id="csv-upload"
                accept=".csv"
                onChange={handleCsvUpload}
                className="block w-full p-3 border-2 border-black bg-[#FEABDA] rounded-none"
              />
              <p className="text-sm text-gray-600 mt-2">
                CSV format: should include a header row with these column names:<br />
                artist, venue, date, emoji, summary, sounds_like, genre<br />
                <span className="italic">Notes:</span>
                <ul className="list-disc pl-5 italic">
                  <li>Date must be in YYYY-MM-DD format (e.g., 2025-05-01)</li>
                  <li>Text fields can be up to 75 characters long</li>
                  <li>Only the first character of the emoji field will be used</li>
                  <li>Genre must match one of the predefined options exactly</li>
                  <li>The sounds_like field is optional</li>
                </ul>
              </p>
              {csvError && (
                <p className="text-red-500 text-sm mt-1">{csvError}</p>
              )}
            </div>
            
            <div className="flex justify-end">
              <Button 
                type="submit"
                variant="default"
                className="bg-black text-white hover:bg-black/90 rounded-full px-6"
                disabled={addEventMutation.isPending}
              >
                ADD SHOW
              </Button>
            </div>
            
            {/* Duplicate event error message */}
            {duplicateError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative flex items-center">
                <AlertCircle className="h-5 w-5 mr-2" />
                {duplicateError}
              </div>
            )}
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
