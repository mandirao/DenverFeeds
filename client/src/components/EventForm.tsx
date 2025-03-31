import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertEventSchema, genres, Event } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { VenueSelector, allVenues } from "./VenueSelector";

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
const eventFormSchema = insertEventSchema.extend({
  emoji: z.string()
    .min(1, "Emoji is required")
    .max(5, "Maximum 5 characters")
    .refine(value => containsOnlyEmoji(value), {
      message: "Only emoji characters are allowed"
    }),
  artist: z.string().min(1, "Artist name is required").max(75, "Maximum 75 characters"),
  venue: z.string()
    .min(1, "Venue is required")
    .max(75, "Maximum 75 characters")
    .refine(
      value => {
        // Allow any value if it's "Other/Festival" (user will enter custom venue)
        if (value === "Other/Festival") return true;
        // For all other entries, enforce the list
        return allVenues.includes(value);
      },
      {
        message: "Please select a venue from the list or choose 'Other/Festival'"
      }
    ),
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
  defaultValues?: Partial<EventFormValues>;
  onSuccess?: () => void;
  onCancel?: () => void;
  eventId?: number;
  isEditing?: boolean;
}

export function EventForm({ 
  defaultValues, 
  onSuccess, 
  onCancel,
  eventId,
  isEditing = false 
}: EventFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Initialize form with default values
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultValues || {
      emoji: "",
      artist: "",
      venue: "",
      date: undefined,
      summary: "",
      soundsLike: "",
      genre: "",
    },
  });

  // Create/Edit event mutation
  const eventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      // Format date as ISO string for the API
      const formattedData = {
        ...data,
        date: data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date
      };

      if (isEditing && eventId) {
        // Update existing event
        return apiRequest({
          endpoint: `/api/events/${eventId}`,
          method: "PUT",
          data: formattedData
        });
      } else {
        // Create new event
        return apiRequest({
          endpoint: "/api/events",
          method: "POST",
          data: formattedData
        });
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Event Updated" : "Event Added",
        description: isEditing 
          ? "The event has been updated successfully!" 
          : "The event has been added successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      if (onSuccess) onSuccess();
    },
    onError: (error: any) => {
      console.error(isEditing ? "Edit event error:" : "Add event error:", error);
      
      if (error.response?.status === 409 || error.message?.includes("already exists")) {
        setDuplicateError("This event already exists.");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "An error occurred. Please try again.",
        });
      }
    }
  });

  const onSubmit = (data: EventFormValues) => {
    setDuplicateError(null);
    eventMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Only show the heading when not editing (in Add Event page) */}
      {!isEditing && <h2 className="text-2xl font-bold mb-4">Add Event</h2>}
      
      {/* Show duplicate error */}
      {duplicateError && (
        <div className="bg-red-50 text-red-800 p-3 rounded-md flex items-start mb-4">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Duplicate event</p>
            <p className="text-sm">{duplicateError}</p>
          </div>
        </div>
      )}

      {/* Mad-lib style form */}
      <div className="mb-8 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span>I want to see</span>
          <div className="inline-flex items-center">
            <Input 
              {...form.register("emoji")}
              id="emoji"
              placeholder="🎸"
              className={`w-12 bg-transparent border rounded-sm focus:border-[#FEABDA] text-center ${form.formState.errors.emoji ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("emoji") ? 1 : 0.2
              }}
            />
          </div>
          <div className="flex-1">
            <Input 
              {...form.register("artist")}
              id="artist"
              placeholder="Band / Performer name"
              className={`w-full bg-transparent border rounded-sm focus:border-[#FEABDA] ${form.formState.errors.artist ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("artist") ? 1 : 0.2
              }}
            />
          </div>
        </div>

        {(form.formState.errors.emoji || form.formState.errors.artist) && (
          <div className="ml-20 space-y-1 text-sm">
            {form.formState.errors.emoji && (
              <p className="text-red-500">{form.formState.errors.emoji.message}</p>
            )}
            {form.formState.errors.artist && (
              <p className="text-red-500">{form.formState.errors.artist.message}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span>at</span>
          <div className="flex-1">
            <VenueSelector
              value={form.watch("venue")}
              onChange={(value) => form.setValue("venue", value)}
              error={!!form.formState.errors.venue}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("venue") ? 1 : 0.2
              }}
            />
          </div>
        </div>
          
        {form.formState.errors.venue && (
          <div className="ml-20 space-y-1 text-sm">
            <p className="text-red-500">{form.formState.errors.venue.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span>on</span>
          <div className="inline-block flex-1">
            <input 
              id="date"
              type="date"
              className={`w-full bg-transparent border rounded-sm p-2 focus:border-[#FEABDA] ${form.formState.errors.date ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("date") ? 1 : 0.2
              }}
              value={form.watch("date") instanceof Date 
                ? format(form.watch("date") as Date, "yyyy-MM-dd") 
                : ""}
              onChange={(e) => {
                if (e.target.value) {
                  form.setValue("date", new Date(e.target.value));
                } else {
                  form.setValue("date", new Date());
                }
              }}
            />
          </div>
        </div>

        {form.formState.errors.date && (
          <div className="ml-20 space-y-1 text-sm">
            <p className="text-red-500">{form.formState.errors.date.message as string}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span>which can be described as</span>
          <div className="flex-1">
            <select
              {...form.register("genre")}
              id="genre"
              className={`w-full bg-transparent border rounded-sm p-2 focus:border-[#FEABDA] ${form.formState.errors.genre ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("genre") ? 1 : 0.2
              }}
            >
              <option value="">Select genre</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.formState.errors.genre && (
          <div className="ml-20 space-y-1 text-sm">
            <p className="text-red-500">{form.formState.errors.genre.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span>with</span>
          <div className="flex-1">
            <Input 
              {...form.register("summary")}
              id="summary"
              placeholder="A few words about the show..."
              className={`w-full bg-transparent border rounded-sm focus:border-[#FEABDA] ${form.formState.errors.summary ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("summary") ? 1 : 0.2
              }}
            />
          </div>
        </div>

        {form.formState.errors.summary && (
          <div className="ml-20 space-y-1 text-sm">
            <p className="text-red-500">{form.formState.errors.summary.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span>and they sound like</span>
          <div className="flex-1">
            <Input 
              {...form.register("soundsLike")}
              id="soundsLike"
              placeholder="Similar artists or bands (comma separated)"
              className={`w-full bg-transparent border rounded-sm focus:border-[#FEABDA] ${form.formState.errors.soundsLike ? 'border-red-500' : 'border-gray-300'}`}
              style={{ 
                backgroundColor: 'rgba(254, 171, 218, 0.2)',
                opacity: form.watch("soundsLike") ? 1 : 0.2
              }}
            />
          </div>
        </div>

        {form.formState.errors.soundsLike && (
          <div className="ml-20 space-y-1 text-sm">
            <p className="text-red-500">{form.formState.errors.soundsLike.message}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-3">
        {onCancel && (
          <Button 
            type="button" 
            variant="outline"
            onClick={onCancel}
            className="bg-transparent border-gray-300"
          >
            Cancel
          </Button>
        )}
        <Button 
          type="submit" 
          disabled={eventMutation.isPending}
          className="bg-[#FEABDA] text-black hover:bg-[#e799c8]"
        >
          {eventMutation.isPending ? (
            <span className="flex items-center">
              <span className="mr-2">Processing...</span>
            </span>
          ) : isEditing ? (
            "Update Event"
          ) : (
            "Add Event"
          )}
        </Button>
      </div>
    </form>
  );
}