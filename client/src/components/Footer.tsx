import { Link, useLocation } from "wouter";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, List, Upload, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Papa from "papaparse";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";

export function Footer() {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  // Determine if we're on the Add Show or Playlists page
  const isAddPage = location === "/add" || location === "/playlists";

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

      if (data.results?.created > 0) {
        toast({
          title: "Events Added",
          description: data.message || `Added ${data.results.created} events successfully!`,
        });

        if (data.results.skipped === 0) {
          setCsvModalOpen(false);
          navigate("/");
        }
      } else {
        setCsvError("No events were added. Please check the CSV format and try again.");
      }

      // Update the results display
      if (data.results?.skipped > 0) {
        setCsvError(
          data.results.errors?.length > 0 
            ? `Some events couldn't be added: ${data.results.errors[0]}${data.results.errors.length > 1 ? ` and ${data.results.errors.length - 1} more` : ''}`
            : "One or more events skipped because they already exist."
        );
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

  // Handle CSV upload
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);

    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      quoteChar: '"',
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
          const requiredHeaders = ['artist', 'venue', 'date', 'emoji', 'summary', 'genre', 'requester'];
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

          // Process valid events
          const events = results.data
            .filter((row: any, index: number) => {
              // Skip empty rows
              if (!row || Object.values(row).every(val => !val)) return false;

              // Check for required fields
              const missingFields = [];
              if (!row.artist) missingFields.push('artist');
              if (!row.venue) missingFields.push('venue');
              if (!row.date) missingFields.push('date');
              if (!row.emoji) missingFields.push('emoji');
              if (!row.summary) missingFields.push('summary');
              if (!row.genre) missingFields.push('genre');
              if (!row.requester) missingFields.push('requester');

              if (missingFields.length > 0) {
                errors.push(`Row ${index + 2}: Missing fields: ${missingFields.join(', ')}`);
                return false;
              }

              return true;
            })
            .map((row: any) => {
              return {
                artist: row.artist.trim(),
                venue: row.venue.trim(),
                date: row.date.trim(),
                emoji: row.emoji.trim(),
                summary: row.summary.trim(),
                soundsLike: (row.sounds_like || row.soundsLike || "").trim(),
                genre: row.genre.trim(),
                requester: row.requester?.trim() || "Mandi",
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
          setCsvError("Error processing CSV data. Please check the format.");
        }
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        setCsvError("Failed to read CSV file.");
      }
    });
  };

  return (
    <footer className="bg-[#FE6B41] py-4 mt-8">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center">
        <div className="mb-4 sm:mb-0 flex items-center space-x-2">
          <button 
            onClick={() => setCalendarOpen(true)}
            className="text-black hover:text-[#41F2EE] transition-colors flex items-center underline text-sm"
          >
            <Calendar className="w-4 h-4 mr-1" /> SUBSCRIBE TO CALENDAR
          </button>
          <span className="text-black">|</span>
          {isAddPage ? (
            <Link href="/" className="text-black hover:text-[#41F2EE] transition-colors flex items-center underline text-sm">
              <List className="w-4 h-4 mr-1" /> VIEW SHOWS
            </Link>
          ) : (
            <button
              onClick={() => setCsvModalOpen(true)} 
              className="text-black hover:text-[#41F2EE] transition-colors flex items-center underline text-sm"
            >
              <Upload className="w-4 h-4 mr-1" /> UPLOAD EVENTS CSV
            </button>
          )}
        </div>

        <div className="text-sm text-black">
          <span>© {new Date().getFullYear()} Setlist Social Feed.</span>
        </div>
      </div>

      {/* Calendar Subscription Dialog */}
      <CalendarSubscribeModal open={calendarOpen} onOpenChange={setCalendarOpen} />

      {/* CSV Upload Dialog */}
      <Dialog open={csvModalOpen} onOpenChange={setCsvModalOpen}>
        <DialogContent className="bg-[#FEABDA] max-w-xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">UPLOAD CSV FILE</DialogTitle>
          </DialogHeader>
          <div className="text-black mt-2">
            <div className="mb-4">
              <Input
                type="file"
                id="csv-upload"
                accept=".csv"
                onChange={handleCsvUpload}
                className="block w-full p-3 border-2 border-black bg-[#FEABDA] rounded-none file:text-black file:opacity-20"
              />
            </div>
            <div className="text-sm text-black mt-4 bg-[#FE6B41] p-3 rounded-md">
              <div className="font-medium mb-2">Example CSV Format:</div>
              <div className="bg-white text-black p-2 rounded text-xs font-mono overflow-x-auto">
                <code className="block">artist,venue,date,emoji,summary,sounds_like,genre,requester</code>
                <code className="block">Khruangbin,Red Rocks,2025-07-15,🎸,Psychedelic trio,Tame Impala,Funk/Soul & Jazz,Sarah</code>
              </div>
              <div className="mt-3 pt-3 border-t border-black/20">
                <Link 
                  href="/discovery" 
                  className="inline-flex items-center text-black hover:text-white transition-colors font-medium text-sm underline"
                  onClick={() => setCsvModalOpen(false)}
                >
                  🔍 Discovery Admin Panel
                </Link>
                <div className="text-xs mt-1 opacity-70">Manage artist database and automated discovery</div>
              </div>
            </div>

            {csvError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mt-4 rounded relative">
                <div className="font-bold flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  CSV Upload Error
                </div>
                <div className="whitespace-pre-line">{csvError}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline2" onClick={() => setCsvModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

export default Footer;