import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EventForm, EventFormValues } from "@/components/EventForm";

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [csvError, setCsvError] = useState<string | null>(null);

  // Add bulk events mutation
  const addBulkEventsMutation = useMutation({
    mutationFn: async (data: any[]) => {
      return apiRequest({
        endpoint: "/api/events/bulk",
        method: "POST",
        data
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Events Added",
        description: `Successfully added ${data.results?.created} events${data.results?.skipped > 0 ? ` (${data.results?.skipped} skipped)` : ''}.`,
      });
      navigate("/");
    },
    onError: (error: any) => {
      console.error("Bulk event add error:", error);
      toast({
        variant: "destructive",
        title: "Error Adding Events",
        description: error.message || "An error occurred. Please try again.",
      });
    }
  });

  // Process CSV file
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Clear any previous errors
    setCsvError(null);
    
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Process the CSV file
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setCsvError("Error parsing CSV file. Please check the format.");
          return;
        }

        if (!results.data || results.data.length === 0) {
          setCsvError("No valid data found in the CSV file.");
          return;
        }

        // Process the data
        const events = results.data.map((row: any) => {
          // Normalize field names (handle case variations and whitespace)
          const normalizeField = (field: string): string => 
            Object.keys(row).find(key => 
              key.trim().toLowerCase() === field.toLowerCase()
            ) || field;

          const artistField = normalizeField('artist');
          const venueField = normalizeField('venue');
          const dateField = normalizeField('date');
          const genreField = normalizeField('genre');
          const emojiField = normalizeField('emoji');
          const summaryField = normalizeField('summary');
          const soundsLikeField = normalizeField('soundsLike');

          return {
            artist: row[artistField],
            venue: row[venueField],
            date: row[dateField],
            genre: row[genreField],
            emoji: row[emojiField] || "🎵", // Default emoji if not provided
            summary: row[summaryField] || `${row[artistField]} live show`,
            soundsLike: row[soundsLikeField] || row[artistField],
          };
        }).filter((event: any) => 
          // Only include events with required fields
          event.artist && event.venue && event.date && event.genre
        );

        if (events.length === 0) {
          setCsvError("No valid events found in the CSV. Events must have artist, venue, date, and genre.");
          return;
        }

        // Submit the events
        addBulkEventsMutation.mutate(events);
      },
      error: (error) => {
        console.error("CSV parsing error:", error);
        setCsvError(`Error parsing CSV: ${error.message}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#FE6B41] flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="bg-white shadow-md rounded-md p-6">
          
          {/* Use the shared EventForm component */}
          <EventForm 
            onSuccess={() => navigate("/")}
            onCancel={() => navigate("/")}
          />
          
          {/* CSV Error Display */}
          {csvError && (
            <div className="bg-red-50 text-red-800 p-3 rounded-md flex items-start mb-4 mt-4">
              <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">CSV Error</p>
                <p className="text-sm">{csvError}</p>
              </div>
            </div>
          )}
          
          <div className="mt-8">
            <Accordion type="single" collapsible>
              <AccordionItem value="bulk-upload">
                <AccordionTrigger className="text-lg font-semibold">
                  Bulk Upload from CSV
                </AccordionTrigger>
                <AccordionContent>
                  <div className="py-2">
                    <p className="mb-4">
                      Upload a CSV file with event data. The CSV must include these columns:
                      <code className="px-1 py-0.5 bg-gray-100 rounded text-sm ml-1">artist, venue, date, genre</code>.
                      Optional columns include <code className="px-1 py-0.5 bg-gray-100 rounded text-sm">emoji, summary, soundsLike</code>.
                    </p>
                    
                    <Label htmlFor="csv-file" className="mb-2 block">
                      Select CSV File
                    </Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      disabled={addBulkEventsMutation.isPending}
                    />
                    
                    {addBulkEventsMutation.isPending && (
                      <p className="mt-3 text-blue-600">Processing CSV file...</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}