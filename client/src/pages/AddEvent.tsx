import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { genres } from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { Input } from "@/components/ui/input";
import EventForm, { EventFormValues } from "@/components/EventForm";

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [csvError, setCsvError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Add single event mutation
  const addEventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
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
  const handleSubmit = (data: EventFormValues) => {
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

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar showFilters={false} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-[#FEABDA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton font-black uppercase">ADD A SHOW</h2>
          
          <EventForm 
            onSubmit={handleSubmit}
            isPending={addEventMutation.isPending}
            duplicateError={duplicateError}
            submitButtonText="ADD SHOW"
          />
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
