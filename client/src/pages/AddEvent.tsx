import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import { insertEventSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

// Extend the event schema with custom validations
const addEventSchema = insertEventSchema.extend({
  emoji: z.string().min(1, "Emoji is required").max(5, "Maximum 5 characters"),
  artist: z.string().min(1, "Artist name is required").max(50, "Maximum 50 characters"),
  venue: z.string().min(1, "Venue is required").max(50, "Maximum 50 characters"),
  summary: z.string().min(1, "Summary is required").max(50, "Maximum 50 characters"),
  soundsLike: z.string().min(1, "Sounds like is required").max(50, "Maximum 50 characters"),
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
      const res = await apiRequest("POST", "/api/events", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Event Added",
        description: "The event has been added successfully!",
      });
      navigate("/");
    },
    onError: (error: any) => {
      if (error.message?.includes("already exists")) {
        setDuplicateError("One or more events skipped because it already exists.");
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
      const res = await apiRequest("POST", "/api/events/bulk", events);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.skipped > 0) {
        setDuplicateError("One or more events skipped because they already exist.");
      }
      
      if (data.created > 0) {
        toast({
          title: "Events Added",
          description: `${data.created} events have been added successfully!`,
        });
        
        if (data.skipped === 0) {
          navigate("/");
        }
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add events from CSV. Please check the format and try again.",
        variant: "destructive",
      });
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
      header: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setCsvError("Error parsing CSV file. Please check the format.");
          return;
        }
        
        try {
          const events = results.data.map((row: any) => ({
            emoji: row.emoji,
            artist: row.artist,
            venue: row.venue,
            date: new Date(row.date),
            summary: row.summary,
            soundsLike: row.sounds_like,
            genre: row.genre,
          }));
          
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

  const genres = ["Indie", "Rock", "Folk", "Pop", "Electronic", "Jazz", "Hip Hop", "R&B", "Metal", "Punk", "Country", "Blues"];

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-[#F4F2EA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton">ADD NEW SHOW</h2>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="artist" className="block text-black mb-2 font-sora">ARTIST NAME</Label>
                <Input
                  id="artist"
                  {...form.register("artist")}
                  maxLength={50}
                  placeholder="Artist name"
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  maxLength={50}
                  placeholder="Venue name"
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  placeholder="Choose an emoji (e.g. 🎸)"
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  maxLength={50}
                  placeholder="Brief description of the music"
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  maxLength={50}
                  placeholder="Similar artist"
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
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
                  className="w-full p-3 border-2 border-black bg-[#FE6B41] placeholder-[#FE6B41]/60 rounded-none focus:bg-white"
                >
                  <option value="" disabled>Select a genre</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre.toLowerCase()}>{genre}</option>
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
                className="block w-full p-3 border-2 border-black bg-[#FE6B41] rounded-none"
              />
              <p className="text-sm text-gray-600 mt-2">
                CSV should include columns: artist, venue, date, emoji, summary, sounds_like, genre
              </p>
              {csvError && (
                <p className="text-red-500 text-sm mt-1">{csvError}</p>
              )}
            </div>
            
            <div className="flex justify-end">
              <Button 
                type="submit"
                variant="primary"
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
    </div>
  );
}
